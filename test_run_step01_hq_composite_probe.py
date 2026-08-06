import datetime as dt
import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / "bridge" / "mac-employee-training" / "run_step01_hq_composite_probe.py"
COMMAND = ROOT / "bridge" / "mac-employee-training" / "Run-NianNian-Step01-HQ-Composite.command"
spec = importlib.util.spec_from_file_location("hq_probe", SOURCE)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1)).isoformat().replace("+00:00", "Z")
authority = {
    "schema_version": "niannian_step01_analysis_service_cost_authority_v1",
    "status": "authorized",
    "source_sha256": "a" * 64,
    "settings_version": 2,
    "allowed_services": ["mimo_asr", "paddle_ocr"],
    "spend_ceiling_policy": "unrestricted_for_exact_scoped_analysis_services",
    "expires_at": future,
    "media_generation_provider_authority_granted": False,
    "video_generation_authority_granted": False,
    "image_generation_authority_granted": False,
    "dubbing_authority_granted": False,
    "delivery_authority_granted": False,
}
module.validate_authority(authority, "a" * 64, 2)
wrong = dict(authority, video_generation_authority_granted=True)
try:
    module.validate_authority(wrong, "a" * 64, 2)
    raise AssertionError("media scope escalation was accepted")
except RuntimeError as error:
    assert str(error) == "hq_composite_cost_authority_scope_invalid"

usage = module.numeric_usage({"usage": {"total_tokens": 12}, "data": {"jobId": 99, "quotaRemaining": 7}, "token": "not-numeric"})
assert usage == {"usage.total_tokens": 12, "data.quotaRemaining": 7}
source = SOURCE.read_text(encoding="utf-8")
assert "os.environ" not in source
assert '"find-generic-password"' in source
assert 'stderr=subprocess.DEVNULL' in source
assert 'secret_output":False' in source
assert 'synthetic_artifacts_persisted":False' in source
command = COMMAND.read_text(encoding="utf-8")
probe_call = command.index('run_step01_hq_composite_probe.py')
assert 'adopt_step01_skill_bundle_v2.js' not in command
assert 'five new App turns' in command
assert probe_call > command.index('Historical adoption proves')
print({"ok": True, "verified": ["scoped cost authority", "media-provider authority remains false", "safe numeric usage reporting", "Keychain-to-memory boundary", "no secret env/argv/output persistence", "synthetic artifacts deleted", "historical adoption is validated without five new App turns"]})
