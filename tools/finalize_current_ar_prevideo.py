import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


JOB_ID = "AR-MSAK0E8D-BB70611AB840"
CONTRACT = "character_two_stage_v1"


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_png(path):
    path = Path(path).resolve()
    if path.suffix.lower() != ".png" or not path.is_file():
        raise RuntimeError(f"invalid PNG path: {path}")
    if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"invalid PNG signature: {path}")
    with Image.open(path) as image:
        image.verify()
    return path


def record(path, qa=False):
    path = Path(path).resolve()
    item = {"exact_path": str(path), "sha256": sha256(path)}
    if qa:
        item["qa_status"] = "accepted"
    return item


def find_task_image(directory, task_id):
    files = sorted(Path(directory).glob(f"{task_id}-*.png"), key=lambda p: ("-copy" in p.name, p.name))
    if not files:
        raise FileNotFoundError(f"missing output for task {task_id}")
    return verify_png(files[0])


def main(root, final_registry):
    from legacy_prevideo_guard import require_migrated_executor
    require_migrated_executor(Path(final_registry), "finalize_current_ar_prevideo.py")
    root = Path(root).resolve()
    package_root = root / "pre_video_package"
    package_root.mkdir(parents=True, exist_ok=True)
    step04 = json.loads((root / "step04" / "pre_video_package_manifest.json").read_text(encoding="utf-8"))
    execution = json.loads((root / "pre_video_execution" / "image_execution_result.json").read_text(encoding="utf-8"))
    masters = json.loads((root / "image_execution" / "identity_masters_four_role" / "accepted_masters_character_two_stage_v1.json").read_text(encoding="utf-8"))["assets"]
    master_by_id = {item["asset_id"]: item for item in masters}

    sheet_paths = {
        "A_CHAR_001": root / "image_execution" / "character_sheets_four_role" / "download" / "2083587203048812546-1-9b6d1fab-95df-4c2c-8b63-fb8a832f0034.png",
        "A_CHAR_002": root / "image_execution" / "character_sheets_four_role" / "download" / "2083587216176984066-1-95869812-e922-4a79-a17a-f62c21d9e16a.png",
        "A_CHAR_003": root / "image_execution" / "character_sheets_four_role" / "download" / "2083587225526145026-1-6601d1ce-aef2-4206-b1ae-1833043ba82c.png",
        "A_CHAR_004": root / "image_execution" / "character_sheets_v4" / "A_CHAR_004" / "download" / "2083594871557726209-1-74b99f9d-e61c-428c-a979-d52d1ee4bebc.png",
    }
    prepared_by_id = {item["asset_id"]: item for item in step04["characters_prepared"]}
    characters = []
    for asset_id in ("A_CHAR_001", "A_CHAR_002", "A_CHAR_003", "A_CHAR_004"):
        prepared = prepared_by_id[asset_id]
        source_master = verify_png(master_by_id[asset_id]["exact_path"])
        source_sheet = verify_png(sheet_paths[asset_id])
        character_root = package_root / "character_assets" / asset_id
        character_root.mkdir(parents=True, exist_ok=True)
        master = character_root / "identity_master.png"
        sheet = character_root / "character_sheet.png"
        shutil.copy2(source_master, master)
        shutil.copy2(source_sheet, sheet)
        master = verify_png(master)
        sheet = verify_png(sheet)
        master_sha = sha256(master)
        if master_sha != master_by_id[asset_id]["sha256"]:
            raise RuntimeError(f"master SHA mismatch: {asset_id}")
        characters.append({
            "asset_id": asset_id,
            "casting_tier": prepared["casting_tier"],
            "identity_master_prompt": Path(prepared["identity_master_prompt_path"]).read_text(encoding="utf-8").strip(),
            "identity_master": record(master, qa=True),
            "character_sheet_prompt": Path(prepared["character_sheet_prompt_path"]).read_text(encoding="utf-8").strip(),
            "character_sheet": record(sheet, qa=True),
            "reference_binding": {"master_sha256": master_sha, "provider_mode": "image_to_image"},
        })

    source_storyboards = {gid: verify_png(path) for gid, path in execution["storyboards"].items()}
    source_storyboards["G02"] = find_task_image(root / "pre_video_execution" / "storyboards_qa_retry" / "download", "2083600038189490177")
    source_storyboards["G05"] = find_task_image(root / "pre_video_execution" / "storyboards_qa_retry" / "download", "2083600357879336962")
    source_firstframes = {gid: verify_png(path) for gid, path in execution["firstframes"].items()}
    firstframes = {}
    storyboards = {}
    for gid in source_firstframes:
        group_root = package_root / "groups" / gid
        group_root.mkdir(parents=True, exist_ok=True)
        firstframes[gid] = group_root / "first_frame.png"
        storyboards[gid] = group_root / "formal_storyboard.png"
        shutil.copy2(source_firstframes[gid], firstframes[gid])
        shutil.copy2(source_storyboards[gid], storyboards[gid])
        firstframes[gid] = verify_png(firstframes[gid])
        storyboards[gid] = verify_png(storyboards[gid])

    specs_root = package_root / "video_task_specs"
    specs_root.mkdir(parents=True, exist_ok=True)
    groups = []
    for item in step04["groups_prepared"]:
        gid = item["group_id"]
        duration = round(float(item["end_sec"]) - float(item["start_sec"]), 3)
        if duration < 4 or duration > 15:
            raise RuntimeError(f"duration out of range: {gid}")
        spec = {
            "schema_version": "niannian.auto_redraw.video_task_spec.v1",
            "job_id": JOB_ID,
            "group_id": gid,
            "source_time": {"start_sec": item["start_sec"], "end_sec": item["end_sec"], "duration_seconds": duration},
            "shot_ids": item["shot_ids"],
            "resolution": "720P",
            "status": "prepared_not_submitted",
            "references": {
                "first_frame": record(firstframes[gid]),
                "formal_storyboard": record(storyboards[gid]),
                "character_asset_ids": [c["asset_id"] for c in characters],
            },
            "video_provider": {"status": "not_called", "task_id": None, "charges": 0},
        }
        spec_path = specs_root / f"{gid}_video_task_spec.json"
        spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
        groups.append({
            "group_id": gid,
            "first_frame": record(firstframes[gid]),
            "storyboard": record(storyboards[gid]),
            "video_task_spec": record(spec_path),
        })

    manifest = {
        "schema_version": "niannian.auto_redraw.pre_video_package_manifest.v1",
        "job_id": JOB_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "video_ready_not_submitted",
        "character_asset_contract": CONTRACT,
        "character_assets": characters,
        "group_count": len(groups),
        "groups": groups,
        "completeness": {"first_frames": len(groups), "storyboards": len(groups), "video_task_specs": len(groups)},
        "visual_qa": {"character_assets": "accepted", "first_frames": "accepted", "storyboards": "accepted", "replaced_storyboards": ["G02", "G05"]},
        "video_provider": {"status": "not_called", "node_created": False, "task_ids": [], "charges": 0},
    }
    manifest_path = package_root / "pre_video_package_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    delivery = {
        "schema_version": "niannian.auto_redraw.pre_video_delivery.v1",
        "job_id": JOB_ID,
        "status": "video_ready_not_submitted",
        "package_root": str(package_root),
        "manifest_path": str(manifest_path.resolve()),
        "character_asset_contract": CONTRACT,
        "character_assets": characters,
        "groups": groups,
        "video_provider": {"status": "not_called"},
    }
    delivery_path = root / "website_prevideo_delivery.json"
    delivery_path.write_text(json.dumps(delivery, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "delivery": str(delivery_path),
        "delivery_sha256": sha256(delivery_path),
        "package_manifest": str(manifest_path),
        "group_count": len(groups),
        "character_count": len(characters),
        "video_provider_status": "not_called",
    }, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--final-registry", type=Path, required=True)
    args = parser.parse_args()
    main(args.root, args.final_registry)
