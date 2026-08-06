from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "run_step04_abcd.py"


class Step04RecoveryTests(unittest.TestCase):
    def test_verified_d_pending_contract_skips_abcd_recompile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            job = Path(tmp) / "job"
            out_dir = job / "compiled"
            out_dir.mkdir(parents=True)
            contract = out_dir / "step04_abcd_contract.json"
            contract.write_text(json.dumps({"immutable": True}), encoding="utf-8")
            digest = hashlib.sha256(contract.read_bytes()).hexdigest()
            for name in (
                "step04a_entity_binding.json",
                "step04b_asset_continuity.json",
                "step04c_prompt_ir.json",
                "step04d_delivery_manifest.json",
            ):
                (out_dir / name).write_text("{}", encoding="utf-8")
            state = {
                "current_node": "step04d_render_pending",
                "current_output": {"step04_contract": {"path": str(contract), "sha256": digest}},
            }
            state_path = job / "harness_state.json"
            state_path.write_text(json.dumps(state), encoding="utf-8")
            completed = subprocess.run([
                sys.executable, str(RUNNER),
                "--job-dir", str(job),
                "--step02-manifest", str(job / "missing-step02.json"),
                "--identity-bindings", str(job / "missing-bindings.json"),
                "--asset-registry", str(job / "missing-assets.json"),
                "--out-dir", str(out_dir),
                "--source-sha256", "not-used-on-d-resume",
            ], capture_output=True, text=True, check=False)
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            result = json.loads(completed.stdout.strip().splitlines()[-1])
            self.assertEqual(result["verified_result"], "STEP04_CONTRACT_ALREADY_VERIFIED")
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["current_node"], "step04d_render_pending")


if __name__ == "__main__":
    unittest.main()
