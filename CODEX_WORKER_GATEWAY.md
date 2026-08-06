# Codex Worker Gateway

## Purpose

The local gateway turns a validated website redraw project or a verified novel/script project into one isolated Codex worker session. The browser never sends arbitrary prompts directly to Codex and never receives Codex credentials.

## Operating Path

1. The website stores the source upload, job contract, preflight evidence, quality gates, and owner-bound project record.
2. Source-video redraw uses `niannian_controller_bridge.js` to claim an authorized website task and materialize a local `direct_jobs/web_nn-*` directory after verifying the downloaded source SHA-256. Script-only project creation automatically materializes `direct_jobs/web_ns-*` from already verified extracted text; it records a `source_script` contract and does not create a video task. `POST /api/script-projects/:id/adaptation-jobs` is the owner-bound retry/reconciliation action if automatic task materialization is blocked.
3. `niannian_codex_worker_dispatcher.js` reads the production index and validates the local task contract before dispatching.
4. The dispatcher requires the root router and the controller-declared current executor to be in the local allowlist. A new redraw job uses `mx-shortdrama-00-router` plus `mx-shortdrama-01-frame-extract`; an N01 script job uses `mx-shortdrama-00-router` plus `mx-shortdrama-script-only-production`. The controller records the advisory `route_decision.json`, while provider and package authorization constraints and the blocked provider gate remain mandatory.
5. In `execute` mode it starts `codex -a never exec --ephemeral` from that job directory. This creates a fresh independent Codex thread for the dispatch instead of resuming a prior session that happened to use the same job directory; its returned thread ID remains in the dispatch audit record.
6. The worker must write `employee_worker_receipt.json`. The dispatcher refuses to treat process exit or a chat response as completion without this receipt and matching `status.json` state.
7. The existing controller bridge reads `employee_dispatch.json`, carries the worker summary back to the website, and exposes it as `project.runtime.worker`.

## Worker Contract

The worker may only use the exact source path and SHA-256 declared by `task.json`: `source_video` for redraw, `source_script` for novel/script production. It must start with the `required_router`, may only use allowlisted routes, and must not submit a provider, package, send, or promote an accepted registry entry. A script worker must not fabricate source-video Step01/Step02 observations; N01 facts require source citations. Those actions remain behind the existing cost and QA gates.

The required worker receipt contains the job and dispatch IDs, production status, worker status, current node, next skill, next action, and explicit `false` values for provider submission and package/send requests.

## Runtime Modes

`queue` is the default safe mode. It creates an auditable dispatch packet and prompt but does not invoke a model.

`execute` starts a dedicated Codex CLI worker session for each eligible job:

```powershell
.\bridge\run_codex_worker_dispatcher.ps1 -Watch -Mode execute
```

The optional `install_codex_worker_dispatcher_task.ps1` can register the worker as a Windows logon task. It is deliberately not invoked by the project source or tests. Run it only after local acceptance and only with the desired `queue` or `execute` mode.

## Recovery

Missing, mismatched, unsafe, or unmirrored worker receipts become `blocked_contract`; the dispatcher writes a clear blocker into the job status, checkpoint, and gate dashboard. A finished worker process alone is never accepted as a completed production result. If a Windows wrapper exits before its already-started Codex child flushes the receipt, the dispatcher may recover only `RECEIPT_MISSING` after the exact job/dispatch IDs, mirrored status, and blocked provider gate are revalidated; all other blocked states remain terminal.

## Boundaries

- The website remains local until explicit deployment acceptance.
- Codex auth stays with the local Codex CLI profile and is not copied into the website, task contract, browser, logs, or worker prompt.
- External image/video provider calls, package/send, and user-visible acceptance are not enabled by this gateway.

## Mac Pull Relay

The Windows website can delegate one isolated job to a Mac Codex worker without exposing a Mac listener or copying the website bridge token. The relay is deliberately pull-based:

1. Mac authenticates to Windows only through the preconfigured Tailscale SSH public-key route.
2. Mac invokes `bridge/niannian_mac_relay_gateway.js claim-export` through the existing Windows SSH session. The gateway process runs on Windows, uses the existing local bridge token only against `http://127.0.0.1:4188`, materializes at most one job, and exports a hash manifest plus an allowlisted job contract into `%USERPROFILE%\\ai-brain-relay\\jobs\\<job-id>`.
3. Mac pulls that package, verifies every entry and the source SHA-256, and changes only the selected local source field: `task.json.source_video.exact_path` for redraw or `task.json.source_script.exact_path` for script-only work. The transport manifest records `source_kind`.
4. Mac's existing platform-aware dispatcher invokes native `codex` only with the explicit `--execute` relay flag. The default relay action creates the auditable `queue` dispatch and does not invoke Codex.
5. After a valid worker receipt exists, Mac returns only the allowlisted status, gate, ledger, report, dispatch, and receipt records with a second hash manifest. Windows verifies them before writing them into the Windows job and synchronizing the website status.

Mac preparation command, after the vetted source tree is present on Mac:

