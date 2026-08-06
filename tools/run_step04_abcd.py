from __future__ import annotations

"""Single Harness entry point for the strict Step04 A/B/C/D compiler.

This runner owns only recovery state. It never infers facts, calls a Provider,
or falls back to the legacy free-text Word builders. The compiler remains the
single semantic owner; this file records the earliest failed layer and exact
artifact paths so a later run can resume without guessing.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


COMPILER = Path(__file__).with_name("step04_abcd_compiler.py").resolve()
LIFECYCLE_RECONCILER = Path(__file__).with_name("reconcile_asset_lifecycle.py").resolve()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path, default: Any = None) -> Any:
    if not path.is_file():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def ref(path: Path) -> dict[str, Any]:
    return {"path": str(path.resolve()), "sha256": sha256_file(path), "status": "verified"}


def update_state(state_path: Path, *, node: str, next_action: str, blocker: str | None, run_id: str, outputs: dict[str, Any] | None = None) -> None:
    state = read_json(state_path, {})
    if not isinstance(state, dict):
        state = {}
    state.update({
        "schema_version": "harness_state_v6_step04_abcd",
        "current_node": node,
        "earliest_incomplete_node": node,
        "next_action": next_action,
        "blocker": blocker,
        "run_id": run_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    if outputs:
        current = state.setdefault("current_output", {})
        current.update(outputs)
    write_json_atomic(state_path, state)


def verified_pending_contract(state: dict[str, Any], required_dir: Path) -> Path | None:
    """Resume only the D renderer when the immutable A/B/C contract is intact."""
    if str(state.get("current_node") or "") != "step04d_render_pending":
        return None
    record = ((state.get("current_output") or {}).get("step04_contract") or {})
    path = Path(str(record.get("path") or ""))
    expected_sha = str(record.get("sha256") or "").lower()
    if not path.is_file() or not expected_sha or sha256_file(path) != expected_sha:
        return None
    required_layers = (
        "step04a_entity_binding.json",
        "step04b_asset_continuity.json",
        "step04c_prompt_ir.json",
        "step04d_delivery_manifest.json",
    )
    if any(not (required_dir / name).is_file() for name in required_layers):
        return None
    return path.resolve()


def parse_result(stdout: str) -> dict[str, Any]:
    for line in reversed([line.strip() for line in stdout.splitlines() if line.strip()]):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "result_type" in value:
            return value
    return {
        "result_type": "external_blocked",
        "verified_result": "STEP04_COMPILER_NO_TYPED_RESULT",
        "next_action_or_blocker": "编译器没有返回结构化终态",
        "evidence_path_or_url": "",
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Run the strict Step04 A/B/C/D compiler and update job-local Harness state.")
    parser.add_argument("--job-dir", type=Path, required=True)
    parser.add_argument("--step02-manifest", type=Path, required=True)
    parser.add_argument("--identity-bindings", type=Path, required=True)
    parser.add_argument("--asset-registry", type=Path, required=True)
    parser.add_argument("--production-registry", type=Path, required=False)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--source-path", type=Path, required=False)
    parser.add_argument("--source-sha256", required=True)
    parser.add_argument("--run-id", default="")
    args = parser.parse_args()

    job_dir = args.job_dir.resolve()
    state_path = job_dir / "harness_state.json"
    run_id = args.run_id or f"STEP04_ABCD_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    production_registry = (args.production_registry or (job_dir / "step05" / "asset_production_registry.json")).resolve()
    if production_registry.is_file():
        lifecycle_gate = job_dir / "step05" / "asset_lifecycle_gate.json"
        lifecycle = subprocess.run(
            [
                sys.executable, str(LIFECYCLE_RECONCILER),
                "--step02-manifest", str(args.step02_manifest.resolve()),
                "--production-registry", str(production_registry),
                "--out", str(lifecycle_gate),
            ],
            capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
        )
        lifecycle_result = parse_result(lifecycle.stdout)
        if lifecycle.returncode != 0:
            update_state(
                state_path,
                node="step05_asset_authority_reconciliation",
                next_action="只恢复资产生命周期报告列出的最早缺失阶段",
                blocker=str(lifecycle_result.get("verified_result") or "ASSET_LIFECYCLE_GATE_BLOCKED"),
                run_id=run_id,
                outputs={"asset_lifecycle_gate": ref(lifecycle_gate)} if lifecycle_gate.is_file() else None,
            )
            sys.stdout.write(json.dumps(lifecycle_result, ensure_ascii=True) + "\n")
            return 2
    existing_state = read_json(state_path, {})
    pending_contract = verified_pending_contract(existing_state, args.out_dir.resolve())
    if pending_contract:
        update_state(
            state_path,
            node="step04d_render_pending",
            next_action="仅从 A/B/C 合同渲染 DOCX，并执行真实预览截图 QA",
            blocker=None,
            run_id=run_id,
            outputs={"step04_contract": ref(pending_contract)},
        )
        result = {
            "result_type": "final_delivery",
            "task_id": "step04-abcd-resume",
            "evidence_path_or_url": str(pending_contract),
            "verified_result": "STEP04_CONTRACT_ALREADY_VERIFIED",
            "next_action_or_blocker": "docx_renderer",
        }
        sys.stdout.write(json.dumps(result, ensure_ascii=True) + "\n")
        return 0
    update_state(
        state_path,
        node="step04a_input_gate",
        next_action="验证 Step02 语义放行清单，然后进入 A/B/C 编译",
        blocker=None,
        run_id=run_id,
    )

    command = [
        sys.executable,
        str(COMPILER),
        "--step02-manifest", str(args.step02_manifest.resolve()),
        "--identity-bindings", str(args.identity_bindings.resolve()),
        "--asset-registry", str(args.asset_registry.resolve()),
        "--out-dir", str(args.out_dir.resolve()),
        "--source-sha256", args.source_sha256,
    ]
    if args.source_path:
        command.extend(["--source-path", str(args.source_path.resolve())])

    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    result = parse_result(completed.stdout)
    evidence = Path(str(result.get("evidence_path_or_url") or "")) if result.get("evidence_path_or_url") else None
    if result.get("result_type") == "final_delivery" and evidence and evidence.is_file():
        outputs = {
            "step04_contract": ref(evidence),
            "step04_layers": {
                name: ref(args.out_dir.resolve() / name)
                for name in ("step04a_entity_binding.json", "step04b_asset_continuity.json", "step04c_prompt_ir.json", "step04d_delivery_manifest.json")
                if (args.out_dir.resolve() / name).is_file()
            },
        }
        update_state(
            state_path,
            node="step04d_render_pending",
            next_action="仅从 A/B/C 合同渲染 DOCX，并执行真实预览截图 QA",
            blocker=None,
            run_id=run_id,
            outputs=outputs,
        )
    else:
        gate = args.out_dir.resolve() / "step04_input_gate_report.json"
        if gate.is_file():
            update_state(
                state_path,
                node="step04a_input_gate",
                next_action="只对报告列出的 Step02 冲突区间做定向复核，不重跑成功批次",
                blocker=str(result.get("verified_result") or "STEP04_BLOCKED"),
                run_id=run_id,
                outputs={"step04_input_gate": ref(gate)},
            )
        else:
            update_state(
                state_path,
                node="step04a_input_gate",
                next_action=str(result.get("next_action_or_blocker") or "修复 Step04 输入后重试"),
                blocker=str(result.get("verified_result") or "STEP04_COMPILER_BLOCKED"),
                run_id=run_id,
            )

    # Keep the machine return ASCII-safe for Windows shells; evidence files
    # retain UTF-8 Chinese content and are the authoritative readable record.
    sys.stdout.write(json.dumps(result, ensure_ascii=True) + "\n")
    return 0 if result.get("result_type") == "final_delivery" and completed.returncode == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
