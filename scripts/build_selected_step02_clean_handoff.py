#!/usr/bin/env python3
"""Compile a selected-shot Step02 handoff from an accepted Haika Step01 run."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "niannian.step02_selected_clean_handoff.v1"
TIME_AXIS = "accepted_source_seconds_frozen"
FORBIDDEN_VALUES = (
    "speaker_unknown",
    "unknown",
    "未知",
    "待确认",
    "按原片",
    "见原片",
    "native frame",
    "provider_job",
    "signed_url",
)
EFFECT_KEYS = (
    "media_provider_network_requested",
    "media_provider_upload_requested",
    "media_provider_submit_requested",
    "spend_requested",
    "package_send_requested",
    "registry_promotion_requested",
    "deployment_requested",
    "local_image_editing_requested",
    "real_delivery",
)


class ContractError(RuntimeError):
    pass


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def require(condition: bool, code: str) -> None:
    if not condition:
        raise ContractError(code)


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=path.parent, prefix=path.name + ".", delete=False
    ) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    os.replace(temporary, path)


def find_shot(shots: list[dict[str, Any]], source_sec: float) -> str:
    for shot in shots:
        if float(shot["start_sec"]) <= source_sec < float(shot["end_sec_exclusive"]):
            return str(shot["shot_id"])
    if shots and abs(source_sec - float(shots[-1]["end_sec_exclusive"])) <= 0.001:
        return str(shots[-1]["shot_id"])
    raise ContractError("STEP02_TEXT_TIME_OUTSIDE_SELECTION")


def artifact_entry_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in manifest.get("artifacts", []):
        relative = str(item.get("relative_path", ""))
        if relative:
            result[relative] = item
    for key in ("visual_facts",):
        item = manifest.get(key)
        if isinstance(item, dict) and item.get("relative_path"):
            result[str(item["relative_path"])] = item
    return result


def resolve_exact_artifact(
    run_evidence_root: Path,
    skill_manifest: dict[str, Any],
    manifest_artifacts: dict[str, dict[str, Any]],
    relative_path: str,
) -> tuple[Path, dict[str, Any]]:
    expected = manifest_artifacts.get(relative_path)
    require(expected is not None, "STEP02_UPSTREAM_ARTIFACT_NOT_DECLARED")
    candidates = [run_evidence_root / relative_path]
    for item in skill_manifest.get("artifacts", []):
        skill_relative = str(item.get("relative_path", "")).replace("\\", "/")
        if skill_relative == relative_path.removeprefix("hq_work/"):
            candidates.append(Path(str(item.get("path", ""))))
    path = next((candidate for candidate in candidates if candidate.is_file()), None)
    require(path is not None, "STEP02_UPSTREAM_ARTIFACT_MISSING")
    actual_sha = file_sha256(path)
    actual_bytes = path.stat().st_size
    require(actual_sha == expected.get("sha256"), "STEP02_UPSTREAM_ARTIFACT_SHA_MISMATCH")
    require(actual_bytes == int(expected.get("bytes", -1)), "STEP02_UPSTREAM_ARTIFACT_BYTES_MISMATCH")
    return path, {"sha256": actual_sha, "bytes": actual_bytes}


def build_authority_binding(
    *,
    run_root: Path,
    current_run_path: Path,
    step01_manifest_path: Path,
    customer_index_path: Path,
    evidence_paths: dict[str, tuple[Path, dict[str, Any]]],
    review_contract_path: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    current_run = load_json(current_run_path)
    manifest = load_json(step01_manifest_path)
    customer_index = load_json(customer_index_path)
    review = load_json(review_contract_path)

    selection = manifest.get("selection") or {}
    selected_shots = selection.get("selected_shots") or []
    selected_ids = selection.get("selected_shot_ids") or []
    expected = review["expected_authority"]

    require(manifest.get("status") == "verified", "STEP02_STEP01_NOT_VERIFIED")
    require(manifest.get("downstream_consumable") is True, "STEP02_STEP01_NOT_CONSUMABLE")
    require(current_run.get("analysis_run_id") == manifest.get("analysis_run_id"), "STEP02_STALE_CURRENT_RUN")
    require(current_run.get("source_sha256") == manifest.get("source_sha256"), "STEP02_STALE_SOURCE")
    require(current_run.get("source_bytes") == manifest.get("source_bytes"), "STEP02_STALE_SOURCE")
    for key in ("project_id", "analysis_run_id", "source_sha256", "source_bytes", "source_revision"):
        require(current_run.get(key) == expected.get(key), "STEP02_REVIEW_AUTHORITY_MISMATCH")
    require(selected_ids == expected.get("selected_shot_ids"), "STEP02_SELECTION_MISMATCH")
    require(len(selected_shots) == int(expected["counts"]["shots"]), "STEP02_SELECTION_MISMATCH")
    require(customer_index.get("counts") == expected.get("counts"), "STEP02_EVIDENCE_COUNTS_MISMATCH")
    require(customer_index.get("analysis_run_id") == current_run.get("analysis_run_id"), "STEP02_INDEX_BINDING_MISMATCH")
    require(customer_index.get("source_sha256") == current_run.get("source_sha256"), "STEP02_INDEX_BINDING_MISMATCH")

    evidence_hashes = {name: envelope for name, (_, envelope) in evidence_paths.items()}
    core = {
        "project_id": current_run["project_id"],
        "analysis_run_id": current_run["analysis_run_id"],
        "source_sha256": current_run["source_sha256"],
        "source_bytes": current_run["source_bytes"],
        "source_revision": current_run["source_revision"],
        "source_duration_seconds": float(customer_index["source_media"]["duration_ms"]) / 1000,
        "current_run_sha256": file_sha256(current_run_path),
        "step01_manifest_sha256": file_sha256(step01_manifest_path),
        "customer_evidence_index_sha256": file_sha256(customer_index_path),
        "review_contract_sha256": file_sha256(review_contract_path),
        "selection": {
            "confirmation_event_id": selection["confirmation_event_id"],
            "shot_inventory_version": selection["shot_inventory_version"],
            "selected_shot_ids": selected_ids,
            "selection_start_sec": float(selected_shots[0]["start_sec"]),
            "selection_end_sec": float(selected_shots[-1]["end_sec_exclusive"]),
            "selected_duration_sec": float(selection["selected_duration_sec"]),
        },
        "counts": {
            "source_shots": int(expected["counts"]["shots"]),
            "native_frames": int(expected["counts"]["native_frames"]),
            "audio_events": int(expected["counts"]["audio_events"]),
            "ocr_rows": int(expected["counts"]["ocr_rows"]),
            "projection_frames": len(selected_shots) * 3,
            "dialogues": len(load_json(evidence_paths["dialogue_ledger"][0]).get("rows", [])),
        },
        "evidence_artifacts": evidence_hashes,
    }
    binding = {**core, "binding_sha256": sha256_bytes(canonical_bytes(core))}
    return binding, manifest, customer_index, review


def format_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    return f"{minutes:02d}:{remainder:06.3f}"


def build_candidate(
    *,
    binding: dict[str, Any],
    manifest: dict[str, Any],
    review: dict[str, Any],
    visual_facts: dict[str, Any],
    dialogue_ledger: dict[str, Any],
    aligner_receipt: dict[str, Any],
    ocr_ledger: list[dict[str, Any]],
    ocr_receipt: dict[str, Any],
) -> dict[str, Any]:
    selection = manifest["selection"]
    shots = selection["selected_shots"]
    selection_start = float(shots[0]["start_sec"])
    shot_ids = [shot["shot_id"] for shot in shots]
    shot_map = {shot["shot_id"]: shot for shot in shots}
    facts_by_shot = {
        "S" + str(segment["source_segment_id"])[-3:]: segment
        for segment in visual_facts.get("segments", [])
    }
    require(set(facts_by_shot) == set(shot_ids), "STEP02_VISUAL_FACT_COVERAGE_MISMATCH")
    review_rows = {row["shot_id"]: row for row in review["source_rows"]}
    require(set(review_rows) == set(shot_ids), "STEP02_REVIEW_SHOT_COVERAGE_MISMATCH")

    dialogue_review = {row["event_id"]: row for row in review["dialogue_bindings"]}
    dialogue_rows = dialogue_ledger.get("rows", [])
    require(set(dialogue_review) == {row["event_id"] for row in dialogue_rows}, "STEP02_DIALOGUE_REVIEW_COVERAGE_MISMATCH")
    require(aligner_receipt.get("ok") is True and aligner_receipt.get("status") == "completed", "STEP02_ALIGNER_NOT_COMPLETE")
    require(int(aligner_receipt.get("segments", -1)) == len(dialogue_rows), "STEP02_ALIGNER_COVERAGE_MISMATCH")
    require(ocr_receipt.get("ok") is True and ocr_receipt.get("status") == "completed", "STEP02_OCR_NOT_COMPLETE")
    require(int(ocr_receipt.get("errors", -1)) == 0, "STEP02_OCR_ERRORS_PRESENT")
    require(int(ocr_receipt.get("ocr_rows", -1)) == len(ocr_ledger), "STEP02_OCR_COVERAGE_MISMATCH")

    dialogues: list[dict[str, Any]] = []
    for index, raw in enumerate(dialogue_rows, start=1):
        adjudication = dialogue_review[raw["event_id"]]
        start = round(selection_start + float(raw["start_sec"]), 3)
        end = round(selection_start + float(raw["end_sec"]), 3)
        onset_shot = find_shot(shots, start)
        require(onset_shot == adjudication["onset_shot"], "STEP02_DIALOGUE_ONSET_MISMATCH")
        require(adjudication["best_evidence_shot"] in shot_map, "STEP02_DIALOGUE_BEST_SHOT_INVALID")
        dialogues.append(
            {
                "dialogue_id": f"D{index:03d}",
                "source_start_sec": start,
                "source_end_sec": end,
                "onset_shot": onset_shot,
                "best_evidence_shot": adjudication["best_evidence_shot"],
                "source_speaker": adjudication["source_speaker"],
                "source_text": raw["text"],
                "evidence_basis": adjudication["evidence_basis"],
                "speaker_attribution_status": adjudication["speaker_attribution_status"],
            }
        )

    text_evidence: list[dict[str, Any]] = []
    for index, raw in enumerate(ocr_ledger, start=1):
        source_start = round(selection_start + float(raw["time_sec"]), 3)
        source_end = round(source_start + 1 / 30, 6)
        text_evidence.append(
            {
                "text_evidence_id": f"TE{index:03d}",
                "shot_id": find_shot(shots, source_start),
                "source_start_sec": source_start,
                "source_end_sec": source_end,
                "text_type": "subtitle",
                "source_text": raw["ocr_text"],
                "screen_region": "画面下部硬字幕区域",
                "story_use": "英文硬字幕单帧证据，用于核对源片对白语义，不绑定人物身份。",
                "evidence_basis": [
                    "paddle_pp_ocrv6_terminal",
                    f"step01_ocr_row:{raw['order']}",
                ],
                "terminal_state": "visible_silent",
            }
        )

    visual_cards: list[dict[str, Any]] = []
    source_rows: list[dict[str, Any]] = []
    for index, shot in enumerate(shots, start=1):
        shot_id = shot["shot_id"]
        review_row = review_rows[shot_id]
        source_start = float(shot["start_sec"])
        source_end = float(shot["end_sec_exclusive"])
        fact_id = f"VF{index:03d}"
        visual_cards.append(
            {
                "fact_id": fact_id,
                "shot_ids": [shot_id],
                "fact_type": "composition_action_continuity",
                "visible_fact": review_row["visible_fact"],
                "evidence_refs": [
                    f"step01_visual_fact:{facts_by_shot[shot_id]['source_segment_id']}",
                    f"step01_shot_triad:{shot_id}",
                ],
            }
        )
        source_rows.append(
            {
                "shot_id": shot_id,
                "source_start_sec": source_start,
                "source_end_sec": source_end,
                "time_label": f"{format_time(source_start)}-{format_time(source_end)}",
                "story_function": review_row["story_function"],
                "visual_composition": review_row["visual_composition"],
                "blocking_movement": review_row["blocking_movement"],
                "continuity_state": review_row["continuity_state"],
                "dialogue_ids": [
                    row["dialogue_id"]
                    for row in dialogues
                    if row["onset_shot"] == shot_id
                ],
                "text_evidence_ids": [
                    row["text_evidence_id"]
                    for row in text_evidence
                    if row["shot_id"] == shot_id
                ],
                "visual_fact_ids": [fact_id],
            }
        )

    candidate = {
        "schema_version": SCHEMA_VERSION,
        "status": "candidate",
        "downstream_consumable": False,
        "test_only": False,
        "fixture_evidence": False,
        "authority_binding": binding,
        "source_media_contract": {
            "duration_seconds": binding["source_duration_seconds"],
            "time_axis": TIME_AXIS,
            "selection_start_sec": binding["selection"]["selection_start_sec"],
            "selection_end_sec": binding["selection"]["selection_end_sec"],
        },
        "sourceRows": source_rows,
        "dialogueBindings": dialogues,
        "visualFactCards": visual_cards,
        "textEvidence": text_evidence,
        "assetCandidates": review["asset_candidates"],
        "hardSceneCandidates": review["hard_scene_candidates"],
        "blockers": [],
        "effects": {key: False for key in EFFECT_KEYS},
        "metrics": {
            "source_shots": len(source_rows),
            "dialogues": len(dialogues),
            "visual_facts": len(visual_cards),
            "text_evidence": len(text_evidence),
            "hard_scenes": len(review["hard_scene_candidates"]),
            "blockers": 0,
        },
    }
    candidate["semantic_sha256"] = semantic_sha(candidate)
    validate_candidate(candidate)
    return candidate


def semantic_sha(candidate: dict[str, Any]) -> str:
    semantic = {
        key: candidate[key]
        for key in (
            "authority_binding",
            "source_media_contract",
            "sourceRows",
            "dialogueBindings",
            "visualFactCards",
            "textEvidence",
            "assetCandidates",
            "hardSceneCandidates",
            "blockers",
            "effects",
        )
    }
    return sha256_bytes(canonical_bytes(semantic))


def validate_candidate(candidate: dict[str, Any]) -> None:
    require(candidate.get("schema_version") == SCHEMA_VERSION, "STEP02_SCHEMA_INVALID")
    require(candidate.get("status") == "candidate", "STEP02_STATUS_INVALID")
    require(candidate.get("downstream_consumable") is False, "STEP02_CANDIDATE_MUST_NOT_BE_CONSUMABLE")
    require(candidate.get("test_only") is False and candidate.get("fixture_evidence") is False, "STEP02_PRODUCTION_FLAGS_INVALID")
    require(candidate.get("blockers") == [], "STEP02_BLOCKERS_PRESENT")
    require(all(candidate.get("effects", {}).get(key) is False for key in EFFECT_KEYS), "STEP02_SIDE_EFFECT_FORBIDDEN")

    binding = candidate["authority_binding"]
    shot_ids = binding["selection"]["selected_shot_ids"]
    require(len(candidate["sourceRows"]) == binding["counts"]["source_shots"], "STEP02_SOURCE_ROWS_INCOMPLETE")
    require([row["shot_id"] for row in candidate["sourceRows"]] == shot_ids, "STEP02_SOURCE_ROWS_MISMATCH")
    require(len(candidate["visualFactCards"]) == len(shot_ids), "STEP02_VISUAL_FACTS_INCOMPLETE")
    require(len(candidate["textEvidence"]) == binding["counts"]["ocr_rows"], "STEP02_TEXT_EVIDENCE_INCOMPLETE")
    require(len(candidate["dialogueBindings"]) == binding["counts"]["dialogues"], "STEP02_DIALOGUES_INCOMPLETE")

    previous_end = None
    for row in candidate["sourceRows"]:
        require(float(row["source_end_sec"]) > float(row["source_start_sec"]), "STEP02_SOURCE_TIME_INVALID")
        if previous_end is not None:
            require(abs(float(row["source_start_sec"]) - previous_end) <= 0.001, "STEP02_SOURCE_TIME_GAP_OR_OVERLAP")
        previous_end = float(row["source_end_sec"])

    dialogue_ids = [row["dialogue_id"] for row in candidate["dialogueBindings"]]
    require(len(dialogue_ids) == len(set(dialogue_ids)), "STEP02_DIALOGUE_ID_DUPLICATED")
    for row in candidate["dialogueBindings"]:
        require(row["onset_shot"] in shot_ids and row["best_evidence_shot"] in shot_ids, "STEP02_DIALOGUE_SHOT_INVALID")
        require(row["source_speaker"].strip() and row["source_text"].strip(), "STEP02_DIALOGUE_EMPTY")
    for row in candidate["textEvidence"]:
        require(row["shot_id"] in shot_ids, "STEP02_TEXT_SHOT_INVALID")
        require(row["terminal_state"] == "visible_silent", "STEP02_SOURCE_SUBTITLE_CLASSIFICATION_INVALID")

    serialized = json.dumps(
        {key: candidate[key] for key in candidate if key not in {"authority_binding"}},
        ensure_ascii=False,
    ).lower()
    for forbidden in FORBIDDEN_VALUES:
        require(forbidden.lower() not in serialized, "STEP02_FORBIDDEN_DOWNSTREAM_VALUE")
    require(candidate["semantic_sha256"] == semantic_sha(candidate), "STEP02_SEMANTIC_SHA_MISMATCH")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", required=True, type=Path)
    parser.add_argument("--current-run", required=True, type=Path)
    parser.add_argument("--review-contract", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    run_root = args.run_root.resolve()
    evidence_root = run_root / "server_evidence"
    step01_manifest_path = evidence_root / "step01_evidence_manifest.json"
    customer_index_path = run_root / "evidence" / "step01_customer_evidence_index.json"
    skill_manifest_path = evidence_root / "hq_work" / "step01_evidence_manifest.skill.json"
    skill_manifest = load_json(skill_manifest_path)
    manifest = load_json(step01_manifest_path)
    artifact_map = artifact_entry_map(manifest)

    required = {
        "visual_facts": "artifacts/visual_facts.json",
        "dialogue_ledger": "hq_work/EP001_S10_S18_dialogue_ledger.json",
        "aligner_receipt": "hq_work/EP001_S10_S18_qwen3_forced_aligner_receipt.json",
        "frame_manifest": "hq_work/EP001_S10_S18_frame_manifest.json",
        "ocr_ledger": "hq_work/smart_ocr/EP001_S10_S18_smart_ocr_ledger.json",
        "ocr_receipt": "hq_work/smart_ocr/EP001_S10_S18_smart_ocr_receipt.json",
    }
    evidence_paths = {
        name: resolve_exact_artifact(evidence_root, skill_manifest, artifact_map, relative)
        for name, relative in required.items()
    }
    binding, manifest, _, review = build_authority_binding(
        run_root=run_root,
        current_run_path=args.current_run.resolve(),
        step01_manifest_path=step01_manifest_path,
        customer_index_path=customer_index_path,
        evidence_paths=evidence_paths,
        review_contract_path=args.review_contract.resolve(),
    )
    candidate = build_candidate(
        binding=binding,
        manifest=manifest,
        review=review,
        visual_facts=load_json(evidence_paths["visual_facts"][0]),
        dialogue_ledger=load_json(evidence_paths["dialogue_ledger"][0]),
        aligner_receipt=load_json(evidence_paths["aligner_receipt"][0]),
        ocr_ledger=load_json(evidence_paths["ocr_ledger"][0]),
        ocr_receipt=load_json(evidence_paths["ocr_receipt"][0]),
    )
    atomic_write_json(args.output.resolve(), candidate)
    print(
        json.dumps(
            {
                "ok": True,
                "status": candidate["status"],
                "downstream_consumable": candidate["downstream_consumable"],
                "semantic_sha256": candidate["semantic_sha256"],
                "counts": candidate["metrics"],
                "output_sha256": file_sha256(args.output.resolve()),
                "output_bytes": args.output.resolve().stat().st_size,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ContractError as error:
        print(json.dumps({"ok": False, "error": str(error)}))
        raise SystemExit(2)
