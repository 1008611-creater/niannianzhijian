import argparse
import hashlib
import importlib.util
import json
import os
import shutil
import sys
import time
from pathlib import Path


PROJECT_DIR = Path(r"C:\Users\lsb\Pictures\ai视频\懂车帝\转绘宝马3\06_正式证据链_20260704")
RUN_DIR = Path(r"E:\codex\aisp\aidaihuo\runs\bmw3_redraw_20260704")
V2_DIR = PROJECT_DIR / "05_故事板首帧_v2_新母图版"
PROMPT_DIR = V2_DIR / "prompts"
REF_DIR = V2_DIR / "refs"
OUTPUT_DIR = V2_DIR / "outputs"
EVIDENCE_DIR = V2_DIR / "evidence"
IMAGES_DIR = V2_DIR / "images"
MOTHER_DIR = PROJECT_DIR / "00_母参考图" / "05_最终母参考_懂车帝车牌版_20260705"
SOURCE_FRAME_DIR = RUN_DIR / "BMW3SRC_step02_source_timeline" / "manual_review_frames"
STEP02_PATH = RUN_DIR / "BMW3SRC_step02_source_timeline" / "accepted_pack" / "BMW3SRC_Step02_原片带货模板时间轴_验收稿.json"
MIMO_PACK_PATH = PROJECT_DIR / "06_Mimo逐镜头执行包" / "BMW3SRC_Mimo_逐镜头执行包_修正版.json"
RH_HELPER = Path(r"C:\Users\lsb\.codex\skills\runninghub-image2-image\scripts\runninghub_image2_image.py")


MOTHER_REFS = {
    "M01": "M01_scene_front_straight_BMW3_DCD_plate_final.png",
    "M02": "M02_scene_front_3quarter_whole_BMW3_DCD_plate_final.png",
    "M03": "M03_scene_side_profile_BMW3_official_studio_unchanged.jpg",
    "M04": "M04_scene_rear_straight_BMW3_DCD_plate_final.png",
    "M05": "M05_scene_rear_3quarter_BMW3_DCD_plate_final.png",
    "M06": "M06_identity_front_grille_plate_BMW3_DCD_plate_final.png",
    "M07": "M07_identity_headlight_front_corner_BMW3_official_studio_unchanged.jpg",
    "M08": "M08_identity_wheel_detail_BMW3_official_studio_unchanged.jpg",
    "M09": "M09_interior_dashboard_front_BMW3_official_studio_unchanged.jpg",
    "M10": "M10_interior_cockpit_angle_BMW3_official_studio_unchanged.jpg",
    "M11": "M11_interior_front_seat_BMW3_official_studio_unchanged.jpg",
    "M12": "M12_interior_rear_cabin_sunroof_BMW3_official_studio_unchanged.jpg",
}


SOURCE_FRAME_BY_SEGMENT = {
    "S01": "shot_01_3.867s.png",
    "S02": "shot_02_11.8s.png",
    "S03": "shot_03_18.433s.png",
    "S04": "shot_04_24.733s.png",
    "S05": "shot_05_31.833s.png",
    "S06": "shot_06_37.6s.png",
    "S07": "shot_08_42.667s.png",
    "S08": "shot_09_47.6s.png",
    "S09": "shot_10_52.933s.png",
    "S10": "shot_11_58.367s.png",
    "S11": "shot_12_64.167s.png",
    "S12": "shot_13_69.333s.png",
    "S13": "shot_14_72.267s.png",
    "S14": "shot_15_75.8s.png",
    "S15": "shot_16_80.733s.png",
    "S16": "shot_17_85.733s.png",
    "S17": "shot_18_90.733s.png",
}


