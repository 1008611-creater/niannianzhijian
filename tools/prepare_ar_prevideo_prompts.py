"""Legacy prompt pack builder.

This script is tied to a historical hard-coded job and predates the final
asset lifecycle contract.  Leaving it executable can create downstream-looking
prompt packages without an accepted final asset registry, so the old entry
point is deliberately fail-closed.  New prompt packages must be compiled from
the Step04 A/B/C contract.
"""

raise SystemExit(
    "LEGACY_STEP04_PROMPT_ENTRYPOINT_DISABLED: use "
    "tools/step04_abcd_compiler.py and the current Step04 contract"
)

import hashlib
import json
from pathlib import Path

JOB = "AR-AUTH19FBCAF6B16-BF6334E09621"
ROOT = Path(r"C:\Users\lsb\AppData\Local\NianNianAI\auto-redraw-jobs") / JOB
CONTRACT = ROOT / "step04_package" / "step04_compiled_contract.json"
OUT = ROOT / "pre_video_package"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1024 * 1024), b""):
            h.update(b)
    return h.hexdigest()


def write_once(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_text(encoding="utf-8") != text:
            raise SystemExit(f"locked prompt collision: {path}")
        return
    path.write_text(text, encoding="utf-8")


contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
groups = contract["productionGroups"]
if len(groups) != 6:
    raise SystemExit("expected exactly 6 locked groups")

for group in groups:
    gid = group["group_id"]
    duration = group["duration_seconds"]
    first = (
        f"16:9 横版现代墨西哥写实短剧转绘首帧，生产组 {gid}，真实电影帧质感。"
        f"开场时刻对应原片 {group['timecode']}。画面构图：{group['source_composition']}。"
        f"人物站位与动作起点：{group['blocking']}。"
        "人物身份遵循已接受角色设定板，场景材质遵循已接受场景图，关键道具遵循已接受道具图；"
        "锁定开场景别、机位、主体位置、前后景、光线方向、动作余量与情绪起点。"
        "画面呈现干净单帧电影镜头，不出现字幕、标题、标签、分镜网格或制作板排版。"
        "真实影视摄影质感，自然皮肤纹理、真实衣料受力、可信手部结构、克制表演与符合场景的光线。"
    )
    write_once(OUT / "prompts" / "firstframes" / f"{gid}.txt", first)

    storyboard = (
        "【基础设定】\n"
        f"比例：16:9。单张专业电影制作板。生产组 {gid}，时长 {duration} 秒，现代墨西哥写实短剧。\n"
        f"故事：从 {group['source_composition']} 的起始构图，按人物关系与动作因果推进；人物站位为 {group['blocking']}。\n"
        "角色与风格锁定：继承已接受角色设定板的脸型、年龄、发型、体型与服装；继承场景图的空间材质与光线；继承关键道具图的结构与尺度。\n\n"
        "【1-8 镜头脚本】\n"
        "1) 建立镜头，明确场景、人物初始站位、前后景和视觉中心。\n"
        "2) 中景承接开场动作，眼神与身体朝向建立人物关系。\n"
        "3) 近景显示主要人物的手部动作与关键道具当前状态。\n"
        "4) 反打镜头呈现另一人物的表情反应与空间距离。\n"
        "5) 侧向中近景推进动作执行，身体重量与衣料受力真实。\n"
        "6) 特写落在剧情关键的表情或物态结果。\n"
        "7) 稳定反应镜头呈现动作结果后的情绪变化。\n"
        "8) 收束镜头停在本组结尾稳定态，为下一生产组保留连续衔接。\n\n"
        "【制作板结构】\n"
        "顶部栏包含标题、时长、16:9、8 个镜头、统一暖中性色调与视觉优先级；左侧为角色与风格参考区；"
        "右上为关键道具锁定区；中部为环境俯视示意、人物移动路径和摄影机路线；主体区域为 1-8 号真实电影帧；"
        "底部完整呈现灯光、情绪关键词、环境声与动作声、焦段景别、运动方式和转场笔记。\n\n"
        "【导演注释颜色系统】\n"
        "红色箭头标注身体运动；蓝色箭头标注摄像机运动；绿色标记说明构图；橙色标记说明光线方向；"
        "紫色标记说明情感强调；黑色文字用于短焦镜头笔记和面板标签。\n\n"
        "【生成要求】\n"
        "单张 16:9 专业电影制作板，浅灰制作板底色，清晰中文栏目与规整镜头编号；"
        "角色参考、道具锁定、环境路线、8 个差异明确的故事帧、灯光情绪、音频和摄影笔记完整共存；"
        "台词仅在底部音频栏以制作笔记小字记录，1-8 号故事帧保持纯电影画面。"
    )
    write_once(OUT / "prompts" / "storyboards" / f"{gid}.txt", storyboard)

manifest = {
    "job_id": JOB,
    "source_contract": {"exact_path": str(CONTRACT.resolve()), "sha256": sha(CONTRACT)},
    "group_count": len(groups),
    "groups": [{
        "group_id": g["group_id"],
        "duration_seconds": g["duration_seconds"],
        "firstframe_prompt": str((OUT / "prompts" / "firstframes" / f"{g['group_id']}.txt").resolve()),
        "firstframe_prompt_sha256": sha(OUT / "prompts" / "firstframes" / f"{g['group_id']}.txt"),
        "storyboard_prompt": str((OUT / "prompts" / "storyboards" / f"{g['group_id']}.txt").resolve()),
        "storyboard_prompt_sha256": sha(OUT / "prompts" / "storyboards" / f"{g['group_id']}.txt"),
    } for g in groups],
}
(OUT / "locked_prompt_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"groups": len(groups), "prompt_files": len(groups) * 2}, ensure_ascii=False))
