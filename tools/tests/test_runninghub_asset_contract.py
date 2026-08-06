from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


RUNNER = Path(r"C:\Users\lsb\.codex\skills\runninghub-image2-image\scripts\runninghub_image2_image.py")
TEXT_RUNNER = Path(r"C:\Users\lsb\.codex\skills\runninghub-image2-text\scripts\runninghub_image2_text.py")
LEGACY_PROMPT_BUILDER = Path(__file__).resolve().parents[1] / "prepare_ar_prevideo_prompts.py"
TOOLS = Path(__file__).resolve().parents[1]
PREVIDEO_EXECUTOR = TOOLS / "run_current_ar_prevideo_images.py"
sys.path.insert(0, str(TOOLS))


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class RunningHubAssetContractTests(unittest.TestCase):
    def test_character_sheet_dry_run_is_local_and_defaults_to_2k(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "identity_master.png"
            master.write_bytes(b"local-test-identity-master")
            digest = hashlib.sha256(master.read_bytes()).hexdigest()
            receipt = root / "identity_master_receipt.json"
            receipt.write_text(json.dumps({"local_path": str(master), "sha256": digest}), encoding="utf-8")
            completed = subprocess.run([
                sys.executable, str(RUNNER), "--prompt", "角色设定卡", "--image-file", str(master),
                "--asset-stage", "character_sheet", "--parent-sha256", digest,
                "--parent-upload-receipt", str(receipt), "--dry-run",
            ], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            payload = json.loads(completed.stdout)
            self.assertEqual(payload["payload"]["resolution"], "2k")
            self.assertEqual(payload["assetContract"]["asset_stage"], "character_sheet")
            self.assertTrue(payload["uploads"][0]["status"].startswith("not_uploaded"))
            self.assertTrue(payload["payload"]["imageUrls"][0].startswith("dry-run://"))

    def test_invalid_character_sheet_contract_fails_before_upload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            master = root / "identity_master.png"
            master.write_bytes(b"local-test-identity-master")
            digest = hashlib.sha256(master.read_bytes()).hexdigest()
            completed = subprocess.run([
                sys.executable, str(RUNNER), "--prompt", "角色设定卡", "--image-file", str(master),
                "--asset-stage", "character_sheet", "--parent-sha256", digest,
                "--parent-upload-receipt", str(root / "missing.json"),
            ], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
            self.assertEqual(completed.returncode, 2)
            self.assertIn("parent upload receipt does not exist", completed.stderr)

    def test_text_to_image_defaults_to_2k_identity_master_contract(self) -> None:
        completed = subprocess.run([
            sys.executable, str(TEXT_RUNNER), "--prompt", "人物身份母图", "--asset-stage", "identity_master", "--dry-run",
        ], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["payload"]["resolution"], "2k")
        self.assertEqual(payload["assetStage"], "identity_master")

    def test_resumed_text_download_requires_actual_prompt_for_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            completed = subprocess.run([
                sys.executable, str(TEXT_RUNNER), "--resume-task-id", "task-123",
                "--download-dir", tmp,
            ], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
            self.assertEqual(completed.returncode, 2)
            self.assertIn("requires --prompt or --prompt-file", completed.stderr)

    def test_download_receipt_captures_file_identity_and_qa(self) -> None:
        png_header = b"\x89PNG\r\n\x1a\n" + (13).to_bytes(4, "big") + b"IHDR" + (2048).to_bytes(4, "big") + (2048).to_bytes(4, "big")
        for path, module_name, stage in (
            (RUNNER, "runninghub_image2_image_receipt_test", "character_sheet"),
            (TEXT_RUNNER, "runninghub_image2_text_receipt_test", "identity_master"),
        ):
            with self.subTest(stage=stage):
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    image = root / "output.png"
                    image.write_bytes(png_header)
                    module = load_module(path, module_name)
                    receipt_path = Path(module.write_download_receipt(root, [str(image)], "task-123", "实际提示词", stage))
                    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
                    self.assertEqual(receipt["task_id"], "task-123")
                    self.assertEqual(receipt["asset_stage"], stage)
                    self.assertEqual(receipt["prompt_sha256"], hashlib.sha256("实际提示词".encode("utf-8")).hexdigest())
                    self.assertEqual(receipt["files"][0]["sha256"], hashlib.sha256(png_header).hexdigest())
                    self.assertEqual((receipt["files"][0]["width"], receipt["files"][0]["height"]), (2048, 2048))
                    self.assertEqual(receipt["qa_status"], "passed")

    def test_downstream_executor_declares_a_stage_for_each_provider_payload(self) -> None:
        module = load_module(PREVIDEO_EXECUTOR, "run_current_ar_prevideo_images_stage_test")
        self.assertEqual(module.downstream_asset_stage("firstframes"), "first_frame")
        self.assertEqual(module.downstream_asset_stage("storyboards"), "storyboard")
        with self.assertRaises(ValueError):
            module.downstream_asset_stage("unexpected")

    def test_legacy_prompt_builder_is_fail_closed(self) -> None:
        completed = subprocess.run([
            sys.executable, str(LEGACY_PROMPT_BUILDER),
        ], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("LEGACY_STEP04_PROMPT_ENTRYPOINT_DISABLED", completed.stderr)


if __name__ == "__main__":
    unittest.main()
