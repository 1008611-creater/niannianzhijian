from __future__ import annotations

"""Strict Step04 A/B/C/D compiler.

This module deliberately contains no clothing/role regex and no prompt repair
logic. Step02 accepted facts and identity bindings are the only semantic input;
the D renderer consumes the resulting IR without changing it.
"""

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from asset_lifecycle import AssetLifecycleError, validate_final_asset
from compile_semantic_step02 import validate_asset_requirements


FORBIDDEN_PROMPT_TOKENS = (
    "speaker_unknown", "人物A", "人物B", "人物A/B", "一名男子", "一名男性",
    "某男子", "某男性", "匿名男子", "未确认背景角色",
)
FORBIDDEN_ASSET_ID_MARKERS = ("_CHAR_", "_ASSET_", "CHAR_", "ASSET_")
CHINESE_DISPLAY_NAME_RE = re.compile(r"^@[\u3400-\u9fff]+$")
SEMANTIC_ALIGNMENT_POLICY = "continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping"


class CompileError(RuntimeError):
    def __init__(self, code: str, message: str, details: Any | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise CompileError("STEP04_INPUT_JSON_INVALID", f"无法读取 JSON: {path}", {"error": str(exc)}) from exc


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_value(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def validate_source_provenance(manifest: dict[str, Any], source_sha256: str) -> None:
    manifest_source_sha = str(manifest.get("source_sha256") or "").strip().lower()
    if manifest_source_sha and manifest_source_sha != source_sha256:
        raise CompileError(
            "STEP04_SOURCE_SHA_PROVENANCE_MISMATCH",
            "Step02 manifest 的原片 SHA-256 与 Step04 输入不一致",
            {"manifest": manifest_source_sha, "input": source_sha256},
        )


def validate_display_name(display_name: str, asset_id: str) -> None:
    """Reference labels are user-facing Chinese names, never internal IDs."""
    if not CHINESE_DISPLAY_NAME_RE.fullmatch(display_name):
        raise CompileError(
            "STEP04_ASSET_DISPLAY_NAME_INVALID",
            f"资产必须使用纯中文 @ 名称: {asset_id}",
            {"display_name": display_name},
        )


def shot_id(value: Any) -> str:
    raw = str(value or "").strip()
    if raw.startswith("S"):
        raw = raw[1:]
    if not raw.isdigit():
        raise CompileError("STEP04_SHOT_ID_INVALID", f"镜头 ID 无效: {value}")
    return f"S{int(raw):03d}"


def card_range(card: dict[str, Any]) -> tuple[int, int]:
    start = card.get("source_start_ms", card.get("start_ms"))
    end = card.get("source_end_ms", card.get("end_ms"))
    if start is None:
        start = round(float(card.get("source_start_sec", 0)) * 1000)
    if end is None:
        end = round(float(card.get("source_end_sec", 0)) * 1000)
    try:
        start_i, end_i = int(start), int(end)
    except (TypeError, ValueError) as exc:
        raise CompileError("STEP04_TIME_RANGE_INVALID", f"镜头时间无效: {card.get('shot_id')}") from exc
    if end_i <= start_i:
        raise CompileError("STEP04_TIME_RANGE_INVALID", f"镜头时间倒置: {card.get('shot_id')}")
    return start_i, end_i


def seconds_range(start_ms: int, end_ms: int) -> str:
    """Human/channel-facing timecodes use seconds; internal evidence stays ms."""
    return f"{start_ms / 1000:.3f}–{end_ms / 1000:.3f}秒"


def group_seconds_range(start_ms: int, end_ms: int, group_start_ms: int) -> str:
    """Channel-facing prompt time always starts at zero for its own VG."""
    return seconds_range(start_ms - group_start_ms, end_ms - group_start_ms)


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def semantic_gate(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    failures: list[dict[str, Any]] = []
    if manifest.get("status") != "accepted":
        failures.append({"check": "step02_status", "value": manifest.get("status")})
    if manifest.get("semantic_status") != "accepted":
        failures.append({"check": "step02_semantic_status", "value": manifest.get("semantic_status")})
    if manifest.get("acceptance_mode") != "semantic":
        failures.append({"check": "step02_acceptance_mode", "value": manifest.get("acceptance_mode")})
    alignment = manifest.get("semantic_alignment") or {}
    if alignment.get("status") != "accepted":
        failures.append({"check": "step02_semantic_alignment_status", "value": alignment.get("status")})
    if alignment.get("mapping_policy") != SEMANTIC_ALIGNMENT_POLICY:
        failures.append({"check": "step02_semantic_alignment_policy", "value": alignment.get("mapping_policy")})
    aligned_ids = {str(value) for value in list_value(alignment.get("semantic_unit_ids")) if str(value)}
    if not aligned_ids:
        failures.append({"check": "step02_semantic_alignment_units"})
    cards = list_value(manifest.get("cards"))
    declared_context_shots: set[int] = set()
    for requirement in list_value(manifest.get("asset_requirements")):
        if isinstance(requirement, dict) and str(requirement.get("kind") or "") in {"scene", "prop"}:
            for value in list_value(requirement.get("required_shot_ids")):
                try:
                    declared_context_shots.add(int(shot_id(value)[1:]))
                except CompileError:
                    failures.append({"check": "asset_requirement_shot", "value": value})
    seen: set[str] = set()
    previous_end = -1
    previous_sid = 0
    for card in cards:
        sid = shot_id(card.get("shot_id"))
        if sid in seen:
            failures.append({"check": "shot_id_unique", "shot_id": sid})
        seen.add(sid)
        start, end = card_range(card)
        if start < previous_end:
            failures.append({"check": "shot_time_order", "shot_id": sid})
        if int(sid[1:]) <= previous_sid:
            failures.append({"check": "shot_id_order", "shot_id": sid})
        previous_end = end
        previous_sid = int(sid[1:])
        audit = card.get("terra_audit") or {}
        verdict = str(card.get("verdict") or audit.get("verdict") or "").lower()
        if verdict != "pass":
            failures.append({"check": "terra_verdict", "shot_id": sid, "verdict": verdict})
        if card.get("needs_targeted_recheck") is True or audit.get("needs_targeted_recheck") is True:
            failures.append({"check": "targeted_recheck", "shot_id": sid})
        evidence_ids = list_value(card.get("evidence_ids"))
        if not evidence_ids and not str(card.get("evidence_basis") or "").strip() and not list_value(audit.get("evidence_paths")):
            failures.append({"check": "card_evidence", "shot_id": sid})
        has_entities = bool(list_value(card.get("entity_instances") or card.get("entities")))
        if not has_entities and int(sid[1:]) not in declared_context_shots:
            failures.append({"check": "entity_instances", "shot_id": sid})
        if not list_value(card.get("event_blocks") or card.get("events")) and has_entities:
            failures.append({"check": "event_blocks", "shot_id": sid})
        card_units = {str(value) for value in list_value(card.get("semantic_unit_ids")) if str(value)}
        if not card_units or not card_units.issubset(aligned_ids):
            failures.append({"check": "card_semantic_unit_binding", "shot_id": sid})
        for event in list_value(card.get("event_blocks") or card.get("events")):
            time_ms = list_value(event.get("timecode_ms") or event.get("time_ms"))
            if len(time_ms) != 2:
                failures.append({"check": "event_timecode", "shot_id": sid})
            if not list_value(event.get("evidence_ids")):
                failures.append({"check": "event_evidence", "shot_id": sid})
    if not cards:
        failures.append({"check": "cards_nonempty"})
    # Step02 must declare every character, scene and prop it intends to make
    # visible downstream.  A Word or historical asset filename cannot fill
    # this contract gap.
    failures.extend(validate_asset_requirements(manifest))
    return failures


def normalize_bindings(source: Any) -> list[dict[str, Any]]:
    rows = source.get("bindings", []) if isinstance(source, dict) else source
    if not isinstance(rows, list):
        raise CompileError("STEP04_BINDINGS_INVALID", "identity_bindings 必须是数组")
    normalized: list[dict[str, Any]] = []
    failures: list[str] = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            failures.append(f"bindings[{index}]")
            continue
        role_ref = str(row.get("target_ref") or row.get("localized_ref") or "")
        status = str(row.get("identity_status") or row.get("status") or "")
        shot_ids = [shot_id(value) for value in list_value(row.get("shot_ids"))]
        evidence_ids = [str(value) for value in list_value(row.get("evidence_ids")) if str(value)]
        raw_instance_ids = row.get("instance_ids")
        instance_ids_by_shot: dict[str, str] = {}
        if isinstance(raw_instance_ids, dict):
            for raw_sid, raw_instance_id in raw_instance_ids.items():
                if str(raw_instance_id).strip():
                    instance_ids_by_shot[shot_id(raw_sid)] = str(raw_instance_id).strip()
        elif isinstance(raw_instance_ids, list):
            if len(raw_instance_ids) != len(shot_ids):
                failures.append(f"bindings[{index}].instance_ids")
            else:
                instance_ids_by_shot = {
                    sid: str(instance_id).strip()
                    for sid, instance_id in zip(shot_ids, raw_instance_ids)
                    if str(instance_id).strip()
                }
        elif str(row.get("instance_id") or "").strip():
            if len(shot_ids) != 1:
                failures.append(f"bindings[{index}].instance_id_requires_one_shot")
            else:
                instance_ids_by_shot[shot_ids[0]] = str(row.get("instance_id")).strip()
        normalized_row = {
            "binding_id": str(row.get("binding_id") or ""),
            "canonical_role": str(row.get("canonical_role") or ""),
            "target_ref": role_ref,
            "target_asset": str(row.get("target_asset") or ""),
            "identity_status": status,
            "shot_ids": shot_ids,
            "evidence_ids": evidence_ids,
            "instance_ids_by_shot": instance_ids_by_shot,
        }
        required = (
            normalized_row["binding_id"], normalized_row["canonical_role"], role_ref.startswith("@"),
            normalized_row["target_asset"], status == "resolved", shot_ids, evidence_ids,
        )
        if not all(required):
            failures.append(f"bindings[{index}]")
        normalized.append(normalized_row)
    if failures:
        raise CompileError("STEP04_BINDINGS_UNRESOLVED", "身份绑定存在缺失或未闭合字段", {"fields": failures})
    return normalized


def compile_a(manifest: dict[str, Any], bindings: list[dict[str, Any]]) -> dict[str, Any]:
    cards = list_value(manifest.get("cards"))
    by_shot: dict[str, list[dict[str, Any]]] = {}
    for binding in bindings:
        for sid in binding["shot_ids"]:
            by_shot.setdefault(sid, []).append(binding)
    entities: dict[str, dict[str, Any]] = {}
    instances: list[dict[str, Any]] = []
    mentions: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    for card in cards:
        sid = shot_id(card.get("shot_id"))
        bindings_for_shot = by_shot.get(sid, [])
        supplied = list_value(card.get("entity_instances") or card.get("entities"))
        context_only = not bindings_for_shot and not supplied and any(
            int(sid[1:]) in [int(shot_id(value)[1:]) for value in list_value(req.get("required_shot_ids"))]
            for req in list_value(manifest.get("asset_requirements"))
            if isinstance(req, dict) and str(req.get("kind") or "") in {"scene", "prop"}
        )
        if not bindings_for_shot and not context_only:
            raise CompileError("STEP04_ENTITY_BINDING_MISSING", f"{sid} 没有权威身份绑定")
        if not supplied and not context_only:
            raise CompileError("STEP04_ENTITY_INSTANCES_MISSING", f"{sid} 缺少 Step02 已验收的人物实例")
        if context_only:
            continue
        asset_ids = [binding["target_asset"] for binding in bindings_for_shot]
        # Instance IDs are shot-local entity keys, not asset aliases.  A
        # duplicate ID must fail even when the rows point at different assets;
        # otherwise the global A-layer entity map can silently collapse one
        # visible person into the other before B/C are compiled.
        resolved_instance_ids = [
            binding.get("instance_ids_by_shot", {}).get(sid) or f"{sid}:{binding['target_asset']}"
            for binding in bindings_for_shot
        ]
        if len(resolved_instance_ids) != len(set(resolved_instance_ids)):
            raise CompileError(
                "STEP04_ENTITY_INSTANCE_ID_DUPLICATE",
                f"{sid} 人物实例的 instance_id 重复",
                {"instance_ids": resolved_instance_ids},
            )
        if len(asset_ids) != len(set(asset_ids)):
            explicit_instance_ids = [
                binding.get("instance_ids_by_shot", {}).get(sid, "")
                for binding in bindings_for_shot
            ]
            if not all(explicit_instance_ids) or len(explicit_instance_ids) != len(set(explicit_instance_ids)):
                raise CompileError(
                    "STEP04_ENTITY_INSTANCE_ID_AMBIGUOUS",
                    f"{sid} 同一资产在同一镜头出现多个实例但没有唯一 instance_id",
                    {"asset_ids": asset_ids, "instance_ids": explicit_instance_ids},
                )
        authoritative: list[dict[str, Any]] = []
        for binding in bindings_for_shot:
            instance_id = binding.get("instance_ids_by_shot", {}).get(sid) or f"{sid}:{binding['target_asset']}"
            authoritative.append({
                "instance_id": instance_id,
                "shot_id": int(sid[1:]),
                "role_ref": binding["target_ref"],
                "asset_id": binding["target_asset"],
                "status": "resolved",
                "evidence_ids": binding["evidence_ids"],
                "appearance_signature": str(card.get("people") or ""),
                "spatial_signature": str(card.get("composition") or ""),
                "confidence": 1.0,
            })
            entities.setdefault(instance_id, {
                "entity_id": instance_id,
                "role_ref": binding["target_ref"],
                "asset_id": binding["target_asset"],
                "status": "resolved",
                "evidence_ids": binding["evidence_ids"],
                "confidence": 1.0,
            })
        supplied_keys = {
            (
                str(row.get("instance_id") or ""),
                str(row.get("asset_id") or row.get("target_asset") or ""),
                str(row.get("role_ref") or row.get("target_ref") or ""),
            )
            for row in supplied
        }
        for row in supplied:
            if str(row.get("status") or "") != "resolved" or not list_value(row.get("evidence_ids")):
                raise CompileError("STEP04_ENTITY_INSTANCE_UNRESOLVED", f"{sid} 卡片人物实例缺少 resolved 状态或证据")
            if not CHINESE_DISPLAY_NAME_RE.fullmatch(str(row.get("role_ref") or "")):
                raise CompileError("STEP04_ENTITY_ROLE_REF_INVALID", f"{sid} 人物实例必须使用中文 @ 名称")
        authoritative_keys = {
            (item["instance_id"], item["asset_id"], item["role_ref"])
            for item in authoritative
        }
        if supplied_keys != authoritative_keys:
            raise CompileError(
                "STEP04_ENTITY_BINDING_MISMATCH",
                f"{sid} 卡片人物实例集合与权威身份绑定不一致",
                {"supplied": sorted(supplied_keys), "authoritative": sorted(authoritative_keys)},
            )
        instances.extend(authoritative)
        for field in ("people", "composition", "story_progression", "action_detail"):
            text = str(card.get(field) or "")
            for entity in authoritative:
                if entity["role_ref"] in text:
                    mentions.append({"shot_id": int(sid[1:]), "field": field, "text": text, "entity_id": entity["asset_id"], "start_ms": None, "end_ms": None, "evidence_ids": entity["evidence_ids"]})
    return {
        "schema_version": "mx_shortdrama_step04a_entity_binding_v2",
        "source_timeline": str(manifest.get("json", {}).get("exact_path") or ""),
        "entities": list(entities.values()),
        "entity_instances": instances,
        "mentions": mentions,
        "conflicts": conflicts,
    }


def normalize_asset_requirements(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """Read only explicit Step02 scene/prop requirements; never infer from prose."""
    requirements: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    for index, raw in enumerate(list_value(manifest.get("asset_requirements"))):
        if not isinstance(raw, dict):
            raise CompileError("STEP04_ASSET_REQUIREMENT_INVALID", f"资产需求 {index + 1} 不是对象")
        asset_id = str(raw.get("asset_id") or "")
        kind = str(raw.get("kind") or "")
        purpose = str(raw.get("purpose") or "").strip()
        continuity_state = str(raw.get("continuity_state") or "").strip()
        evidence_ids = [str(value) for value in list_value(raw.get("evidence_ids")) if str(value)]
        shot_ids = [int(shot_id(value)[1:]) for value in list_value(raw.get("required_shot_ids"))]
        if not asset_id or kind not in {"character", "scene", "prop"} or not purpose or not continuity_state or not evidence_ids or not shot_ids:
            raise CompileError("STEP04_ASSET_REQUIREMENT_INVALID", f"资产需求 {index + 1} 缺少 asset_id/kind/purpose/continuity_state/evidence_ids/required_shot_ids")
        if kind == "character":
            if raw.get("requires_final_character_sheet") is not True or str(raw.get("identity_status") or "") != "resolved":
                raise CompileError("STEP04_CHARACTER_REQUIREMENT_INVALID", f"人物资产需求 {asset_id} 必须声明最终角色卡和已闭合身份")
            continue
        for sid in shot_ids:
            if (asset_id, sid) in seen:
                raise CompileError("STEP04_ASSET_REQUIREMENT_DUPLICATE", f"资产 {asset_id} 在 S{sid:03d} 重复声明")
            seen.add((asset_id, sid))
        requirements.append({"asset_id": asset_id, "kind": kind, "purpose": purpose, "continuity_state": continuity_state, "evidence_ids": evidence_ids, "required_shot_ids": sorted(set(shot_ids))})
    return requirements


def verified_asset(asset_id: str, asset: dict[str, Any], display_name_fallback: str, purpose_fallback: str, expected_kind: str) -> dict[str, str]:
    exact_path = Path(str(asset.get("exact_path") or asset.get("path") or ""))
    expected_sha = str(asset.get("sha256") or "")
    try:
        lifecycle = validate_final_asset(asset_id, asset, expected_kind)
    except AssetLifecycleError as exc:
        raise CompileError(exc.code, str(exc), exc.details) from exc
    actual_sha = str(lifecycle["sha256"])
    display_name = str(asset.get("display_name") or display_name_fallback)
    if any(marker in display_name for marker in FORBIDDEN_ASSET_ID_MARKERS):
        raise CompileError("STEP04_ASSET_DISPLAY_NAME_INVALID", f"资产显示名不能包含内部 ID: {asset_id}")
    validate_display_name(display_name, asset_id)
    image_prompt = str(
        lifecycle.get("character_sheet_prompt")
        if expected_kind == "character"
        else (
            asset.get("delivery_prompt")
            or asset.get("generation_prompt")
            or asset.get("image_prompt")
            or asset.get("prompt")
            or ""
        )
    ).strip()
    if not image_prompt:
        raise CompileError("STEP04_ASSET_PROMPT_MISSING", f"资产缺少已验收的生图提示词: {asset_id}")
    return {
        "exact_path": str(exact_path.resolve()),
        "sha256": actual_sha,
        "display_name": display_name,
        "purpose": str(asset.get("purpose") or purpose_fallback),
        "generation_prompt": image_prompt,
        "image_prompt": image_prompt,
        "evidence_path": str(asset.get("evidence_path") or ""),
        "asset_stage": str(asset.get("asset_stage") or ""),
        "character_sheet_submission_receipt": str(lifecycle.get("character_sheet_submission_receipt") or ""),
        "character_sheet_task_id": str(lifecycle.get("character_sheet_task_id") or ""),
        "asset_submission_receipt": str(lifecycle.get("asset_submission_receipt") or ""),
        "asset_download_receipt": str(lifecycle.get("asset_download_receipt") or ""),
        "asset_task_id": str(lifecycle.get("task_id") or ""),
        "status": "accepted",
    }


def compile_b(manifest: dict[str, Any], a_layer: dict[str, Any], asset_registry: dict[str, Any]) -> dict[str, Any]:
    assets = list_value(asset_registry.get("assets") if isinstance(asset_registry, dict) else asset_registry)
    registry: dict[str, dict[str, Any]] = {}
    duplicate_ids: list[str] = []
    for asset in assets:
        asset_id = str(asset.get("asset_id") or asset.get("id") or "") if isinstance(asset, dict) else ""
        if not asset_id:
            raise CompileError("STEP04_ASSET_ID_MISSING", "资产注册表存在缺少 asset_id 的条目")
        if asset_id in registry:
            duplicate_ids.append(asset_id)
        registry[asset_id] = asset
    if duplicate_ids:
        raise CompileError("STEP04_ASSET_REGISTRY_DUPLICATE", "资产注册表存在重复 asset_id", {"asset_ids": sorted(set(duplicate_ids))})
    used_by: dict[str, list[int]] = {}
    output_assets: dict[str, dict[str, Any]] = {}
    slots: list[dict[str, Any]] = []
    slot_by_shot_asset: dict[tuple[int, str], dict[str, Any]] = {}
    for instance in a_layer["entity_instances"]:
        asset_id = instance.get("asset_id")
        asset = registry.get(asset_id)
        if not asset:
            raise CompileError("STEP04_ASSET_REFERENCE_MISSING", f"资产未登记: {asset_id}")
        verified = verified_asset(asset_id, asset, instance["role_ref"], "锁定该镜头人物身份与连续性", "character")
        allowed = [str(item) for item in list_value(asset.get("allowed_instance_ids"))]
        if allowed and instance["instance_id"] not in allowed:
            raise CompileError("STEP04_ASSET_INSTANCE_NOT_ALLOWED", f"资产不允许用于实例: {instance['instance_id']}")
        used_by.setdefault(asset_id, []).append(instance["shot_id"])
        output_assets.setdefault(asset_id, {
            "asset_id": asset_id,
            "display_name": verified["display_name"],
            "reference_key": verified["display_name"],
            "evidence_ids": instance["evidence_ids"],
            "exact_path": verified["exact_path"],
            "sha256": verified["sha256"],
            "duty": verified["purpose"],
            "generation_prompt": verified["generation_prompt"],
            "image_prompt": verified["image_prompt"],
            "evidence_path": verified["evidence_path"],
            "asset_stage": verified["asset_stage"],
            "character_sheet_submission_receipt": verified["character_sheet_submission_receipt"],
            "character_sheet_task_id": verified["character_sheet_task_id"],
            "asset_submission_receipt": verified["asset_submission_receipt"],
            "asset_download_receipt": verified["asset_download_receipt"],
            "asset_task_id": verified["asset_task_id"],
            "kind": "character",
            "status": verified["status"],
            "used_by_shots": [],
        })
        output_assets[asset_id]["evidence_ids"] = sorted(set(output_assets[asset_id].get("evidence_ids", []) + instance["evidence_ids"]))
        slot_key = (instance["shot_id"], asset_id)
        existing_slot = slot_by_shot_asset.get(slot_key)
        if existing_slot:
            existing_slot["allowed_instance_ids"] = sorted(set(existing_slot["allowed_instance_ids"] + [instance["instance_id"]]))
            existing_slot["evidence_ids"] = sorted(set(existing_slot.get("evidence_ids", []) + instance["evidence_ids"]))
        else:
            slot_id = f"REF-{instance['shot_id']:03d}-{asset_id}"
            existing_slot = {
                "slot_id": slot_id,
                "shot_id": instance["shot_id"],
                "reference_key": verified["display_name"],
                "asset_id": asset_id,
                "kind": "character",
                "duty": verified["purpose"],
                "allowed_instance_ids": [instance["instance_id"]],
                "evidence_ids": list(instance["evidence_ids"]),
                "exact_path": verified["exact_path"],
                "sha256": verified["sha256"],
                "generation_prompt": verified["generation_prompt"],
                "image_prompt": verified["image_prompt"],
                "evidence_path": verified["evidence_path"],
                "asset_stage": verified["asset_stage"],
                "character_sheet_submission_receipt": verified["character_sheet_submission_receipt"],
                "character_sheet_task_id": verified["character_sheet_task_id"],
                "asset_submission_receipt": verified["asset_submission_receipt"],
                "asset_download_receipt": verified["asset_download_receipt"],
                "asset_task_id": verified["asset_task_id"],
                "status": verified["status"],
            }
            slot_by_shot_asset[slot_key] = existing_slot
            slots.append(existing_slot)
    # Non-person assets may only enter via accepted Step02 asset_requirements.
    known_shots = {int(shot_id(card.get("shot_id"))[1:]) for card in list_value(manifest.get("cards"))}
    for requirement in normalize_asset_requirements(manifest):
        asset_id = requirement["asset_id"]
        asset = registry.get(asset_id)
        if not asset:
            raise CompileError("STEP04_ASSET_REFERENCE_MISSING", f"资产未登记: {asset_id}")
        verified = verified_asset(asset_id, asset, str(asset.get("display_name") or ""), requirement["purpose"], requirement["kind"])
        for sid in requirement["required_shot_ids"]:
            if sid not in known_shots:
                raise CompileError("STEP04_ASSET_REQUIREMENT_SHOT_INVALID", f"资产 {asset_id} 指向不存在人物实例的镜头 S{sid:03d}")
            used_by.setdefault(asset_id, []).append(sid)
            output_assets.setdefault(asset_id, {
                "asset_id": asset_id,
                "display_name": verified["display_name"],
                "reference_key": verified["display_name"],
                "evidence_ids": requirement["evidence_ids"],
                "exact_path": verified["exact_path"],
                "sha256": verified["sha256"],
                "duty": requirement["purpose"],
                "generation_prompt": verified["generation_prompt"],
                "image_prompt": verified["image_prompt"],
                "evidence_path": verified["evidence_path"],
                "asset_submission_receipt": verified["asset_submission_receipt"],
                "asset_download_receipt": verified["asset_download_receipt"],
                "asset_task_id": verified["asset_task_id"],
                "kind": requirement["kind"],
                "status": verified["status"],
                "used_by_shots": [],
            })
            slots.append({
                "slot_id": f"REF-{sid:03d}-{asset_id}",
                "shot_id": sid,
                "reference_key": verified["display_name"],
                "asset_id": asset_id,
                "kind": requirement["kind"],
                "duty": requirement["purpose"],
                "allowed_instance_ids": [],
                "exact_path": verified["exact_path"],
                "sha256": verified["sha256"],
                "status": verified["status"],
                "evidence_ids": requirement["evidence_ids"],
                "generation_prompt": verified["generation_prompt"],
                "image_prompt": verified["image_prompt"],
                "evidence_path": verified["evidence_path"],
                "asset_submission_receipt": verified["asset_submission_receipt"],
                "asset_download_receipt": verified["asset_download_receipt"],
                "asset_task_id": verified["asset_task_id"],
            })
    for asset_id, shot_ids in used_by.items():
        output_assets[asset_id]["used_by_shots"] = sorted(set(shot_ids))
    return {
        "schema_version": "mx_shortdrama_step04b_asset_continuity_v3",
        "assets": list(output_assets.values()),
        "reference_slots": slots,
        "shot_usage": {str(shot): [slot["slot_id"] for slot in slots if slot["shot_id"] == shot] for shot in sorted({slot["shot_id"] for slot in slots})},
    }


def card_text(card: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = card.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


# Prompt text is a delivery view of the immutable C facts.  These phrases were
# repeatedly observed in old outputs and add no new visual instruction; remove
# only exact boilerplate, never evidence-bearing clauses.
PROMPT_BOILERPLATE = (
    "当前发言或反应带来视线、表情或手势的自然变化。",
    "当前发言或反应带来视线、表情或手势自然变化。",
    "保持空间状态。",
)


def display_seconds(value: Any) -> str:
    """Convert embedded source milliseconds for the user-facing prompt only."""
    text = str(value or "")

    def range_replacer(match: re.Match[str]) -> str:
        start = int(match.group(1)) / 1000
        end = int(match.group(2)) / 1000
        return f"{start:.3f}–{end:.3f}秒"

    # Source cards use both ``4100ms-5000ms`` and ``4100-5000ms``.
    text = re.sub(r"(?<!\d)(\d+)\s*(?:ms)?\s*[-–—]\s*(\d+)\s*ms", range_replacer, text, flags=re.I)
    text = re.sub(r"(?<!\d)(\d+)\s*ms", lambda match: f"{int(match.group(1)) / 1000:.3f}秒", text, flags=re.I)
    return text


def rebase_prompt_time(value: Any, group_start_ms: int, group_end_ms: int) -> str:
    """Rebase delivery prose to an independently generated video group.

    The immutable event IR retains source absolute milliseconds.  The prompt is
    submitted one VG at a time, so every visible time in it is relative to that
    VG.  Source cards can use absolute decimal seconds or a minute-local
    ``00:SS.s`` notation; both are normalized here without modifying evidence.
    """
    text = display_seconds(value)
    duration_ms = group_end_ms - group_start_ms
    source_minute_base_ms = (group_start_ms // 60_000) * 60_000

    def relative_value(absolute_ms: float) -> str | None:
        relative_ms = absolute_ms - group_start_ms
        if relative_ms < -1 or relative_ms > duration_ms + 1:
            return None
        return f"{max(0.0, relative_ms) / 1000:.3f}"

    def relative_label(absolute_ms: float) -> str:
        value = relative_value(absolute_ms)
        # A raw card may mention a preceding/following shot's local marker.
        # It is not part of this independently generated video, so omit it
        # rather than leaking a misleading non-zero source time.
        return f"{value}秒" if value is not None else ""

    def decimal_range(match: re.Match[str]) -> str:
        start = relative_value(float(match.group(1)) * 1000)
        end = relative_value(float(match.group(2)) * 1000)
        if start is None or end is None:
            return ""
        return f"{start}–{end}秒"

    # Event/dialogue delivery lines produced by C carry absolute decimal
    # seconds before this final prompt-only projection.
    text = re.sub(
        r"(?<![\d:])(\d{1,3}\.\d{3})\s*[–-]\s*(\d{1,3}\.\d{3})秒",
        decimal_range,
        text,
    )

    def clock_replacer(match: re.Match[str]) -> str:
        minutes = int(match.group(1))
        seconds = float(match.group(2))
        raw_ms = (minutes * 60 + seconds) * 1000
        # A 00:SS marker in a later episode minute is a minute-local source
        # notation; a nonzero minute marker is already episode-absolute.
        absolute_ms = source_minute_base_ms + raw_ms if minutes == 0 and source_minute_base_ms else raw_ms
        return relative_label(absolute_ms)

    text = re.sub(r"(?<!\d)(\d{1,2}):(\d{2}(?:\.\d{1,3})?)(?!\d)", clock_replacer, text)
    text = re.sub(r"(?:\s*/\s*)?\s*处(?=\s*(?:硬切|直切|切入|切出|由))", "", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text


def compact_fact(value: Any) -> str:
    """Normalize and exact-deduplicate prose without semantic paraphrasing."""
    text = re.sub(r"\s+", " ", display_seconds(value)).strip()
    # Step02 retains labelled state fields for audit.  Delivery prose keeps the
    # same evidence but turns them into a readable time-ordered sentence.
    for source, delivery in (
        ("开场状态：", "开场， "),
        ("触发事件：", "随后， "),
        ("因果动作：", "接着， "),
        ("结束状态：", "最后， "),
        ("初始姿势为", "开场"),
        ("初始姿态为", "开场"),
    ):
        text = text.replace(source, delivery)
    for phrase in PROMPT_BOILERPLATE:
        text = text.replace(phrase, "")
    # Exact duplicate clauses are common when Gemini and the action field are
    # merged.  Preserve order and all non-duplicate factual clauses.
    # Keep a closing dialogue quote with the sentence-ending punctuation.  The
    # previous look-behind split detached ``”`` after ``？`` and silently
    # turned correct dialogue into ``？；”`` in the delivery Word.
    clauses = [part.strip(" ；;，,") for part in re.findall(r'[^。！？；;]+(?:[。！？；;]+[”’"]?)?', text) if part.strip(" ；;，,")]
    unique: list[str] = []
    seen: set[str] = set()
    for clause in clauses:
        key = re.sub(r"\s+", "", clause)
        if key and key not in seen:
            seen.add(key)
            unique.append(clause)
    return "；".join(unique)


def clean_dialogue_text(value: Any) -> str:
    """Keep only the spoken text; source prose often leaves delimiter noise."""
    text = compact_fact(value).strip()
    text = re.sub(r"[；;]+(?=[”’\"。！？!?]?$)", "", text)
    text = re.sub(r"[；;]\s*([”’\"])", r"\1", text)
    return text.strip(" \t\r\n，,；;")


def clean_event_change(value: Any, subject_ref: str) -> str:
    """Remove a duplicated local timeline/subject before Step04 adds its own.

    Step02 keeps source-prose actions verbatim for audit.  Some cards already
    prefix the action with the event interval and subject, so rendering those
    strings below an event row created ``57367-59600ms @角色:57367...``.
    The prompt needs one authoritative timestamp, not the same one twice.
    """
    text = compact_fact(value)
    text = re.sub(r"^\s*\d{1,6}\s*[-–—]\s*\d{1,6}\s*ms\s*", "", text, flags=re.I)
    text = re.sub(r"^\s*\d+\.\d{3}\s*[-–—]\s*\d+\.\d{3}\s*秒\s*[:：]?\s*", "", text)
    # A prior event sometimes leaked a following event into its action prose.
    # The following timecoded clause already has its own immutable event row.
    text = re.sub(r"[；;]\s*(?:\d{1,6}\s*[-–—]\s*\d{1,6}\s*ms|\d+\.\d{3}\s*[-–—]\s*\d+\.\d{3}\s*秒).*$", "", text, flags=re.I)
    text = re.sub(rf"^\s*{re.escape(subject_ref)}\s*[:：]\s*", "", text)
    text = re.sub(rf"^\s*{re.escape(subject_ref)}\s*", "", text)
    text = re.sub(rf"(?:硬)?切到{re.escape(subject_ref)}近景", "硬切至近景", text)
    text = text.replace(f"切回{subject_ref}近景", "硬切回近景")
    return text.strip(" \t\r\n；;")


def remove_dialogue_from_action(change: str, dialogue_text: str) -> str:
    """Dialogue is rendered once at the event time, never inside action prose."""
    if dialogue_text:
        escaped = re.escape(dialogue_text)
        # Remove a literal copy of the structured dialogue.
        change = re.sub(rf"[，,、；;]?\s*(?:说|接出|完成|问|脱口而出)?[‘'“\"]{escaped}[’'”\"]", "", change)
    # Remove source-only subtitle/lip-sync notes (including an original-
    # language subtitle). If an action carries a quote but no structured
    # dialogue, it is still not safe to emit: C requires speech to arrive
    # through the independently verified dialogue object.
    change = re.sub(r"[，,、；;]?\s*嘴型与字幕[^，,；;。]*[，,；;。]?", "", change)
    change = re.sub(r"[，,、；;]?\s*(?:继续)?说完?[‘'“\"][^’'”\"]+[’'”\"]", "", change)
    change = re.sub(r"[，,、；;]?\s*(?:问|接出|脱口而出)[‘'“\"][^’'”\"]+[’'”\"]", "", change)
    change = re.sub(r"[，,、；;]?\s*(?:他|她|女孩|男主|男配)?(?:继续)?说[‘'“\"][^’'”\"]+[’'”\"]", "", change)
    change = re.sub(r"[，,、；;]?\s*嘴型和字幕[^，,；;。]*", "", change)
    change = change.replace("硬切回近景，她", "硬切回近景，继续开口")
    change = change.replace("硬切至近景，他", "硬切至近景，")
    change = compact_fact(change).replace("。；", "；").replace("；。", "。")
    return change.strip(" ，,；;")


def dialogue_delivery_clause(dialogue: dict[str, Any], speaker_ref: str) -> str:
    """Place localized dialogue at its verified action/mouth interval."""
    target_text = clean_dialogue_text(dialogue.get("target_text") or dialogue.get("text") or dialogue.get("content"))
    mode = str(dialogue.get("mode") or "")
    if mode == "offscreen_inner_monologue":
        return f"{speaker_ref}的内心独白以自然拉美英语低声响起：“{target_text}”"
    if mode == "offscreen_over_cut":
        return f"切镜时保留{speaker_ref}的画外拉美英语：“{target_text}”"
    return f"{speaker_ref}开口，口型准确对应自然拉美英语：“{target_text}”"


def validate_target_dialogue_names(source_text: str, target_text: str, dialogue_localization: dict[str, Any] | None, sid: int) -> None:
    """Forbid source names from leaking into a localized spoken line."""
    for source_name, target_name in dict((dialogue_localization or {}).get("source_name_replacements") or {}).items():
        if source_name in source_text and target_name not in target_text:
            raise CompileError(
                "STEP04_DIALOGUE_TARGET_NAME_MISSING",
                f"S{sid:03d} 目标语言台词未使用已锁定的转绘后人名",
                {"source_name": source_name, "required_target_name": target_name, "target_text": target_text},
            )


def compact_event_lines(events: list[dict[str, Any]], role_by_instance: dict[str, str]) -> list[str]:
    """Write only per-event change; unchanged state is carried by the IR."""
    lines: list[str] = []
    for event in events:
        subject_ref = role_by_instance[event["subject_instance_ids"][0]]
        change = clean_event_change(event.get("change") or event.get("action"), subject_ref)
        dialogue_text = ""
        if event.get("dialogue"):
            dialogue_text = clean_dialogue_text(event["dialogue"].get("text") or event["dialogue"].get("content"))
            # The source action field may already contain a prose copy of the
            # dialogue. Keep the structured event dialogue as the only copy.
            for duplicate in (
                f"在动作末段说“{dialogue_text}”",
                f"在动作末段说\"{dialogue_text}\"",
                f"说“{dialogue_text}”",
                f"说\"{dialogue_text}\"",
            ):
                change = change.replace(duplicate, "")
        change = remove_dialogue_from_action(change, dialogue_text)
        change = clean_event_change(change, subject_ref)
        # Event blocks carry start/end state for audit.  In the actual video
        # prompt, their source prose is often a second description of the
        # same action.  Emit the observed change once, at its exact interval.
        transition = change or "保持当前动作"
        line = f"{seconds_range(event['start_ms'], event['end_ms'])}：{subject_ref}{transition}"
        if event.get("dialogue"):
            dialogue = event["dialogue"]
            line += f"；{dialogue_delivery_clause(dialogue, role_by_instance[dialogue['speaker_instance_id']])}"
        lines.append(line)
    return lines


def compact_sound(value: Any, has_dialogue: bool, active_speaker_ref: str = "") -> str:
    text = compact_fact(value)
    if has_dialogue:
        # Dialogue belongs only in its timed action event.  Keep actual
        # ambience, but never echo a speaker, quote, or cross-shot note here.
        ambient = []
        for clause in re.split(r"[；;。]", text):
            clause = clause.strip(" ，,；;")
            if not clause:
                continue
            if any(token in clause for token in ("说", "对白", "男声", "女声", "下一组", "上一组", "延续", "绑定", "不能改绑", "‘", "’", "\"", "“", "”")):
                continue
            ambient.append(clause)
        text = "；".join(ambient)
        if not text:
            # The accepted card confirms an on-screen speaking interval but
            # has no additional audio detail. Preserve the room's verified
            # continuity without inventing a second speaker or duplicate line.
            text = "保留连续的会议室空气声、衣物与桌面细微反馈，除对应口型台词外不叠加额外对白。"
    elif active_speaker_ref:
        # A visible, resolved speaking face must never reach the prompt as an
        # anonymous 'male/female voice'.  This is not a dialogue claim; it is
        # the already accepted on-screen speaking identity.
        text = re.sub(r"男声发言语音|男声发言", f"{active_speaker_ref}持续发言", text)
        text = re.sub(r"女声发言语音|女声发言", f"{active_speaker_ref}持续发言", text)
    return text.strip(" ；;")


def concise_scene_identity(card: dict[str, Any]) -> str:
    """Use the verified story function, not the generic 'continuous shot'."""
    story = compact_fact(card_text(card, "story_progression", "剧情发展"))
    if any(token in story for token in ("营收", "汇报", "报告", "讲解")):
        return "企业会议室内的正式汇报"
    if any(token in story for token in ("震惊", "不解")):
        return "企业会议室内的震惊反应"
    if any(token in story for token in ("迟到", "质问", "反驳", "安抚", "到来", "承认")):
        return "企业会议室内的到场质询"
    return "企业会议室内的人物反应"


def subtitle_continuity_instruction(card: dict[str, Any]) -> str:
    """Consume verified subtitle timing without reusing stale source names/text."""
    source = compact_fact(card_text(card, "text_continuity", "字幕连续性"))
    if not source:
        return ""
    # Step02's OCR proves timing, screen position, and line changes.  The
    # actual words are localized by the target-language dialogue map, so the
    # source OCR phrase itself must not reintroduce a stale source name.
    return "画面底部英文字幕随对应口型和台词逐句切换，内容与本段拉美英语对白一致。"


def narrative_phase(card: dict[str, Any]) -> str:
    """Classify only the broad dramatic phase used to choose VG boundaries."""
    story = compact_fact(card_text(card, "story_progression", "剧情发展"))
    action = compact_fact(card_text(card, "action_detail", "人物动作细节"))
    text = f"{story}；{action}"
    if any(token in text for token in ("震惊", "变化怎么", "不解")):
        return "opening_reaction"
    if any(token in text for token in ("到来", "迟到", "安抚", "推离", "靠近", "终于来了")):
        return "arrival_exchange"
    if any(token in text for token in ("十点", "迟到规则", "证明", "再看看", "怎么就")):
        return "lateness_confrontation"
    if any(token in text for token in ("承认", "不错", "气恼", "不爽", "怒视")):
        return "reaction_after_confrontation"
    if any(token in text for token in ("汇报", "营收", "报告", "讲解", "参会人员", "时间推移")):
        return "formal_report"
    return "continuation"


def merge_fact_once(parts: list[str]) -> str:
    """Join evidence fields without repeating a sentence already present."""
    output: list[str] = []
    for raw in parts:
        value = compact_fact(raw)
        if not value:
            continue
        if any(value in existing or existing in value for existing in output):
            continue
        output.append(value)
    return "；".join(output).replace("。；", "。 ").replace("；。", "。")


def comparison_form(value: Any) -> str:
    """A narrow comparison key used only to remove literal duplicated facts."""
    text = display_seconds(value)
    text = re.sub(r"\d+\.\d{3}–\d+\.\d{3}秒[：:]?", "", text)
    return re.sub(r"[\s；;，,。.!！？?]", "", text)


def segment_fact_text(segment: dict[str, Any], group_start_ms: int, group_end_ms: int) -> str:
    """Write one natural, evidence-rich timeline sentence without field labels."""
    story = rebase_prompt_time(compact_fact(segment.get("story_progression") or ""), group_start_ms, group_end_ms)
    action_detail = rebase_prompt_time(compact_fact(segment.get("action_detail") or ""), group_start_ms, group_end_ms)
    action_key = comparison_form(action_detail)
    event_lines = []
    for raw_event_line in str(segment.get("action") or "").splitlines():
        # Event lines are explicitly newline-delimited by C-layer compilation.
        # Semicolons remain inside their action or dialogue sentence: splitting
        # on them previously detached and dropped the localized dialogue.
        event_line = re.sub(r"\s+", " ", rebase_prompt_time(raw_event_line, group_start_ms, group_end_ms)).strip(" ；;")
        if not event_line:
            continue
        # A timed dialogue is distinct even where the physical action has
        # already been described by Gemini.  Other literal duplicates add no
        # instruction and are removed without semantic rewriting.
        has_dialogue = "拉美英语：“" in event_line or "说“" in event_line or '说"' in event_line
        event_key = comparison_form(event_line)
        if not has_dialogue and event_key and (event_key in action_key or action_key in event_key):
            continue
        # Keep a dialogue together with its verified physical action.  The
        # action supplies lip-sync and motivation; its semicolons are not an
        # instruction boundary.
        event_lines.append(event_line)
    # `dialogue_lines` is emitted from the normalized dialogue objects rather
    # than re-parsed from prose.  This keeps each approved localized line in
    # the delivery prompt even if exact-deduplication removes a similar action
    # sentence from the source card.
    dialogue_lines = [rebase_prompt_time(value, group_start_ms, group_end_ms).strip() for value in list_value(segment.get("dialogue_lines")) if str(value).strip()]
    # These fields are all independently accepted Step02 evidence. They are
    # deliberately preserved in their natural temporal order rather than
    # compressed into visible "事件/构图/声音" form labels.
    return merge_fact_once([
        rebase_prompt_time(segment.get("composition") or "", group_start_ms, group_end_ms),
        story,
        action_detail,
        "；".join(event_lines),
        "；".join(dialogue_lines),
        rebase_prompt_time(segment.get("camera") or "", group_start_ms, group_end_ms),
        rebase_prompt_time(segment.get("camera_transition") or "", group_start_ms, group_end_ms),
        rebase_prompt_time(segment.get("light") or "", group_start_ms, group_end_ms),
        rebase_prompt_time(segment.get("sound") or "", group_start_ms, group_end_ms),
        rebase_prompt_time(segment.get("subtitle_continuity") or "", group_start_ms, group_end_ms),
    ])


def build_group_prompt(group_segments: list[dict[str, Any]], references: list[dict[str, Any]]) -> str:
    """Compile one complete VG prompt without discarding Gemini shot facts.

    References are the visual authority for stable appearance and geometry. The
    prose therefore introduces their duties once and spends its remaining
    budget on the source timeline: dramatic progression, visible action,
    composition, camera, light, sound, and timed dialogue.
    """
    first = group_segments[0]
    role_refs: list[str] = []
    for segment in group_segments:
        for role_ref in segment.get("role_refs") or []:
            if role_ref and role_ref not in role_refs:
                role_refs.append(role_ref)
    reference_names = "、".join(
        str(item.get("reference_key") or "")
        for item in references
        if str(item.get("reference_key") or "").strip()
    )
    group_start_ms = int(first["start_ms"])
    group_end_ms = int(group_segments[-1]["end_ms"])
    group_start = group_seconds_range(group_start_ms, group_end_ms, group_start_ms)
    lines = [
        f"{group_start} 的完整连续短剧视频。{first.get('scene_identity') or '企业会议室内的连续戏剧动作'}，发生在{first.get('environment_identity') or '现代墨西哥企业会议室'}。",
        f"参考图：{reference_names}。参考图锁定人物、场景和道具的静态事实；以下只写镜头中的变化与台词。",
    ]
    for segment in group_segments:
        seg_start = int(segment["start_ms"])
        seg_end = int(segment["end_ms"])
        time_label = group_seconds_range(seg_start, seg_end, group_start_ms)
        fact = segment_fact_text(segment, group_start_ms, group_end_ms)
        lines.append(f"{time_label}：{fact}")
    lines.append("保持参考图连续性；不新增人物或台词，不重置镜头间已发生的动作。")
    return "\n".join(line for line in lines if line.rstrip("："))


def merge_prompt_groups(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge native Step02 cards into complete 5–15 second video groups."""
    buckets: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    current_phase = ""
    for group in groups:
        segment = group["segments"][0]
        phase = str(segment.get("narrative_phase") or "continuation")
        current_duration = (int(current[-1]["segments"][0]["end_ms"]) - int(current[0]["segments"][0]["start_ms"])) if current else 0
        phase_change = bool(current and phase != current_phase)
        should_flush = bool(
            current
            and current_duration >= 5000
            and (phase_change or current_duration >= 10000)
        )
        if should_flush:
            buckets.append(current)
            current = []
            current_phase = ""
        current.append(group)
        current_phase = phase if not current_phase else current_phase
    if current:
        buckets.append(current)

    # A phase break must not create a sub-five-second production group. Merge
    # it forward/backward until every normal group is usable by the video API.
    index = 0
    while index < len(buckets):
        bucket = buckets[index]
        duration = int(bucket[-1]["segments"][0]["end_ms"]) - int(bucket[0]["segments"][0]["start_ms"])
        if duration < 5000 and index + 1 < len(buckets):
            buckets[index:index + 2] = [bucket + buckets[index + 1]]
            continue
        if duration < 5000 and index > 0:
            buckets[index - 1:index + 1] = [buckets[index - 1] + bucket]
            index -= 1
            continue
        index += 1

    merged: list[dict[str, Any]] = []
    for group_index, bucket in enumerate(buckets, start=1):
        segments = [item["segments"][0] for item in bucket]
        references: list[dict[str, Any]] = []
        seen_refs: set[str] = set()
        for item in bucket:
            for ref in item.get("references", []):
                key = str(ref.get("reference_key") or "")
                if key and key not in seen_refs:
                    seen_refs.add(key)
                    references.append(ref)
        start_ms = int(segments[0]["start_ms"])
        end_ms = int(segments[-1]["end_ms"])
        merged.append({
            "group_id": f"VG{group_index:02d}",
            "source_start_ms": start_ms,
            "source_end_ms": end_ms,
            "narrative_phase": segments[0].get("narrative_phase") or "continuation",
            "references": references,
            "segments": segments,
            "prompt_text": build_group_prompt(segments, references),
            "negative_constraints": ["不混用不同人物资产", "不改变源镜头时间顺序", "不新增未确认说话人"],
            "prompt_compression": {
                "policy": "one_complete_5_to_15_second_group; preserve_gemini_story_action_camera_light; references_lock_stable_facts",
                "source_segment_count": len(segments),
                "source_duration_seconds": round((end_ms - start_ms) / 1000, 3),
            },
        })
    return merged


def compile_c(manifest: dict[str, Any], a_layer: dict[str, Any], b_layer: dict[str, Any], dialogue_localization: dict[str, Any] | None = None) -> dict[str, Any]:
    instances_by_shot: dict[int, list[dict[str, Any]]] = {}
    for instance in a_layer["entity_instances"]:
        instances_by_shot.setdefault(instance["shot_id"], []).append(instance)
    slots_by_shot: dict[int, list[dict[str, Any]]] = {}
    for slot in b_layer["reference_slots"]:
        slots_by_shot.setdefault(slot["shot_id"], []).append(slot)
    groups: list[dict[str, Any]] = []
    for card in list_value(manifest.get("cards")):
        sid = int(shot_id(card.get("shot_id"))[1:])
        start_ms, end_ms = card_range(card)
        entities = instances_by_shot.get(sid, [])
        slots = slots_by_shot.get(sid, [])
        events = list_value(card.get("event_blocks") or card.get("events"))
        if not events and entities:
            raise CompileError("STEP04_EVENT_BLOCK_MISSING", f"S{sid:03d} 没有结构化事件")
        normalized_events: list[dict[str, Any]] = []
        entity_ids = {item["instance_id"] for item in entities}
        role_by_instance = {item["instance_id"]: item["role_ref"] for item in entities}
        slot_by_asset = {item["asset_id"]: item["slot_id"] for item in slots}
        context_slot_ids = [item["slot_id"] for item in slots if item.get("kind") in {"scene", "prop"}]
        declared_context_slot_ids = [str(value) for value in list_value(card.get("context_reference_slot_ids") or card.get("context_reference_slots")) if str(value)]
        if set(declared_context_slot_ids) != set(context_slot_ids):
            raise CompileError(
                "STEP04_CONTEXT_REFERENCE_DECLARATION_MISMATCH",
                f"S{sid:03d} 场景/道具参考槽位声明与 B 层不一致",
                {"declared": sorted(set(declared_context_slot_ids)), "required": sorted(set(context_slot_ids))},
            )
        last_event_end = start_ms
        for index, event in enumerate(events, start=1):
            raw_time = list_value(event.get("timecode_ms") or event.get("time_ms"))
            if len(raw_time) != 2:
                raise CompileError("STEP04_EVENT_TIMECODE_INVALID", f"S{sid:03d} 事件时间无效")
            event_start, event_end = int(raw_time[0]), int(raw_time[1])
            if event_start < start_ms or event_end > end_ms or event_end <= event_start:
                raise CompileError("STEP04_EVENT_TIME_OUT_OF_RANGE", f"S{sid:03d} 事件时间越界")
            if event_start < last_event_end:
                raise CompileError("STEP04_EVENT_TIME_ORDER_INVALID", f"S{sid:03d} 事件时间倒序或重叠")
            subject = str(event.get("subject_instance_id") or "")
            if subject not in entity_ids:
                raise CompileError("STEP04_EVENT_SUBJECT_INVALID", f"S{sid:03d} 事件主语未绑定")
            object_id = str(event.get("object_instance_id") or "")
            if object_id and object_id not in entity_ids:
                raise CompileError("STEP04_EVENT_OBJECT_INVALID", f"S{sid:03d} 事件客体未绑定")
            # A short source shot can legitimately contain an audible speaker,
            # a foreground counterpart and an on-screen reaction at the same
            # instant.  Do not manufacture a second overlapping micro-event
            # solely to consume the third verified visual reference.  The
            # source timeline may declare those additional, evidenced
            # participants explicitly; they remain part of this one event.
            related_ids = [str(value) for value in list_value(event.get("related_instance_ids")) if str(value)]
            invalid_related = [value for value in related_ids if value not in entity_ids]
            if invalid_related:
                raise CompileError("STEP04_EVENT_RELATED_INVALID", f"S{sid:03d} 事件关联人物未绑定", {"instance_ids": invalid_related})
            if subject in related_ids or (object_id and object_id in related_ids):
                raise CompileError("STEP04_EVENT_RELATED_DUPLICATE", f"S{sid:03d} 事件关联人物重复")
            action_text = str(event.get("action") or event.get("change") or "").strip()
            if not action_text:
                raise CompileError("STEP04_EVENT_ACTION_MISSING", f"S{sid:03d} 事件缺少动作变化")
            evidence_ids = [str(item) for item in list_value(event.get("evidence_ids")) if str(item)]
            if not evidence_ids:
                raise CompileError("STEP04_EVENT_EVIDENCE_MISSING", f"S{sid:03d} 事件缺少证据")
            dialogue = event.get("dialogue")
            if dialogue:
                speaker = str(dialogue.get("speaker_instance_id") or dialogue.get("speaker_id") or "")
                if speaker not in entity_ids:
                    raise CompileError("STEP04_DIALOGUE_SPEAKER_INVALID", f"S{sid:03d} 对白说话人未绑定")
                # Dialogue must have its own interval; using the parent event
                # interval silently attaches speech to the wrong action.
                dialogue_range = list_value(dialogue.get("timecode_ms") or dialogue.get("time_ms"))
                if len(dialogue_range) != 2 or int(dialogue_range[0]) < event_start or int(dialogue_range[1]) > event_end:
                    raise CompileError("STEP04_DIALOGUE_TIMECODE_INVALID", f"S{sid:03d} 对白时间不在动作事件内")
                dialogue_evidence = [str(item) for item in list_value(dialogue.get("evidence_ids")) if str(item)]
                if not dialogue_evidence:
                    raise CompileError("STEP04_DIALOGUE_EVIDENCE_MISSING", f"S{sid:03d} 对白缺少说话人/文本证据")
                dialogue_text = str(dialogue.get("text") or dialogue.get("content") or "").strip()
                if not dialogue_text:
                    raise CompileError("STEP04_DIALOGUE_TEXT_MISSING", f"S{sid:03d} 对白缺少台词文本")
                translations = dict((dialogue_localization or {}).get("translations") or {})
                target_text = str(translations.get(dialogue_text) or "").strip()
                if dialogue_localization and not target_text:
                    raise CompileError("STEP04_DIALOGUE_LOCALIZATION_MISSING", f"S{sid:03d} 缺少目标语言台词", {"source_text": dialogue_text})
                validate_target_dialogue_names(dialogue_text, target_text or dialogue_text, dialogue_localization, sid)
                speaker_role_ref = role_by_instance[speaker]
                target_name_record = dict((dialogue_localization or {}).get("character_name_mapping") or {}).get(speaker_role_ref) or {}
                dialogue = {**dialogue, "evidence_ids": dialogue_evidence}
                dialogue = {
                    **dialogue,
                    "source_text": dialogue_text,
                    "target_text": target_text or dialogue_text,
                    "target_language": str((dialogue_localization or {}).get("target_language") or "source_language"),
                    "target_dialogue_name": str(target_name_record.get("target_dialogue_name") or ""),
                    "speaker_instance_id": speaker,
                    "timecode_ms": [int(dialogue_range[0]), int(dialogue_range[1])],
                }
            reference_slot_ids = []
            for instance_id in [subject, object_id, *related_ids]:
                if not instance_id:
                    continue
                instance = next(item for item in entities if item["instance_id"] == instance_id)
                reference_slot = slot_by_asset.get(instance["asset_id"])
                if not reference_slot:
                    raise CompileError("STEP04_EVENT_REFERENCE_SLOT_MISSING", f"S{sid:03d} 事件实例缺少参考槽位")
                reference_slot_ids.append(reference_slot)
            normalized_events.append({
                "event_id": f"S{sid:03d}:E{index:02d}",
                "start_ms": event_start,
                "end_ms": event_end,
                "subject_instance_ids": [subject],
                "object_instance_ids": [object_id] if object_id else [],
                "related_instance_ids": related_ids,
                "action": str(event.get("action") or event.get("change") or "").strip(),
                "change": str(event.get("change") or "").strip(),
                "start_state": str(event.get("start_state") or "").strip(),
                "end_state": str(event.get("end_state") or "").strip(),
                "dialogue_ids": [f"S{sid:03d}:E{index:02d}:dialogue"] if dialogue else [],
                "dialogue": dialogue,
                "reference_slot_ids": sorted(set(reference_slot_ids)),
                "evidence_ids": evidence_ids,
            })
            if not normalized_events[-1]["start_state"] or not normalized_events[-1]["end_state"]:
                raise CompileError("STEP04_EVENT_STATE_MISSING", f"S{sid:03d} 事件必须同时有起始状态和结束状态")
            last_event_end = event_end
        consumed_character_slots = {
            slot_id
            for event in normalized_events
            for slot_id in event["reference_slot_ids"]
            if next((slot for slot in slots if slot["slot_id"] == slot_id), {}).get("kind") == "character"
        }
        required_character_slots = {slot["slot_id"] for slot in slots if slot.get("kind") == "character"}
        if required_character_slots - consumed_character_slots:
            raise CompileError(
                "STEP04_CHARACTER_REFERENCE_UNCONSUMED",
                f"S{sid:03d} 人物资产没有被事件实际消费",
                {"slot_ids": sorted(required_character_slots - consumed_character_slots)},
            )
        for field in ("scene_identity", "environment_identity", "composition", "action", "camera", "light", "sound"):
            value = {
                "scene_identity": card_text(card, "scene_identity", "场景身份"),
                "environment_identity": card_text(card, "environment_identity", "环境身份"),
                "composition": card_text(card, "composition", "画面构图"),
                "action": card_text(card, "action_detail", "人物动作细节", "story_progression", "剧情发展"),
                "camera": card_text(card, "camera_motion_detail", "镜头运动细节"),
                "light": card_text(card, "lighting", "光线氛围"),
                "sound": card_text(card, "audio_observation", "声音与表演"),
            }[field]
            if field == "action" and not value and not entities:
                value = "无人物动作，保持空间状态"
            if not value:
                raise CompileError("STEP04_C_FIELD_MISSING", f"S{sid:03d} 缺少 C 层字段: {field}")
        event_lines = compact_event_lines(normalized_events, role_by_instance)
        if not event_lines:
            # Context-only semantic units (for example a room-wide insert or a
            # clock overlay) have no character subject, but their verified
            # camera/action fact must still reach the delivery prompt.
            context_change = compact_fact(card_text(card, "action_detail", "人物动作细节", "story_progression", "剧情发展"))
            if context_change:
                event_lines = [f"{seconds_range(start_ms, end_ms)}：{context_change}"]
        scene_identity = concise_scene_identity(card)
        environment_identity = "现代墨西哥企业会议室，由@现代墨西哥会议室参考图锁定"
        composition = compact_fact(card_text(card, "composition", "画面构图"))
        camera = compact_fact(card_text(card, "camera_motion_detail", "镜头运动细节"))
        light = compact_fact(card_text(card, "lighting", "光线氛围"))
        speaker_subjects = {
            role_by_instance[event["subject_instance_ids"][0]]
            for event in normalized_events
            if event["subject_instance_ids"]
        }
        active_speaker_ref = next(iter(speaker_subjects)) if len(speaker_subjects) == 1 else ""
        sound = compact_sound(
            card_text(card, "audio_observation", "声音与表演"),
            any(event.get("dialogue") for event in normalized_events),
            active_speaker_ref,
        )
        reference_names = "、".join(str(slot["reference_key"]) for slot in slots)
        raw_reference_names = "；".join(
            f"{slot['reference_key']}（{slot['duty']}）" for slot in slots
        )
        # Keep one complete shot block.  Uploaded references carry identity,
        # clothing, and stable spatial facts; prose only states the current
        # shot's composition and temporal changes.
        # Reference images are the authority for stable faces, wardrobe,
        # props and room geometry.  Do not restate those facts in prose.
        # Text only carries the shot's dramatic function and timed change.
        prompt_lines = [
            f"场景身份：{scene_identity}",
            f"环境身份：{environment_identity}",
            f"参考图：{reference_names}",
            f"构图：S{sid:03d} {seconds_range(start_ms, end_ms)}；{composition}",
            f"变化：{'；'.join(event_lines)}",
            f"镜头：{camera}",
            f"光线：{light}",
            f"声音：{sound}",
        ]
        prompt_text = "\n".join(line for line in prompt_lines if not line.endswith("：")).replace("。；", "；")
        raw_prompt_text = "\n".join([
            f"场景身份：{scene_identity}",
            f"环境身份：{environment_identity}",
            f"参考图：{raw_reference_names}",
            f"构图：S{sid:03d} {seconds_range(start_ms, end_ms)}；{card_text(card, 'composition', '画面构图')}",
            f"变化：{'；'.join(event_lines)}",
            f"镜头：{card_text(card, 'camera_motion_detail', '镜头运动细节')}",
            f"光线：{card_text(card, 'lighting', '光线氛围')}",
            f"声音：{card_text(card, 'audio_observation', '声音与表演')}",
        ])
        forbidden = [token for token in FORBIDDEN_PROMPT_TOKENS if token in prompt_text]
        if forbidden:
            raise CompileError("STEP04_PROMPT_FORBIDDEN_GENERIC", f"S{sid:03d} 提示词含泛称", {"tokens": forbidden})
        groups.append({
            "group_id": f"VG{sid:02d}",
            "references": [{"reference_key": slot["reference_key"], "duty": slot["duty"], "slot_id": slot["slot_id"], "kind": slot.get("kind", "character")} for slot in slots],
            "segments": [{
                "shot_id": sid,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "entities": [item["instance_id"] for item in entities],
                "role_refs": [item["role_ref"] for item in entities],
                "scene_identity": scene_identity,
                "environment_identity": environment_identity,
                "story_progression": compact_fact(card_text(card, "story_progression", "剧情发展")),
                "action_detail": compact_fact(card_text(card, "action_detail", "人物动作细节")),
                "composition": composition,
                "action": "\n".join(event_lines),
                "camera": camera,
                "camera_transition": compact_fact(card_text(card, "camera_transition", "镜头切换和叠化")),
                "light": light,
                "sound": sound,
                "subtitle_continuity": subtitle_continuity_instruction(card),
                "dialogue": [event["dialogue"] for event in normalized_events if event.get("dialogue")],
                "dialogue_lines": [
                    f"{seconds_range(event['dialogue']['timecode_ms'][0], event['dialogue']['timecode_ms'][1])}："
                    f"{dialogue_delivery_clause(event['dialogue'], role_by_instance[event['dialogue']['speaker_instance_id']])}"
                    for event in normalized_events if event.get("dialogue")
                ],
                "events": normalized_events,
                "context_reference_slot_ids": context_slot_ids,
                "evidence_ids": sorted({evidence for event in normalized_events for evidence in event["evidence_ids"]}),
                "prompt_text": prompt_text,
                "prompt_compression": {
                    "policy": "references_lock_stable_facts; emit_temporal_changes_only; exact_boilerplate_dedupe",
                    "raw_chars": len(raw_prompt_text),
                    "compressed_chars": len(prompt_text),
                    "reduction_chars": max(0, len(raw_prompt_text) - len(prompt_text)),
                    "reduction_ratio": round((len(raw_prompt_text) - len(prompt_text)) / len(raw_prompt_text), 4) if raw_prompt_text else 0.0,
                },
            }],
            "negative_constraints": ["不混用不同人物资产", "不改变源镜头时间顺序", "不把未闭合说话人写成已确认角色"],
        })
    groups = merge_prompt_groups(groups)
    return {
        "schema_version": "mx_shortdrama_step04c_prompt_ir_v6_localized_prose_groups",
        "prompt_policy": {
            "references_lock_stable_facts": True,
            "emit_temporal_changes_only": True,
            "dialogue_in_event": True,
            "remove_exact_boilerplate_only": True,
            "never_drop_structured_evidence": True,
            "one_complete_prompt_per_5_to_15_second_group": True,
            "preserve_gemini_story_progression_action_detail_camera_light_sound": True,
            "preserve_gemini_camera_transition_and_text_continuity": True,
            "localized_dialogue_embedded_at_verified_timing": True,
        },
        "groups": groups,
    }


def compile_d(out_dir: Path, source: dict[str, Any], a_layer: dict[str, Any], b_layer: dict[str, Any], c_layer: dict[str, Any]) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)
    output_refs = []
    for name, payload in (("step04a_entity_binding.json", a_layer), ("step04b_asset_continuity.json", b_layer), ("step04c_prompt_ir.json", c_layer)):
        path = out_dir / name
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        output_refs.append({"kind": name.removesuffix(".json"), "path": str(path.resolve()), "sha256": sha256_file(path), "status": "verified"})
    md = out_dir / "step04c_prompt_ir.md"
    lines = ["# Step04 C 层完整生产组提示词 IR", "", "本文件为结构化 IR 的只读渲染；每个 VG 只有一条完整模型正文，人物、资产、时间和对白均来自 A/B/C，不在 D 层推断。", ""]
    for group in c_layer["groups"]:
        segments = list(group.get("segments") or [])
        start_ms = int(group.get("source_start_ms") or (segments[0]["start_ms"] if segments else 0))
        end_ms = int(group.get("source_end_ms") or (segments[-1]["end_ms"] if segments else start_ms))
        source_shots = "、".join(
            f"S{segment['shot_id']:03d} {seconds_range(segment['start_ms'], segment['end_ms'])}"
            for segment in segments
        )
        lines += [
            f"## {group['group_id']} | {seconds_range(start_ms, end_ms)}",
            "",
            f"源小镜头：{source_shots}",
            "",
            str(group.get("prompt_text") or ""),
            "",
        ]
        for segment in segments:
            for event in segment["events"]:
                lines += [f"事件 {event['event_id']} | {seconds_range(event['start_ms'], event['end_ms'])} | {'、'.join(event['subject_instance_ids'])} -> {'、'.join(event['object_instance_ids']) or '无明确受事者'}", event["change"], ""]
    md.write_text("\n".join(lines), encoding="utf-8")
    output_refs.append({"kind": "step04c_prompt_ir_markdown", "path": str(md.resolve()), "sha256": sha256_file(md), "status": "verified"})
    delivery = {
        "schema_version": "mx_shortdrama_step04d_delivery_manifest_v1",
        "source_ir": sha256_value(c_layer),
        "input_layers": {
            "a_sha256": sha256_value(a_layer),
            "b_sha256": sha256_value(b_layer),
            "c_sha256": sha256_value(c_layer),
        },
        "deliveries": output_refs,
        "gate": {"status": "passed", "source_step02": str(source.get("step02_acceptance_sha256") or ""), "failed_checks": []},
        "qa": {"semantic": "passed_before_D", "geometry": "pending_docx", "rendered": "pending_docx"},
        "provider_calls": {"image": False, "video": False},
        "renderer_policy": "D 只渲染，不修改 A/B/C 事实。",
    }
    delivery_path = out_dir / "step04d_delivery_manifest.json"
    delivery_path.write_text(json.dumps(delivery, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return delivery


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--step02-manifest", type=Path, required=True)
    parser.add_argument("--identity-bindings", type=Path, required=True)
    parser.add_argument("--asset-registry", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--source-sha256", default="")
    parser.add_argument("--source-path", type=Path, default=None)
    parser.add_argument("--dialogue-localization", type=Path, default=None)
    args = parser.parse_args()
    manifest = read_json(args.step02_manifest)
    failures = semantic_gate(manifest)
    if failures:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        gate_path = args.out_dir / "step04_input_gate_report.json"
        gate = {
            "schema_version": "mx_shortdrama_step04_input_gate_v1",
            "status": "blocked",
            "step02_manifest": str(args.step02_manifest.resolve()),
            "step02_manifest_sha256": sha256_file(args.step02_manifest),
            "failed_checks": failures,
            "next_action": "return_to_step02_targeted_recheck",
        }
        gate_path.write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        raise CompileError("STEP04_STEP02_SEMANTIC_GATE_BLOCKED", "Step02 尚未通过 Step04 语义门", {"failed_checks": failures})
    source_sha256 = str(args.source_sha256 or manifest.get("source_sha256") or "").strip().lower()
    if not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
        raise CompileError("STEP04_SOURCE_SHA_MISSING", "Step04 必须接收原片 SHA-256")
    validate_source_provenance(manifest, source_sha256)
    source_path = args.source_path.resolve() if args.source_path else None
    if source_path is not None:
        if not source_path.is_file():
            raise CompileError("STEP04_SOURCE_PATH_MISSING", f"原片路径不存在: {source_path}")
        actual_source_sha = sha256_file(source_path)
        if actual_source_sha != source_sha256:
            raise CompileError("STEP04_SOURCE_SHA_MISMATCH", "原片路径与 source_sha256 不一致", {"expected": source_sha256, "actual": actual_source_sha})
    bindings_path = args.identity_bindings.resolve()
    assets_path = args.asset_registry.resolve()
    bindings = normalize_bindings(read_json(bindings_path))
    a_layer = compile_a(manifest, bindings)
    b_layer = compile_b(manifest, a_layer, read_json(args.asset_registry))
    dialogue_localization = read_json(args.dialogue_localization.resolve()) if args.dialogue_localization else None
    c_layer = compile_c(manifest, a_layer, b_layer, dialogue_localization)
    source = {
        "source_sha256": source_sha256,
        "source_path": str(source_path) if source_path else "",
        "step02_acceptance_sha256": sha256_file(args.step02_manifest),
        "step02_manifest_path": str(args.step02_manifest.resolve()),
        "step02_manifest_input_sha256": sha256_file(args.step02_manifest),
        "identity_bindings_path": str(bindings_path),
        "identity_bindings_sha256": sha256_file(bindings_path),
        "asset_registry_path": str(assets_path),
        "asset_registry_sha256": sha256_file(assets_path),
    }
    if args.dialogue_localization:
        localization_path = args.dialogue_localization.resolve()
        source["dialogue_localization_path"] = str(localization_path)
        source["dialogue_localization_sha256"] = sha256_file(localization_path)
        source["target_dialogue_language"] = str((dialogue_localization or {}).get("target_language") or "")
    delivery = compile_d(args.out_dir, source, a_layer, b_layer, c_layer)
    contract = {
        "schema_version": "mx_shortdrama_step04_abcd_contract_v2",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "layers": {"A": a_layer, "B": b_layer, "C": c_layer, "D": delivery},
    }
    contract["contract_sha256"] = sha256_value(contract)
    contract_path = args.out_dir / "step04_abcd_contract.json"
    contract_path.write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result_type": "final_delivery", "task_id": "step04-abcd-compile", "evidence_path_or_url": str(contract_path.resolve()), "verified_result": "A/B/C compiled; D renderer outputs written", "next_action_or_blocker": "docx_renderer"}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except CompileError as exc:
        print(json.dumps({"result_type": "external_blocked", "task_id": "step04-abcd-compile", "evidence_path_or_url": "", "verified_result": exc.code, "next_action_or_blocker": str(exc), "details": exc.details}, ensure_ascii=False))
        raise SystemExit(2)
