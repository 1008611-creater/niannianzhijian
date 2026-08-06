from __future__ import annotations

"""Build upload-ready references from the final registry only."""

import argparse
import json
from pathlib import Path

from asset_lifecycle import AssetLifecycleError, prepare_downstream_references, read_json, write_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare validated final asset references for a downstream consumer.")
    parser.add_argument("--final-registry", type=Path, required=True)
    parser.add_argument("--consumer", choices=("first_frame", "storyboard", "video"), required=True)
    parser.add_argument("--asset-id", action="append", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        payload = prepare_downstream_references(read_json(args.final_registry), args.asset_id, args.consumer)
        write_json(args.out, payload)
        print(json.dumps({"result_type": "final_delivery", "task_id": "prepare-downstream-references", "evidence_path_or_url": str(args.out.resolve()), "verified_result": "FINAL_REFERENCES_VALIDATED", "next_action_or_blocker": "upload_exact_paths_only"}, ensure_ascii=False))
        return 0
    except AssetLifecycleError as exc:
        print(json.dumps({"result_type": "external_blocked", "task_id": "prepare-downstream-references", "evidence_path_or_url": "", "verified_result": exc.code, "next_action_or_blocker": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
