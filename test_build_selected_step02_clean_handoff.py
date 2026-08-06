#!/usr/bin/env python3

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parent / "scripts" / "build_selected_step02_clean_handoff.py"
SPEC = importlib.util.spec_from_file_location("selected_step02", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class SelectedStep02Tests(unittest.TestCase):
    def test_semantic_hash_ignores_no_fields(self):
        candidate = {
            "authority_binding": {"x": 1},
            "source_media_contract": {"x": 2},
            "sourceRows": [],
            "dialogueBindings": [],
            "visualFactCards": [],
            "textEvidence": [],
            "assetCandidates": [],
            "hardSceneCandidates": [],
            "blockers": [],
            "effects": {},
        }
        before = MODULE.semantic_sha(candidate)
        candidate["sourceRows"].append({"shot_id": "S010"})
        self.assertNotEqual(before, MODULE.semantic_sha(candidate))

    def test_find_shot_uses_absolute_source_axis(self):
        shots = [
            {"shot_id": "S010", "start_sec": 16.0, "end_sec_exclusive": 18.6},
            {"shot_id": "S011", "start_sec": 18.6, "end_sec_exclusive": 20.133333},
        ]
        self.assertEqual(MODULE.find_shot(shots, 16.0), "S010")
        self.assertEqual(MODULE.find_shot(shots, 18.6), "S011")
        self.assertEqual(MODULE.find_shot(shots, 20.133333), "S011")
        with self.assertRaisesRegex(MODULE.ContractError, "OUTSIDE_SELECTION"):
            MODULE.find_shot(shots, 15.9)

    def test_candidate_validator_rejects_forbidden_placeholder(self):
        candidate = self._minimal_candidate()
        candidate["dialogueBindings"][0]["source_speaker"] = "speaker_unknown"
        candidate["semantic_sha256"] = MODULE.semantic_sha(candidate)
        with self.assertRaisesRegex(MODULE.ContractError, "FORBIDDEN"):
            MODULE.validate_candidate(candidate)

    def test_candidate_validator_rejects_gap(self):
        candidate = self._minimal_candidate()
        candidate["sourceRows"][1]["source_start_sec"] = 18.7
        candidate["semantic_sha256"] = MODULE.semantic_sha(candidate)
        with self.assertRaisesRegex(MODULE.ContractError, "GAP_OR_OVERLAP"):
            MODULE.validate_candidate(candidate)

    def test_atomic_write_is_stable_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "candidate.json"
            MODULE.atomic_write_json(path, {"b": 2, "a": "中文"})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"a": "中文", "b": 2})
            self.assertTrue(path.read_bytes().endswith(b"\n"))

    @staticmethod
    def _minimal_candidate():
        effects = {key: False for key in MODULE.EFFECT_KEYS}
        candidate = {
            "schema_version": MODULE.SCHEMA_VERSION,
            "status": "candidate",
            "downstream_consumable": False,
            "test_only": False,
            "fixture_evidence": False,
            "authority_binding": {
                "selection": {"selected_shot_ids": ["S010", "S011"]},
                "counts": {"source_shots": 2, "ocr_rows": 1, "dialogues": 1},
            },
            "source_media_contract": {},
            "sourceRows": [
                {"shot_id": "S010", "source_start_sec": 16.0, "source_end_sec": 18.6},
                {"shot_id": "S011", "source_start_sec": 18.6, "source_end_sec": 20.133333},
            ],
            "dialogueBindings": [{"dialogue_id": "D001", "onset_shot": "S010", "best_evidence_shot": "S010", "source_speaker": "黑色细条纹西装男子", "source_text": "你好"}],
            "visualFactCards": [{"fact_id": "VF1"}, {"fact_id": "VF2"}],
            "textEvidence": [{"shot_id": "S010", "terminal_state": "visible_silent"}],
            "assetCandidates": [],
            "hardSceneCandidates": [],
            "blockers": [],
            "effects": effects,
            "metrics": {},
        }
        candidate["semantic_sha256"] = MODULE.semantic_sha(candidate)
        return candidate


if __name__ == "__main__":
    unittest.main()
