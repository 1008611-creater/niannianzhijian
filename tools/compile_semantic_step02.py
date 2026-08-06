from __future__ import annotations

"""Promote an already accepted Step02 semantic manifest.

This is deliberately a *contract adapter*, not an evidence interpreter. It
never chooses a person from clothing/text, invents event blocks, assigns a
speaker, or creates an asset requirement. Those facts must be present in the
accepted input and remain traceable into Step04.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


INTERVAL_POLICY = "continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping"
ASSET_KINDS = {"character", "scene", "prop"}
CHARACTER_TIERS = {"lead_male", "lead_female", "key_child", "major_support", "minor_support"}


class ContractError(RuntimeError):
    def __init__(self, code: str, message: str, details: Any | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise ContractError("STEP02_INPUT_JSON_INVALID", f"无法读取 Step02 输入：{path}", {"error": str(exc)}) from exc
    if not isinstance(value, dict):
        raise ContractError("STEP02_INPUT_SHAPE_INVALID", "Step02 输入必须是对象")
    return value


def normalize_source(source: dict[str, Any]) -> dict[str, Any]:
    """Accept only an explicit semantic acceptance shape; never guess fields."""
    acceptance = source.get("acceptance") if isinstance(source.get("acceptance"), dict) else {}
    cards = source.get("cards")
    if not isinstance(cards, list):
        cards = acceptance.get("cards")
    manifest = {
        "schema_version": str(source.get("schema_version") or ""),
        "status": source.get("status", acceptance.get("status")),
        "semantic_status": source.get("semantic_status", acceptance.get("semantic_status")),
        "acceptance_mode": source.get("acceptance_mode", acceptance.get("acceptance_mode")),
        "semantic_alignment": source.get("semantic_alignment") or source.get("alignment") or {},
        "source_sha256": str(source.get("source_sha256") or ""),
        "cards": cards if isinstance(cards, list) else [],
        "asset_requirements": source.get("asset_requirements") if isinstance(source.get("asset_requirements"), list) else [],
        "identity_bindings": source.get("identity_bindings") or {},
        "provenance": source.get("provenance") or {},
    }
    return manifest


def shot_number(value: Any) -> int:
    text = str(value or "").strip().lstrip("S")
    if not text.isdigit() or int(text) <= 0:
        raise ValueError(value)
    return int(text)


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def validate_asset_requirements(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Require Step02 to declare every downstream-visible asset explicitly."""
    failures: list[dict[str, Any]] = []
    cards = list_value(manifest.get("cards"))
    known_shots = {f"S{shot_number(card.get('shot_id')):03d}" for card in cards if isinstance(card, dict) and str(card.get("shot_id") or "").lstrip("S").isdigit()}
    character_entities: dict[str, dict[str, Any]] = {}
    for card in cards:
        if not isinstance(card, dict):
            continue
        for entity in list_value(card.get("entity_instances") or card.get("entities")):
            if isinstance(entity, dict) and str(entity.get("asset_id") or "").strip():
                character_entities[str(entity["asset_id"])] = entity
    requirements = list_value(manifest.get("asset_requirements"))
    by_id: dict[str, dict[str, Any]] = {}
    for index, requirement in enumerate(requirements):
        if not isinstance(requirement, dict):
            failures.append({"check": "asset_requirement.object", "index": index})
            continue
        asset_id = str(requirement.get("asset_id") or "").strip()
        kind = str(requirement.get("kind") or "").strip()
        shots = [str(value) for value in list_value(requirement.get("required_shot_ids"))]
        evidence_ids = [str(value) for value in list_value(requirement.get("evidence_ids")) if str(value)]
        continuity_state = str(requirement.get("continuity_state") or "").strip()
        if not asset_id or kind not in ASSET_KINDS or not str(requirement.get("purpose") or "").strip() or not shots or not evidence_ids or not continuity_state:
            failures.append({"check": "asset_requirement.required_fields", "index": index, "asset_id": asset_id})
            continue
        if asset_id in by_id:
            failures.append({"check": "asset_requirement.asset_id_unique", "asset_id": asset_id})
        by_id[asset_id] = requirement
        invalid_shots = [value for value in shots if value not in known_shots]
        if invalid_shots:
            failures.append({"check": "asset_requirement.required_shot_ids", "asset_id": asset_id, "invalid": invalid_shots})
        if kind == "character":
            if str(requirement.get("casting_tier") or "") not in CHARACTER_TIERS:
                failures.append({"check": "character_requirement.casting_tier", "asset_id": asset_id})
            if not str(requirement.get("wardrobe_state") or "").strip():
                failures.append({"check": "character_requirement.wardrobe_state", "asset_id": asset_id})
            if requirement.get("requires_final_character_sheet") is not True:
                failures.append({"check": "character_requirement.requires_final_character_sheet", "asset_id": asset_id})
            if str(requirement.get("identity_status") or "").lower() != "resolved":
                failures.append({"check": "character_requirement.identity_status", "asset_id": asset_id})
    for asset_id, entity in character_entities.items():
        requirement = by_id.get(asset_id)
        if not requirement or str(requirement.get("kind") or "") != "character":
            failures.append({"check": "character_entity.final_asset_requirement", "asset_id": asset_id})
        if str(entity.get("status") or "resolved").lower() not in {"resolved", "confirmed"} or str(entity.get("identity_confidence") or "high").lower() in {"unknown", "unresolved", "conflict"}:
            failures.append({"check": "character_entity.identity_closed", "asset_id": asset_id})
    return failures


