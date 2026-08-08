"""Local JSONL worker for Qwen3-ForcedAligner.

This process deliberately imports only Qwen3ForcedAligner.  Speech recognition
remains the responsibility of MiMo ASR; requests here must include known text.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path
from typing import Any

MODEL_NAME = os.environ.get("QWEN_FORCED_ALIGNER_MODEL", "Qwen/Qwen3-ForcedAligner-0.6B-hf")
MODEL_PATH = os.environ.get("QWEN_FORCED_ALIGNER_MODEL_PATH", "").strip()
_model: Any | None = None
_processor: Any | None = None


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


def model() -> Any:
    global _model, _processor
    if _model is not None:
        return _model

    import torch
    from transformers import AutoModelForTokenClassification, AutoProcessor

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device.startswith("cuda") else torch.float32
    model_path = MODEL_PATH or MODEL_NAME
    _processor = AutoProcessor.from_pretrained(model_path)
    _model = AutoModelForTokenClassification.from_pretrained(
        model_path,
        dtype=dtype,
        device_map=device,
    )
    return _model


def number(value: Any) -> float:
    value = float(value)
    if value < 0 or not value < float("inf"):
        raise ValueError("aligner returned an invalid timestamp")
    return value


@contextmanager
def decoded_audio(source: str):
    """Give the aligner a standard local WAV and remove it after this request."""
    temp_dir = Path.cwd() / "local-wsl-dev" / "data" / "aligner-tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(prefix="qwen-align-", suffix=".wav", dir=temp_dir, delete=False)
    target = Path(handle.name)
    handle.close()
    try:
        result = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", source, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", str(target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
            message = result.stderr.strip() or "ffmpeg could not decode the source media"
            raise RuntimeError(f"unable to decode audio for forced alignment: {message}")
        yield str(target)
    finally:
        target.unlink(missing_ok=True)


def handle(request: dict[str, Any]) -> dict[str, Any]:
    request_id = request.get("id")
    audio = request.get("audio")
    text = request.get("text")
    if not isinstance(audio, str) or not Path(audio).is_file():
        raise ValueError("audio file is unavailable")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("known text is required")

    import torch

    aligner = model()
    if _processor is None:
        raise RuntimeError("forced aligner processor is unavailable")
    with decoded_audio(audio) as decoded:
        inputs, word_lists = _processor.prepare_forced_aligner_inputs(
            audio=decoded,
            transcript=text.strip(),
            language="Chinese",
        )
        inputs = inputs.to(aligner.device, aligner.dtype)
        with torch.inference_mode():
            outputs = aligner(**inputs)
        results = _processor.decode_forced_alignment(
            logits=outputs.logits,
            input_ids=inputs["input_ids"],
            word_lists=word_lists,
            timestamp_token_id=aligner.config.timestamp_token_id,
        )
    if not isinstance(results, list) or len(results) != 1 or not results[0]:
        raise ValueError("forced aligner returned no timestamps")

    words: list[dict[str, int | str]] = []
    for token in results[0]:
        token_text = str(token.get("text", "")).strip()
        if not token_text:
            continue
        start = round(number(token.get("start_time")) * 1000)
        end = round(number(token.get("end_time")) * 1000)
        if end <= start:
            continue
        words.append({"text": token_text, "start": start, "end": end})
    if not words:
        raise ValueError("forced aligner returned no usable timestamps")

    # The official Chinese aligner normally returns characters.  Preserve its
    # native units verbatim instead of manufacturing a finer timing grid.
    granularity = "character" if all(len(str(word["text"])) == 1 for word in words) else "word"
    return {"id": request_id, "ok": True, "model": MODEL_PATH or MODEL_NAME, "granularity": granularity, "words": words}


def main() -> None:
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be an object")
            emit(handle(request))
        except Exception as error:  # Keep worker alive so the model cache survives a bad request.
            emit({"id": request.get("id") if isinstance(locals().get("request"), dict) else None, "ok": False, "error": str(error)})
            print(traceback.format_exc(), file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
