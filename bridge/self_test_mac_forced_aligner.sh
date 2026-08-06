#!/bin/bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

MODEL_ID="Qwen/Qwen3-ForcedAligner-0.6B"
MODEL_REVISION="c7cbfc2048c462b0d63a45797104fc9db3ad62b7"
RUNTIME_ROOT="${HOME}/AI-Brain/runtime/step01-python312"
PYTHON_BIN="${RUNTIME_ROOT}/bin/python"
HF_BIN="${RUNTIME_ROOT}/bin/hf"
MODEL_CACHE="${HOME}/AI-Brain/runtime/model-cache"
SNAPSHOT_PATH="${MODEL_CACHE}/models--Qwen--Qwen3-ForcedAligner-0.6B/snapshots/${MODEL_REVISION}"
FFMPEG_BIN="${HOME}/AI-Brain/tools/ffmpeg-runtime/ffmpeg"
STATUS_PATH="${HOME}/.config/ai-brain/runtime_capability_status.json"
RECEIPT_PATH="${HOME}/.config/ai-brain/mac-forced-aligner-self-test-receipt.json"
MODEL_INSTALL_RECEIPT_PATH="${HOME}/.config/ai-brain/mac-forced-aligner-model-install-receipt.json"
MODE="self-test"
[[ "${1:-}" == "--install" ]] && MODE="install"
dependency_network_used=false

[[ -x "$PYTHON_BIN" && -x "$HF_BIN" ]] || { printf 'mac_forced_aligner_self_test_failed:runtime_missing\n' >&2; exit 2; }
[[ -x "$FFMPEG_BIN" ]] || { printf 'mac_forced_aligner_self_test_failed:ffmpeg_missing\n' >&2; exit 2; }

weights_present="$(/usr/bin/find -L "$SNAPSHOT_PATH" -maxdepth 1 \( -name '*.safetensors' -o -name 'pytorch_model.bin' \) -print -quit 2>/dev/null || true)"
if [[ "$MODE" == "install" && -z "$weights_present" ]]; then
  export HF_HUB_ETAG_TIMEOUT=60
  export HF_HUB_DOWNLOAD_TIMEOUT=180
  export HF_HUB_DISABLE_XET=1
  export HF_HUB_ENABLE_HF_TRANSFER=0
  "$HF_BIN" download "$MODEL_ID" --revision "$MODEL_REVISION" --cache-dir "$MODEL_CACHE" --max-workers 1 --quiet >/dev/null
  dependency_network_used=true
fi
[[ -f "$SNAPSHOT_PATH/config.json" ]] || { printf 'mac_forced_aligner_self_test_failed:model_snapshot_missing\n' >&2; exit 2; }
weights_present="$(/usr/bin/find -L "$SNAPSHOT_PATH" -maxdepth 1 \( -name '*.safetensors' -o -name 'pytorch_model.bin' \) -print -quit 2>/dev/null || true)"
[[ -n "$weights_present" ]] || { printf 'mac_forced_aligner_self_test_failed:model_weights_missing\n' >&2; exit 2; }
if [[ ! -f "$MODEL_INSTALL_RECEIPT_PATH" ]]; then
  "$PYTHON_BIN" - "$MODEL_INSTALL_RECEIPT_PATH" "$MODEL_ID" "$MODEL_REVISION" <<'PY'
import datetime, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
receipt = {
    'schema_version': 'niannian_mac_forced_aligner_model_install_receipt_v1',
    'status': 'installed_pinned_huggingface_snapshot',
    'model_id': sys.argv[2],
    'revision': sys.argv[3],
    'dependency_network_used_for_initial_install': True,
    'provider_network_requested': False,
    'provider_submit_requested': False,
    'credentials_read': False,
    'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
}
out.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
PY
fi

self_test_root="$(/usr/bin/mktemp -d)"
trap '[[ -n "${self_test_root:-}" && "$self_test_root" == /var/folders/* ]] && /bin/rm -rf "$self_test_root"' EXIT
/usr/bin/say -v Tingting '你好，念念。' -o "$self_test_root/niannian-tts.aiff"
"$FFMPEG_BIN" -nostdin -hide_banner -loglevel error -i "$self_test_root/niannian-tts.aiff" -ar 16000 -ac 1 -c:a pcm_s16le -y "$self_test_root/niannian-tts.wav"
mkdir -p "$(dirname "$STATUS_PATH")"

"$PYTHON_BIN" - "$SNAPSHOT_PATH" "$self_test_root/niannian-tts.wav" "$STATUS_PATH" "$RECEIPT_PATH" "$MODEL_INSTALL_RECEIPT_PATH" "$MODEL_ID" "$MODEL_REVISION" "$dependency_network_used" <<'PY'
import datetime
import hashlib
import json
import pathlib
import sys
import traceback

