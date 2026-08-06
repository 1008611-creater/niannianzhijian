#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

UV_VERSION="0.11.28"
PYTHON_VERSION="3.12.10"
TRANSNET_VERSION="1.0.5"
QWEN_ASR_VERSION="0.0.6"
OPENCV_VERSION="4.12.0.88"
PILLOW_VERSION="11.3.0"
REQUESTS_VERSION="2.32.4"
SILERO_VAD_VERSION="5.1.2"
TORCHAUDIO_VERSION="2.7.1"
RUNTIME_ROOT="${HOME}/AI-Brain/runtime/step01-python312"
UV_BIN="${HOME}/.local/bin/uv"
STATUS_PATH="${HOME}/.config/ai-brain/runtime_capability_status.json"
RECEIPT_PATH="${HOME}/.config/ai-brain/mac-step01-runtime-install-receipt.json"
MODE="self-test"
[[ "${1:-}" == "--install" ]] && MODE="install"

if [[ "$MODE" == "install" ]]; then
  /usr/bin/python3 -m pip install --user "uv==${UV_VERSION}"
  "$UV_BIN" python install "$PYTHON_VERSION"
  if [[ ! -x "$RUNTIME_ROOT/bin/python" ]]; then
    "$UV_BIN" venv --python "$PYTHON_VERSION" --seed "$RUNTIME_ROOT"
  fi
  "$UV_BIN" pip install --python "$RUNTIME_ROOT/bin/python" \
    "torch==2.7.1" \
    "transnetv2-pytorch==${TRANSNET_VERSION}" \
    "qwen-asr==${QWEN_ASR_VERSION}" \
    "opencv-python-headless==${OPENCV_VERSION}" \
    "Pillow==${PILLOW_VERSION}" \
    "requests==${REQUESTS_VERSION}" \
    "silero-vad==${SILERO_VAD_VERSION}" \
    "torchaudio==${TORCHAUDIO_VERSION}"
fi

[[ -x "$RUNTIME_ROOT/bin/python" ]] || { printf 'mac_step01_runtime_self_test_failed:python_runtime_missing\n' >&2; exit 2; }
mkdir -p "$(dirname "$STATUS_PATH")"

"$RUNTIME_ROOT/bin/python" - "$STATUS_PATH" "$RECEIPT_PATH" <<'PY'
import datetime
import importlib.metadata
import json
import pathlib
import sys

status_path = pathlib.Path(sys.argv[1])
receipt_path = pathlib.Path(sys.argv[2])
checked_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')

result = {
    'python_version': sys.version.split()[0],
    'transnetv2': {'installed': False, 'model_constructed_with_packaged_weights': False, 'version': None},
    'forced_aligner': {'installed': False, 'class_imported': False, 'model_weights_loaded': False, 'version': None},
    'opencv': {'installed': False, 'version': None},
}
errors = []
try:
    import cv2
    result['opencv'] = {'installed': True, 'version': cv2.__version__}
except Exception as exc:
    errors.append('opencv_import_failed:' + type(exc).__name__)
try:
    from transnetv2_pytorch import TransNetV2
    model = TransNetV2(device='cpu')
    result['transnetv2'] = {
        'installed': True,
        'model_constructed_with_packaged_weights': True,
        'version': importlib.metadata.version('transnetv2-pytorch'),
        'device': str(model.device),
    }
    del model
except Exception as exc:
    errors.append('transnetv2_self_test_failed:' + type(exc).__name__)
try:
    from qwen_asr import Qwen3ForcedAligner
    result['forced_aligner'] = {
        'installed': True,
        'class_imported': Qwen3ForcedAligner is not None,
        'model_weights_loaded': False,
        'version': importlib.metadata.version('qwen-asr'),
    }
except Exception as exc:
    errors.append('forced_aligner_import_failed:' + type(exc).__name__)

if status_path.exists():
    try:
        status = json.loads(status_path.read_text(encoding='utf-8'))
    except Exception:
        status = {}
else:
    status = {}
status.setdefault('schema_version', 'niannian_runtime_capability_status_v1')
status.setdefault('capabilities', {})
status['updated_at'] = checked_at
status['capabilities']['runtime:transnetv2'] = {
    'status': 'ready' if result['transnetv2']['model_constructed_with_packaged_weights'] else 'failed',
    'checked_at': checked_at,
    'evidence': {
        'method': 'mac_local_runtime_model_self_test',
        'summary': 'transnetv2-pytorch package import and CPU model construction with packaged weights passed.' if result['transnetv2']['model_constructed_with_packaged_weights'] else 'TransNetV2 local model self-test failed; no provider call was made.'
    }
}
existing_forced_aligner = status['capabilities'].get('runtime:forced_aligner') or {}
existing_forced_evidence = existing_forced_aligner.get('evidence') or {}
independent_model_self_test_ready = (
    existing_forced_aligner.get('status') == 'ready'
    and existing_forced_evidence.get('method') == 'mac_local_qwen3_forced_aligner_synthetic_audio_self_test'
)
if not independent_model_self_test_ready:
    status['capabilities']['runtime:forced_aligner'] = {
        'status': 'missing',
        'checked_at': checked_at,
        'evidence': {
            'method': 'mac_local_runtime_import_self_test',
            'summary': 'qwen-asr and Qwen3ForcedAligner class import passed; model weights and real alignment remain unverified.' if result['forced_aligner']['class_imported'] else 'Qwen3ForcedAligner package import failed; no provider call was made.'
        }
    }
status['capabilities']['runtime:hq'] = {
    'status': 'missing',
    'checked_at': checked_at,
    'evidence': {
        'method': 'hq_full_composite_gate',
        'summary': 'hq_full remains blocked until current Mimo ASR and Paddle OCR credential health plus composite profile validation are ready.' if independent_model_self_test_ready else 'hq_full remains blocked until Mimo ASR, Paddle OCR, TransNetV2, ForcedAligner model self-test, and composite profile validation are all ready.'
    }
}
status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
receipt = {
    'schema_version': 'niannian_mac_step01_runtime_install_receipt_v1',
    'status': 'installed_self_tested_with_forced_aligner_model_pending' if not errors and result['transnetv2']['model_constructed_with_packaged_weights'] and result['forced_aligner']['class_imported'] else 'runtime_self_test_failed',
    'runtime_root': str(pathlib.Path(sys.executable).parent.parent),
    'result': result,
    'errors': errors,
    'provider_network_requested': False,
    'provider_submit_requested': False,
    'credentials_read': False,
    'real_media_processed': False,
    'real_alignment_verified': False,
    'checked_at': checked_at,
}
receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False))
if receipt['status'] == 'runtime_self_test_failed':
    raise SystemExit(2)
PY