```bash
cd /Users/lsb/AI-Brain/niannian-ai-canonical-local
node bridge/niannian_mac_worker_relay.js --windows-host 100.125.247.33 --windows-user lsb --key-path "$HOME/.ssh/<the-existing-matching-key>"
```

The preparation command does not start Codex, submit a provider, upload an artifact package, or send a Mac-worker update back to the website. The Windows controller may still mirror its normal `prepared` intake state while it claims the job. The exported job remains pending until it is either resumed with explicit execution or investigated. Starting the isolated Mac Codex worker is a separate action:

```bash
node bridge/niannian_mac_worker_relay.js --execute --windows-host 100.125.247.33 --windows-user lsb --key-path "$HOME/.ssh/<the-existing-matching-key>"
```

For a script-only job, the Windows relay gateway must point at the shared production workspace before the Mac preparation command can discover a `web_ns-*` task:

```powershell
$env:NIANNIAN_MAC_RELAY_WORKSPACE = 'D:/codex-work/zhuanhui'
```

The required Mac connection fields remain `NIANNIAN_WINDOWS_TAILSCALE_HOST`, `NIANNIAN_WINDOWS_SSH_USER`, and `NIANNIAN_WINDOWS_SSH_KEY_PATH` (or their explicit command-line equivalents). Without all three, the correct durable state is `SCRIPT_ADAPTATION_RELAY_CONFIGURATION_MISSING`; do not guess hosts, users, or key paths.

The explicit execution command still rejects provider submission, package/send, and user-visible acceptance. It sends no source material or credential to any external provider. It waits for the worker's locally written receipt, reconciles it, and returns only the manifest allowlist to Windows.

## Typed-block recovery for one relay job

An old employee attempt with a missing skill, invalid receipt, or a generic `blocked` receipt is historical evidence, not a valid current dispatch. Do not widen receipt validation to accept generic `blocked`: the supported recovery status is a typed value such as `blocked_contract`.

To prepare one exact job for a later, separately authorized Mac worker execution, run on Windows:

```powershell
node bridge/niannian_mac_relay_gateway.js recover-export web_nn-<job-id>
```

`recover-export` is preparation only. It does not invoke Codex, a provider, deployment, package/send, or user-visible acceptance. It archives the prior Windows controller attempt under the job-specific `recovery_history` directory, rebuilds the same source-verified job as `prepared`, archives the prior transport export instead of deleting it, and creates one exact pending export for the requested job ID. A later Mac `--execute --job-id <same-id>` remains separately authorized.

When a new transport package reaches Mac, `niannian_mac_worker_relay.js` archives the prior local attempt under `06_AUTOMATION/attempt_history/<job-id>/` before it pulls the new package; it no longer silently removes the old receipt/log evidence.

## Optional restricted Windows-to-Mac trigger

The default and safest route remains Mac pull. When the owner explicitly enables reverse control, the project also contains a deliberately narrow Windows-to-Mac trigger:

- `bridge/install_mac_relay_ssh_gateway.sh` installs one forced-command SSH key on Mac, binds the Mac OpenSSH listener to its Tailscale IPv4 address only, and allows only the Windows Tailscale IPv4 source.
- `bridge/mac_relay_ssh_gateway.sh` accepts exactly `ai-brain-relay status` or `ai-brain-relay execute-once <web_nn-*|web_ns-*>`. Any other remote command is rejected, the job ID is passed to the Windows claim gateway as an exact selection, and `execute-once` has a single-instance lock.
- `bridge/Invoke-AiBrainMacRelay.ps1` is the Windows caller. It pins the Mac Tailscale IP and user, disables password and forwarding paths, and uses a dedicated key at `%USERPROFILE%\.ssh\ai_brain_windows_to_mac_relay` with a separate known-hosts file.

The installer validates the existing SSH policy before changing it, backs up `sshd_config`, checks `sshd -t`, and restores the backup if the protected listener cannot be verified. It must be run on Mac by its normal login user and intentionally pauses for the owner’s macOS administrator confirmation. The relay still does not allow provider submission, deployment, package/send, or user-visible acceptance without their separate authorizations.

Relay tests are offline and do not use SSH, Codex, a website token, or any provider:

```bash
npm run test:mac-relay-gateway
npm run test:mac-relay-worker
```

## Daily cross-device state sync

Do not use long handoff prompts as the normal control plane. Windows can run the status-only sync script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File bridge\Sync-AiBrainCrossDeviceRelayState.ps1
```

It performs only the forced-command `ai-brain-relay status` call, validates `shell:false`, records the pending exact export if one exists, and atomically writes `%USERPROFILE%\ai-brain-share\cross_device_relay_state.json`. It never invokes `recover-export`, `claim-export`, `execute-once`, a worker, a provider, deployment, package/send, or user-visible acceptance.

The state file has three transition intents: `status`, `prepare`, and `execute_once`. `execute_once` always requires an exact job ID and a new explicit user authorization; a historical/pending export is not an authorization to run it.
