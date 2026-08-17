#!/usr/bin/env python3
"""Submit one static image request without persisting credentials or raw responses."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


CHANNELS = {
    "yunwu": {
        "endpoints": {
            "generate": "https://yunwu.ai/v1/images/generations",
            "edit": "https://yunwu.ai/v1/images/edits",
        },
        "generate_status": "verified_4k_text_to_image",
        "edit_status": "verified_4k_reference_image_edit",
        "credential_mode": "agent_vault_proxy",
    },
}

SHARED_ENV_KEYS = ("AGENT_VAULT_ADDR", "AGENT_VAULT_VAULT", "AGENT_VAULT_TOKEN")
DEFAULT_GENERATE_MODEL = "gpt-image-2-c"
DEFAULT_EDIT_MODEL = "gpt-image-2-c"
MAX_REFERENCE_IMAGES = 16
MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024


def load_shared_session_env() -> None:
    """Load only the protected proxy bootstrap fields, never provider keys."""
    if all(os.environ.get(name) for name in SHARED_ENV_KEYS):
        return
    default_path = Path.home() / ".codex" / "secrets" / "image2-agent-vault.env"
    env_path = Path(os.environ.get("IMAGE2_SHARED_ENV_FILE", str(default_path)))
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            name = name.strip()
            value = value.strip()
            if name in SHARED_ENV_KEYS and value and not os.environ.get(name):
                os.environ[name] = value
    except (OSError, UnicodeError):
        return


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def dimensions(path: Path) -> list[int]:
    try:
        from PIL import Image
    except ImportError:
        data = path.read_bytes()
        if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
            return [int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")]
        if data.startswith(b"RIFF") and data[8:12] == b"WEBP" and len(data) >= 30:
            kind = data[12:16]
            if kind == b"VP8X":
                return [1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")]
            if kind == b"VP8L" and len(data) >= 25:
                packed = int.from_bytes(data[21:25], "little")
                return [1 + (packed & 0x3FFF), 1 + ((packed >> 14) & 0x3FFF)]
        if data.startswith(b"\xff\xd8"):
            index = 2
            while index + 9 < len(data):
                if data[index] != 0xFF:
                    index += 1
                    continue
                marker = data[index + 1]
                index += 2
                if marker in {0xD8, 0xD9}:
                    continue
                length = int.from_bytes(data[index:index + 2], "big")
                if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                    return [int.from_bytes(data[index + 5:index + 7], "big"), int.from_bytes(data[index + 3:index + 5], "big")]
                index += length
        raise RuntimeError("Unsupported image format for final dimension QA without Pillow")
    with Image.open(path) as image:
        return [image.width, image.height]


def request_json(endpoint: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))


def request_multipart(endpoint: str, prompt: str, model: str, size: str, images: list[Path]) -> dict:
    boundary = f"----CodexImage2{uuid.uuid4().hex}"
    parts: list[bytes] = []

    def add_field(name: str, value: str) -> None:
        parts.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    for name, value in (("model", model), ("prompt", prompt), ("n", "1"), ("size", size)):
        add_field(name, value)
    for image in images:
        mime_type = mimetypes.guess_type(image.name)[0] or "application/octet-stream"
        parts.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="image"; filename="{image.name}"\r\n'.encode(),
                f"Content-Type: {mime_type}\r\n\r\n".encode(),
                image.read_bytes(),
                b"\r\n",
            ]
        )
    parts.append(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        endpoint,
        data=b"".join(parts),
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))


def save_image(response: dict, output: Path) -> None:
    data = response.get("data")
    if isinstance(data, dict):
        item = data
    elif isinstance(data, list) and data and isinstance(data[0], dict):
        item = data[0]
    else:
        raise RuntimeError("Provider response did not contain image data")
    if isinstance(item.get("b64_json"), str):
        output.write_bytes(base64.b64decode(item["b64_json"], validate=True))
        return
    if isinstance(item.get("url"), str):
        with urllib.request.urlopen(item["url"], timeout=120) as response:
            output.write_bytes(response.read())
        return
    raise RuntimeError("Provider response did not contain b64_json or url")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel", choices=["yunwu"], default="yunwu")
    parser.add_argument("--operation", choices=["generate", "edit"], default="generate")
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--model")
    parser.add_argument("--size", required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reference-image", type=Path, action="append", default=[])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--submit", action="store_true")
    return parser.parse_args()


def vault_proxy_ready() -> tuple[bool, list[str]]:
    required = ["AGENT_VAULT_ADDR", "AGENT_VAULT_TOKEN", "AGENT_VAULT_VAULT"]
    missing = [name for name in required if not os.environ.get(name)]
    if not (os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")):
        missing.append("HTTPS_PROXY")
    return not missing, missing


def validate_size(size: str) -> None:
    try:
        width_text, height_text = size.lower().split("x", 1)
        width, height = int(width_text), int(height_text)
    except ValueError as exc:
        raise SystemExit("--size must use WIDTHxHEIGHT") from exc
    if min(width, height) <= 0 or max(width, height) > 3840:
        raise SystemExit("--size exceeds the Yunwu gpt-image-2 dimension limits")
    if width % 16 or height % 16:
        raise SystemExit("--size dimensions must be multiples of 16")
    if max(width, height) / min(width, height) > 3 or not 655360 <= width * height <= 8294400:
        raise SystemExit("--size is outside the Yunwu gpt-image-2 aspect or pixel limits")


def fingerprint_references(images: list[Path]) -> list[str]:
    fingerprints = []
    for image in images:
        if not image.is_file():
            raise SystemExit(f"Reference image does not exist: {image}")
        if image.stat().st_size > MAX_REFERENCE_IMAGE_BYTES:
            raise SystemExit(f"Reference image exceeds 50MB: {image.name}")
        digest = hashlib.sha256()
        with image.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        fingerprints.append(digest.hexdigest())
    return fingerprints


def main() -> int:
    load_shared_session_env()
    args = parse_args()
    if args.dry_run == args.submit:
        raise SystemExit("Use exactly one of --dry-run or --submit")
    args.model = args.model or (DEFAULT_EDIT_MODEL if args.operation == "edit" else DEFAULT_GENERATE_MODEL)
    validate_size(args.size)
    prompt = args.prompt_file.read_text(encoding="utf-8").strip()
    if not prompt:
        raise SystemExit("Prompt file is empty")
    channel = CHANNELS[args.channel]
    endpoint = channel["endpoints"][args.operation]
    if args.operation == "generate" and args.reference_image:
        raise SystemExit("--reference-image is only valid with --operation edit")
    if args.operation == "edit" and not 1 <= len(args.reference_image) <= MAX_REFERENCE_IMAGES:
        raise SystemExit(f"--operation edit requires 1 to {MAX_REFERENCE_IMAGES} --reference-image values")
    reference_fingerprints = fingerprint_references(args.reference_image) if args.operation == "edit" else []
    receipt = {
        "asset_id": args.asset_id,
        "channel": args.channel,
        "channel_status": channel[f"{args.operation}_status"],
        "credential_mode": channel["credential_mode"],
        "operation": args.operation,
        "endpoint": endpoint,
        "model": args.model,
        "requested_size": args.size,
        "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "created_at": utc_now(),
        "submitted_at": None,
        "status": "dry_run" if args.dry_run else "submission_started",
    }
    if reference_fingerprints:
        receipt["reference_image_count"] = len(reference_fingerprints)
        receipt["reference_image_sha256"] = reference_fingerprints
    if args.dry_run:
        write_json(args.receipt, receipt)
        print(json.dumps(receipt, ensure_ascii=False))
        return 0
    if args.output is None:
        raise SystemExit("--output is required with --submit")
    if channel["credential_mode"] == "agent_vault_proxy":
        ready, missing = vault_proxy_ready()
        if not ready:
            receipt["status"] = "blocked_agent_vault_proxy_not_configured"
            receipt["missing_bootstrap"] = missing
            write_json(args.receipt, receipt)
            print(json.dumps(receipt, ensure_ascii=False))
            return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    receipt["submitted_at"] = utc_now()
    write_json(args.receipt, receipt)
    try:
        if args.operation == "edit":
            response = request_multipart(endpoint, prompt, args.model, args.size, args.reference_image)
        else:
            payload = {
                "model": args.model,
                "prompt": prompt,
                "n": 1,
                "size": args.size,
            }
            response = request_json(endpoint, payload)
        save_image(response, args.output)
        actual = dimensions(args.output)
        receipt["output_path"] = str(args.output)
        receipt["actual_size"] = f"{actual[0]}x{actual[1]}"
        receipt["status"] = "accepted_dimensions" if receipt["actual_size"] == args.size else "rejected_dimension_mismatch"
        receipt["completed_at"] = utc_now()
        write_json(args.receipt, receipt)
        print(json.dumps(receipt, ensure_ascii=False))
        return 0 if receipt["status"] == "accepted_dimensions" else 3
    except urllib.error.HTTPError as exc:
        receipt["status"] = "rejected_http_error"
        receipt["http_status"] = exc.code
        receipt["completed_at"] = utc_now()
        write_json(args.receipt, receipt)
        print(json.dumps(receipt, ensure_ascii=False))
        return 4
    except Exception as exc:
        receipt["status"] = "uncertain_no_retry"
        receipt["error_type"] = type(exc).__name__
        receipt["completed_at"] = utc_now()
        write_json(args.receipt, receipt)
        print(json.dumps(receipt, ensure_ascii=False))
        return 5


if __name__ == "__main__":
    sys.exit(main())
