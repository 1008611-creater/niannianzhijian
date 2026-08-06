from __future__ import annotations

"""Commercial asset-lifecycle contract for the redraw pipeline.

This module is deliberately dependency-free.  It is used by the Step04
compiler and can also migrate a pre-contract asset registry into a preserved,
non-consumable legacy production registry.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "mx_shortdrama_asset_lifecycle_v1"
CHARACTER_STAGES = (
    "identity_master_prepared",
    "identity_master_submitted",
    "identity_master_downloaded",
    "identity_master_qa_passed",
    "character_sheet_prepared",
    "character_sheet_submitted",
    "character_sheet_downloaded",
    "character_sheet_qa_passed",
    "final_character_asset_accepted",
)
SINGLE_STAGE_BY_KIND = {"scene": "final_scene_asset_accepted", "prop": "final_prop_asset_accepted"}
# `asset_stage` identifies the concrete deliverable.  A character sheet is
# never renamed into a lifecycle state, otherwise downstream consumers cannot
# tell a final multi-angle sheet from the intermediate identity master.
FINAL_STAGE_BY_KIND = {"character": "character_sheet", **SINGLE_STAGE_BY_KIND}
FINAL_LIFECYCLE_STATE_BY_KIND = {
    "character": "final_character_asset_accepted",
    "scene": "final_scene_asset_accepted",
    "prop": "final_prop_asset_accepted",
}
CHARACTER_QA_CHECKS = (
    "file",
    "layout",
    "identity_consistency",
    "age_consistency",
    "wardrobe_consistency",
    "accessory_consistency",
    "anatomy",
    "labels",
    "source_leakage",
)


class AssetLifecycleError(ValueError):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.details = details or {}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_dimensions(path: Path) -> tuple[int, int]:
    """Read PNG/JPEG dimensions without requiring Pillow in production."""
    with path.open("rb") as stream:
        header = stream.read(32)
        if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
            return struct.unpack(">II", header[16:24])
        if not header.startswith(b"\xff\xd8"):
            raise AssetLifecycleError("STEP04_ASSET_IMAGE_UNSUPPORTED", "资产图不是可验证的 PNG/JPEG", {"path": str(path)})
        stream.seek(2)
        while True:
            marker_prefix = stream.read(1)
            if not marker_prefix:
                break
            if marker_prefix != b"\xff":
                continue
            marker = stream.read(1)
            while marker == b"\xff":
                marker = stream.read(1)
            if not marker or marker in {b"\xd8", b"\xd9"}:
                continue
            length_raw = stream.read(2)
            if len(length_raw) != 2:
                break
            length = struct.unpack(">H", length_raw)[0]
            if length < 2:
                break
            if marker[0] in set(range(0xC0, 0xC4)) | set(range(0xC5, 0xC8)) | set(range(0xC9, 0xCC)) | set(range(0xCD, 0xD0)):
                payload = stream.read(5)
                if len(payload) != 5:
                    break
                height, width = struct.unpack(">HH", payload[1:5])
                return width, height
            stream.seek(length - 2, 1)
    raise AssetLifecycleError("STEP04_ASSET_IMAGE_DIMENSIONS_MISSING", "无法读取资产图尺寸", {"path": str(path)})


def _read_json_path(value: Any, code: str, label: str) -> dict[str, Any]:
    path = Path(str(value or ""))
    if not path.is_file():
        raise AssetLifecycleError(code, f"{label}缺失", {"path": str(path)})
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise AssetLifecycleError(code, f"{label}不是有效 JSON", {"path": str(path)}) from exc
    if not isinstance(payload, dict):
        raise AssetLifecycleError(code, f"{label}不是对象", {"path": str(path)})
    return payload


def _verify_channel_upload_receipt(value: Any, master_path: Path, master_sha: str) -> None:
    receipt = _read_json_path(value, "STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "角色卡母图上传回执")
    uploads = receipt.get("uploads") or []
    if not isinstance(uploads, list):
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "角色卡母图上传回执缺少 uploads", {})
    for upload in uploads:
        if not isinstance(upload, dict):
            continue
        if str(upload.get("local_path") or "") != str(master_path):
            continue
        if str(upload.get("sha256") or "").lower() != master_sha:
            raise AssetLifecycleError("STEP04_CHARACTER_SHEET_PARENT_SHA_MISMATCH", "渠道上传回执母图 SHA 不一致", {})
        if not str(upload.get("download_url") or "").startswith(("http://", "https://")):
            raise AssetLifecycleError("STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "渠道上传回执缺少母图下载地址", {})
        return
    raise AssetLifecycleError("STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "渠道上传回执未记录身份母图", {})


def _extract_task_id(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("taskId", "task_id"):
            candidate = str(value.get(key) or "").strip()
            if candidate:
                return candidate
        for nested_key in ("submit", "data", "result", "response"):
            candidate = _extract_task_id(value.get(nested_key))
            if candidate:
                return candidate
    return ""


def _verify_character_sheet_submission_receipt(value: Any, master_path: Path, master_sha: str) -> tuple[str, str]:
    receipt_path = Path(str(value or ""))
    receipt = _read_json_path(
        receipt_path,
        "STEP04_CHARACTER_SHEET_SUBMISSION_RECEIPT_MISSING",
        "角色设定卡提交回执",
    )
    contract = receipt.get("assetContract")
    if not isinstance(contract, dict) or str(contract.get("asset_stage") or "") != "character_sheet":
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_SUBMISSION_RECEIPT_MISSING",
            "角色设定卡提交回执未声明 character_sheet 阶段",
            {"path": str(receipt_path)},
        )
    parent = contract.get("identity_master")
    if not isinstance(parent, dict):
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_SUBMISSION_RECEIPT_MISSING",
            "角色设定卡提交回执缺少身份母图合同",
            {"path": str(receipt_path)},
        )
    if str(parent.get("local_path") or "") != str(master_path):
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING",
            "角色设定卡提交回执母图路径不一致",
            {"path": str(receipt_path)},
        )
    if str(parent.get("sha256") or "").lower() != master_sha:
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_PARENT_SHA_MISMATCH",
            "角色设定卡提交回执母图 SHA 不一致",
            {"path": str(receipt_path)},
        )
    _verify_channel_upload_receipt(receipt_path, master_path, master_sha)
    task_id = _extract_task_id(receipt)
    if not task_id:
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_TASK_ID_MISSING",
            "角色设定卡提交回执缺少渠道任务 ID",
            {"path": str(receipt_path)},
        )
    return str(receipt_path.resolve()), task_id


def _verify_single_stage_submission_receipt(value: Any, asset_kind: str) -> tuple[str, str]:
    receipt_path = Path(str(value or ""))
    receipt = _read_json_path(
        receipt_path,
        "STEP04_ASSET_SUBMISSION_RECEIPT_MISSING",
        f"{asset_kind} 提交回执",
    )
    contract = receipt.get("assetContract")
    declared_stage = ""
    if isinstance(contract, dict):
        declared_stage = str(contract.get("asset_stage") or contract.get("assetStage") or "").strip()
    if not declared_stage:
        declared_stage = str(receipt.get("asset_stage") or receipt.get("assetStage") or "").strip()
    if declared_stage != asset_kind:
        raise AssetLifecycleError(
            "STEP04_ASSET_SUBMISSION_RECEIPT_MISSING",
            f"{asset_kind} 提交回执未声明正确资产阶段",
            {"path": str(receipt_path), "expected_stage": asset_kind, "actual_stage": declared_stage},
        )
    task_id = _extract_task_id(receipt)
    if not task_id:
        raise AssetLifecycleError(
            "STEP04_ASSET_TASK_ID_MISSING",
            f"{asset_kind} 提交回执缺少渠道任务 ID",
            {"path": str(receipt_path)},
        )
    return str(receipt_path.resolve()), task_id


def _verify_asset_download_receipt(value: Any, exact_path: Path, exact_sha: str, asset_kind: str, task_id: str) -> str:
    receipt_path = Path(str(value or ""))
    receipt = _read_json_path(
        receipt_path,
        "STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING",
        f"{asset_kind} 下载回执",
    )
    if str(receipt.get("asset_stage") or "") != asset_kind:
        raise AssetLifecycleError(
            "STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING",
            f"{asset_kind} 下载回执未声明正确资产阶段",
            {"path": str(receipt_path)},
        )
    if str(receipt.get("task_id") or "") != task_id:
        raise AssetLifecycleError(
            "STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING",
            f"{asset_kind} 下载回执任务 ID 不匹配",
            {"path": str(receipt_path)},
        )
    if str(receipt.get("qa_status") or "").lower() not in {"passed", "accepted"}:
        raise AssetLifecycleError(
            "STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING",
            f"{asset_kind} 下载文件 QA 未通过",
            {"path": str(receipt_path)},
        )
    files = receipt.get("files") or []
    if not isinstance(files, list):
        files = []
    for file in files:
        if not isinstance(file, dict):
            continue
        if str(file.get("exact_path") or "") != str(exact_path.resolve()):
            continue
        if str(file.get("sha256") or "").lower() != exact_sha:
            raise AssetLifecycleError("STEP04_ASSET_SHA_MISMATCH", f"{asset_kind} 下载回执 SHA 不一致", {"path": str(receipt_path)})
        qa = file.get("qa") or {}
        if not isinstance(qa, dict) or str(qa.get("status") or "").lower() not in {"passed", "accepted"}:
            raise AssetLifecycleError("STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING", f"{asset_kind} 下载文件 QA 缺失或未通过", {"path": str(receipt_path)})
        return str(receipt_path.resolve())
    raise AssetLifecycleError(
        "STEP04_ASSET_DOWNLOAD_RECEIPT_MISSING",
        f"{asset_kind} 下载回执未记录最终原图",
        {"path": str(receipt_path)},
    )


def _qa_passed(value: Any, code: str, label: str, required_checks: tuple[str, ...] = ()) -> dict[str, Any]:
    payload = _read_json_path(value, code, label) if isinstance(value, (str, Path)) else value
    if not isinstance(payload, dict):
        raise AssetLifecycleError(code, f"{label}缺失", {})
    if str(payload.get("status") or "").lower() not in {"passed", "accepted"}:
        raise AssetLifecycleError(code, f"{label}未通过", {"status": payload.get("status")})
    checks = payload.get("checks") or payload.get("qa_checks") or {}
    if required_checks:
        if not isinstance(checks, dict):
            raise AssetLifecycleError(code, f"{label}缺少结构化检查项", {})
        failed = [name for name in required_checks if checks.get(name) is not True]
        if failed:
            raise AssetLifecycleError(code, f"{label}检查未通过", {"failed_checks": failed})
    return payload


def _required_string(asset: dict[str, Any], key: str, code: str, message: str) -> str:
    value = str(asset.get(key) or "").strip()
    if not value:
        raise AssetLifecycleError(code, message, {"field": key})
    return value


def _required_string_list(asset: dict[str, Any], key: str, code: str, message: str) -> list[str]:
    raw = asset.get(key)
    values = [str(value).strip() for value in raw] if isinstance(raw, list) else []
    values = [value for value in values if value]
    if not values:
        raise AssetLifecycleError(code, message, {"field": key})
    return values


def validate_final_asset(asset_id: str, asset: dict[str, Any], expected_kind: str) -> dict[str, Any]:
    """Validate an asset that is about to enter Step04 B/C/D or a channel payload."""
    if expected_kind not in FINAL_STAGE_BY_KIND:
        raise AssetLifecycleError("STEP04_ASSET_KIND_INVALID", "未知资产种类", {"asset_id": asset_id, "kind": expected_kind})
    asset_kind = str(asset.get("asset_kind") or asset.get("kind") or "").strip()
    if asset_kind != expected_kind:
        raise AssetLifecycleError("STEP04_ASSET_KIND_MISMATCH", "资产种类与引用职责不一致", {"asset_id": asset_id, "expected": expected_kind, "actual": asset_kind})
    stage = str(asset.get("asset_stage") or "").strip()
    lifecycle_state = str(asset.get("lifecycle_state") or stage).strip()
    final_status = str(asset.get("final_status") or asset.get("status") or "").strip()
    if expected_kind == "character" and lifecycle_state == "character_sheet_qa_failed":
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_QA_FAILED",
            "角色设定卡第二次 QA 失败，资产已严格阻断",
            {"asset_id": asset_id},
        )
    expected_stage = FINAL_STAGE_BY_KIND[expected_kind]
    if stage != expected_stage:
        code = "STEP04_CHARACTER_ASSET_STAGE_INVALID" if expected_kind == "character" else "STEP04_ASSET_STAGE_INVALID"
        raise AssetLifecycleError(code, "最终资产阶段不正确", {"asset_id": asset_id, "expected": expected_stage, "actual": stage})
    expected_lifecycle = FINAL_LIFECYCLE_STATE_BY_KIND[expected_kind]
    if lifecycle_state != expected_lifecycle:
        code = "STEP04_CHARACTER_ASSET_STAGE_INVALID" if expected_kind == "character" else "STEP04_ASSET_STAGE_INVALID"
        raise AssetLifecycleError(code, "最终资产生命周期状态不正确", {
            "asset_id": asset_id,
            "expected_lifecycle_state": expected_lifecycle,
            "actual_lifecycle_state": lifecycle_state,
        })
    if final_status != "accepted":
        raise AssetLifecycleError("STEP04_ASSET_NOT_ACCEPTED", "最终资产未验收", {"asset_id": asset_id, "final_status": final_status})
    exact_path = Path(_required_string(asset, "exact_path", "STEP04_ASSET_REFERENCE_INCOMPLETE", "资产原图路径缺失"))
    expected_sha = _required_string(asset, "sha256", "STEP04_ASSET_REFERENCE_INCOMPLETE", "资产原图 SHA 缺失").lower()
    if not exact_path.is_file():
        raise AssetLifecycleError("STEP04_ASSET_REFERENCE_INCOMPLETE", "资产原图不存在", {"asset_id": asset_id, "path": str(exact_path)})
    actual_sha = sha256_file(exact_path)
    if actual_sha != expected_sha:
        raise AssetLifecycleError("STEP04_ASSET_SHA_MISMATCH", "资产 SHA 不一致", {"asset_id": asset_id, "expected": expected_sha, "actual": actual_sha})
    width, height = image_dimensions(exact_path)
    if width * 9 != height * 16 or width < 1920 or height < 1080:
        raise AssetLifecycleError("STEP04_ASSET_RESOLUTION_INVALID", "最终资产必须是至少 2K 的 16:9 图", {"asset_id": asset_id, "width": width, "height": height})
    if expected_kind != "character":
        _required_string(asset, "generation_prompt", "STEP04_ASSET_PROMPT_MISSING", "最终资产缺少实际生图提示词")
        evidence_path = Path(_required_string(asset, "evidence_path", "STEP04_ASSET_EVIDENCE_MISSING", "最终资产缺少证据路径"))
        if not evidence_path.is_file():
            raise AssetLifecycleError("STEP04_ASSET_EVIDENCE_MISSING", "最终资产证据路径不存在", {"asset_id": asset_id, "path": str(evidence_path)})
        submission_receipt, task_id = _verify_single_stage_submission_receipt(
            asset.get("asset_submission_receipt"), expected_kind
        )
        download_receipt = _verify_asset_download_receipt(
            asset.get("asset_download_receipt"), exact_path, actual_sha, expected_kind, task_id
        )
        _qa_passed(asset.get("final_qa") or asset.get("qa"), "STEP04_ASSET_QA_MISSING", "最终资产 QA")
        return {
            "exact_path": str(exact_path.resolve()),
            "sha256": actual_sha,
            "width": width,
            "height": height,
            "asset_submission_receipt": submission_receipt,
            "asset_download_receipt": download_receipt,
            "task_id": task_id,
        }

    master_path = Path(_required_string(asset, "identity_master_path", "STEP04_CHARACTER_SHEET_PARENT_MISSING", "角色卡母图路径缺失"))
    master_sha = _required_string(asset, "identity_master_sha256", "STEP04_CHARACTER_SHEET_PARENT_MISSING", "角色卡母图 SHA 缺失").lower()
    if not master_path.is_file():
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_PARENT_MISSING", "角色卡母图不存在", {"asset_id": asset_id, "path": str(master_path)})
    actual_master_sha = sha256_file(master_path)
    if actual_master_sha != master_sha:
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_PARENT_SHA_MISMATCH", "角色卡母图 SHA 不一致", {"asset_id": asset_id, "expected": master_sha, "actual": actual_master_sha})
    _qa_passed(asset.get("identity_master_qa"), "STEP04_CHARACTER_SHEET_PARENT_MISSING", "身份母图 QA")
    upload = asset.get("identity_master_upload")
    if not isinstance(upload, dict):
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "角色卡缺少母图上传回执", {"asset_id": asset_id})
    if str(upload.get("local_path") or "") != str(master_path):
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_UPLOAD_RECEIPT_MISSING", "上传回执未指向身份母图", {"asset_id": asset_id})
    if str(upload.get("sha256") or "").lower() != actual_master_sha:
        raise AssetLifecycleError("STEP04_CHARACTER_SHEET_PARENT_SHA_MISMATCH", "上传回执母图 SHA 不一致", {"asset_id": asset_id})
    _verify_channel_upload_receipt(upload.get("receipt_path"), master_path, actual_master_sha)
    character_sheet_prompt = _required_string(
        asset,
        "character_sheet_prompt",
        "STEP04_CHARACTER_SHEET_PROMPT_MISSING",
        "角色设定卡缺少实际生图提示词",
    )
    display_name = _required_string(
        asset,
        "display_name",
        "STEP04_CHARACTER_SHEET_METADATA_MISSING",
        "角色设定卡缺少中文显示名",
    )
    purpose = _required_string(
        asset,
        "purpose",
        "STEP04_CHARACTER_SHEET_METADATA_MISSING",
        "角色设定卡缺少资产职责",
    )
    evidence_path = _required_string(
        asset,
        "evidence_path",
        "STEP04_CHARACTER_SHEET_METADATA_MISSING",
        "角色设定卡缺少证据路径",
    )
    if not Path(evidence_path).is_file():
        raise AssetLifecycleError(
            "STEP04_CHARACTER_SHEET_METADATA_MISSING",
            "角色设定卡证据路径不存在",
            {"field": "evidence_path", "path": evidence_path},
        )
    allowed_instance_ids = _required_string_list(
        asset,
        "allowed_instance_ids",
        "STEP04_CHARACTER_SHEET_METADATA_MISSING",
        "角色设定卡缺少允许使用的人物实例",
    )
    submission_receipt, task_id = _verify_character_sheet_submission_receipt(
        asset.get("character_sheet_submission_receipt"),
        master_path,
        actual_master_sha,
    )
    download_receipt = _verify_asset_download_receipt(
        asset.get("asset_download_receipt"), exact_path, actual_sha, "character_sheet", task_id
    )
    _qa_passed(asset.get("character_sheet_qa") or asset.get("final_qa"), "STEP04_CHARACTER_SHEET_QA_MISSING", "角色设定卡 QA", CHARACTER_QA_CHECKS)
    return {
        "exact_path": str(exact_path.resolve()),
        "sha256": actual_sha,
        "width": width,
        "height": height,
        "identity_master_path": str(master_path.resolve()),
        "identity_master_sha256": actual_master_sha,
        "character_sheet_prompt": character_sheet_prompt,
        "character_sheet_submission_receipt": submission_receipt,
        "character_sheet_task_id": task_id,
        "asset_download_receipt": download_receipt,
        "display_name": display_name,
        "purpose": purpose,
        "evidence_path": evidence_path,
        "allowed_instance_ids": allowed_instance_ids,
    }


def earliest_missing_stage(asset: dict[str, Any]) -> str:
    kind = str(asset.get("asset_kind") or asset.get("kind") or "").strip()
    stage = str(asset.get("asset_stage") or "").strip()
    lifecycle_state = str(asset.get("lifecycle_state") or stage).strip()
    if kind == "character":
        if lifecycle_state == "character_sheet_qa_failed":
            return lifecycle_state
        if lifecycle_state in CHARACTER_STAGES:
            index = CHARACTER_STAGES.index(lifecycle_state)
            return CHARACTER_STAGES[min(index + 1, len(CHARACTER_STAGES) - 1)]
        return "identity_master_prepared"
    if kind in SINGLE_STAGE_BY_KIND:
        if stage == SINGLE_STAGE_BY_KIND[kind]:
            return stage
        return f"{kind}_prepared"
    return "legacy_pending_reconciliation"


def migrate_legacy_registry(source: dict[str, Any]) -> dict[str, Any]:
    entries = source.get("assets") if isinstance(source, dict) else source
    if not isinstance(entries, list):
        raise AssetLifecycleError("ASSET_LIFECYCLE_REGISTRY_INVALID", "asset_registry.assets 必须是数组")
    migrated: list[dict[str, Any]] = []
    for item in entries:
        if not isinstance(item, dict):
            continue
        cloned = dict(item)
        cloned["legacy_source_status"] = str(cloned.get("status") or "")
        cloned["status"] = "legacy_pending_reconciliation"
        cloned["legacy_status"] = "legacy_pending_reconciliation"
        cloned["asset_stage"] = str(cloned.get("asset_stage") or "legacy_pending_reconciliation")
        cloned["lifecycle_state"] = str(cloned.get("lifecycle_state") or "legacy_pending_reconciliation")
        cloned["final_status"] = "legacy_pending_reconciliation"
        cloned["reconciliation_required"] = [
            "asset_kind", "asset_stage", "final_status", "exact_path_sha256", "qa", "parent_provenance_for_character"
        ]
        migrated.append(cloned)
    return {"schema_version": SCHEMA_VERSION, "assets": migrated}


def export_final_registry(production: dict[str, Any]) -> dict[str, Any]:
    entries = production.get("assets") if isinstance(production, dict) else []
    if not isinstance(entries, list):
        raise AssetLifecycleError("ASSET_LIFECYCLE_REGISTRY_INVALID", "production registry.assets 必须是数组")
    final_assets: list[dict[str, Any]] = []
    for asset in entries:
        if not isinstance(asset, dict):
            continue
        kind = str(asset.get("asset_kind") or asset.get("kind") or "")
        if kind not in FINAL_STAGE_BY_KIND:
            continue
        try:
            validate_final_asset(str(asset.get("asset_id") or ""), asset, kind)
        except AssetLifecycleError:
            continue
        final_assets.append(asset)
    return {"schema_version": "mx_shortdrama_final_asset_registry_v1", "assets": final_assets}


def required_asset_ids(step02_manifest: dict[str, Any]) -> set[str]:
    """Return only explicit Step02 assets that may be consumed downstream.

    This deliberately does not scrape prompts, Word documents, filenames or
    historical registries.  A character is required only when its accepted
    entity instance names an asset_id; a scene/prop is required only when the
    accepted asset requirement declares it.
    """
    required: set[str] = set()
    for card in step02_manifest.get("cards") or []:
        if not isinstance(card, dict):
            continue
        for entity in card.get("entity_instances") or card.get("entities") or []:
            if isinstance(entity, dict) and str(entity.get("asset_id") or "").strip():
                required.add(str(entity["asset_id"]).strip())
    for requirement in step02_manifest.get("asset_requirements") or []:
        if isinstance(requirement, dict) and str(requirement.get("asset_id") or "").strip():
            required.add(str(requirement["asset_id"]).strip())
    return required


def reconcile_production_registry(production: dict[str, Any], required_ids: set[str]) -> dict[str, Any]:
    """Produce a deterministic recovery report without changing assets.

    Only assets explicitly required by the accepted Step02 manifest can block
    Step04/Step05.  Historical extra assets remain isolated but do not prevent
    independent production groups from moving.
    """
    entries = production.get("assets") if isinstance(production, dict) else []
    if not isinstance(entries, list):
        raise AssetLifecycleError("ASSET_LIFECYCLE_REGISTRY_INVALID", "production registry.assets 必须是数组")
    by_id = {str(item.get("asset_id") or ""): item for item in entries if isinstance(item, dict)}
    assets: list[dict[str, Any]] = []
    blocked = []
    for asset_id in sorted(required_ids):
        asset = by_id.get(asset_id)
        if not asset:
            item = {"asset_id": asset_id, "status": "missing", "earliest_missing_stage": "asset_requirement_unfulfilled", "blocker": "STEP04_ASSET_REFERENCE_MISSING"}
            assets.append(item)
            blocked.append(item)
            continue
        kind = str(asset.get("asset_kind") or asset.get("kind") or "").strip()
        stage = str(asset.get("asset_stage") or "").strip()
        lifecycle_state = str(asset.get("lifecycle_state") or stage).strip()
        status = str(asset.get("final_status") or asset.get("status") or "").strip()
        item = {
            "asset_id": asset_id,
            "kind": kind or "unknown",
            "asset_stage": stage or "legacy_pending_reconciliation",
            "lifecycle_state": lifecycle_state or "legacy_pending_reconciliation",
            "final_status": status or "legacy_pending_reconciliation",
            "earliest_missing_stage": earliest_missing_stage(asset),
        }
        try:
            validate_final_asset(asset_id, asset, kind)
            item["status"] = "consumable"
        except AssetLifecycleError as exc:
            item["status"] = "blocked"
            item["blocker"] = exc.code
            item["message"] = str(exc)
            blocked.append(item)
        assets.append(item)
    return {
        "schema_version": "mx_shortdrama_asset_lifecycle_gate_v1",
        "status": "passed" if not blocked else "blocked",
        "required_asset_ids": sorted(required_ids),
        "assets": assets,
        "blocked_assets": blocked,
        "next_action": "step04_abcd_compile" if not blocked else "resume_earliest_asset_lifecycle_stage",
    }


def prepare_downstream_references(final_registry: dict[str, Any], asset_ids: list[str], consumer: str) -> dict[str, Any]:
    """Return the only references a first-frame, storyboard or video runner may upload."""
    if consumer not in {"first_frame", "storyboard", "video"}:
        raise AssetLifecycleError("ASSET_LIFECYCLE_CONSUMER_INVALID", "未知下游消费者", {"consumer": consumer})
    entries = final_registry.get("assets") if isinstance(final_registry, dict) else []
    if not isinstance(entries, list):
        raise AssetLifecycleError("ASSET_LIFECYCLE_REGISTRY_INVALID", "final registry.assets 必须是数组")
    by_id = {str(item.get("asset_id") or ""): item for item in entries if isinstance(item, dict)}
    references = []
    for asset_id in asset_ids:
        asset = by_id.get(str(asset_id))
        if not asset:
            raise AssetLifecycleError("DOWNSTREAM_FINAL_ASSET_MISSING", "下游引用不在最终资产注册表", {"asset_id": asset_id, "consumer": consumer})
        kind = str(asset.get("asset_kind") or asset.get("kind") or "")
        checked = validate_final_asset(str(asset_id), asset, kind)
        references.append({
            "asset_id": str(asset_id),
            "asset_kind": kind,
            "exact_path": checked["exact_path"],
            "sha256": checked["sha256"],
            "consumer": consumer,
        })
    return {"schema_version": "mx_shortdrama_downstream_reference_payload_v1", "consumer": consumer, "references": references}


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise AssetLifecycleError("ASSET_LIFECYCLE_REGISTRY_INVALID", "JSON 根节点必须是对象")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage redraw asset lifecycle contracts.")
    sub = parser.add_subparsers(dest="command", required=True)
    legacy = sub.add_parser("migrate-legacy")
    legacy.add_argument("--asset-registry", type=Path, required=True)
    legacy.add_argument("--out", type=Path, required=True)
    export = sub.add_parser("export-final")
    export.add_argument("--production-registry", type=Path, required=True)
    export.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "migrate-legacy":
            result = migrate_legacy_registry(read_json(args.asset_registry))
            write_json(args.out, result)
        else:
            result = export_final_registry(read_json(args.production_registry))
            write_json(args.out, result)
        print(json.dumps({"result_type": "final_delivery", "task_id": "asset-lifecycle", "evidence_path_or_url": str(args.out.resolve()), "verified_result": "asset_lifecycle_contract_written", "next_action_or_blocker": "none"}, ensure_ascii=False))
        return 0
    except AssetLifecycleError as exc:
        print(json.dumps({"result_type": "external_blocked", "task_id": "asset-lifecycle", "evidence_path_or_url": "", "verified_result": exc.code, "next_action_or_blocker": str(exc), "details": exc.details}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