SHOT_LOCKS = {
    "S01": {
        "refs": ["M01", "M02", "M06"],
        "composition": "竖屏正面近景开场，宝马3系车头从画面下沿顶到中上部，机盖大面积亮面反射，BMW徽标、双肾格栅、两侧大灯、黄色懂车帝牌在同一纵轴，右侧前景一只手掌竖向切入，手掌边缘在车头右三分线。",
        "camera": "机位略高于车标，近距离广角，车头裁切较满，前挡和机盖上沿保留，车牌在下方完整入画。",
        "hand": "右手掌从画面右侧立掌进入，掌心朝车头，停在车头右侧再轻微向内收，不触车。",
    },
    "S02": {
        "refs": ["M01", "M02", "M06"],
        "composition": "竖屏正面整车宽景，宝马3系居中，左右大灯点亮，车头、引擎盖、前挡、两侧后视镜、前轮外缘同时入画，黄色懂车帝牌在前保险杠正中下方。",
        "camera": "机位在车灯高度略上，广角正中透视，车身两侧留少量安全边。",
        "hand": "无手部触碰，画面保持真实到店看车的轻推展示感。",
    },
    "S03": {
        "refs": ["M06", "M07"],
        "composition": "前脸局部近景，镜头贴近左前大灯和双肾格栅交界处，大灯在右上到中部占主视觉，格栅边缘、车头下包围、机盖反光同时可见，车身只保留局部。",
        "camera": "机位低于机盖、略高于大灯，近距离斜前角，裁切紧，强调灯组、格栅和高光。",
        "hand": "无手部动作，细节由镜头贴近承担。",
    },
    "S04": {
        "refs": ["M03", "M08"],
        "composition": "侧前车漆和轮毂细节，宝马3系前轮、侧裙、前门下沿、蓝灰金属漆反光占主画面，车身线条顺着竖屏向上延伸。",
        "camera": "机位从腰线高度降到轮毂高度，近距离斜俯视，轮毂和车门下沿裁切很满。",
        "hand": "右手在下方做短促指向动作，指向车漆和轮毂，不长时间接触车身。",
    },
    "S05": {
        "refs": ["M09", "M10"],
        "composition": "车内驾驶舱宽景，方向盘在左中，前排座椅和中控通道在下部，仪表屏和中控屏横向展开，前挡保留棚拍灰色环境反光。",
        "camera": "机位约肩部高度，从前排侧门位置斜看驾驶位，广角让方向盘、中控和座椅同时可见。",
        "hand": "无明显触摸，靠镜头进入车内完成外观到内饰的转场。",
    },
    "S06": {
        "refs": ["M10"],
        "composition": "中控控制区近景，宝马3系中控台、控制旋钮、挡位区域、碳纤维风格饰板占主画面，右手真实按住控制区。",
        "camera": "从副驾和中控上方斜俯视，画面紧，手和控制区占主面积。",
        "hand": "右手实际抓握并按住中控控制器区域，停留一秒以上，手指自然弯曲，不能漂浮。",
    },
    "S07": {
        "refs": ["M11"],
        "composition": "前排座椅触摸近景，棕色菱格纹皮质座椅从坐垫到头枕完整入画，侧翼和缝线清楚，右手正在轻抚靠背侧翼。",
        "camera": "坐垫到头枕范围的中近景，略高于坐垫，座椅轮廓完整。",
        "hand": "右手掌轻抚座椅靠背和侧翼，从右向左短距离移动，展示材质和包裹感。",
    },
    "S08": {
        "refs": ["M10"],
        "composition": "方向盘手部近景，BMW方向盘和右手占主画面，仪表屏和中控屏在背景中保持宝马内饰布局。",
        "camera": "驾驶员胸口高度，近距离广角，方向盘和手占主画面。",
        "hand": "手握方向盘右侧并触碰按键附近，动作短促，接触真实，强调驾驶位控制感。",
    },
    "S09": {
        "refs": ["M09", "M10"],
        "composition": "驾驶位第一视角静态体验，方向盘下沿被裁切，前挡和棚拍灰色环境反光占上半部，双联屏和中控台保持宝马布局。",
        "camera": "驾驶员眼睛到胸口之间的POV视角，坐进驾驶位的真实看车视角。",
        "hand": "手部不主导，只在方向盘下侧边缘短暂出现。",
    },
    "S10": {
        "refs": ["M09", "M10"],
        "composition": "驾驶位第二个第一视角，方向盘和手在中下部，前挡外灰色棚拍场地在上部，座舱屏幕和中控形成横向层次。",
        "camera": "驾驶员胸口到眼睛之间的第一视角，方向盘和前挡同时入画。",
        "hand": "右手在方向盘右侧握住并做短促拳形强调动作，不切换成道路驾驶动作。",
    },
    "S11": {
        "refs": ["M02", "M03"],
        "composition": "外观侧前整车转场，宝马3系三分之二整车入画，右前角更近，车尾略远，蓝灰金属漆和轮毂清晰，右侧手掌引出重点。",
        "camera": "站姿胸口高度，竖屏广角，整车占画面中部，地面反光保留。",
        "hand": "右手掌从右侧伸出，掌心朝车身做展示动作，不触车。",
    },
    "S12": {
        "refs": ["M06", "M07"],
        "composition": "前灯第二次细节近景，宝马3系左前灯、双肾格栅边缘、机盖曲线、蓝灰漆面高光占满画面。",
        "camera": "大灯高度，近距离斜前角，裁掉大部分车身，只保留灯、格栅和轮廓。",
        "hand": "无手部动作。",
    },
    "S13": {
        "refs": ["M10", "M11"],
        "composition": "车门内饰门板近景，棕色门板、银色门把手、黑色上沿、蓝色氛围灯形成横向结构，右手食指指向门板具体位置。",
        "camera": "门板高度近距离侧拍，饰板横向填满画面，手指在右中位置。",
        "hand": "右手食指从右侧伸出，指向门板具体位置，形成短暂说明动作。",
    },
    "S14": {
        "refs": ["M02", "M03"],
        "composition": "侧面整车宽景，宝马3系完整侧 profile 入画，车顶不切，蓝灰金属漆、黑色轮毂、灰色影棚地面反光保持清楚。",
        "camera": "站姿略低，广角侧拍，整车上下留少量空间。",
        "hand": "手部不作为主体，只允许画面边缘短暂掠过。",
    },
    "S15": {
        "refs": ["M02", "M03"],
        "composition": "侧前中景，宝马3系车身横向占满画面，前门、后门、车窗、轮毂和地面反光同时保留，右手掌向车身做建议引导动作。",
        "camera": "胸口高度侧前中景，车身占满横向空间，地面和车窗上方都保留。",
        "hand": "右手掌向车身做建议引导动作，掌心朝车身，动作稳定不触车。",
    },
    "S16": {
        "refs": ["M04", "M05"],
        "composition": "侧后车尾近景，宝马3系尾灯、后标、后保险杠、黄色懂车帝牌在画面内，右手掌在尾灯下方做展示动作。",
        "camera": "尾灯高度近距离侧后角，车尾占满画面，牌照区域在下方完整入画。",
        "hand": "右手掌在尾灯下方和后标旁做展示动作，不遮挡主体。",
    },
    "S17": {
        "refs": ["M01", "M02", "M06"],
        "composition": "车头正面宽景收尾，宝马3系整车正面居中，车身左右留边，黄色懂车帝牌完整入画，右手掌向车头做最后展示。",
        "camera": "车头高度略上，整车正面宽景，竖屏手机看车视角。",
        "hand": "右手掌向车头做最后展示并轻微回收，引导评论。",
    },
}


