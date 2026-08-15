#!/usr/bin/env python3
"""Linux entrypoint for the hash-bound Step01 hq_full analysis toolchain.

The implementation deliberately reuses the accepted evidence generators.  It
only adapts their Mac-only orchestration boundary: roots and credentials are
provided by the Haika systemd environment, never by argv or project files.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LEGACY = ROOT / "mac-employee-training" / "execute_step01_hq_full.py"


def load_legacy():
    spec = importlib.util.spec_from_file_location("haika_hq_contract", LEGACY)
    if not spec or not spec.loader:
        raise RuntimeError("STEP01_HQ_CONTRACT_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def require_regular(path: Path, code: str) -> Path:
    resolved = path.resolve()
    if not resolved.is_file() or resolved.is_symlink():
        raise RuntimeError(code)
    return resolved


def main(argv=None) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--episode-id", default="EP001")
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--analysis-run-id", required=True)
    parser.add_argument("--source-revision", type=int, required=True)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--source-bytes", type=int, required=True)
    parser.add_argument("--step01-skill-root", type=Path, required=True)
    parser.add_argument("--step02-skill-root", type=Path, required=True)
    args = parser.parse_args(argv)

    source = require_regular(args.source, "STEP01_HQ_SOURCE_MISSING")
    if source.stat().st_size != args.source_bytes or sha256_file(source) != args.source_sha256:
        raise RuntimeError("STEP01_HQ_SOURCE_BINDING_INVALID")
    for name in ("MIMO_API_KEY", "PADDLEOCR_API_TOKEN"):
        if not os.environ.get(name, "").strip():
            raise RuntimeError("STEP01_HQ_CREDENTIALS_MISSING")
    step01_root = require_regular(args.step01_skill_root / "scripts" / "build_audio_evidence.py", "STEP01_HQ_STEP01_SKILLS_MISSING").parent.parent
    step02_root = require_regular(args.step02_skill_root / "scripts" / "smart_selective_ocr.py", "STEP01_HQ_STEP02_SKILLS_MISSING").parent.parent
    legacy = load_legacy()
    root = args.output.resolve()
    work = root / "hq_work"
    work.mkdir(parents=True, exist_ok=True)
    dispatch = {
        "local_job_id": args.project_id,
        "remote_project_id": args.project_id,
        "source_sha256": args.source_sha256,
        "source_bytes": args.source_bytes,
    }
    # Finalization requires these durable state objects and rejects empty shells.
    write_json(work / "checkpoint.json", {"node_id":"step01_evidence","job_id":args.project_id,"profile":"hq_full","status":"collecting","downstream_consumable":False})
    write_json(work / "artifact_ledger.json", {"node_id":"step01_evidence","job_id":args.project_id,"profile":"hq_full","status":"collecting","artifacts":[],"downstream_consumable":False})
    # Keep every evidence tool in the locked Haika runtime. The runner itself
    # may be launched by a system Python, but child commands need the configured
    # virtualenv so numpy/OpenCV and the other Step01 dependencies resolve.
    tool_python = Path(os.environ.get("NIANNIAN_STEP01_HQ_PYTHON", sys.executable)).resolve()
    if not tool_python.is_file():
        raise RuntimeError("STEP01_HQ_PYTHON_MISSING")
    plan = legacy.build_command_plan(tool_python, source, work, args.episode_id, step01_root, step02_root)
    legacy.execute_commands(plan, environment=os.environ.copy(), timeout_seconds=max(900, int(os.environ.get("NIANNIAN_STEP01_HQ_COMMAND_TIMEOUT_SEC", "7200"))))
    manifest_path = legacy.canonicalize_manifest(root, work, source, args.episode_id, dispatch)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update({
        "project_id": args.project_id,
        "analysis_run_id": args.analysis_run_id,
        "source_revision": args.source_revision,
        "execution": {"runtime_profile":"haika-step01-hq-full-v1","allowed_skill_routes":["mx-shortdrama-00-router","mx-shortdrama-01-frame-extract"],"model":os.environ.get("NIANNIAN_STEP01_GPT_MODEL", "gpt-5.6-sol"),"provider_submission_requested":False,"package_send_requested":False,"local_image_editing_requested":False},
    })
    write_json(manifest_path, manifest)
    print(json.dumps({"ok":True,"project_id":args.project_id,"analysis_run_id":args.analysis_run_id,"manifest_sha256":sha256_file(manifest_path)}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok":False,"code":str(error).split(":", 1)[0]}, ensure_ascii=False))
        raise
