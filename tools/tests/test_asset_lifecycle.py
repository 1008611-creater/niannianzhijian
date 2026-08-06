from __future__ import annotations

import hashlib
import json
import struct
import sys
import tempfile
import subprocess
import unittest
from pathlib import Path


TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))

from asset_lifecycle import (
    AssetLifecycleError,
    export_final_registry,
    migrate_legacy_registry,
    prepare_downstream_references,
    reconcile_production_registry,
    earliest_missing_stage,
    validate_final_asset,
)
from step04_abcd_compiler import CompileError, verified_asset


def write_png(path: Path, width: int = 2048, height: int = 1152) -> None:
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + struct.pack(">I4sII5B", 13, b"IHDR", width, height, 8, 2, 0, 0, 0))


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def write_character_sheet_submission(root: Path, master: Path) -> Path:
    return write_json(root / "character_sheet_submission.json", {
        "assetContract": {
            "asset_stage": "character_sheet",
            "identity_master": {"local_path": str(master), "sha256": sha(master)},
        },
        "uploads": [{"local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png"}],
        "submit": {"taskId": "fixture-character-sheet-task"},
    })


def final_character_metadata(root: Path, master: Path, sheet: Path) -> dict:
    evidence_path = root / "evidence.json"
    if not evidence_path.exists():
        evidence_path.write_text(json.dumps({"evidence": "fixture"}), encoding="utf-8")
    download_receipt = write_json(root / "character_sheet_download.json", {
        "asset_stage": "character_sheet",
        "task_id": "fixture-character-sheet-task",
        "qa_status": "passed",
        "files": [{"exact_path": str(sheet.resolve()), "sha256": sha(sheet), "qa": {"status": "passed"}}],
    })
    return {
        "display_name": "@测试角色",
        "purpose": "锁定测试角色的脸、服装和连续性",
        "evidence_path": str(evidence_path),
        "allowed_instance_ids": ["S001:CHAR_TEST"],
        "character_sheet_prompt": "@测试角色角色设定卡，正侧背全身与表情组保持同脸同服装。",
        "character_sheet_submission_receipt": str(write_character_sheet_submission(root, master)),
        "asset_download_receipt": str(download_receipt),
    }