def validate(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    if manifest.get("status") != "accepted":
        failures.append({"check": "status", "value": manifest.get("status")})
    if manifest.get("semantic_status") != "accepted":
        failures.append({"check": "semantic_status", "value": manifest.get("semantic_status")})
    if manifest.get("acceptance_mode") != "semantic":
        failures.append({"check": "acceptance_mode", "value": manifest.get("acceptance_mode")})
    alignment = manifest.get("semantic_alignment") or {}
    if alignment.get("status") != "accepted":
        failures.append({"check": "semantic_alignment.status", "value": alignment.get("status")})
    if alignment.get("mapping_policy") != INTERVAL_POLICY:
        failures.append({"check": "semantic_alignment.mapping_policy", "value": alignment.get("mapping_policy")})
    unit_ids = {str(value) for value in list_value(alignment.get("semantic_unit_ids")) if str(value)}
    if not unit_ids:
        failures.append({"check": "semantic_alignment.semantic_unit_ids"})

    previous_end = -1
    previous_id = 0
    seen: set[str] = set()
    cards = list_value(manifest.get("cards"))
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            failures.append({"check": "card.object", "index": index})
            continue
        try:
            sid = shot_number(card.get("shot_id"))
        except ValueError:
            failures.append({"check": "card.shot_id", "index": index})
            continue
        sid_text = f"S{sid:03d}"
        if sid_text in seen:
            failures.append({"check": "card.shot_id_unique", "shot_id": sid_text})
        seen.add(sid_text)
        try:
            start = int(card.get("source_start_ms", card.get("start_ms")))
            end = int(card.get("source_end_ms", card.get("end_ms")))
        except (TypeError, ValueError):
            failures.append({"check": "card.time_range", "shot_id": sid_text})
            continue
        if end <= start or start < previous_end or sid <= previous_id:
            failures.append({"check": "card.time_order", "shot_id": sid_text, "range": [start, end]})
        previous_end, previous_id = end, sid
        verdict = str(card.get("verdict") or (card.get("terra_audit") or {}).get("verdict") or "").lower()
        if verdict != "pass":
            failures.append({"check": "card.verdict", "shot_id": sid_text, "value": verdict})
        if card.get("needs_targeted_recheck") is True or (card.get("terra_audit") or {}).get("needs_targeted_recheck") is True:
            failures.append({"check": "card.targeted_recheck", "shot_id": sid_text})
        if not list_value(card.get("evidence_ids")) and not str(card.get("evidence_basis") or "").strip():
            failures.append({"check": "card.evidence_ids", "shot_id": sid_text})
        card_units = {str(value) for value in list_value(card.get("semantic_unit_ids")) if str(value)}
        if not card_units or not card_units.issubset(unit_ids):
            failures.append({"check": "card.semantic_unit_ids", "shot_id": sid_text})
        entities = list_value(card.get("entity_instances") or card.get("entities"))
        context_shots = {
            shot_number(value)
            for requirement in list_value(manifest.get("asset_requirements"))
            if isinstance(requirement, dict) and str(requirement.get("kind")) in {"scene", "prop"}
            for value in list_value(requirement.get("required_shot_ids"))
            if str(value).lstrip("S").isdigit()
        }
        if not entities and sid not in context_shots:
            failures.append({"check": "card.entity_instances", "shot_id": sid_text})
        events = list_value(card.get("event_blocks") or card.get("events"))
        if entities and not events:
            failures.append({"check": "card.event_blocks", "shot_id": sid_text})
        entity_ids = {str(row.get("instance_id")) for row in entities if isinstance(row, dict)}
        for event_index, event in enumerate(events):
            if not isinstance(event, dict):
                failures.append({"check": "event.object", "shot_id": sid_text, "index": event_index})
                continue
            time_ms = list_value(event.get("timecode_ms") or event.get("time_ms"))
            if len(time_ms) != 2 or int(time_ms[1]) <= int(time_ms[0]) or int(time_ms[0]) < start or int(time_ms[1]) > end:
                failures.append({"check": "event.timecode_ms", "shot_id": sid_text, "index": event_index})
            if str(event.get("subject_instance_id") or "") not in entity_ids:
                failures.append({"check": "event.subject_instance_id", "shot_id": sid_text, "index": event_index})
            if event.get("object_instance_id") and str(event["object_instance_id"]) not in entity_ids:
                failures.append({"check": "event.object_instance_id", "shot_id": sid_text, "index": event_index})
            if not list_value(event.get("evidence_ids")):
                failures.append({"check": "event.evidence_ids", "shot_id": sid_text, "index": event_index})
            dialogue = event.get("dialogue")
            if dialogue:
                speaker = str(dialogue.get("speaker_instance_id") or dialogue.get("speaker_id") or "")
                if not speaker or speaker not in entity_ids:
                    failures.append({"check": "dialogue.speaker_instance_id", "shot_id": sid_text, "index": event_index})
                if not list_value(dialogue.get("evidence_ids")):
                    failures.append({"check": "dialogue.evidence_ids", "shot_id": sid_text, "index": event_index})
    if not cards:
        failures.append({"check": "cards.nonempty"})
    failures.extend(validate_asset_requirements(manifest))
    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--identity-bindings", type=Path, required=False)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--source-sha256", default="")
    args = parser.parse_args()
    source_path = args.source_manifest.resolve()
    source = normalize_source(read_json(source_path))
    if args.identity_bindings:
        source["identity_bindings"] = read_json(args.identity_bindings.resolve())
    source["source_sha256"] = str(args.source_sha256 or source.get("source_sha256") or "")
    failures = validate(source)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": "mx_shortdrama_step02_semantic_acceptance_gate_v1",
        "status": "accepted" if not failures else "blocked",
        "input_path": str(source_path),
        "input_sha256": sha256_file(source_path),
        "source_sha256": source["source_sha256"],
        "mapping_policy": (source.get("semantic_alignment") or {}).get("mapping_policy"),
        "failed_checks": failures,
        "next_action": "step04_abcd_compile" if not failures else "return_to_step02_targeted_recheck",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    report_path = args.out_dir / "step02_semantic_acceptance_gate.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if failures:
        print(json.dumps({"result_type":"external_blocked","task_id":"step02-semantic-gate","evidence_path_or_url":str(report_path.resolve()),"verified_result":"STEP02_SEMANTIC_GATE_BLOCKED","next_action_or_blocker":"输入必须补齐局部时间、结构化实体、事件和证据后才能进入 Step04","failed_checks":failures}, ensure_ascii=False))
        raise SystemExit(2)
    source["schema_version"] = "mx_shortdrama_step02_acceptance_manifest_v4"
    source["status"] = source["semantic_status"] = "accepted"
    source["acceptance_mode"] = "semantic"
    source["acceptance_provenance"] = {"input_path": str(source_path), "input_sha256": report["input_sha256"], "gate_path": str(report_path.resolve())}
    output_path = args.out_dir / "step02_semantic_acceptance_manifest.json"
    output_path.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result_type":"final_delivery","task_id":"step02-semantic-gate","evidence_path_or_url":str(output_path.resolve()),"verified_result":"STEP02_SEMANTIC_ACCEPTED","next_action_or_blocker":"step04_abcd_compile"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
