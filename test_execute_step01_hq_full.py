#!/usr/bin/env python3
"""Focused no-network contract tests for the canonical Step01 hq_full entrypoint."""

import hashlib
import importlib.util
import json
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace


PROJECT = Path(__file__).resolve().parent
ENTRYPOINT = PROJECT / "bridge" / "mac-employee-training" / "execute_step01_hq_full.py"
STEP01 = Path(r"C:\Users\lsb\.codex\skills\mx-shortdrama-01-frame-extract")
STEP02 = Path(r"C:\Users\lsb\.codex\skills\mx-shortdrama-02-source-timeline")


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_entrypoint():
    spec = importlib.util.spec_from_file_location("execute_step01_hq_full", ENTRYPOINT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(root, module):
    workspace = root / "workspace"
    source = workspace / "input" / "source" / "synthetic-source.mp4"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"synthetic command-plan source; not user media")
    source_sha = sha256(source.read_bytes())
    rights = {
        "schema_version": module.RIGHTS_SCHEMA,
        "event_id": "rights-focused-plan-0001",
        "status": "confirmed",
        "revoked": False,
        "source_sha256": source_sha,
        "source_bytes": source.stat().st_size,
        "scope": "source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates",
    }
    rights_path = workspace / "input" / "authority" / "rights_authority.json"
    write_json(rights_path, rights)
    rights_bytes = rights_path.read_bytes()
    authority = {
        "schema_version": module.AUTHORITY_SCHEMA,
        "status": "authorized",
        "authorization_event_id": "step01-auth-focused-plan-0001",
        "source_sha256": source_sha,
        "settings_version": 2,
        "allowed_services": [{"service_id": "mimo_asr"}, {"service_id": "paddle_ocr"}],
        "media_provider_authority_granted": False,
        "media_provider_submit_requested": False,
        "media_provider_upload_requested": False,
        "spend_requested": False,
    }
    authority_path = workspace / "input" / "analysis_service_network_authority.json"
    write_json(authority_path, authority)
    dispatch = {
        "schema_version": module.DISPATCH_SCHEMA,
        "execution_mode": "step01_hq_full_authorized_analysis_only",
        "dispatch_id": "STEP01EMP-FOCUSED-PLAN-0001",
        "local_job_id": "web_nn-focused-plan-0001",
        "remote_project_id": "NN-FOCUSED-PLAN-0001",
        "source_sha256": source_sha,
        "source_bytes": source.stat().st_size,
        "authorization_event_id": authority["authorization_event_id"],
        "settings_version": 2,
        "rights_authority": {
            "event_id": rights["event_id"],
            "sha256": sha256(rights_bytes),
            "bytes": len(rights_bytes),
            "scope": rights["scope"],
            "status": "confirmed",
            "revoked": False,
        },
        "phase_key": {
            "key_id": "step01phase-focused-plan-0001",
            "source_sha256": source_sha,
            "rights_authority_event_id": rights["event_id"],
            "rights_authority_sha256": sha256(rights_bytes),
        },
        "portable": {"rights_authority": "input/authority/rights_authority.json"},
        "test_only": False,
        "real_delivery": False,
        **{field: False for field in module.SIDE_EFFECT_FALSE_FIELDS},
    }
    dispatch_path = workspace / "step01_employee_dispatch.json"
    write_json(dispatch_path, dispatch)
    args = SimpleNamespace(
        dispatch=dispatch_path,
        workspace=workspace,
        source=source,
        output=workspace / "evidence",
        authority=authority_path,
        episode_id="EPFOCUSED",
        step01_skill_root=STEP01,
        step02_skill_root=STEP02,
        timeout_seconds=10,
        plan_only=True,
        test_mode=True,
    )
    return args, dispatch


