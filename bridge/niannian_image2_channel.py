#!/usr/bin/env python3
"""Run one Yunwu Image2 request through the injected Agent Vault proxy."""

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

ENDPOINTS = {"generate": "https://yunwu.ai/v1/images/generations", "edit": "https://yunwu.ai/v1/images/edits"}
VAULT_ENV = ("AGENT_VAULT_ADDR", "AGENT_VAULT_VAULT", "AGENT_VAULT_TOKEN")
CRLF = bytes((13, 10))

def utc_now():
    return datetime.now(timezone.utc).isoformat()

def write_receipt(path, receipt):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--channel", choices=["yunwu"], required=True)
    parser.add_argument("--operation", choices=["generate", "edit"], required=True)
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--size", required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reference-image", type=Path, action="append", default=[])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--submit", action="store_true")
    return parser.parse_args()

def validate_size(value):
    try:
        width, height = (int(item) for item in value.lower().split("x", 1))
    except ValueError as error:
        raise SystemExit("invalid size") from error
    if min(width, height) <= 0 or max(width, height) > 3840 or width % 16 or height % 16:
        raise SystemExit("invalid size")
    if max(width, height) / min(width, height) > 3 or not 655360 <= width * height <= 8294400:
        raise SystemExit("invalid size")

def vault_ready():
    return all(os.environ.get(name) for name in VAULT_ENV) and bool(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy"))

def json_request(endpoint, payload):
    request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))

def edit_request(endpoint, prompt, model, size, images):
    boundary = "----NiannianImage2" + uuid.uuid4().hex
    parts = []
    def field(name, value):
        parts.extend([(f"--{boundary}").encode() + CRLF, (f'Content-Disposition: form-data; name="{name}"').encode() + CRLF + CRLF, value.encode("utf-8"), CRLF])
    for name, value in (("model", model), ("prompt", prompt), ("n", "1"), ("size", size)):
        field(name, value)
    for image in images:
        mime = mimetypes.guess_type(image.name)[0] or "application/octet-stream"
        parts.extend([(f"--{boundary}").encode() + CRLF, (f'Content-Disposition: form-data; name="image"; filename="{image.name}"').encode() + CRLF, (f"Content-Type: {mime}").encode() + CRLF + CRLF, image.read_bytes(), CRLF])
    parts.append((f"--{boundary}--").encode() + CRLF)
    request = urllib.request.Request(endpoint, data=b"".join(parts), method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))

def save_image(response, output):
    data = response.get("data")
    item = data if isinstance(data, dict) else (data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else None)
    if not item:
        raise RuntimeError("output missing")
    if isinstance(item.get("b64_json"), str):
        output.write_bytes(base64.b64decode(item["b64_json"], validate=True))
        return
    if isinstance(item.get("url"), str):
        with urllib.request.urlopen(item["url"], timeout=120) as response_handle:
            output.write_bytes(response_handle.read())
        return
    raise RuntimeError("output missing")

def image_size(path):
    raw = path.read_bytes()
    if raw[:8] == bytes((137, 80, 78, 71, 13, 10, 26, 10)) and len(raw) >= 24:
        return int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP" and len(raw) >= 30:
        if raw[12:16] == b"VP8X":
            return 1 + int.from_bytes(raw[24:27], "little"), 1 + int.from_bytes(raw[27:30], "little")
        if raw[12:16] == b"VP8L" and len(raw) >= 25:
            packed = int.from_bytes(raw[21:25], "little")
            return 1 + (packed & 16383), 1 + ((packed >> 14) & 16383)
    if raw[:2] == bytes((255, 216)):
        index = 2
        while index + 9 < len(raw):
            if raw[index] != 255:
                index += 1
                continue
            marker = raw[index + 1]
            index += 2
            if marker in {216, 217}:
                continue
            length = int.from_bytes(raw[index:index + 2], "big")
            if marker in {192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207}:
                return int.from_bytes(raw[index + 5:index + 7], "big"), int.from_bytes(raw[index + 3:index + 5], "big")
            index += length
    raise RuntimeError("unsupported output")

def main():
    args = parse_args()
    if args.dry_run == args.submit:
        raise SystemExit("choose one mode")
    validate_size(args.size)
    prompt = args.prompt_file.read_text(encoding="utf-8").strip()
    invalid = not prompt or (args.operation == "generate" and args.reference_image) or (args.operation == "edit" and not 1 <= len(args.reference_image) <= 16)
    if invalid:
        raise SystemExit("invalid request")
    receipt = {"asset_id": args.asset_id, "channel": args.channel, "credential_mode": "agent_vault_proxy", "operation": args.operation, "endpoint": ENDPOINTS[args.operation], "model": args.model, "requested_size": args.size, "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(), "created_at": utc_now(), "status": "dry_run" if args.dry_run else "submission_started"}
    if args.dry_run:
        write_receipt(args.receipt, receipt)
        return 0
    if not vault_ready():
        receipt["status"] = "blocked_agent_vault_proxy_not_configured"
        write_receipt(args.receipt, receipt)
        return 2
    if args.output is None:
        raise SystemExit("output required")
    try:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        response = edit_request(ENDPOINTS["edit"], prompt, args.model, args.size, args.reference_image) if args.operation == "edit" else json_request(ENDPOINTS["generate"], {"model": args.model, "prompt": prompt, "n": 1, "size": args.size})
        save_image(response, args.output)
        width, height = image_size(args.output)
        receipt["actual_size"] = f"{width}x{height}"
        receipt["status"] = "accepted_dimensions" if receipt["actual_size"] == args.size else "rejected_dimension_mismatch"
        receipt["completed_at"] = utc_now()
        write_receipt(args.receipt, receipt)
        return 0 if receipt["status"] == "accepted_dimensions" else 3
    except urllib.error.HTTPError as error:
        receipt["status"] = "rejected_http_error"
        receipt["http_status"] = error.code
        receipt["completed_at"] = utc_now()
        write_receipt(args.receipt, receipt)
        return 4
    except Exception as error:
        receipt["status"] = "uncertain_no_retry"
        receipt["error_type"] = type(error).__name__
        receipt["completed_at"] = utc_now()
        write_receipt(args.receipt, receipt)
        return 5

if __name__ == "__main__":
    sys.exit(main())
