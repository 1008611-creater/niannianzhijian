from __future__ import annotations

"""Write the job-local asset lifecycle gate used by the production Harness."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from asset_lifecycle import AssetLifecycleError, read_json, reconcile_production_registry, required_asset_ids, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile explicit Step02 asset needs with production lifecycle state.")
    parser.add_argument("--step02-manifest", type=Path, required=True)
    parser.add_argument("--production-registry", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = read_json(args.step02_manifest)
        production = read_json(args.production_registry)
        report = reconcile_production_registry(production, required_asset_ids(manifest))
        report.update({
            "created_at": datetime.now(timezone.utc).isoformat(),
            "step02_manifest": str(args.step02_manifest.resolve()),
            "production_registry": str(args.production_registry.resolve()),
        })
        write_json(args.out, report)
        print(json.dumps({
            "result_type": "final_delivery" if report["status"] == "passed" else "external_blocked",
            "task_id": "asset-lifecycle-reconcile",
            "evidence_path_or_url": str(args.out.resolve()),
            "verified_result": "ASSET_LIFECYCLE_GATE_PASSED" if report["status"] == "passed" else "ASSET_LIFECYCLE_GATE_BLOCKED",
            "next_action_or_blocker": report["next_action"],
        }, ensure_ascii=False))
        return 0 if report["status"] == "passed" else 2
    except AssetLifecycleError as exc:
        print(json.dumps({"result_type": "external_blocked", "task_id": "asset-lifecycle-reconcile", "evidence_path_or_url": "", "verified_result": exc.code, "next_action_or_blocker": str(exc)}, ensure_ascii=False))
        return 2
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({
            "result_type": "external_blocked",
            "task_id": "asset-lifecycle-reconcile",
            "evidence_path_or_url": "",
            "verified_result": "ASSET_LIFECYCLE_INPUT_UNREADABLE",
            "next_action_or_blocker": str(exc),
        }, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
