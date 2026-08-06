import hashlib
import json
import argparse
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from legacy_prevideo_guard import require_migrated_executor

parser = argparse.ArgumentParser(description="Legacy pre-video package finalizer; disabled pending S-011 migration.")
parser.add_argument("--final-registry", type=Path, required=True)
args = parser.parse_args()
require_migrated_executor(args.final_registry, "finalize_ar_prevideo_package.py")

JOB = "AR-AUTH19FBCAF6B16-BF6334E09621"
ROOT = Path(r"C:\Users\lsb\AppData\Local\NianNianAI\auto-redraw-jobs") / JOB
PKG = ROOT / "pre_video_package"
CONTRACT_PATH = ROOT / "step04_package" / "step04_compiled_contract.json"
SUPPORT_STATUS_PATH = ROOT / "step05_production_status.json"


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def image_record(path: Path, role: str):
    with Image.open(path) as im:
        width, height, fmt = im.width, im.height, im.format
        im.verify()
    return {
        "exact_path": str(path.resolve()), "sha256": sha(path), "bytes": path.stat().st_size,
        "width": width, "height": height, "format": fmt, "responsibility": role,
        "decodable": True,
    }


def one_png(path: Path) -> Path:
    files = list(path.glob("*.png"))
    if len(files) != 1:
        raise SystemExit(f"expected one png: {path}; found {len(files)}")
    return files[0]


contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
support = json.loads(SUPPORT_STATUS_PATH.read_text(encoding="utf-8"))
groups = contract["productionGroups"]
if len(groups) != 6:
    raise SystemExit("expected 6 production groups")

support_assets = []
for item in support["step05_assets"]["assets"]:
    rec = dict(item["output"])
    rec["asset_id"] = item["asset_id"]
    rec["responsibility"] = {
        "character": "identity_and_wardrobe_support_only_not_video_upload",
        "scene": "environment_material_and_spatial_support_only_not_video_upload",
        "prop": "key_prop_structure_and_scale_support_only_not_video_upload",
    }[item["asset_id"]]
    support_assets.append(rec)

manifest_groups = []
for group in groups:
    gid = group["group_id"]
    duration = float(group["duration_seconds"])
    if not (4 <= duration <= 15):
        raise SystemExit(f"duration out of range: {gid}")
    ff = one_png(PKG / "outputs" / "firstframes" / gid)
    sb = one_png(PKG / "outputs" / "storyboards" / gid)
    ff_rec = image_record(ff, "single_selected_video_first_frame_anchor")
    sb_rec = image_record(sb, "storyboard_planning_authority_not_uploaded_to_single_image_channel")
    ff_receipt = PKG / "receipts" / "firstframes" / f"{gid}.json"
    sb_receipt = PKG / "receipts" / "storyboards" / f"{gid}.json"
    if json.loads(ff_receipt.read_text(encoding="utf-8"))["query"]["status"] != "SUCCESS":
        raise SystemExit(f"firstframe provider receipt not success: {gid}")
    if json.loads(sb_receipt.read_text(encoding="utf-8"))["query"]["status"] != "SUCCESS":
        raise SystemExit(f"storyboard provider receipt not success: {gid}")

    prompt = (
        "【成片目标】\n"
        f"9:16 竖屏，720P，时长 {duration:.3f} 秒，现代墨西哥写实短剧。"
        "保持源片剧情节奏、镜头事实与连续性，从本组起始状态推进到结尾稳定态。\n\n"
        "【参考图使用方式】\n"
        "上传本组转绘首帧作为唯一图片输入，锁定开场人物身份、服装、构图起点、空间关系、光线和道具状态。"
        "本组正式故事板作为制作调度依据，不作为第二张上传图；按故事板 1-8 格的动作因果、反应停点和摄影路线推进。\n\n"
        "【主体与场景锁定】\n"
        "人物身份、年龄、脸型、发型、体型与服装保持首帧和已接受角色资产的一致性；"
        "场景材质、空间关系与光线保持已接受场景资产的一致性；关键道具结构与尺度保持已接受道具资产的一致性。\n\n"
        "【时间轴与动作推进】\n"
        f"0.0s：贴近首帧的开场构图。{group['source_composition']}\n"
        f"0.0-{duration*0.25:.1f}s：建立人物站位、眼神方向与动作起点。{group['blocking']}\n"
        f"{duration*0.25:.1f}-{duration*0.55:.1f}s：按故事板中段推进手部、身体重心、道具状态和镜头运动，动作因果清楚。\n"
        f"{duration*0.55:.1f}-{duration*0.80:.1f}s：落到动作结果与对方反应，表情变化清晰可读。\n"
        f"{duration*0.80:.1f}-{duration:.1f}s：收束至故事板末格稳定态，为下一组保留连续衔接。\n\n"
        "【镜头设计】\n"
        "镜头运动遵循故事板蓝色摄影机路线和 Step04 锁定机位，景别变化服务人物关系与剧情重点，运动平滑克制。\n\n"
        "【表演与物理细节】\n"
        "眼神、头颈、肩膀、手部、躯干与脚步按动作逻辑连续变化；衣料、头发、饰品和道具有自然细微运动。\n\n"
        "【声音设计】\n"
        f"对白与停顿遵循锁定文本：{group['es_mx_dialogue']} 环境声、呼吸和动作声跟随原片空间距离与动作强弱变化。\n\n"
        "【画面完整性护栏】\n"
        "最终画面是干净连续的 9:16 电影镜头；人物、服装、道具、场景和身体结构稳定。"
        "故事板分格、箭头、编号、标签、文字和网格仅作制作参考，不进入成片。"
    )
    prompt_path = PKG / "final_video_prompts" / f"{gid}.txt"
    prompt_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_path.write_text(prompt, encoding="utf-8")

    spec = {
        "schema_version": "mx_shortdrama_video_task_spec_v1",
        "job_id": JOB, "group_id": gid,
        "status": "video_ready_not_submitted",
        "channel": "astorie-seedance2-channel",
        "model": "Seedance 2.0 Mini",
        "duration_seconds": duration,
        "resolution": "720P",
        "aspect_ratio": "9:16",
        "source_video": {"width": 540, "height": 960, "fps": 30, "display_aspect_ratio": "9:16"},
        "one_generation_per_locked_group": True,
        "locked_prompt": {"exact_path": str(prompt_path.resolve()), "sha256": sha(prompt_path), "bytes": prompt_path.stat().st_size},
        "assets": {
            "upload_selected_image": ff_rec,
            "storyboard": sb_rec,
            "support_assets": support_assets,
        },
        "reference_policy": {
            "provider_upload_count": 1,
            "upload_role": "video_first_frame_anchor",
            "storyboard_role": "planning_authority_not_provider_upload",
            "support_asset_role": "identity_environment_prop_evidence_not_provider_upload",
        },
        "known_preflight_note": "Generated planning images are 16:9 while final source aspect is 9:16; provider preflight must confirm the selected-image fit/crop behavior before submission.",
        "provider_task_id": None, "provider_submitted": False, "provider_called": False,
    }
    spec_path = PKG / "video_task_specs" / f"{gid}.json"
    spec_path.parent.mkdir(parents=True, exist_ok=True)
    spec_path.write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest_groups.append({
        "group_id": gid,
        "first_frame": ff_rec,
        "storyboard": sb_rec,
        "video_prompt": {"exact_path": str(prompt_path.resolve()), "sha256": sha(prompt_path), "bytes": prompt_path.stat().st_size},
        "video_task_spec": {"exact_path": str(spec_path.resolve()), "sha256": sha(spec_path), "bytes": spec_path.stat().st_size},
        "receipts": {
            "first_frame": {"exact_path": str(ff_receipt.resolve()), "sha256": sha(ff_receipt)},
            "storyboard": {"exact_path": str(sb_receipt.resolve()), "sha256": sha(sb_receipt)},
        },
        "qa": {"first_frame_decodable": True, "storyboard_decodable": True, "duration_valid": True, "spec_complete": True, "auto_accepted": True},
    })

