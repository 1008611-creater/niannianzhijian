# Mac Employee Training Runbook

This runbook trains the Mac relay before it receives a real user job. It does not authorize provider submission, package/send, source replacement, or a production delivery.

## Controlled Source Sync

The current Mac SSH key is forced-command only. Do not widen that key or add an arbitrary file-copy command. A Mac operator updates the existing canonical checkout through the established private source-sync process, then verifies these files match the canonical source before invoking the gateway:

- `bridge/niannian_runtime_capability_status.js`
- `bridge/niannian_employee_preflight.js`
- `bridge/niannian_mac_worker_relay.js`
- `bridge/mac_relay_ssh_gateway.sh`
- `bridge/runtime_profiles.json`
- `bridge/skill_registry.json`

The active gateway must still expose only `status`, `prepare <exact-job-id>`, and `execute-once <exact-job-id>`.

## Capability Training

On the Mac, run the read-only audit from the canonical checkout:

```bash
node bridge/niannian_runtime_capability_status.js \
  --profile mac-step01-strict-evidence-v1
```

It is expected to report `ready:false` until every required capability has a fresh, redacted verification record. The status file is:

```text
~/.config/ai-brain/runtime_capability_status.json
```

For a capability to be `ready`, its status entry must contain a fresh `checked_at` and safe evidence with only `method` and `summary`. Credential entries also require a future `expires_at`. Never put a password, Cookie, token, private key, browser export, endpoint response body, or source material in this file.

## Gateway Training Sequence

1. From Windows, call `Invoke-AiBrainMacRelay.ps1 -Action Status`; confirm the gateway returns `shell:false`, `lock:idle`, and a capability audit.
2. Create a synthetic exact job with provider/package/send gates blocked; call `-Action Prepare -JobId <exact-job-id>`.
3. Confirm the return is `prepared_no_worker_started`, the transport source SHA matches, and no Codex process or provider request was created.
4. Run contract-negative fixtures: wrong job ID, stale source hash, missing authorization, expired capability, duplicate execute, and receipt mismatch. Each must return a typed block or rejection.
5. Only after the strict profile reads `ready:true`, run one explicit low-risk `execute-once` synthetic fixture. Verify a new isolated thread ID, expected artifacts, receipt, and return manifest.
6. Only after the synthetic fixture and a real no-provider Step01 analysis pass may a real user video be used. Provider gates remain blocked at this point.

## Earliest Stop Conditions

- Capability audit unavailable or any required capability not ready: `blocked_resource`.
- Job/version/source/authorization mismatch: `blocked_contract`.
- Missing receipt or worker timeout: `infra_failed`.
- Any provider/package/send request during training: reject receipt and stop.

## Current Handoff

The canonical source contains the training contract. The live Mac gateway currently reports only the older status payload, so controlled source sync is required before this runbook can advance to `prepare`.
