import argparse
import json
import subprocess
import time
from pathlib import Path

from asset_lifecycle import AssetLifecycleError, prepare_downstream_references, read_json


PYTHON = Path(r"C:\Users\lsb\anaconda3\python.exe")
SUBMIT = Path(r"C:\Users\lsb\.codex\skills\runninghub-image2-image\scripts\runninghub_image2_image.py")
QUERY = Path(r"C:\Users\lsb\.codex\skills\runninghub-image2-image\scripts\runninghub_query_tasks.py")


GROUP_CHARACTERS = {
    "G01": ["A_CHAR_001", "A_CHAR_002", "A_CHAR_003"],
    "G02": ["A_CHAR_001", "A_CHAR_002"],
    "G03": ["A_CHAR_001", "A_CHAR_002", "A_CHAR_004"],
    "G04": ["A_CHAR_002"],
    "G05": ["A_CHAR_002"],
}


def downstream_asset_stage(phase: str) -> str:
    if phase == "firstframes":
        return "first_frame"
    if phase == "storyboards":
        return "storyboard"
    raise ValueError(f"unsupported downstream phase: {phase}")


def run(args, log_path):
    log_path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [str(PYTHON), *map(str, args)],
        cwd=str(log_path.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    log_path.write_text(proc.stdout, encoding="utf-8")
    if proc.returncode:
        raise RuntimeError(f"command failed ({proc.returncode}): {log_path}")
    return proc.stdout


def parse_json(text):
    start = min([x for x in (text.find("{"), text.find("[")) if x >= 0], default=-1)
    if start < 0:
        raise RuntimeError("no JSON in runner output")
    return json.loads(text[start:])


def find_task_id(value):
    if isinstance(value, dict):
        for key in ("taskId", "task_id"):
            if value.get(key):
                return str(value[key])
        for item in value.values():
            found = find_task_id(item)
            if found:
                return found
    if isinstance(value, list):
        for item in value:
            found = find_task_id(item)
            if found:
                return found
    return None


def submit_batch(root, phase, refs_by_group):
    phase_root = root / "pre_video_execution" / phase
    asset_stage = downstream_asset_stage(phase)
    task_ids = {}
    for gid in GROUP_CHARACTERS:
        group_root = phase_root / gid
        receipt = group_root / "submit_receipt.json"
        if receipt.exists():
            task_id = find_task_id(json.loads(receipt.read_text(encoding="utf-8")))
            if not task_id:
                raise RuntimeError(f"missing task id in {receipt}")
            task_ids[gid] = task_id
            continue

        prompt = root / "step04" / "prompts" / f"{gid}_{'first_frame' if phase == 'firstframes' else 'storyboard'}.txt"
        refs = refs_by_group[gid]
        base = [
            SUBMIT,
            "--prompt-file", prompt,
            "--aspect-ratio", "16:9",
            "--resolution", "2k",
            "--asset-stage", asset_stage,
        ]
        for ref in refs:
            base.extend(["--image-file", ref])
        run([*base, "--dry-run"], group_root / "dry_run.log")
        output = run(
            [*base, "--submit-log-dir", group_root / "provider_submit_logs"],
            group_root / "submit.log",
        )
        parsed = parse_json(output)
        task_id = find_task_id(parsed)
        if not task_id:
            raise RuntimeError(f"provider did not return task id for {phase}/{gid}")
        receipt.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        task_ids[gid] = task_id
    (phase_root / "task_ids.json").write_text(json.dumps(task_ids, ensure_ascii=False, indent=2), encoding="utf-8")
    (phase_root / "task_ids.txt").write_text("\n".join(task_ids.values()) + "\n", encoding="utf-8")
    return task_ids


def query_until_done(root, phase, task_ids):
    phase_root = root / "pre_video_execution" / phase
    download = phase_root / "download"
    deadline = time.time() + 1200
    while time.time() < deadline:
        output = run(
            [QUERY, "--task-ids-file", phase_root / "task_ids.txt", "--download-dir", download],
            phase_root / "query.log",
        )
        parsed = parse_json(output)
        (phase_root / "query_receipt.json").write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        files = list(download.glob("*.png")) if download.exists() else []
        completed = {gid for gid, task_id in task_ids.items() if any(task_id in f.name for f in files)}
        if len(completed) == len(task_ids):
            return {gid: next(f for f in files if task_id in f.name) for gid, task_id in task_ids.items()}
        time.sleep(8)
    raise TimeoutError(f"timed out waiting for {phase}")


def final_character_cards(final_registry: Path) -> dict[str, Path]:
    asset_ids = sorted({asset_id for ids in GROUP_CHARACTERS.values() for asset_id in ids})
    payload = prepare_downstream_references(read_json(final_registry), asset_ids, "first_frame")
    return {item["asset_id"]: Path(item["exact_path"]) for item in payload["references"]}


def main(root, final_registry):
    root = Path(root)
    cards = final_character_cards(Path(final_registry))
    for path in cards.values():
        if not path.exists():
            raise FileNotFoundError(path)

    first_refs = {gid: [cards[c] for c in chars] for gid, chars in GROUP_CHARACTERS.items()}
    first_task_ids = submit_batch(root, "firstframes", first_refs)
    first_outputs = query_until_done(root, "firstframes", first_task_ids)

    board_refs = {
        gid: [first_outputs[gid], *[cards[c] for c in chars]]
        for gid, chars in GROUP_CHARACTERS.items()
    }
    board_task_ids = submit_batch(root, "storyboards", board_refs)
    board_outputs = query_until_done(root, "storyboards", board_task_ids)

    result = {
        "firstframes": {gid: str(path) for gid, path in first_outputs.items()},
        "storyboards": {gid: str(path) for gid, path in board_outputs.items()},
        "firstframe_task_ids": first_task_ids,
        "storyboard_task_ids": board_task_ids,
    }
    out = root / "pre_video_execution" / "image_execution_result.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--final-registry", type=Path, required=True)
    args = parser.parse_args()
    try:
        main(args.root, args.final_registry)
    except AssetLifecycleError as exc:
        raise SystemExit(f"{exc.code}: {exc}") from exc