EXTERIOR_LOCK = (
    "深海蓝灰金属漆宝马3系长轴轿车，黑色双肾格栅带镀铬边，细长LED大灯，白色折角日行灯，蓝色灯腔细节，"
    "黑色多辐BMW轮毂带银色切面，黄色懂车帝牌，车牌文字精确为懂车帝，冷灰色无缝棚拍影棚，灰色高反地面，柔和棚拍光，"
    "无店招，无户外背景，无价格字，无电话，无字幕，无随机可读文字"
)

INTERIOR_LOCK = (
    "宝马3系黑色座舱，BMW方向盘，长条双联屏，中控屏，碳纤维风格饰板，蓝色氛围灯，棕色菱格纹皮质座椅，"
    "黑色顶棚，银色门把手，屏幕只保留宝马风格色块，无仪表可读文字，无价格字，无电话，无字幕，无随机可读文字"
)

QUALITY_SUFFIX = (
    "超高细节，徕卡画质，保持所有元素材质；smooth shading, soft lighting, controlled details, minimal texture, high clarity, refined edges, smooth gradients "
    "--- no noise, grain, artifacts, high frequency detail, dirty texture, oversharpen, blotchy, chaotic details."
)

FORBIDDEN_TERMS = ["或", "或者", "可选", "任选", "二选一", "可能", "大概", "按原片", "参考原视频"]


