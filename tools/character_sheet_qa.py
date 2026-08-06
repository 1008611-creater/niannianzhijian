from __future__ import annotations

"""Apply a structured character-sheet QA result to a job-local lifecycle.

Visual assessment is supplied by the approved QA producer.  This runner owns
only the irreversible lifecycle decision: a passed sheet becomes final; a
first failure may prepare one constrained retry; a second failure blocks the
asset.  It never calls an image provider or redesigns a character.
"""

import argparse
import copy
import json
from datetime import datetime, timezone
from pathlib import Path

from asset_lifecycle import CHARACTER_QA_CHECKS, AssetLifecycleError, read_json, validate_final_asset, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply final character-sheet QA with one same-parent retry.")
    parser.add_argument("--production-registry", type=Path, required=True)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--qa-result", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        registry = read_json(args.production_registry)
        qa = read_json(args.qa_result)
        assets = registry.get("assets") or []
        asset = next((item for item in assets if isinstance(item, dict) and str(item.get("asset_id") or "") == args.asset_id), None)
        if not asset:
            raise AssetLifecycleError("CHARACTER_SHEET_QA_ASSET_MISSING", "未找到角色资产", {"asset_id": args.asset_id})
        if str(asset.get("asset_kind") or asset.get("kind") or "") != "character":
            raise AssetLifecycleError("CHARACTER_SHEET_QA_KIND_INVALID", "QA 只适用于人物角色设定卡", {"asset_id": args.asset_id})
        lifecycle_state = str(asset.get("lifecycle_state") or asset.get("asset_stage") or "")
        if lifecycle_state != "character_sheet_downloaded":
            raise AssetLifecycleError("CHARACTER_SHEET_QA_STAGE_INVALID", "角色卡 QA 只能处理已下载的角色设定卡", {
                "asset_id": args.asset_id,
                "lifecycle_state": lifecycle_state,
            })
        master_path = str(asset.get("identity_master_path") or "")
        master_sha = str(asset.get("identity_master_sha256") or "").lower()
        channel = str(asset.get("character_sheet_channel") or asset.get("channel") or "")
        if not master_path or not master_sha or not channel:
            raise AssetLifecycleError("CHARACTER_SHEET_QA_PARENT_CONTRACT_MISSING", "角色卡缺少固定母图或渠道合同", {"asset_id": args.asset_id})
        checks = qa.get("checks") or qa.get("qa_checks") or {}
        passed = str(qa.get("status") or "").lower() in {"passed", "accepted"} and all(checks.get(name) is True for name in CHARACTER_QA_CHECKS)
        retries = int(asset.get("character_sheet_retry_count") or 0)
        original_asset = copy.deepcopy(asset)
        asset["character_sheet_qa"] = str(args.qa_result.resolve())
        result = {
            "asset_id": args.asset_id,
            "qa_result": str(args.qa_result.resolve()),
            "retry_count_before": retries,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if passed:
            asset["asset_stage"] = "character_sheet"
            asset["lifecycle_state"] = "final_character_asset_accepted"
            asset["final_status"] = "accepted"
            try:
                validate_final_asset(args.asset_id, asset, "character")
            except AssetLifecycleError:
                asset.clear()
                asset.update(original_asset)
                raise
            result.update({"status": "accepted", "next_action": "export_final_asset_registry"})
            result_type = "final_delivery"
            verified = "CHARACTER_SHEET_QA_PASSED"
        elif retries == 0:
            asset["character_sheet_retry_count"] = 1
            asset["asset_stage"] = "character_sheet_prepared"
            asset["lifecycle_state"] = "character_sheet_prepared"
            asset["final_status"] = "not_accepted"
            asset["character_sheet_retry_contract"] = {
                "identity_master_path": master_path,
                "identity_master_sha256": master_sha,
                "channel": channel,
                "failure_reasons": qa.get("failure_reasons") or qa.get("failed_checks") or [name for name in CHARACTER_QA_CHECKS if checks.get(name) is not True],
                "must_not_change": ["identity_master", "identity_master_sha256", "channel", "asset_id"],
            }
            result.update({"status": "retry_prepared", "next_action": "submit_same_parent_same_channel_character_sheet_retry"})
            result_type = "final_delivery"
            verified = "CHARACTER_SHEET_QA_RETRY_PREPARED"
        else:
            asset["asset_stage"] = "character_sheet_qa_failed"
            asset["lifecycle_state"] = "character_sheet_qa_failed"
            asset["final_status"] = "rejected"
            asset["blocked_reason"] = qa.get("failure_reasons") or qa.get("failed_checks") or "character_sheet_qa_failed_twice"
            result.update({"status": "blocked", "next_action": "external_blocked_after_one_same_parent_retry"})
            result_type = "external_blocked"
            verified = "CHARACTER_SHEET_QA_FAILED_TWICE"
        write_json(args.production_registry, registry)
        write_json(args.out, result)
        print(json.dumps({"result_type": result_type, "task_id": "character-sheet-qa", "evidence_path_or_url": str(args.out.resolve()), "verified_result": verified, "next_action_or_blocker": result["next_action"]}, ensure_ascii=False))
        return 0 if result_type == "final_delivery" else 2
    except AssetLifecycleError as exc:
        print(json.dumps({"result_type": "external_blocked", "task_id": "character-sheet-qa", "evidence_path_or_url": "", "verified_result": exc.code, "next_action_or_blocker": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