def main():
    module = load_entrypoint()
    with tempfile.TemporaryDirectory(prefix="step01-hq-entrypoint-") as temp:
        root = Path(temp)
        args, dispatch = fixture(root, module)
        os.environ.pop("MX_STEP01_TEST_MODE", None)
        try:
            module.execute(args)
            raise AssertionError("expected explicit test environment gate")
        except RuntimeError as exc:
            assert str(exc) == "STEP01_HQ_TEST_MODE_EXECUTION_FORBIDDEN"
        os.environ["MX_STEP01_TEST_MODE"] = "1"
        result = module.execute(args)
        assert result["status"] == "plan_only"
        plan = result["commands"]
        assert tuple(item["name"] for item in plan) == module.COMMAND_ORDER
        assert all(item["script_sha256"] == module.SCRIPT_SHA256[Path(item["command"][1]).name] for item in plan)
        encoded_plan = json.dumps(plan, ensure_ascii=False)
        for forbidden in ("--mimo-api-key", "--mimo-key-file", "--paddle-api-token", "synthetic-secret-value"):
            assert forbidden not in encoded_plan
        assert [item["analysis_service_network"] for item in plan] == [True, False, False, True, False, False]
        assert all(item["media_provider_network_requested"] is False for item in plan)
        assert "--asr-backend" in plan[0]["command"] and "mimo" in plan[0]["command"]
        assert "--asr-fallback" in plan[0]["command"] and "none" in plan[0]["command"]
        assert "Qwen/Qwen3-ForcedAligner-0.6B" in plan[0]["command"]
        assert "--unbounded" in plan[1]["command"] and "60" in plan[1]["command"]
        assert "--skip-ocr" in plan[2]["command"]
        assert "paddle-api" in plan[3]["command"]
        assert "--require-source-ffprobe" in plan[4]["command"] and "--require-audio-ledger" in plan[4]["command"]
        assert "--manifest" in plan[5]["command"]
        assert plan[0]["required_dependency_sha256"]["qwen3_forced_aligner_worker.py"] == module.SCRIPT_SHA256["qwen3_forced_aligner_worker.py"]
        args.test_mode = False
        try:
            module.execute(args)
            raise AssertionError("expected production Skill root override rejection")
        except RuntimeError as exc:
            assert str(exc) == "STEP01_HQ_PRODUCTION_SKILL_ROOT_OVERRIDE_FORBIDDEN"
        args.test_mode = True

        calls = []
        def fake_runner(command, **options):
            calls.append((command, options))
            return SimpleNamespace(returncode=0)
        completed = module.execute_commands(plan, runner=fake_runner, environment={"MIMO_API_KEY": "synthetic-secret-value", "PADDLEOCR_API_TOKEN": "synthetic-secret-value"}, timeout_seconds=10)
        assert tuple(completed) == module.COMMAND_ORDER
        assert len(calls) == 6
        assert all("synthetic-secret-value" not in json.dumps(command) for command, _ in calls)
        assert all(options["stdout"] is not None and options["stderr"] is not None for _, options in calls)

        failed_calls = []
        def failing_runner(command, **_options):
            failed_calls.append(command)
            return SimpleNamespace(
                returncode=9 if len(failed_calls) == 3 else 0,
                stdout="tool output api_key=sk-fixturecredential123456",
                stderr="token echoed synthetic-secret-value",
            )
        try:
            module.execute_commands(
                plan,
                runner=failing_runner,
                environment={"PADDLEOCR_API_TOKEN": "synthetic-secret-value"},
                timeout_seconds=10,
            )
            raise AssertionError("expected fail-closed command runner")
        except RuntimeError as exc:
            failure = str(exc)
            assert failure.startswith("STEP01_HQ_TOOL_FAILED:accepted_transnet_pack:9:")
            assert "fixturecredential" not in failure
            assert "synthetic-secret-value" not in failure
            assert failure.count("[REDACTED") >= 2
        redacted = module.redact_tool_diagnostic("api_key=sk-fixturecredential123456 stderr marker")
        assert "fixturecredential" not in redacted and "[REDACTED" in redacted
        assert len(failed_calls) == 3

        original = args.source.read_bytes()
        args.source.write_bytes(original + b"tamper")
        try:
            module.validate_inputs(args.dispatch, args.workspace, args.source, args.authority)
            raise AssertionError("expected exact source SHA rejection")
        except RuntimeError as exc:
            assert str(exc) == "STEP01_HQ_SOURCE_AUTHORITY_MISMATCH"
        args.source.write_bytes(original)

        dispatch["test_only"] = True
        write_json(args.dispatch, dispatch)
        try:
            module.validate_inputs(args.dispatch, args.workspace, args.source, args.authority)
            raise AssertionError("expected test-only rejection")
        except RuntimeError as exc:
            assert str(exc) == "STEP01_HQ_PRODUCTION_BOUNDARY_INVALID"

        contract_path = PROJECT / "bridge" / "mac-employee-training" / "step01_hq_full_toolchain_contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        assert contract["status"] == "blocked_install_pending"
        assert contract["execution_authority_granted"] is False
        assert contract["entrypoint"]["sha256"] == sha256(ENTRYPOINT.read_bytes())
        assert contract["entrypoint"]["argv_template"] == [
            "--dispatch", "{{dispatch}}", "--workspace", "{{workspace}}", "--source", "{{source}}",
            "--output", "{{output}}", "--authority", "{{authority}}", "--toolchain-context", "{{toolchain_context}}",
            "--episode-id", "{{episode_id}}",
        ]
        contract_scripts = {Path(item["exact_path"]).name: item["sha256"] for item in contract["skill_files"].values()}
        assert contract_scripts == module.SCRIPT_SHA256
        bundle_root = PROJECT / "bridge" / "mac-skill-bundles" / "niannian-mac-production-skills-v2"
        for field in ("archive", "manifest", "sensitive_scan"):
            item = contract["bundle_v2"][field]
            assert item["sha256"] == sha256((PROJECT / item["project_relative_path"]).read_bytes())
        assert contract["bundle_v2"]["skill_file_count"] == 127
        assert contract["bundle_v2"]["skill_count"] == 13
        assert contract["focused_test"]["sha256"] == sha256(Path(__file__).read_bytes())
        assert all(item["status"] == "missing" for item in contract["acceptance_gates"].values())
        assert contract["acceptance_gates"]["fixed_employee_v2_adoption"]["completed"] == 0
        assert contract["acceptance_gates"]["fresh_hq_full_gate_receipt"]["ready"] is False
        assert contract["real_delivery"] is False

        context_path = args.workspace / "input" / "authority" / "toolchain_runtime_context.json"
        script_paths = {
            "build_audio_evidence": module.STEP01_SKILL_ROOT / "scripts" / "build_audio_evidence.py",
            "qwen3_forced_aligner_worker": module.STEP01_SKILL_ROOT / "scripts" / "qwen3_forced_aligner_worker.py",
            "extract_episode_frames": module.STEP01_SKILL_ROOT / "scripts" / "extract_episode_frames.py",
            "enhance_episode_evidence": module.STEP01_SKILL_ROOT / "scripts" / "enhance_episode_evidence.py",
            "smart_selective_ocr": module.STEP02_SKILL_ROOT / "scripts" / "smart_selective_ocr.py",
            "validate_episode_evidence": module.STEP01_SKILL_ROOT / "scripts" / "validate_episode_evidence.py",
            "finalize_step01_evidence": module.STEP01_SKILL_ROOT / "scripts" / "finalize_step01_evidence.py",
        }
        context = {
            "schema_version": module.TOOLCHAIN_CONTEXT_SCHEMA,
            "dispatch_id": dispatch["dispatch_id"],
            "phase_key": dispatch["phase_key"]["key_id"],
            "source_sha256": dispatch["source_sha256"],
            "source_bytes": dispatch["source_bytes"],
            "settings_version": dispatch["settings_version"],
            "toolchain_contract_sha256": sha256(b"contract"),
            "entrypoint_sha256": sha256(ENTRYPOINT.read_bytes()),
            "toolchain_candidate_sha256": sha256(b"candidate"),
            "bundle": dict(module.EXPECTED_BUNDLE),
            "receipts": {
                "install_sha256": sha256(b"install"),
                "parity_sha256": sha256(b"parity"),
                "adoption_manifest_sha256": sha256(b"adoption"),
                "hq_gate_sha256": sha256(b"hq"),
            },
            "skill_files": {key: {"exact_path": str(value), "sha256": module.SCRIPT_SHA256[value.name]} for key, value in script_paths.items()},
            "analysis_service_network": {"allowed_services": ["mimo_asr", "paddle_ocr"], "media_provider_authority_granted": False},
            **{field: False for field in module.SIDE_EFFECT_FALSE_FIELDS},
            "real_delivery": False,
        }
        write_json(context_path, context)
        context_readback, context_evidence = module.validate_toolchain_context(args.workspace, context_path, dispatch)
        assert context_readback["toolchain_candidate_sha256"] == context["toolchain_candidate_sha256"]
        assert context_evidence["sha256"] == sha256(context_path.read_bytes())
        context["package_send_requested"] = True
        write_json(context_path, context)
        try:
            module.validate_toolchain_context(args.workspace, context_path, dispatch)
            raise AssertionError("expected immutable context side-effect rejection")
        except RuntimeError as exc:
            assert str(exc) == "STEP01_HQ_TOOLCHAIN_CONTEXT_SIDE_EFFECT_INVALID:package_send_requested"
        os.environ.pop("MX_STEP01_TEST_MODE", None)

    print(json.dumps({
        "ok": True,
        "verified": [
            "exact six-command hq_full order",
            "all six invoked Skill scripts plus ForcedAligner worker exact SHA checked before execution",
            "Mimo text to Qwen3 ForcedAligner with no ASR fallback",
            "unbounded 60-second audio-guided frames then TransNet then Paddle then strict validate then finalize",
            "credentials child-environment-only and absent from argv/plan",
            "fake runner stops on first nonzero and never reaches downstream commands",
            "source/rights/analysis/phase binding fail closed",
            "test_only rejected and cannot become verified",
            "candidate contract exact entrypoint, seven scripts, v2 release, 127/13 inventory bound",
            "Mac install/parity/five-adoption/fresh-HQ gates truthfully missing and execution blocked",
            "immutable JS-to-Python context binds dispatch, seven scripts, v2 release, receipts, and false side effects",
            "media generation upload/submit/spend/deploy/local edit all false",
            "no user media, model, network, App turn, or Provider used",
        ],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