snapshot = pathlib.Path(sys.argv[1]).resolve()
audio_path = pathlib.Path(sys.argv[2]).resolve()
status_path = pathlib.Path(sys.argv[3]).resolve()
receipt_path = pathlib.Path(sys.argv[4]).resolve()
model_install_receipt_path = pathlib.Path(sys.argv[5]).resolve()
model_id = sys.argv[6]
revision = sys.argv[7]
dependency_network_used = sys.argv[8] == 'true'
checked_at = datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')

def sha256_file(file_path):
    digest = hashlib.sha256()
    with file_path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()

status_name = 'failed'
safe_error = None
items = []
supported_languages_contains_chinese = False
try:
    import torch
    from qwen_asr import Qwen3ForcedAligner
    aligner = Qwen3ForcedAligner.from_pretrained(
        str(snapshot),
        device_map='cpu',
        dtype=torch.float32,
        local_files_only=True,
    )
    supported = aligner.get_supported_languages()
    config_supported = getattr(aligner.model.config, 'support_languages', None)
    language_values = list(supported or []) + list(config_supported or [])
    supported_languages_contains_chinese = supported is None or any(str(value).strip().lower() == 'chinese' for value in language_values)
    results = aligner.align(audio=str(audio_path), text='你好，念念。', language='Chinese')
    if len(results) != 1 or not results[0].items:
        raise RuntimeError('synthetic_alignment_items_missing')
    for item in results[0].items:
        row = {'text': str(item.text), 'start_time': float(item.start_time), 'end_time': float(item.end_time)}
        if row['start_time'] < 0 or row['end_time'] < row['start_time']:
            raise RuntimeError('synthetic_alignment_timestamp_invalid')
        items.append(row)
    status_name = 'ready'
except Exception as exc:
    safe_error = type(exc).__name__ + ':' + str(exc).replace('\n', ' ')[:240]

model_files = []
for candidate in sorted(snapshot.rglob('*')):
    if candidate.is_file():
        model_files.append({'path': str(candidate.relative_to(snapshot)), 'bytes': candidate.stat().st_size, 'sha256': sha256_file(candidate)})

if status_path.exists():
    try:
        capability_status = json.loads(status_path.read_text(encoding='utf-8'))
    except Exception:
        capability_status = {}
else:
    capability_status = {}
capability_status.setdefault('schema_version', 'niannian_runtime_capability_status_v1')
capability_status.setdefault('capabilities', {})
capability_status['updated_at'] = checked_at
capability_status['capabilities']['runtime:forced_aligner'] = {
    'status': status_name,
    'checked_at': checked_at,
    'evidence': {
        'method': 'mac_local_qwen3_forced_aligner_synthetic_audio_self_test',
        'summary': 'Pinned local model loaded on CPU and returned timestamped items for a synthetic macOS TTS clip; no user media or provider call.' if status_name == 'ready' else 'Pinned local model self-test failed; no user media or provider call.'
    }
}
capability_status['capabilities']['runtime:hq'] = {
    'status': 'missing',
    'checked_at': checked_at,
    'evidence': {
        'method': 'hq_full_composite_gate',
        'summary': 'Local TransNetV2 and ForcedAligner are ready, but hq_full still requires current Mimo ASR and Paddle OCR credential health plus composite profile validation.' if status_name == 'ready' else 'hq_full remains blocked because ForcedAligner model self-test is not ready.'
    }
}
status_path.write_text(json.dumps(capability_status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

receipt = {
    'schema_version': 'niannian_mac_forced_aligner_self_test_receipt_v1',
    'status': 'ready_synthetic_alignment_passed' if status_name == 'ready' else 'failed',
    'model': {'id': model_id, 'revision': revision, 'snapshot_path': str(snapshot), 'files': model_files},
    'self_test': {
        'synthetic_evidence_only': True,
        'input_source': 'macos_tingting_tts',
        'language': 'Chinese',
        'text': '你好，念念。',
        'items': items,
        'supported_languages_contains_chinese': supported_languages_contains_chinese,
        'real_user_media_processed': False,
        'real_project_alignment_verified': False,
    },
    'safe_error': safe_error,
    'model_install_receipt_path': str(model_install_receipt_path),
    'model_dependency_network_used_for_initial_install': True,
    'dependency_network_used': dependency_network_used,
    'provider_network_requested': False,
    'provider_submit_requested': False,
    'credentials_read': False,
    'checked_at': checked_at,
}
receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(receipt, ensure_ascii=False))
if status_name != 'ready':
    raise SystemExit(2)
PY
