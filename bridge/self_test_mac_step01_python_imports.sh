#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

PROJECT_ROOT="${HOME}/AI-Brain/niannian-ai-canonical-local"
PYTHON_ROOT="${HOME}/AI-Brain/runtime/step01-python312"
PYTHON="${PYTHON_ROOT}/bin/python"
RECEIPT_PATH="${1:-${PROJECT_ROOT}/output/mac-employee-training/mac-step01-python-import-receipt.json}"

[[ -x "$PYTHON" ]] || { printf 'step01_python_import_probe_failed:python_missing\n' >&2; exit 2; }
mkdir -p "$(dirname "$RECEIPT_PATH")"

"$PYTHON" - "$PROJECT_ROOT" "$PYTHON_ROOT" "$RECEIPT_PATH" <<'PY'
import datetime
import importlib
import importlib.metadata
import json
import pathlib
import platform
import sys

project_root, python_root, receipt_path = sys.argv[1:]
targets = {
    "Pillow": ("PIL", "Pillow"),
    "requests": ("requests", "requests"),
    "silero-vad": ("silero_vad", "silero-vad"),
}
imports = {}
for label, (module, distribution) in targets.items():
    try:
        importlib.import_module(module)
        imports[label] = {"ready": True, "version": importlib.metadata.version(distribution)}
    except Exception as exc:
        imports[label] = {"ready": False, "error_type": type(exc).__name__}

ready = platform.system().lower() == "darwin" and all(item["ready"] for item in imports.values())
receipt = {
    "schema_version": "niannian_mac_step01_python_import_receipt_v1",
    "status": "ready" if ready else "blocked",
    "host": {"platform": platform.system().lower(), "project_root": project_root},
    "runtime": {"python_root": python_root, "python_version": platform.python_version()},
    "imports": imports,
    "provider_network_requested": False,
    "analysis_service_network_requested": False,
    "media_provider_network_requested": False,
    "credentials_read": False,
    "user_media_processed": False,
    "real_delivery": False,
    "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
}
target = pathlib.Path(receipt_path)
temporary = target.with_name(target.name + ".tmp")
temporary.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
temporary.replace(target)
print(json.dumps({"ok": ready, "status": receipt["status"], "imports": {key: value["ready"] for key, value in imports.items()}, "credentials_read": False, "user_media_processed": False}))
raise SystemExit(0 if ready else 2)
PY