manifest = {
    "schema_version": "mx_shortdrama_pre_video_package_manifest_v1",
    "job_id": JOB,
    "created_at": datetime.now(timezone.utc).isoformat(),
    "status": "video_ready_not_submitted",
    "source_contract": {"exact_path": str(CONTRACT_PATH.resolve()), "sha256": sha(CONTRACT_PATH)},
    "support_asset_status": {"exact_path": str(SUPPORT_STATUS_PATH.resolve()), "sha256": sha(SUPPORT_STATUS_PATH)},
    "group_count": len(manifest_groups), "groups": manifest_groups,
    "completeness": {"first_frames": 6, "storyboards": 6, "video_task_specs": 6, "video_prompts": 6},
    "video_provider": {"status": "not_called", "node_created": False, "task_ids": [], "charges": 0},
}
manifest_path = PKG / "pre_video_package_manifest.json"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

# Unique Windows/site projection signal: written only after every group passed the checks above.
website = {
    "schema_version": "niannian.auto_redraw.pre_video_delivery.v1",
    "job_id": JOB,
    "status": "video_ready_not_submitted",
    "package_root": str(PKG.resolve()),
    "manifest_path": str(manifest_path.resolve()),
    "groups": [{
        "group_id": x["group_id"],
        "first_frame": {"exact_path": x["first_frame"]["exact_path"], "sha256": x["first_frame"]["sha256"]},
        "storyboard": {"exact_path": x["storyboard"]["exact_path"], "sha256": x["storyboard"]["sha256"]},
        "video_task_spec": {"exact_path": x["video_task_spec"]["exact_path"], "sha256": x["video_task_spec"]["sha256"]},
    } for x in manifest_groups],
    "video_provider": {"status": "not_called"},
}
website_path = ROOT / "website_prevideo_delivery.json"
website_path.write_text(json.dumps(website, ensure_ascii=False, indent=2), encoding="utf-8")

print(json.dumps({
    "website_manifest": str(website_path.resolve()), "website_sha256": sha(website_path),
    "groups": len(manifest_groups), "first_frames": 6, "storyboards": 6, "video_task_specs": 6,
    "video_provider_status": "not_called",
}, ensure_ascii=False))