def load_rh_helper():
    spec = importlib.util.spec_from_file_location("runninghub_image2_image", RH_HELPER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load RunningHub helper: {RH_HELPER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def mkdirs():
    for path in [PROMPT_DIR, REF_DIR, OUTPUT_DIR, EVIDENCE_DIR, IMAGES_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def source_copy_for_row(row, copy_map):
    return " ".join(copy_map[cid]["exactSourceCopy"] for cid in row.get("speechCaptionIds", []) if cid in copy_map).strip()


def has_interior_refs(ref_ids):
    return any(ref in {"M09", "M10", "M11", "M12"} for ref in ref_ids)


def make_prompt(row, voiceover_text):
    segment_id = row["segmentId"]
    lock = SHOT_LOCKS[segment_id]
    visual_lock = INTERIOR_LOCK if has_interior_refs(lock["refs"]) else EXTERIOR_LOCK
    prompt = f"""任务：生成9:16竖屏真实手机看车短视频首帧，单张真实照片，不是拼贴图，不是分镜板，不要边框。
参考图A是源片首帧，只锁定构图、镜头距离、裁切、手部姿态、展示部位。参考图A不锁定车型、车色、场地、车标、车牌、内饰款式。
母参考图锁定宝马3系车辆身份、蓝灰车漆、棚拍场地、内饰材质、轮毂和懂车帝车牌。
车辆和场地固定：{visual_lock}。
本镜头构图：{lock["composition"]}
本镜头机位：{lock["camera"]}
本镜头手部：{lock["hand"]}
口播文案只作为情绪节奏提示，不在画面生成字幕：{voiceover_text}
画面风格：真实手机看车实拍，车辆静止，手部比例真实，车身结构准确，BMW标识准确，影棚灰墙灰地连续统一。
文字规则：除黄色车牌上的懂车帝之外，画面不生成任何可读文字，不生成字幕条，不生成价格，不生成电话，不生成店名，不生成屏幕菜单字。
失败判定：车型变成奥迪，车身变成SUV，车漆偏黑，场地变成户外，车牌不是懂车帝，出现随机文字，出现真人脸部，手部漂浮，轮毂错误，内饰不是宝马3系。
{QUALITY_SUFFIX}"""
    return prompt


def validate_prompt(prompt: str, path: Path):
    hits = [term for term in FORBIDDEN_TERMS if term in prompt]
    if hits:
        raise ValueError(f"Forbidden prompt terms {hits} in {path}")


def build_jobs():
    step02 = read_json(STEP02_PATH)
    mimo = read_json(MIMO_PACK_PATH)
    record_by_segment = {r["sourceSegmentId"]: r for r in mimo["records"]}
    copy_map = {c["id"]: c for c in step02["copyBindings"]}
    jobs = []
    for index, row in enumerate(step02["sourceRows"], start=1):
        segment_id = row["segmentId"]
        storyboard_id = f"SB{index:02d}"
        video_id = f"V{index:02d}"
        lock = SHOT_LOCKS[segment_id]
        prompt_path = PROMPT_DIR / f"{storyboard_id}_{segment_id}_firstframe_prompt_v2.txt"
        source_frame = SOURCE_FRAME_DIR / SOURCE_FRAME_BY_SEGMENT[segment_id]
        mother_paths = [MOTHER_DIR / MOTHER_REFS[ref] for ref in lock["refs"]]
        output_image = IMAGES_DIR / f"{storyboard_id}_{segment_id}_firstframe.png"
        refs_file = REF_DIR / f"{storyboard_id}_{segment_id}_rh_image_files.txt"
        voiceover_text = record_by_segment[segment_id]["voiceoverText"]
        prompt = make_prompt(row, voiceover_text)
        validate_prompt(prompt, prompt_path)
        image_files = [source_frame, *mother_paths]
        for path in image_files:
            if not path.exists():
                raise FileNotFoundError(path)
        prompt_path.write_text(prompt, encoding="utf-8")
        refs_file.write_text("\n".join(str(p) for p in image_files) + "\n", encoding="utf-8")
        jobs.append(
            {
                "videoId": video_id,
                "storyboardId": storyboard_id,
                "sourceSegmentId": segment_id,
                "sourceTimecode": row["sourceTimecode"],
                "shotType": row["shotType"],
                "sourceFrame": str(source_frame),
                "motherRefs": [str(p) for p in mother_paths],
                "motherRefIds": lock["refs"],
                "promptFile": str(prompt_path),
                "refsFile": str(refs_file),
                "outputImage": str(output_image),
                "voiceoverText": voiceover_text,
                "sourceOriginalCopy": source_copy_for_row(row, copy_map),
                "compositionLock": lock["composition"],
                "cameraLock": lock["camera"],
                "handLock": lock["hand"],
                "status": "prepared_not_submitted",
            }
        )
    manifest = {
        "artifactType": "BMW3_v2_new_mother_firstframe_jobs",
        "version": "20260705.v2_new_mother_refs",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "policy": "source frames control composition hand camera crop only; approved mother refs control BMW3 vehicle studio interior wheel plate",
        "baseDir": str(V2_DIR),
        "jobs": jobs,
    }
    manifest_path = V2_DIR / "BMW3SRC_首帧图生成任务_v2_新母图版.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    jsonl_path = V2_DIR / "BMW3SRC_首帧图生成任务_v2_新母图版.jsonl"
    jsonl_path.write_text("\n".join(json.dumps(job, ensure_ascii=False) for job in jobs) + "\n", encoding="utf-8")
    return manifest_path


def load_manifest():
    path = V2_DIR / "BMW3SRC_首帧图生成任务_v2_新母图版.json"
    if not path.exists():
        raise FileNotFoundError(f"Run prepare first: {path}")
    return path, read_json(path)


def upload_refs(manifest, rh, api_key, base_url, request_timeout):
    cache_path = EVIDENCE_DIR / "runninghub_upload_cache.json"
    cache = read_json(cache_path) if cache_path.exists() else {}
    upload_events = []
    for job in manifest["jobs"]:
        urls = []
        uploads = []
        for local in [job["sourceFrame"], *job["motherRefs"]]:
            path = Path(local)
            key = str(path)
            digest = sha256_file(path)
            cached = cache.get(key)
            if not cached or cached.get("sha256") != digest:
                upload = rh.upload_media_file(base_url, path, api_key, request_timeout)
                cached = {
                    "local_path": str(path),
                    "sha256": digest,
                    "download_url": upload["download_url"],
                    "uploadedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "response": upload.get("response"),
                }
                cache[key] = cached
                upload_events.append({"path": key, "status": "uploaded"})
            urls.append(cached["download_url"])
            uploads.append({"local_path": key, "download_url": cached["download_url"], "sha256": digest})
        job["runninghubImageUrls"] = urls
        job["runninghubUploads"] = uploads
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    return upload_events


def dry_run():
    manifest_path, manifest = load_manifest()
    rh = load_rh_helper()
    rh.load_dotenv(prefer_keys={"RUNNINGHUB_API_KEY"})
    api_key = os.getenv("RUNNINGHUB_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("RUNNINGHUB_API_KEY missing")
    upload_events = upload_refs(manifest, rh, api_key, "https://www.runninghub.cn", 120)
    payloads = []
    for job in manifest["jobs"]:
        prompt = Path(job["promptFile"]).read_text(encoding="utf-8").strip()
        payloads.append(
            {
                "videoId": job["videoId"],
                "storyboardId": job["storyboardId"],
                "sourceSegmentId": job["sourceSegmentId"],
                "url": "https://www.runninghub.cn/openapi/v2/rhart-image-g-2/image-to-image",
                "payload": {
                    "prompt": prompt,
                    "imageUrls": job["runninghubImageUrls"],
                    "aspectRatio": "9:16",
                    "resolution": "2k",
                    "tools": ["image_generation"],
                },
                "localReferences": [job["sourceFrame"], *job["motherRefs"]],
            }
        )
    dry_path = EVIDENCE_DIR / "runninghub_dry_run_payloads.json"
    dry_path.write_text(json.dumps({"payloads": payloads, "uploadEvents": upload_events}, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "dry_run_ready", "jobs": len(payloads), "dryRunPath": str(dry_path), "newUploads": len(upload_events)}, ensure_ascii=False, indent=2))


def submit_and_poll(timeout_seconds: int, poll_interval: int):
    manifest_path, manifest = load_manifest()
    rh = load_rh_helper()
    rh.load_dotenv(prefer_keys={"RUNNINGHUB_API_KEY"})
    api_key = os.getenv("RUNNINGHUB_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("RUNNINGHUB_API_KEY missing")
    upload_refs(manifest, rh, api_key, "https://www.runninghub.cn", 120)
    submitted = []
    for job in manifest["jobs"]:
        if Path(job["outputImage"]).exists():
            continue
        if job.get("status") == "submitted" and job.get("taskId"):
            submitted.append({"videoId": job["videoId"], "taskId": job["taskId"], "status": "resume_existing"})
            continue
        prompt = Path(job["promptFile"]).read_text(encoding="utf-8").strip()
        payload = {
            "prompt": prompt,
            "imageUrls": job["runninghubImageUrls"],
            "aspectRatio": "9:16",
            "resolution": "2k",
            "tools": ["image_generation"],
        }
        response = rh.post_json("https://www.runninghub.cn/openapi/v2/rhart-image-g-2/image-to-image", payload, api_key, 120)
        task_id = rh.extract_task_id(response)
        job["submitPayload"] = payload
        job["submitResponse"] = response
        job["taskId"] = task_id
        job["submittedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        job["status"] = "submitted" if task_id else "submit_no_task_id"
        submitted.append({"videoId": job["videoId"], "taskId": task_id, "status": job["status"]})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    submit_path = EVIDENCE_DIR / "runninghub_submit_tasks.json"
    submit_path.write_text(json.dumps({"submitted": submitted}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "submitted", "submitted": submitted}, ensure_ascii=False, indent=2))

    deadline = time.time() + timeout_seconds
    pending = {job["taskId"]: job for job in manifest["jobs"] if job.get("taskId") and not Path(job["outputImage"]).exists()}
    raw_dir = OUTPUT_DIR / "runninghub_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    while pending and time.time() < deadline:
        for task_id, job in list(pending.items()):
            try:
                query = rh.post_json("https://www.runninghub.cn/openapi/v2/query", {"taskId": task_id}, api_key, 120)
            except Exception as exc:
                job["lastQueryError"] = repr(exc)
                continue
            job["lastQuery"] = query
            urls = rh.find_image_urls(query)
            if urls:
                raw_saved = rh.download_urls([urls[0]], raw_dir, 120)
                if raw_saved:
                    out_path = Path(job["outputImage"])
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(raw_saved[0], out_path)
                    job["resultUrl"] = urls[0]
                    job["downloadedRaw"] = raw_saved[0]
                    job["downloadedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                    job["outputSha256"] = sha256_file(out_path)
                    job["status"] = "qa_pending"
                    pending.pop(task_id, None)
                    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        if pending:
            time.sleep(poll_interval)
    for job in manifest["jobs"]:
        if job.get("taskId") in pending:
            job["status"] = "poll_timeout"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"status": "poll_complete", "pending": list(pending.keys()), "downloaded": sum(1 for j in manifest["jobs"] if Path(j["outputImage"]).exists())}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["prepare", "dry-run", "submit"])
    parser.add_argument("--final-registry", type=Path, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=1800)
    parser.add_argument("--poll-interval", type=int, default=20)
    args = parser.parse_args()
    from legacy_prevideo_guard import require_migrated_executor
    require_migrated_executor(args.final_registry, "bmw3_v2_firstframe_pipeline.py")
    mkdirs()
    if args.command == "prepare":
        path = build_jobs()
        print(json.dumps({"status": "prepared", "manifest": str(path)}, ensure_ascii=False, indent=2))
    elif args.command == "dry-run":
        dry_run()
    elif args.command == "submit":
        submit_and_poll(args.timeout_seconds, args.poll_interval)


if __name__ == "__main__":
    sys.exit(main())
