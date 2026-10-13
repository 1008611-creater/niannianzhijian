#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="${QWEN_FORCED_ALIGNER_NATIVE_ROOT:-$HOME/.cache/niannianzhijian/qwen-forced-aligner}"
VENV="$WORK_ROOT/venv"
MODEL_DIR="$WORK_ROOT/model"
PYTHON="${PYTHON:-python3}"
HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
PYTORCH_INDEX_URL="${PYTORCH_INDEX_URL:-https://download.pytorch.org/whl/cu126}"
PYTORCH_TORCH_VERSION="${PYTORCH_TORCH_VERSION:-2.7.1}"

cd "$ROOT"

command -v uv >/dev/null || { echo "缺少 uv：请先安装 uv" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "缺少 ffmpeg：Qwen 对齐需要解码本地媒体" >&2; exit 1; }

mkdir -p "$WORK_ROOT"
if [[ ! -x "$VENV/bin/python" ]]; then
  uv venv --python "$PYTHON" "$VENV"
fi

# RTX 40-series WSL hosts with NVIDIA 560 drivers support CUDA 12.6 but not
# newer CUDA 13 wheels. Pin a compatible wheel so the aligner does not silently
# fall back to multi-minute CPU inference. Override either variable for another
# supported local CUDA runtime.
uv pip install --python "$VENV/bin/python" --upgrade \
  --index-url "$PYTORCH_INDEX_URL" \
  "torch==$PYTORCH_TORCH_VERSION"

# The official checkpoint requires unreleased native Qwen3-ASR support.
# Keep the verified source revision stable for repeatable local/production setup.
uv pip install --python "$VENV/bin/python" --upgrade \
  https://github.com/huggingface/transformers/archive/943628458a1691f8af09c47ea9fc6e314734722f.zip

HF_ENDPOINT="$HF_ENDPOINT" QWEN_FORCED_ALIGNER_WORK_ROOT="$WORK_ROOT" "$VENV/bin/python" - <<'PY'
import os
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(os.environ["QWEN_FORCED_ALIGNER_WORK_ROOT"])
snapshot_download(
    repo_id="Qwen/Qwen3-ForcedAligner-0.6B-hf",
    local_dir=root / "model",
    allow_patterns=[
        "config.json",
        "model.safetensors",
        "processor_config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "chat_template.jinja",
    ],
)
PY

echo "Qwen3 ForcedAligner 已准备完成：$MODEL_DIR"
