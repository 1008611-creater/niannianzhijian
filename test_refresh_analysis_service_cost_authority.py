import datetime as dt
import importlib.util
import json
import os
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
SOURCE = ROOT / "bridge" / "mac-employee-training" / "refresh_analysis_service_cost_authority.py"
POLICY = ROOT / "bridge" / "mac-employee-training" / "analysis_service_cost_policy_NN-20260715083045-8120F5.json"
spec = importlib.util.spec_from_file_location("refresh_authority", SOURCE)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as temporary:
    authority = pathlib.Path(temporary) / "authority.json"
    first_at = dt.datetime(2026, 7, 18, 5, 0, tzinfo=dt.timezone.utc)
    first = module.refresh(POLICY, authority, first_at)
    assert first["status"] == "refreshed_from_policy"
    value = json.loads(authority.read_text(encoding="utf-8"))
    assert value["authorized_by"] == {"type": "durable_user_policy", "decision_id": "D-022"}
    assert value["project_id"] == module.PROJECT_ID
    assert value["source_sha256"] == module.SOURCE_SHA256
    assert all(value[key] is False for key in module.FALSE_SCOPES)
    if os.name != "nt":
        assert authority.stat().st_mode & 0o777 == 0o600
    second = module.refresh(POLICY, authority, first_at + dt.timedelta(minutes=5))
    assert second["status"] == "reused_fresh"
    value["video_generation_authority_granted"] = True
    authority.write_text(json.dumps(value), encoding="utf-8")
    try:
        module.refresh(POLICY, authority, first_at + dt.timedelta(hours=2))
        raise AssertionError("tampered authority was overwritten")
    except RuntimeError as error:
        assert str(error) == "analysis_cost_authority_scope_invalid"

print({"ok": True, "verified": ["D-022 exact policy binding", "expired authority refresh", "fresh authority reuse", "mode-600 authority", "scope escalation rejection"]})