class AssetLifecycleTests(unittest.TestCase):
    def test_identity_master_cannot_enter_step04(self) -> None:
        with self.assertRaises(CompileError) as error:
            verified_asset(
                "CHAR_TEST",
                {"asset_kind": "character", "asset_stage": "identity_master_qa_passed", "status": "accepted"},
                "@测试角色",
                "测试",
                "character",
            )
        self.assertEqual(error.exception.code, "STEP04_CHARACTER_ASSET_STAGE_INVALID")

    def test_complete_character_sheet_is_consumable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "master.png"
            sheet = root / "sheet.png"
            write_png(master)
            write_png(sheet)
            master_qa = write_json(root / "master_qa.json", {"status": "passed"})
            upload = write_json(root / "upload_receipt.json", {"uploads": [{"local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png"}]})
            sheet_qa = write_json(root / "sheet_qa.json", {"status": "passed", "checks": {
                "file": True, "layout": True, "identity_consistency": True, "age_consistency": True,
                "wardrobe_consistency": True, "accessory_consistency": True, "anatomy": True,
                "labels": True, "source_leakage": True,
            }})
            asset = {
                "asset_kind": "character",
                "asset_stage": "character_sheet",
                "lifecycle_state": "final_character_asset_accepted",
                "final_status": "accepted",
                "exact_path": str(sheet),
                "sha256": sha(sheet),
                "identity_master_path": str(master),
                "identity_master_sha256": sha(master),
                "identity_master_qa": str(master_qa),
                "identity_master_upload": {"local_path": str(master), "sha256": sha(master), "receipt_path": str(upload)},
                "character_sheet_qa": str(sheet_qa),
                **final_character_metadata(root, master, sheet),
            }
            result = validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(result["width"], 2048)
            self.assertEqual(result["height"], 1152)

    def test_missing_upload_receipt_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "master.png"
            sheet = root / "sheet.png"
            write_png(master)
            write_png(sheet)
            asset = {
                "asset_kind": "character", "asset_stage": "character_sheet", "lifecycle_state": "final_character_asset_accepted", "final_status": "accepted",
                "exact_path": str(sheet), "sha256": sha(sheet),
                "identity_master_path": str(master), "identity_master_sha256": sha(master),
                "identity_master_qa": {"status": "passed"},
                "character_sheet_qa": {"status": "passed", "checks": {name: True for name in (
                    "file", "layout", "identity_consistency", "age_consistency", "wardrobe_consistency",
                    "accessory_consistency", "anatomy", "labels", "source_leakage")}},
            }
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(error.exception.code, "STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING")

    def test_final_character_sheet_requires_actual_prompt_and_task_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "master.png"
            sheet = root / "sheet.png"
            write_png(master)
            write_png(sheet)
            master_qa = write_json(root / "master_qa.json", {"status": "passed"})
            upload = write_json(root / "upload_receipt.json", {"uploads": [{
                "local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png",
            }]})
            sheet_qa = write_json(root / "sheet_qa.json", {"status": "passed", "checks": {
                name: True for name in (
                    "file", "layout", "identity_consistency", "age_consistency", "wardrobe_consistency",
                    "accessory_consistency", "anatomy", "labels", "source_leakage")
            }})
            asset = {
                "asset_kind": "character", "asset_stage": "character_sheet",
                "lifecycle_state": "final_character_asset_accepted", "final_status": "accepted",
                "exact_path": str(sheet), "sha256": sha(sheet),
                "identity_master_path": str(master), "identity_master_sha256": sha(master),
                "identity_master_qa": str(master_qa),
                "identity_master_upload": {"local_path": str(master), "sha256": sha(master), "receipt_path": str(upload)},
                "character_sheet_qa": str(sheet_qa),
                **final_character_metadata(root, master, sheet),
            }
            asset.pop("character_sheet_prompt")
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(error.exception.code, "STEP04_CHARACTER_SHEET_PROMPT_MISSING")

            asset["character_sheet_prompt"] = "@测试角色角色设定卡"
            broken_receipt = write_json(root / "broken_submission.json", {
                "assetContract": {
                    "asset_stage": "character_sheet",
                    "identity_master": {"local_path": str(master), "sha256": sha(master)},
                },
                "uploads": [{"local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png"}],
            })
            asset["character_sheet_submission_receipt"] = str(broken_receipt)
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(error.exception.code, "STEP04_CHARACTER_SHEET_TASK_ID_MISSING")

    def test_final_character_sheet_parent_sha_and_qa_are_independent_gates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "master.png"
            sheet = root / "sheet.png"
            write_png(master)
            write_png(sheet)
            master_qa = write_json(root / "master_qa.json", {"status": "passed"})
            upload = write_json(root / "upload_receipt.json", {"uploads": [{
                "local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png",
            }]})
            sheet_qa = write_json(root / "sheet_qa.json", {"status": "passed", "checks": {
                name: True for name in (
                    "file", "layout", "identity_consistency", "age_consistency", "wardrobe_consistency",
                    "accessory_consistency", "anatomy", "labels", "source_leakage")
            }})
            asset = {
                "asset_kind": "character", "asset_stage": "character_sheet",
                "lifecycle_state": "final_character_asset_accepted", "final_status": "accepted",
                "exact_path": str(sheet), "sha256": sha(sheet),
                "identity_master_path": str(master), "identity_master_sha256": sha(master),
                "identity_master_qa": str(master_qa),
                "identity_master_upload": {"local_path": str(master), "sha256": sha(master), "receipt_path": str(upload)},
                "character_sheet_qa": str(sheet_qa),
                **final_character_metadata(root, master, sheet),
            }
            asset["identity_master_sha256"] = "0" * 64
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(error.exception.code, "STEP04_CHARACTER_SHEET_PARENT_SHA_MISMATCH")

            asset["identity_master_sha256"] = sha(master)
            asset["character_sheet_qa"] = write_json(root / "failed_sheet_qa.json", {"status": "failed"})
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("CHAR_TEST", asset, "character")
            self.assertEqual(error.exception.code, "STEP04_CHARACTER_SHEET_QA_MISSING")

    def test_legacy_entries_are_not_exported_as_final(self) -> None:
        legacy = migrate_legacy_registry({"assets": [{"asset_id": "OLD", "display_name": "@旧资产", "status": "accepted"}]})
        self.assertEqual(legacy["assets"][0]["legacy_status"], "legacy_pending_reconciliation")
        self.assertEqual(legacy["assets"][0]["status"], "legacy_pending_reconciliation")
        self.assertEqual(legacy["assets"][0]["legacy_source_status"], "accepted")
        self.assertEqual(export_final_registry(legacy)["assets"], [])

    def test_identity_master_is_blocked_for_downstream_upload(self) -> None:
        registry = {"assets": [{
            "asset_id": "CHAR_TEST", "asset_kind": "character",
            "asset_stage": "identity_master_qa_passed", "final_status": "not_accepted",
        }]}
        with self.assertRaises(AssetLifecycleError) as error:
            prepare_downstream_references(registry, ["CHAR_TEST"], "video")
        self.assertEqual(error.exception.code, "STEP04_CHARACTER_ASSET_STAGE_INVALID")

    def test_downstream_payload_contains_only_the_validated_final_path_and_sha(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            asset_file = root / "final.png"
            write_png(asset_file)
            asset_sha = sha(asset_file)
            evidence = write_json(root / "scene_evidence.json", {"status": "accepted"})
            submission = write_json(root / "scene_submission.json", {
                "assetStage": "scene", "submit": {"taskId": "scene-task-1"},
            })
            download = write_json(root / "scene_download.json", {
                "asset_stage": "scene", "task_id": "scene-task-1", "qa_status": "passed",
                "files": [{"exact_path": str(asset_file.resolve()), "sha256": asset_sha, "qa": {"status": "passed"}}],
            })
            registry = {"assets": [{
                "asset_id": "SCENE_TEST", "asset_kind": "scene",
                "asset_stage": "final_scene_asset_accepted", "lifecycle_state": "final_scene_asset_accepted",
                "final_status": "accepted", "exact_path": str(asset_file), "sha256": asset_sha,
                "generation_prompt": "现代办公室会议室，无人物。", "evidence_path": str(evidence),
                "asset_submission_receipt": str(submission), "asset_download_receipt": str(download),
                "final_qa": {"status": "passed"},
            }]}
            for consumer in ("first_frame", "storyboard", "video"):
                with self.subTest(consumer=consumer):
                    payload = prepare_downstream_references(registry, ["SCENE_TEST"], consumer)
                    self.assertEqual(payload["references"], [{
                        "asset_id": "SCENE_TEST", "asset_kind": "scene", "exact_path": str(asset_file.resolve()),
                        "sha256": asset_sha, "consumer": consumer,
                    }])

    def test_final_scene_requires_submit_and_download_receipts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            asset_file = root / "scene.png"
            write_png(asset_file)
            evidence = write_json(root / "scene_evidence.json", {"status": "accepted"})
            asset = {
                "asset_kind": "scene", "asset_stage": "final_scene_asset_accepted",
                "lifecycle_state": "final_scene_asset_accepted", "final_status": "accepted",
                "exact_path": str(asset_file), "sha256": sha(asset_file),
                "generation_prompt": "现代办公室会议室，无人物。", "evidence_path": str(evidence),
                "final_qa": {"status": "passed"},
            }
            with self.assertRaises(AssetLifecycleError) as error:
                validate_final_asset("SCENE_TEST", asset, "scene")
            self.assertEqual(error.exception.code, "STEP04_ASSET_SUBMISSION_RECEIPT_MISSING")

    def test_reconciliation_reports_earliest_character_stage(self) -> None:
        production = {"assets": [{
            "asset_id": "CHAR_TEST", "asset_kind": "character",
            "asset_stage": "identity_master_qa_passed", "final_status": "not_accepted",
        }]}
        report = reconcile_production_registry(production, {"CHAR_TEST"})
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["blocked_assets"][0]["blocker"], "STEP04_CHARACTER_ASSET_STAGE_INVALID")

    def test_recovery_points_to_the_next_lifecycle_stage_only(self) -> None:
        self.assertEqual(earliest_missing_stage({"asset_kind": "character", "lifecycle_state": "identity_master_qa_passed"}), "character_sheet_prepared")
        self.assertEqual(earliest_missing_stage({"asset_kind": "character", "lifecycle_state": "character_sheet_prepared"}), "character_sheet_submitted")
        self.assertEqual(earliest_missing_stage({"asset_kind": "character", "lifecycle_state": "character_sheet_qa_failed"}), "character_sheet_qa_failed")
        self.assertEqual(earliest_missing_stage({"asset_kind": "scene", "asset_stage": "scene_prepared"}), "scene_prepared")

    def test_first_failed_character_sheet_qa_prepares_one_same_parent_retry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            registry = root / "production.json"
            qa = root / "qa.json"
            report = root / "report.json"
            master = root / "master.png"
            write_png(master)
            registry.write_text(json.dumps({"assets": [{
                "asset_id": "CHAR_TEST", "asset_kind": "character", "asset_stage": "character_sheet_downloaded",
                "final_status": "not_accepted", "identity_master_path": str(master), "identity_master_sha256": sha(master),
                "character_sheet_channel": "RunningHub",
            }]}), encoding="utf-8")
            qa.write_text(json.dumps({"status": "failed", "checks": {name: False for name in (
                "file", "layout", "identity_consistency", "age_consistency", "wardrobe_consistency",
                "accessory_consistency", "anatomy", "labels", "source_leakage")}, "failure_reasons": ["layout"]}), encoding="utf-8")
            runner = TOOLS / "character_sheet_qa.py"
            completed = subprocess.run([sys.executable, str(runner), "--production-registry", str(registry), "--asset-id", "CHAR_TEST", "--qa-result", str(qa), "--out", str(report)], capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            updated = json.loads(registry.read_text(encoding="utf-8"))["assets"][0]
            self.assertEqual(updated["character_sheet_retry_count"], 1)
            self.assertEqual(updated["asset_stage"], "character_sheet_prepared")
            self.assertEqual(updated["character_sheet_retry_contract"]["identity_master_sha256"], sha(master))

    def test_second_failed_character_sheet_qa_blocks_asset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            registry = root / "production.json"
            qa = root / "qa.json"
            report = root / "report.json"
            master = root / "master.png"
            write_png(master)
            registry.write_text(json.dumps({"assets": [{
                "asset_id": "CHAR_TEST", "asset_kind": "character", "asset_stage": "character_sheet_downloaded",
                "final_status": "not_accepted", "character_sheet_retry_count": 1,
                "identity_master_path": str(master), "identity_master_sha256": sha(master), "character_sheet_channel": "RunningHub",
            }]}), encoding="utf-8")
            qa.write_text(json.dumps({"status": "failed", "checks": {}}), encoding="utf-8")
            completed = subprocess.run([sys.executable, str(TOOLS / "character_sheet_qa.py"), "--production-registry", str(registry), "--asset-id", "CHAR_TEST", "--qa-result", str(qa), "--out", str(report)], capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 2)
            updated = json.loads(registry.read_text(encoding="utf-8"))["assets"][0]
            self.assertEqual(updated["asset_stage"], "character_sheet_qa_failed")
            self.assertEqual(updated["final_status"], "rejected")

    def test_passed_qa_requires_complete_final_sheet_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "master.png"
            sheet = root / "sheet.png"
            write_png(master)
            write_png(sheet)
            master_qa = write_json(root / "master_qa.json", {"status": "passed"})
            upload = write_json(root / "upload.json", {"uploads": [{
                "local_path": str(master), "sha256": sha(master), "download_url": "https://example.test/master.png",
            }]})
            qa = write_json(root / "sheet_qa.json", {"status": "passed", "checks": {
                "file": True, "layout": True, "identity_consistency": True, "age_consistency": True,
                "wardrobe_consistency": True, "accessory_consistency": True, "anatomy": True,
                "labels": True, "source_leakage": True,
            }})
            registry = root / "production.json"
            report = root / "report.json"
            registry.write_text(json.dumps({"assets": [{
                "asset_id": "CHAR_TEST", "asset_kind": "character", "asset_stage": "character_sheet_downloaded",
                "lifecycle_state": "character_sheet_downloaded", "final_status": "not_accepted",
                "exact_path": str(sheet), "sha256": sha(sheet),
                "identity_master_path": str(master), "identity_master_sha256": sha(master),
                "identity_master_qa": str(master_qa),
                "identity_master_upload": {"local_path": str(master), "sha256": sha(master), "receipt_path": str(upload)},
                "character_sheet_channel": "RunningHub",
                **final_character_metadata(root, master, sheet),
            }]}), encoding="utf-8")
            completed = subprocess.run([
                sys.executable, str(TOOLS / "character_sheet_qa.py"), "--production-registry", str(registry),
                "--asset-id", "CHAR_TEST", "--qa-result", str(qa), "--out", str(report),
            ], capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            updated = json.loads(registry.read_text(encoding="utf-8"))["assets"][0]
            self.assertEqual(updated["asset_stage"], "character_sheet")
            self.assertEqual(updated["lifecycle_state"], "final_character_asset_accepted")
            self.assertEqual(updated["final_status"], "accepted")


if __name__ == "__main__":
    unittest.main()
