"""Fail closed for historical pre-video runners that predate asset lifecycle S-011."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from asset_lifecycle import AssetLifecycleError, read_json


def require_migrated_executor(final_registry: Path, executor: str) -> None:
    """Verify the supplied registry is real, then reject an unmigrated runner.

    These runners contain hard-coded historic media paths.  Validating a registry
    alone would not make those paths safe to upload, so they must not run until
    their payload construction has been migrated to final-registry references.
    """
    try:
        read_json(final_registry)
    except (OSError, AssetLifecycleError) as exc:
        raise SystemExit(f"LEGACY_EXECUTOR_REQUIRES_FINAL_REGISTRY: {exc}") from exc
    raise SystemExit(
        f"LEGACY_EXECUTOR_REQUIRES_FINAL_REGISTRY: {executor} still contains historic "
        "paths and is disabled. Rebuild its payload from prepare_downstream_references.py."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Fail-closed guard for unmigrated pre-video executors.")
    parser.add_argument("--final-registry", type=Path, required=True)
    parser.add_argument("--executor", required=True)
    args = parser.parse_args()
    require_migrated_executor(args.final_registry, args.executor)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
