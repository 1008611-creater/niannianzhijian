from __future__ import annotations

"""Finalize a Step04 Harness state only after real DOCX visual QA."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON object required: {path}")
    return value


def write_atomic(path: Path, value: Any) -> None:
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-dir", type=Path, required=True)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--docx", type=Path, required=True)
    parser.add_argument("--render-receipt", type=Path, required=True)
    parser.add_argument("--qa-report", type=Path, required=True)
    args = parser.parse_args()

    contract = read(args.contract.resolve())
    receipt = read(args.render_receipt.resolve())
    qa = read(args.qa_report.resolve())
    expected_contract = str(contract.get("contract_sha256") or "")
    if receipt.get("contract_sha256") != expected_contract:
        raise SystemExit("STEP04_FINALIZE_CONTRACT_SHA_MISMATCH")
    if receipt.get("output_docx_path") != str(args.docx.resolve()):
        raise SystemExit("STEP04_FINALIZE_DOCX_PATH_MISMATCH")
    if qa.get("status") != "passed" or qa.get("ok") is not True or not Path(str(qa.get("screenshot_path") or "")).is_file():
        raise SystemExit("STEP04_FINALIZE_VISUAL_QA_FAILED")
    state_path = args.job_dir.resolve() / "harness_state.json"
    state = read(state_path) if state_path.is_file() else {}
    state.update({
        "schema_version": "harness_state_v6_step04_abcd",
        "current_node": "step04_word_delivered",
        "earliest_incomplete_node": "step05",
        "next_action": "Step04 已完成；按路由进入下一未完成节点",
        "blocker": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    output = state.setdefault("current_output", {})
    output.update({
        "step04_contract": {"path": str(args.contract.resolve()), "sha256": sha256_file(args.contract.resolve()), "status": "verified"},
        "step04_word": {"path": str(args.docx.resolve()), "sha256": sha256_file(args.docx.resolve()), "status": "verified"},
        "step04_render_qa": {"path": str(args.qa_report.resolve()), "screenshot_path": str(Path(str(qa["screenshot_path"])).resolve()), "status": "passed"},
    })
    write_atomic(state_path, state)
    result = {
        "result_type": "final_delivery",
        "task_id": state.get("job_id") or args.job_dir.name,
        "evidence_path_or_url": str(args.docx.resolve()),
        "verified_result": "step04_abcd_docx_visual_qa_passed",
        "next_action_or_blocker": "step04_complete",
    }
    print(json.dumps(result, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
