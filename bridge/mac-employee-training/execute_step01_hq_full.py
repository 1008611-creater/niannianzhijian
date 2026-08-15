#!/usr/bin/env python3
"""Authority-bound Step01 hq_full orchestrator for the fixed Mac App employee.

This entrypoint only coordinates the accepted Step01/Step02-helper scripts.  It
does not contain credentials, does not put credentials in argv, and never
grants media-generation Provider authority.  Mimo ASR and Paddle OCR are
analysis services and may only read credentials inherited from the child
environment after the exact project authority has been validated.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


DISPATCH_SCHEMA = "niannian_redraw_step01_mac_employee_dispatch_v1"
AUTHORITY_SCHEMA = "niannian_step01_analysis_service_network_authority_v1"
RIGHTS_SCHEMA = "niannian_source_rights_authority_v1"
SKILL_MANIFEST_SCHEMA = "niannian.step01_evidence_manifest.v1"
CANONICAL_MANIFEST_SCHEMA = "step01_evidence_manifest_v1"
TOOLCHAIN_CONTEXT_SCHEMA = "niannian_step01_hq_full_toolchain_runtime_context_v1"
STEP01_SKILL_ROOT = Path("/Users/lsb/.codex/skills/mx-shortdrama-01-frame-extract")
STEP02_SKILL_ROOT = Path("/Users/lsb/.codex/skills/mx-shortdrama-02-source-timeline")
SIDE_EFFECT_FALSE_FIELDS = (
    "media_provider_network_requested",
    "media_provider_submit_requested",
    "media_provider_upload_requested",
    "spend_requested",
    "package_send_requested",
    "registry_promotion_requested",
    "deployment_requested",
    "local_image_editing_requested",
)
COMMAND_ORDER = (
    "audio_first_mimo_forced_aligner",
    "audio_guided_native_frames",
    "accepted_transnet_pack",
    "paddle_smart_ocr_helper",
    "strict_episode_validation",
    "finalize_canonical_evidence",
)
SCRIPT_SHA256 = {
    # Haika's locked skill bundle is the execution authority. These hashes
    # match the installed bundle validated during the S1 production probe.
    "build_audio_evidence.py": "b49fdfa4fed0695720c7879be64df6c8f79404674a6e8dfc98109cc96738daf4",
    "extract_episode_frames.py": "4addd6ad1a34125eb5cca317a43abe81b790339effc6e323ff74cbb0fe3bf1c5",
    "enhance_episode_evidence.py": "cf4ea0bf4a86cd0ec77804ae8777932c2c1b120798f3c1611fd450170e07bc55",
    "smart_selective_ocr.py": "210a2508938aa17880b2280d2863ac709988ce421637d417daac21923808e8bc",
    "validate_episode_evidence.py": "089200e8e16db91b0b69c7cc4f9fb4f431db75daefff7935ae0571899c5a3deb",
    "finalize_step01_evidence.py": "18d0e3ea98774fc70232fabf9eb8a57faee3dbe9970e388a0009124281212feb",
    "qwen3_forced_aligner_worker.py": "3ea5edf1c0bf2d408e4bc230d5577504a59dfa537ffdb5eea78432abd63bb6f6",
}
EXPECTED_BUNDLE = {
    "archive_sha256": "464ab57bdfa98dfc2f60e89e82fedd5903b8d2ec37cd9a05e8b6a37e9a1accb5",
    "manifest_sha256": "59035cd1b97540ec85c926d4e957c3766b8c106012af725b0abad2f8d1548b09",
    "sensitive_scan_sha256": "b69795579be1cc6845f5bda1dac8e5d989ecb071f463914dce1ed748f6d1fd53",
    "source_snapshot_sha256": "2e9c27f3c783f72f7d36dc846dcd15fd4572fa35ee9b96bc424824ea9a8b309c",
    "skill_file_count": 127,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(file_path: Path):
    return json.loads(file_path.read_text(encoding="utf-8"))


def sync_directory(directory: Path) -> None:
    try:
        descriptor = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_json(file_path: Path, payload) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = file_path.with_name(f".{file_path.name}.tmp-{os.getpid()}-{os.urandom(4).hex()}")
    try:
        with temporary.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, file_path)
        sync_directory(file_path.parent)
    finally:
        if temporary.exists():
            temporary.unlink()


def inside(parent: Path, child: Path, allow_root: bool = False) -> bool:
    parent = parent.resolve()
    child = child.resolve()
    if parent == child:
        return allow_root
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def require_regular(file_path: Path, code: str) -> Path:
    try:
        stats = file_path.lstat()
    except FileNotFoundError as exc:
        raise RuntimeError(code) from exc
    if not file_path.is_file() or file_path.is_symlink() or stats.st_size <= 0:
        raise RuntimeError(code)
    return file_path


def safe_workspace_file(workspace: Path, relative: str, code: str) -> Path:
    raw = str(relative or "").replace("\\", "/")
    parts = raw.split("/")
    if not raw or raw.startswith("/") or any(not part or part in {".", ".."} for part in parts):
        raise RuntimeError(code)
    resolved = (workspace / Path(*parts)).resolve()
    if not inside(workspace, resolved):
        raise RuntimeError(code)
    return require_regular(resolved, code)


def assert_no_embedded_secret(payload) -> None:
    encoded = json.dumps(payload, ensure_ascii=False)
    lowered = encoded.lower()
    if "authorization: bearer " in lowered or "-----begin private key-----" in lowered:
        raise RuntimeError("STEP01_HQ_SECRET_MATERIAL_REJECTED")
    for prefix in ("sk-", "tp-"):
        for token in encoded.split():
            if token.strip('"\',:[]{}').startswith(prefix) and len(token.strip('"\',:[]{}')) >= 15:
                raise RuntimeError("STEP01_HQ_SECRET_MATERIAL_REJECTED")


def validate_inputs(dispatch_path: Path, workspace: Path, source: Path, authority_path: Path):
    dispatch_path = require_regular(dispatch_path.resolve(), "STEP01_HQ_DISPATCH_MISSING")
    workspace = workspace.resolve()
    source = require_regular(source.resolve(), "STEP01_HQ_SOURCE_MISSING")
    authority_path = require_regular(authority_path.resolve(), "STEP01_HQ_AUTHORITY_MISSING")
    if not inside(workspace, dispatch_path) or not inside(workspace, source) or not inside(workspace, authority_path):
        raise RuntimeError("STEP01_HQ_PORTABLE_PATH_ESCAPE")
    dispatch = read_json(dispatch_path)
    authority = read_json(authority_path)
    assert_no_embedded_secret(dispatch)
    assert_no_embedded_secret(authority)
    if dispatch.get("schema_version") != DISPATCH_SCHEMA:
        raise RuntimeError("STEP01_HQ_DISPATCH_SCHEMA_INVALID")
    if dispatch.get("execution_mode") != "step01_hq_full_authorized_analysis_only":
        raise RuntimeError("STEP01_HQ_EXECUTION_MODE_INVALID")
    if dispatch.get("test_only") is not False or dispatch.get("real_delivery") is not False:
        raise RuntimeError("STEP01_HQ_PRODUCTION_BOUNDARY_INVALID")
    for field in SIDE_EFFECT_FALSE_FIELDS:
        if dispatch.get(field) is not False:
            raise RuntimeError(f"STEP01_HQ_SIDE_EFFECT_NOT_FALSE:{field}")
    source_bytes = source.stat().st_size
    source_sha = sha256_file(source)
    if source_sha != dispatch.get("source_sha256") or source_bytes != int(dispatch.get("source_bytes", -1)):
        raise RuntimeError("STEP01_HQ_SOURCE_AUTHORITY_MISMATCH")
    if authority.get("schema_version") != AUTHORITY_SCHEMA or authority.get("status") != "authorized":
        raise RuntimeError("STEP01_HQ_ANALYSIS_AUTHORITY_INVALID")
    for field in ("authorization_event_id", "source_sha256", "settings_version"):
        if authority.get(field) != dispatch.get(field):
            raise RuntimeError(f"STEP01_HQ_ANALYSIS_AUTHORITY_BINDING_INVALID:{field}")
    services = {item.get("service_id") if isinstance(item, dict) else item for item in authority.get("allowed_services", [])}
    if not {"mimo_asr", "paddle_ocr"}.issubset(services):
        raise RuntimeError("STEP01_HQ_ANALYSIS_SERVICE_SCOPE_INVALID")
    for field in ("media_provider_authority_granted", "media_provider_submit_requested", "media_provider_upload_requested", "spend_requested"):
        if authority.get(field) is not False:
            raise RuntimeError(f"STEP01_HQ_ANALYSIS_MEDIA_BOUNDARY_INVALID:{field}")
    rights_path = safe_workspace_file(workspace, dispatch.get("portable", {}).get("rights_authority"), "STEP01_HQ_RIGHTS_PATH_INVALID")
    rights_bytes = rights_path.read_bytes()
    rights = json.loads(rights_bytes)
    pointer = dispatch.get("rights_authority") or {}
    if sha256_bytes(rights_bytes) != pointer.get("sha256") or len(rights_bytes) != int(pointer.get("bytes", -1)):
        raise RuntimeError("STEP01_HQ_RIGHTS_EVIDENCE_MISMATCH")
    if rights.get("schema_version") != RIGHTS_SCHEMA or rights.get("status") != "confirmed" or rights.get("revoked") is not False:
        raise RuntimeError("STEP01_HQ_RIGHTS_NOT_ACTIVE")
    for field, expected in (
        ("event_id", pointer.get("event_id")),
        ("source_sha256", source_sha),
        ("source_bytes", source_bytes),
        ("scope", pointer.get("scope")),
    ):
        if rights.get(field) != expected:
            raise RuntimeError(f"STEP01_HQ_RIGHTS_BINDING_INVALID:{field}")
    phase = dispatch.get("phase_key") or {}
    if phase.get("source_sha256") != source_sha or phase.get("rights_authority_event_id") != rights.get("event_id") or phase.get("rights_authority_sha256") != pointer.get("sha256"):
        raise RuntimeError("STEP01_HQ_PHASE_AUTHORITY_MISMATCH")
    return dispatch, authority, rights


def validate_toolchain_context(workspace: Path, context_path: Path, dispatch):
    context_path = require_regular(context_path.resolve(), "STEP01_HQ_TOOLCHAIN_CONTEXT_MISSING")
    if not inside(workspace, context_path):
        raise RuntimeError("STEP01_HQ_TOOLCHAIN_CONTEXT_PATH_ESCAPE")
    context = read_json(context_path)
    assert_no_embedded_secret(context)
    if context.get("schema_version") != TOOLCHAIN_CONTEXT_SCHEMA:
        raise RuntimeError("STEP01_HQ_TOOLCHAIN_CONTEXT_SCHEMA_INVALID")
    for field, expected in (
        ("dispatch_id", dispatch["dispatch_id"]),
        ("phase_key", dispatch["phase_key"]["key_id"]),
        ("source_sha256", dispatch["source_sha256"]),
        ("source_bytes", int(dispatch["source_bytes"])),
        ("settings_version", dispatch["settings_version"]),
    ):
        if context.get(field) != expected:
            raise RuntimeError(f"STEP01_HQ_TOOLCHAIN_CONTEXT_BINDING_INVALID:{field}")
    for key, expected in EXPECTED_BUNDLE.items():
        if (context.get("bundle") or {}).get(key) != expected:
            raise RuntimeError(f"STEP01_HQ_TOOLCHAIN_CONTEXT_BUNDLE_INVALID:{key}")
    required_hashes = [
        context.get("toolchain_contract_sha256"),
        context.get("entrypoint_sha256"),
        context.get("toolchain_candidate_sha256"),
        *((context.get("receipts") or {}).values()),
    ]
    if any(not isinstance(value, str) or len(value) != 64 for value in required_hashes):
        raise RuntimeError("STEP01_HQ_TOOLCHAIN_CONTEXT_SHA_INVALID")
    expected_paths = {
        "build_audio_evidence": STEP01_SKILL_ROOT / "scripts" / "build_audio_evidence.py",
        "qwen3_forced_aligner_worker": STEP01_SKILL_ROOT / "scripts" / "qwen3_forced_aligner_worker.py",
        "extract_episode_frames": STEP01_SKILL_ROOT / "scripts" / "extract_episode_frames.py",
        "enhance_episode_evidence": STEP01_SKILL_ROOT / "scripts" / "enhance_episode_evidence.py",
        "smart_selective_ocr": STEP02_SKILL_ROOT / "scripts" / "smart_selective_ocr.py",
        "validate_episode_evidence": STEP01_SKILL_ROOT / "scripts" / "validate_episode_evidence.py",
        "finalize_step01_evidence": STEP01_SKILL_ROOT / "scripts" / "finalize_step01_evidence.py",
    }
    skill_files = context.get("skill_files") or {}
    for key, expected_path in expected_paths.items():
        item = skill_files.get(key) or {}
        if Path(str(item.get("exact_path", ""))) != expected_path or item.get("sha256") != SCRIPT_SHA256[expected_path.name]:
            raise RuntimeError(f"STEP01_HQ_TOOLCHAIN_CONTEXT_SKILL_INVALID:{key}")
    for field in SIDE_EFFECT_FALSE_FIELDS:
        if context.get(field) is not False:
            raise RuntimeError(f"STEP01_HQ_TOOLCHAIN_CONTEXT_SIDE_EFFECT_INVALID:{field}")
    if (context.get("analysis_service_network") or {}).get("media_provider_authority_granted") is not False:
        raise RuntimeError("STEP01_HQ_TOOLCHAIN_CONTEXT_MEDIA_AUTHORITY_INVALID")
    return context, {"sha256": sha256_file(context_path), "bytes": context_path.stat().st_size}


def build_command_plan(
    python_executable: Path,
    source: Path,
    output: Path,
    episode_id: str,
    step01_root: Path = STEP01_SKILL_ROOT,
    step02_root: Path = STEP02_SKILL_ROOT,
):
    python_executable = Path(python_executable).resolve()
    source = Path(source).resolve()
    output = Path(output).resolve()
    step01_scripts = Path(step01_root).resolve() / "scripts"
    step02_scripts = Path(step02_root).resolve() / "scripts"
    smart_ocr_dir = output / "smart_ocr"
    step02_support = output / "step02_ocr_support"
    skill_manifest = output / "step01_evidence_manifest.skill.json"
    checkpoint = output / "checkpoint.json"
    artifact_ledger = output / "artifact_ledger.json"
    script_paths = {
        name: (step02_scripts if name == "smart_selective_ocr.py" else step01_scripts) / name
        for name in SCRIPT_SHA256
    }
    verified_script_sha = {}
    for name, script_path in script_paths.items():
        script_path = require_regular(script_path.resolve(), f"STEP01_HQ_SCRIPT_MISSING:{name}")
        actual_sha = sha256_file(script_path)
        if actual_sha != SCRIPT_SHA256[name]:
            raise RuntimeError(f"STEP01_HQ_SCRIPT_SHA_MISMATCH:{name}")
        verified_script_sha[name] = actual_sha
    commands = [
        ("audio_first_mimo_forced_aligner", step01_scripts / "build_audio_evidence.py", [
            "--video", str(source), "--episode-id", episode_id, "--out-dir", str(output),
            "--quality-profile", "hq_full", "--asr-backend", "mimo", "--asr-fallback", "none",
            "--asr-aligner-model", "Qwen/Qwen3-ForcedAligner-0.6B", "--asr-python", str(python_executable),
            "--asr-timeout-sec", "1200", "--mimo-api-base", "auto", "--mimo-auth-header", "api-key",
            "--mimo-concurrency", "2", "--speaker-backend", "auto", "--strict-quality-gate",
        ]),
        ("audio_guided_native_frames", step01_scripts / "extract_episode_frames.py", [
            "--video", str(source), "--episode-id", episode_id, "--out-dir", str(output),
            "--unbounded", "--chunk-sec", "60", "--audio-events", str(output / f"{episode_id}_audio_event_ledger.csv"),
        ]),
        ("accepted_transnet_pack", step01_scripts / "enhance_episode_evidence.py", [
            "--video", str(source), "--episode-id", episode_id, "--out-dir", str(output), "--skip-ocr",
        ]),
        ("paddle_smart_ocr_helper", step02_scripts / "smart_selective_ocr.py", [
            "--episode-id", episode_id, "--step01-dir", str(output), "--step02-dir", str(step02_support),
            "--dialogue-ledger", str(output / f"{episode_id}_dialogue_ledger.csv"), "--out-dir", str(smart_ocr_dir),
            "--engine", "paddle-api", "--paddle-model", "auto", "--paddle-concurrency", "8",
        ]),
        ("strict_episode_validation", step01_scripts / "validate_episode_evidence.py", [
            "--video", str(source), "--episode-id", episode_id, "--out-dir", str(output),
            "--require-source-ffprobe", "--require-audio-ledger", "--require-asr",
        ]),
        ("finalize_canonical_evidence", step01_scripts / "finalize_step01_evidence.py", [
            "--source-video", str(source), "--episode-id", episode_id, "--out-dir", str(output),
            "--quality-profile", "hq_full", "--paddle-receipt", str(smart_ocr_dir / f"{episode_id}_smart_ocr_receipt.json"),
            "--checkpoint", str(checkpoint), "--artifact-ledger", str(artifact_ledger), "--chunk-sec", "60",
            "--manifest", str(skill_manifest),
        ]),
    ]
    plan = []
    for name, script, arguments in commands:
        script = script.resolve()
        script_sha = verified_script_sha[script.name]
        plan.append({
            "name": name,
            "command": [str(python_executable), str(script), *arguments],
            "script_sha256": script_sha,
            "credential_transport": "child_environment_only",
            "analysis_service_network": name in {"audio_first_mimo_forced_aligner", "paddle_smart_ocr_helper"},
            "media_provider_network_requested": False,
        })
    plan[0]["required_dependency_sha256"] = {
        "qwen3_forced_aligner_worker.py": verified_script_sha["qwen3_forced_aligner_worker.py"]
    }
    validate_command_plan(plan)
    return plan


def validate_command_plan(plan) -> None:
    if tuple(item.get("name") for item in plan) != COMMAND_ORDER:
        raise RuntimeError("STEP01_HQ_COMMAND_ORDER_INVALID")
    forbidden = {"--mimo-api-key", "--mimo-key-file", "--paddle-api-token", "--authorization", "--cookie", "--token"}
    for item in plan:
        command = item.get("command") or []
        if any(flag in command for flag in forbidden):
            raise RuntimeError(f"STEP01_HQ_SECRET_ARGV_FORBIDDEN:{item.get('name')}")
        if item.get("media_provider_network_requested") is not False:
            raise RuntimeError("STEP01_HQ_MEDIA_PROVIDER_BOUNDARY_INVALID")


def redact_tool_diagnostic(value: str, secret_values=()) -> str:
    text = str(value or "")[-16000:]
    for secret in secret_values:
        secret = str(secret or "")
        if len(secret) >= 8:
            text = text.replace(secret, "[REDACTED_CREDENTIAL]")
    patterns = (
        (r"(?i)\b(?:sk|tp)-[A-Za-z0-9_-]{8,}\b", "[REDACTED_CREDENTIAL]"),
        (r"(?i)\bbearer\s+[A-Za-z0-9_./+=-]{8,}", "bearer [REDACTED]"),
        (r"(?i)(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization)\s*[:=]\s*[^\s,;]+", r"\1=[REDACTED]"),
    )
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text)
    return text.replace("\r", " ").replace("\n", " ")[-2000:]


def execute_commands(plan, runner=None, environment=None, timeout_seconds=7200):
    runner = runner or subprocess.run
    environment = dict(os.environ if environment is None else environment)
    sensitive_name = re.compile(r"(?i)(?:key|token|secret|password|authorization|credential)")
    secret_values = tuple(
        str(value) for name, value in environment.items()
        if sensitive_name.search(str(name)) and len(str(value or "")) >= 8
    )
    completed = []
    for item in plan:
        result = runner(
            item["command"],
            cwd=str(Path(item["command"][1]).parent),
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return_code = int(getattr(result, "returncode", 1))
        if return_code != 0:
            stdout_tail = redact_tool_diagnostic(getattr(result, "stdout", ""), secret_values)
            stderr_tail = redact_tool_diagnostic(getattr(result, "stderr", ""), secret_values)
            raise RuntimeError(
                f"STEP01_HQ_TOOL_FAILED:{item['name']}:{return_code}:"
                f"stdout={stdout_tail}:stderr={stderr_tail}"
            )
        completed.append(item["name"])
    return completed


def file_evidence(file_path: Path, workspace: Path):
    file_path = require_regular(file_path.resolve(), "STEP01_HQ_ARTIFACT_MISSING")
    if not inside(workspace, file_path):
        raise RuntimeError("STEP01_HQ_ARTIFACT_PATH_ESCAPE")
    return {
        "relative_path": file_path.relative_to(workspace).as_posix(),
        "sha256": sha256_file(file_path),
        "bytes": file_path.stat().st_size,
    }


def read_csv_rows(file_path: Path):
    with file_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def validate_dialogue_subtitle_coverage(output: Path, ocr_root: Path, episode_id: str, aligner: dict):
    dialogue_path = require_regular(
        output / f"{episode_id}_dialogue_ledger.csv",
        "STEP01_HQ_DIALOGUE_LEDGER_MISSING",
    )
    ocr_path = require_regular(
        ocr_root / f"{episode_id}_smart_ocr_ledger.csv",
        "STEP01_HQ_OCR_LEDGER_MISSING",
    )
    dialogue_rows = [row for row in read_csv_rows(dialogue_path) if str(row.get("text") or "").strip()]
    subtitle_rows = []
    previous = ""
    for row in sorted(read_csv_rows(ocr_path), key=lambda item: float(item.get("time_sec") or 0)):
        if str(row.get("region") or "") != "lower_subtitle":
            continue
        text = re.sub(r"\s+", " ", str(row.get("ocr_text") or "")).strip().casefold()
        if text and text != previous:
            subtitle_rows.append(row)
            previous = text
    if not dialogue_rows:
        raise RuntimeError("STEP01_HQ_DIALOGUE_LEDGER_EMPTY")
    if len(subtitle_rows) >= 4:
        minimum_dialogue_rows = max(2, math.ceil(len(subtitle_rows) * 0.5))
        if len(dialogue_rows) < minimum_dialogue_rows:
            raise RuntimeError("STEP01_HQ_ASR_SUBTITLE_COVERAGE_INSUFFICIENT")
        latest_subtitle_sec = max(float(row.get("time_sec") or 0) for row in subtitle_rows)
        aligned_end_sec = float(((aligner.get("coverage") or {}).get("end_sec") or 0))
        if aligned_end_sec + 3.0 < latest_subtitle_sec:
            raise RuntimeError("STEP01_HQ_FORCED_ALIGNMENT_DRIFT_EXCESSIVE")
    return {
        "dialogue_rows": len(dialogue_rows),
        "subtitle_changes": len(subtitle_rows),
        "aligned_end_sec": float(((aligner.get("coverage") or {}).get("end_sec") or 0)),
        "status": "passed",
    }


def canonicalize_manifest(workspace: Path, output: Path, source: Path, episode_id: str, dispatch) -> Path:
    skill_manifest_path = require_regular(output / "step01_evidence_manifest.skill.json", "STEP01_HQ_SKILL_MANIFEST_MISSING")
    skill_manifest = read_json(skill_manifest_path)
    if skill_manifest.get("schema") != SKILL_MANIFEST_SCHEMA or skill_manifest.get("status") != "verified" or skill_manifest.get("quality_profile") != "hq_full" or skill_manifest.get("downstream_consumable") is not True:
        raise RuntimeError("STEP01_HQ_SKILL_MANIFEST_NOT_VERIFIED")
    gates = skill_manifest.get("gates") or {}
    if not gates or not all(value is True for value in gates.values()):
        raise RuntimeError("STEP01_HQ_SKILL_MANIFEST_GATE_FAILED")
    source_record = skill_manifest.get("source") or {}
    if source_record.get("sha256") != dispatch.get("source_sha256") or int(source_record.get("bytes", -1)) != int(dispatch.get("source_bytes", -1)):
        raise RuntimeError("STEP01_HQ_SKILL_MANIFEST_SOURCE_MISMATCH")
    canonical_root = output / "canonical_contract"
    canonical_root.mkdir(parents=True, exist_ok=True)
    probe = source_record.get("ffprobe") or {}
    normalized_probe = {
        "width": int(probe.get("width", 0)),
        "height": int(probe.get("height", 0)),
        "duration_seconds": float(probe.get("duration_sec", 0)),
        "fps": probe.get("avg_frame_rate") or probe.get("r_frame_rate") or "",
        "source_sha256": dispatch["source_sha256"],
    }
    probe_path = canonical_root / "source_ffprobe.json"
    atomic_json(probe_path, normalized_probe)

    transnet_source = require_regular(output / "transnet_shots" / f"{episode_id}_transnet_shots.json", "STEP01_HQ_TRANSNET_JSON_MISSING")
    transnet_rows = read_json(transnet_source)
    if not isinstance(transnet_rows, list) or not transnet_rows:
        raise RuntimeError("STEP01_HQ_TRANSNET_ROWS_EMPTY")
    accepted_path = canonical_root / "accepted_transnet_shots.json"
    atomic_json(accepted_path, {"status": "accepted", "detector": "TransNetV2", "shots": transnet_rows})
    accepted_evidence = file_evidence(accepted_path, workspace)

    supplement_source = require_regular(output / "shotlevel_start_mid_end_manifest.json", "STEP01_HQ_TRANSNET_SUPPLEMENT_MISSING")
    supplement_rows = read_json(supplement_source)
    expected_points = {str(row.get("shot_id")): {"start", "mid", "end"} for row in transnet_rows}
    normalized_supplement = []
    for row in supplement_rows if isinstance(supplement_rows, list) else []:
        shot_id = str(row.get("shot_id"))
        point = str(row.get("point"))
        if row.get("source_detector") != "transnetv2" or shot_id not in expected_points or point not in expected_points[shot_id]:
            raise RuntimeError("STEP01_HQ_TRANSNET_SUPPLEMENT_BINDING_INVALID")
        frame = require_regular(Path(row.get("path", "")).resolve(), "STEP01_HQ_TRANSNET_FRAME_MISSING")
        normalized_supplement.append({"shot_id": shot_id, "point": point, **file_evidence(frame, workspace)})
    for shot_id in expected_points:
        actual = {row["point"] for row in normalized_supplement if row["shot_id"] == shot_id}
        if actual != expected_points[shot_id]:
            raise RuntimeError("STEP01_HQ_TRANSNET_SUPPLEMENT_COVERAGE_INVALID")
    supplement_path = canonical_root / "accepted_transnet_start_mid_end.json"
    atomic_json(supplement_path, {"source_shots_sha256": accepted_evidence["sha256"], "rows": normalized_supplement})

    aligner_source = require_regular(output / f"{episode_id}_qwen3_forced_aligner_receipt.json", "STEP01_HQ_ALIGNER_RECEIPT_MISSING")
    aligner = read_json(aligner_source)
    if aligner.get("ok") is not True or aligner.get("status") != "completed" or aligner.get("transcript_origin") != "mimo_asr" or aligner.get("timestamps_are_forced_alignment") is not True or aligner.get("asr_model_invoked") is not False or aligner.get("test_only") is not False:
        raise RuntimeError("STEP01_HQ_ALIGNER_RECEIPT_INVALID")
    transcript_sha = (aligner.get("mimo_transcript") or {}).get("sha256")
    if not isinstance(transcript_sha, str) or len(transcript_sha) != 64:
        raise RuntimeError("STEP01_HQ_MIMO_TRANSCRIPT_BINDING_MISSING")
    mimo_path = canonical_root / "mimo_transcript_receipt.json"
    atomic_json(mimo_path, {"status": "passed", "backend": "mimo", "transcript_sha256": transcript_sha, "timestamps": False, "fallback_used": False, "source_receipt": file_evidence(aligner_source, workspace)})
    aligner_path = canonical_root / "forced_aligner_receipt.json"
    atomic_json(aligner_path, {"status": "passed", "backend": "Qwen3-ForcedAligner-0.6B", "input_transcript_sha256": transcript_sha, "timestamps": True, "segment_count": int(aligner.get("segments", 0)), "source_receipt": file_evidence(aligner_source, workspace)})

    ocr_root = output / "smart_ocr"
    ocr_source = require_regular(ocr_root / f"{episode_id}_smart_ocr_receipt.json", "STEP01_HQ_OCR_RECEIPT_MISSING")
    ocr = read_json(ocr_source)
    terminal_path = require_regular(ocr_root / f"{episode_id}_smart_ocr_terminal_jobs.json", "STEP01_HQ_OCR_TERMINAL_JOBS_MISSING")
    terminal_rows = read_json(terminal_path)
    if ocr.get("ok") is not True or ocr.get("status") != "completed" or int(ocr.get("errors", -1)) != 0 or int(ocr.get("ocr_rows", 0)) < 1 or (ocr.get("terminal_coverage") or {}).get("complete") is not True:
        raise RuntimeError("STEP01_HQ_OCR_RECEIPT_INVALID")
    selected = []
    seen_jobs = set()
    for index, row in enumerate(terminal_rows if isinstance(terminal_rows, list) else []):
        job_id = str(row.get("job_id") or "")
        if not job_id or job_id in seen_jobs or row.get("terminal") is not True:
            raise RuntimeError("STEP01_HQ_OCR_TERMINAL_READBACK_INVALID")
        seen_jobs.add(job_id)
        selected.append({"candidate_id": str(row.get("order") or index + 1), "job_id": job_id, "status": "completed"})
    if not selected:
        raise RuntimeError("STEP01_HQ_OCR_TERMINAL_READBACK_EMPTY")
    dialogue_coverage = validate_dialogue_subtitle_coverage(output, ocr_root, episode_id, aligner)
    ocr_path = canonical_root / "paddle_terminal_receipt.json"
    atomic_json(ocr_path, {"status": "passed", "errors": [], "ledger_count": int(ocr["ocr_rows"]), "selected_candidates": selected, "interrupted_job_ids": [], "source_receipt": file_evidence(ocr_source, workspace), "terminal_jobs": file_evidence(terminal_path, workspace)})

    validation_source = require_regular(output / f"{episode_id}_evidence_validation.json", "STEP01_HQ_VALIDATION_RECEIPT_MISSING")
    validation = read_json(validation_source)
    if validation.get("ok") is not True or validation.get("source_ffprobe_resolution_verified") is not True:
        raise RuntimeError("STEP01_HQ_VALIDATION_RECEIPT_INVALID")
    validation_path = canonical_root / "hard_gate_validation_receipt.json"
    atomic_json(validation_path, {"status": "passed", "hard_gates": {"mimo_forced_aligner_pass": True, "dialogue_subtitle_coverage_pass": True, "exact_source_resolution_pass": True, "transnet_supplement_pass": True, "paddle_terminal_readback_pass": True, "artifact_hashes_pass": True}, "dialogue_coverage": dialogue_coverage, "source_receipt": file_evidence(validation_source, workspace), "skill_manifest": file_evidence(skill_manifest_path, workspace)})

    frame_manifest_path = require_regular(output / f"{episode_id}_frame_manifest.json", "STEP01_HQ_FRAME_MANIFEST_MISSING")
    frames = [file_evidence(path, workspace) for path in sorted((output / "reference_frames_original").glob("*.png"))]
    if not frames:
        raise RuntimeError("STEP01_HQ_NATIVE_FRAME_SET_EMPTY")
    duration = float(normalized_probe["duration_seconds"])
    chunk_index_path = require_regular(output / "minute_chunks" / f"{episode_id}_minute_chunks_index.json", "STEP01_HQ_MINUTE_INDEX_MISSING")
    chunk_rows = read_json(chunk_index_path)
    chunks = []
    for expected_index, row in enumerate(chunk_rows if isinstance(chunk_rows, list) else [], 1):
        if int(row.get("chunk_index", 0)) != expected_index:
            raise RuntimeError("STEP01_HQ_MINUTE_INDEX_INVALID")
        chunks.append({"index": expected_index, "start_sec": float(row.get("start_sec", 0)), "end_sec": min(float(row.get("end_sec", 0)), duration)})
    if len(chunks) != math.ceil(duration / 60):
        raise RuntimeError("STEP01_HQ_MINUTE_COVERAGE_INVALID")

    wav_path = require_regular(output / "audio" / f"{episode_id}_16k_mono.wav", "STEP01_HQ_AUDIO_WAV_MISSING")
    audio_ledger = require_regular(output / f"{episode_id}_audio_event_ledger.csv", "STEP01_HQ_AUDIO_LEDGER_MISSING")
    ocr_ledger = require_regular(ocr_root / f"{episode_id}_smart_ocr_ledger.csv", "STEP01_HQ_OCR_LEDGER_MISSING")
    artifacts = []
    for candidate in sorted(output.rglob("*")):
        if candidate.is_symlink():
            raise RuntimeError("STEP01_HQ_OUTPUT_SYMLINK_REJECTED")
        if candidate.is_file() and candidate.name != "step01_evidence_manifest.json":
            artifacts.append(file_evidence(candidate, workspace))
    canonical_manifest = {
        "schema_version": CANONICAL_MANIFEST_SCHEMA,
        "job_id": dispatch["local_job_id"],
        "source_sha256": dispatch["source_sha256"],
        "source_bytes": int(dispatch["source_bytes"]),
        "status": "verified",
        "profile": "hq_full",
        "downstream_consumable": True,
        "source": {"ffprobe": file_evidence(probe_path, workspace)},
        "minute_chunks": {"index": file_evidence(chunk_index_path, workspace), "chunks": chunks},
        "native_frames": {"manifest": file_evidence(frame_manifest_path, workspace), "frames": frames},
        "transnet": {"accepted_shots": accepted_evidence, "shot_supplement": file_evidence(supplement_path, workspace)},
        "audio": {"wav": file_evidence(wav_path, workspace), "event_ledger": file_evidence(audio_ledger, workspace), "mimo_transcript_receipt": file_evidence(mimo_path, workspace), "forced_aligner_receipt": file_evidence(aligner_path, workspace)},
        "ocr": {"ledger": file_evidence(ocr_ledger, workspace), "receipt": file_evidence(ocr_path, workspace)},
        "validation": {"receipt": file_evidence(validation_path, workspace)},
        "artifacts": artifacts,
        "analysis_service_network": {"requested": True, "used": True, "allowed_services": ["mimo_asr", "paddle_ocr"], "media_provider_authority_granted": False},
        "test_only": False,
        "real_delivery": False,
        "media_provider_network_requested": False,
        "media_provider_submit_requested": False,
        "media_provider_upload_requested": False,
        "spend_requested": False,
        "deployment_requested": False,
        "updated_at": utc_now(),
    }
    canonical_path = output.parent / "step01_evidence_manifest.json"
    atomic_json(canonical_path, canonical_manifest)
    return canonical_path


def initialize_state(output: Path, dispatch) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "step02_ocr_support").mkdir(parents=True, exist_ok=True)
    shared = {
        "node_id": "step01_evidence",
        "job_id": dispatch["local_job_id"],
        "remote_project_id": dispatch["remote_project_id"],
        "source_sha256": dispatch["source_sha256"],
        "source_bytes": int(dispatch["source_bytes"]),
        "rights_authority_event_id": dispatch["rights_authority"]["event_id"],
        "rights_authority_sha256": dispatch["rights_authority"]["sha256"],
        "authorization_event_id": dispatch["authorization_event_id"],
        "settings_version": dispatch["settings_version"],
        "profile": "hq_full",
        "media_provider_network_requested": False,
        "media_provider_submit_requested": False,
        "spend_requested": False,
        "real_delivery": False,
        "updated_at": utc_now(),
    }
    atomic_json(output / "checkpoint.json", {**shared, "status": "in_progress", "current_phase": "audio_first", "completed": [], "downstream_consumable": False})
    atomic_json(output / "artifact_ledger.json", {**shared, "status": "collecting", "artifacts": [], "downstream_consumable": False})


def execute(args, runner=None):
    step01_root = args.step01_skill_root or STEP01_SKILL_ROOT
    step02_root = args.step02_skill_root or STEP02_SKILL_ROOT
    if args.test_mode:
        if os.environ.get("MX_STEP01_TEST_MODE") != "1" or not args.plan_only:
            raise RuntimeError("STEP01_HQ_TEST_MODE_EXECUTION_FORBIDDEN")
    elif args.step01_skill_root is not None or args.step02_skill_root is not None:
        raise RuntimeError("STEP01_HQ_PRODUCTION_SKILL_ROOT_OVERRIDE_FORBIDDEN")
    dispatch, authority, rights = validate_inputs(args.dispatch, args.workspace, args.source, args.authority)
    output = args.output.resolve()
    if not inside(args.workspace, output):
        raise RuntimeError("STEP01_HQ_OUTPUT_PATH_ESCAPE")
    plan = build_command_plan(Path(sys.executable), args.source, output, args.episode_id, step01_root, step02_root)
    if args.plan_only:
        return {"ok": True, "status": "plan_only", "commands": plan, "real_delivery": False}
    if args.toolchain_context is None:
        raise RuntimeError("STEP01_HQ_TOOLCHAIN_CONTEXT_REQUIRED")
    context, context_evidence = validate_toolchain_context(args.workspace, args.toolchain_context, dispatch)
    initialize_state(output, dispatch)
    completed = execute_commands(plan, runner=runner, environment=os.environ.copy(), timeout_seconds=args.timeout_seconds)
    canonical_path = canonicalize_manifest(args.workspace, output, args.source, args.episode_id, dispatch)
    receipt = {
        "schema_version": "niannian_step01_hq_full_toolchain_execution_receipt_v1",
        "status": "completed_verified",
        "dispatch_id": dispatch["dispatch_id"],
        "phase_key": dispatch["phase_key"]["key_id"],
        "source_sha256": dispatch["source_sha256"],
        "rights_authority_event_id": rights["event_id"],
        "analysis_authority_event_id": authority["authorization_event_id"],
        "commands_completed": completed,
        "evidence_manifest": file_evidence(canonical_path, args.workspace),
        "toolchain_context_sha256": context_evidence["sha256"],
        "bindings": {
            "toolchain_contract_sha256": context["toolchain_contract_sha256"],
            "entrypoint_sha256": context["entrypoint_sha256"],
            "toolchain_candidate_sha256": context["toolchain_candidate_sha256"],
            "bundle_manifest_sha256": context["bundle"]["manifest_sha256"],
            "install_receipt_sha256": context["receipts"]["install_sha256"],
            "parity_receipt_sha256": context["receipts"]["parity_sha256"],
            "adoption_manifest_sha256": context["receipts"]["adoption_manifest_sha256"],
            "hq_gate_sha256": context["receipts"]["hq_gate_sha256"],
        },
        "credential_transport": "child_environment_only",
        "analysis_service_network": {"requested": True, "used": True, "allowed_services": ["mimo_asr", "paddle_ocr"]},
        "media_provider_network_requested": False,
        "media_provider_submit_requested": False,
        "media_provider_upload_requested": False,
        "spend_requested": False,
        "package_send_requested": False,
        "registry_promotion_requested": False,
        "deployment_requested": False,
        "local_image_editing_requested": False,
        "real_delivery": False,
        "completed_at": utc_now(),
    }
    atomic_json(output / "step01_hq_toolchain_execution_receipt.json", receipt)
    return {"ok": True, "status": receipt["status"], "evidence_manifest": str(canonical_path), "real_delivery": False}


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--dispatch", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--authority", type=Path, required=True)
    parser.add_argument("--toolchain-context", type=Path)
    parser.add_argument("--episode-id", default="EP001")
    parser.add_argument("--step01-skill-root", type=Path)
    parser.add_argument("--step02-skill-root", type=Path)
    parser.add_argument("--timeout-seconds", type=int, default=7200)
    parser.add_argument("--plan-only", action="store_true")
    parser.add_argument("--test-mode", action="store_true")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    try:
        result = execute(args)
    except Exception as exc:
        detail = redact_tool_diagnostic(str(exc))
        code = detail.split(":", 1)[0] or exc.__class__.__name__
        print(json.dumps({"ok": False, "status": "blocked_contract", "blocker_code": code, "blocker_detail": detail, "real_delivery": False}, ensure_ascii=False))
        raise SystemExit(2)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
