from __future__ import annotations

"""Create a small accepted Step02 packet and run the Python Step04 path.

This is a deterministic no-Provider regression fixture for the A/B/C/D runner.
It deliberately includes one character, one scene, one prop, a time-bounded
action, and a separately time-bounded line of dialogue.
"""

import argparse
import hashlib
import json
from pathlib import Path


SOURCE_SHA = "4d4f9852805f4e5e5eb01768e9e071b5227052d3f2fd37c13737e63e534477ae"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--asset", type=Path, required=True)
    args = parser.parse_args()
    root = args.root.resolve()
    asset = args.asset.resolve()
    root.mkdir(parents=True, exist_ok=True)
    asset_sha = sha256(asset)
    master_qa_path = root / "identity_master_qa.json"
    sheet_qa_path = root / "character_sheet_qa.json"
    upload_receipt_path = root / "character_sheet_upload_receipt.json"
    master_qa_path.write_text(json.dumps({"status": "passed"}), encoding="utf-8")
    sheet_qa_path.write_text(json.dumps({"status": "passed", "checks": {
        "file": True, "layout": True, "identity_consistency": True, "age_consistency": True,
        "wardrobe_consistency": True, "accessory_consistency": True, "anatomy": True,
        "labels": True, "source_leakage": True,
    }}), encoding="utf-8")
    upload_receipt_path.write_text(json.dumps({"uploads": [{
        "local_path": str(asset), "sha256": asset_sha, "download_url": "https://example.test/fixture-master.png",
    }]}), encoding="utf-8")
    sheet_submission_receipt_path = root / "character_sheet_submission_receipt.json"
    sheet_submission_receipt_path.write_text(json.dumps({
        "assetContract": {
            "asset_stage": "character_sheet",
            "identity_master": {"local_path": str(asset), "sha256": asset_sha},
        },
        "uploads": [{"local_path": str(asset), "sha256": asset_sha, "download_url": "https://example.test/fixture-master.png"}],
        "submit": {"taskId": "fixture-character-sheet-task"},
    }), encoding="utf-8")
    sheet_download_receipt_path = root / "character_sheet_download_receipt.json"
    sheet_download_receipt_path.write_text(json.dumps({
        "asset_stage": "character_sheet",
        "task_id": "fixture-character-sheet-task",
        "qa_status": "passed",
        "files": [{"exact_path": str(asset), "sha256": asset_sha, "qa": {"status": "passed"}}],
    }), encoding="utf-8")
    evidence_path = root / "fixture_evidence.json"
    evidence_path.write_text(json.dumps({"status": "accepted"}), encoding="utf-8")

    def single_stage_receipts(kind: str) -> tuple[Path, Path]:
        task_id = f"fixture-{kind}-task"
        submission = root / f"{kind}_submission_receipt.json"
        submission.write_text(json.dumps({"assetStage": kind, "submit": {"taskId": task_id}}), encoding="utf-8")
        download = root / f"{kind}_download_receipt.json"
        download.write_text(json.dumps({
            "asset_stage": kind,
            "task_id": task_id,
            "qa_status": "passed",
            "files": [{"exact_path": str(asset), "sha256": asset_sha, "qa": {"status": "passed"}}],
        }), encoding="utf-8")
        return submission, download

    scene_submission, scene_download = single_stage_receipts("scene")
    prop_submission, prop_download = single_stage_receipts("prop")
    manifest = {
        "schema_version": "mx_shortdrama_step02_acceptance_manifest_v4_fixture",
        "status": "accepted",
        "semantic_status": "accepted",
        "acceptance_mode": "semantic",
        "source_sha256": SOURCE_SHA,
        "semantic_alignment": {
            "status": "accepted",
            "mapping_policy": "continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping",
            "semantic_unit_ids": ["OBS-FIXTURE-001"],
        },
        "asset_requirements": [
            {
                "asset_id": "CHAR-1", "kind": "character", "purpose": "锁定@沈川的脸、服装和动作连续性",
                "evidence_ids": ["IDENTITY-1"], "required_shot_ids": ["S001"],
                "casting_tier": "lead_male", "wardrobe_state": "深色西装",
                "continuity_state": "连续角色状态锁定",
                "requires_final_character_sheet": True, "identity_status": "resolved",
            },
            {"asset_id": "SCENE-1", "kind": "scene", "purpose": "锁定会议室空间和窗侧光", "continuity_state": "空间几何和窗侧光连续锁定", "evidence_ids": ["GEMINI-1"], "required_shot_ids": ["S001"]},
            {"asset_id": "PROP-1", "kind": "prop", "purpose": "锁定桌面文件夹位置和材质", "continuity_state": "道具位置与材质连续锁定", "evidence_ids": ["GEMINI-1"], "required_shot_ids": ["S001"]},
        ],
        "cards": [
            {
                "shot_id": "S001",
                "source_start_ms": 0,
                "source_end_ms": 2400,
                "verdict": "pass",
                "evidence_ids": ["GEMINI-1"],
                "semantic_unit_ids": ["OBS-FIXTURE-001"],
                "scene_identity": "会议室内的质询",
                "environment_identity": "现代墨西哥公司办公室，白天窗侧光",
                "composition": "中景，@沈川位于桌旁左侧，桌面文件夹在前景",
                "action_detail": "@沈川先从桌面抬头转向画外来人，随后保持转身并短暂开口",
                "camera_motion_detail": "固定中景，最后 1800-2400ms 轻微推近并停在面部",
                "lighting": "右侧窗光保持柔和阴影，推近时脸部高光更集中",
                "audio_observation": "室内空气声、衣物摩擦和桌面轻响",
                "context_reference_slot_ids": ["REF-001-SCENE-1", "REF-001-PROP-1"],
                "entity_instances": [
                    {"instance_id": "S001:CHAR-1", "role_ref": "@沈川", "asset_id": "CHAR-1", "status": "resolved", "evidence_ids": ["IDENTITY-1"]}
                ],
                "event_blocks": [
                    {
                        "timecode_ms": [0, 1800],
                        "subject_instance_id": "S001:CHAR-1",
                        "object_instance_id": "",
                        "start_state": "站在桌旁，视线落在桌面",
                        "change": "抬头看向画外，右手离开文件夹并收回胸前",
                        "end_state": "身体转向画外，手停在胸前",
                        "evidence_ids": ["GEMINI-1-ACT-1"],
                    },
                    {
                        "timecode_ms": [1800, 2400],
                        "subject_instance_id": "S001:CHAR-1",
                        "object_instance_id": "",
                        "start_state": "身体转向画外，手停在胸前",
                        "change": "保持转身姿势，嘴唇短暂停顿后说出一句话",
                        "end_state": "视线锁定画外来人，动作停住",
                        "evidence_ids": ["GEMINI-1-ACT-2"],
                        "dialogue": {
                            "speaker_instance_id": "S001:CHAR-1",
                            "timecode_ms": [1950, 2250],
                            "text": "Claire.",
                            "evidence_ids": ["MIMO-1", "ACTIVE-MOUTH-1"],
                        },
                    },
                ],
            }
        ],
    }
    bindings = {
        "bindings": [
            {"binding_id": "B-CHAR-1", "canonical_role": "沈川", "target_ref": "@沈川", "target_asset": "CHAR-1", "identity_status": "resolved", "shot_ids": ["S001"], "instance_ids": {"S001": "S001:CHAR-1"}, "evidence_ids": ["IDENTITY-1"]}
        ]
    }
    assets = {
        "assets": [
            {
                "asset_id": "CHAR-1", "asset_kind": "character", "asset_stage": "character_sheet",
                "lifecycle_state": "final_character_asset_accepted", "final_status": "accepted",
                "display_name": "@沈川", "exact_path": str(asset), "sha256": asset_sha,
                "identity_master_path": str(asset), "identity_master_sha256": asset_sha,
                "identity_master_qa": str(master_qa_path),
                "identity_master_upload": {"local_path": str(asset), "sha256": asset_sha, "receipt_path": str(upload_receipt_path)},
                "character_sheet_qa": str(sheet_qa_path), "purpose": "锁定@沈川的脸、服装和动作连续性",
                "generation_prompt": "@沈川人物角色设定卡，现代墨西哥写实短剧，深色西装，脸部辨识度稳定。",
                "character_sheet_prompt": "@沈川角色设定卡：正侧背全身、头肩近景和表情组保持同脸、同年龄、同发型、同深色西装与配饰。",
                "character_sheet_submission_receipt": str(sheet_submission_receipt_path),
                "asset_download_receipt": str(sheet_download_receipt_path),
                "evidence_path": str(master_qa_path),
                "allowed_instance_ids": ["S001:CHAR-1"],
            },
            {
                "asset_id": "SCENE-1", "asset_kind": "scene", "asset_stage": "final_scene_asset_accepted",
                "lifecycle_state": "final_scene_asset_accepted", "final_status": "accepted",
                "display_name": "@会议室", "exact_path": str(asset), "sha256": asset_sha,
                "final_qa": {"status": "passed"}, "purpose": "锁定会议室空间和窗侧光",
                "generation_prompt": "现代墨西哥公司办公室会议室，长桌、窗帘和白天窗侧光，无人物。",
                "evidence_path": str(evidence_path),
                "asset_submission_receipt": str(scene_submission),
                "asset_download_receipt": str(scene_download),
            },
            {
                "asset_id": "PROP-1", "asset_kind": "prop", "asset_stage": "final_prop_asset_accepted",
                "lifecycle_state": "final_prop_asset_accepted", "final_status": "accepted",
                "display_name": "@文件夹", "exact_path": str(asset), "sha256": asset_sha,
                "final_qa": {"status": "passed"}, "purpose": "锁定桌面文件夹位置和材质",
                "generation_prompt": "桌面深绿色文件夹，半开启状态，写实纸张和皮革材质，无人物。",
                "evidence_path": str(evidence_path),
                "asset_submission_receipt": str(prop_submission),
                "asset_download_receipt": str(prop_download),
            },
        ]
    }
    (root / "step02_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "identity_bindings.json").write_text(json.dumps(bindings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (root / "asset_registry.json").write_text(json.dumps(assets, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"root": str(root), "asset_sha256": asset_sha, "source_sha256": SOURCE_SHA}, ensure_ascii=False))


if __name__ == "__main__":
    main()
