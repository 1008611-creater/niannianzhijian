# Post-Coding Review

Date: 2026-07-11
Scope: 念念 AI 公网任务队列、本地控制器桥接、状态回写、UI 投影与生产部署

## Requested Outcome

公网用户上传源视频后，任务必须被授权的本地控制器安全领取并物化为正式 direct job，随后把本地状态、质量门、产物计数和心跳回写到公网 UI；未授权时不得提交 provider、打包发送或提升 accepted registry。

## Correct Operating Path

1. 用户注册并通过 multipart 创建公网项目。
2. 服务端持久化项目、上传文件、SHA-256 和任务合同。
3. 本地桥接使用控制器 Token 领取租约并下载源视频。
4. 桥接校验 SHA-256，创建 `web_<remote_job_id>` direct job，并更新 `production_jobs.index.json`。
5. 桥接读取 `status/checkpoint/gate_dashboard/artifact_ledger`，回写生产状态、质量门、产物和心跳。
6. 公网 UI 投影 Step01、Step02、Step04、Step05 及阻塞状态。
7. 只有显式受控状态才能进入 accepted/packaged/sent/user-visible acceptance；旧式 `completed` 只进入 `qa_running`。
8. `NianNianAi-SshForward`、`NianNianAi-Cloudflared` 和 `NianNianAIControllerBridge` 持续运行。

## Files Reviewed

- `server.js`
- `index.html`
- `mvp.js`
- `product.css`
- `package.json`
- `test_controller_flow.js`
- `bridge/niannian_controller_bridge.js`
- `bridge/run_bridge.ps1`
- `bridge/install_bridge_task.ps1`
- `bridge/transaction_intent.json`

The project is under an ignored `outputs` path, so Git did not provide a tracked diff. Review therefore inspected the actual files, syntax, runtime behavior, deployment hashes, scheduled-task actions, and live endpoints.

## Verified Evidence

- Remote runtime: Node `v12.22.9`.
- Node 12 compatibility: no optional chaining or nullish coalescing remains in `server.js`.
- Syntax checks: all changed JavaScript and PowerShell entrypoints passed.
- JSON parsing: `package.json` and `bridge/transaction_intent.json` passed.
- Integration test: `npm run test:controller` passed with auth, lease, source hash, durable contract, production index, status writeback, pipeline projection, heartbeat, and legacy completion guard.
- Live E2E project `NN-20260710220511-A3A081`: registered a disposable user, uploaded 2,350,221 bytes, reached `prepared`, verified the local source hash, then reached public `running_step02` with Step02 shown as running.
- The live test confirmed provider submit and package/send remained authorization-blocked.
- Live test cleanup: remote project, user, session, upload, job contract, local direct job, bridge state, and production-index entry were removed; controller queue returned zero jobs.
- Public endpoint and assets: `/`, `/mvp.js`, `/product.css`, and `/api/health` returned HTTP 200.
- Deployment hash parity:
  - `server.js`: `cdbd827cdb1b2b8037d3b14435f1118240bf4c5705cbbdb49444cf81358d8acd`
  - `index.html`: `46b0f841827e123c9fce662c39aa68ce756793f2c53e09d32f55ebb819ce7c1d`
  - `mvp.js`: `40310d7f5cb34f3a3940a724385a1e4fb1b2981afee46109a45dff551a16531b`
  - `product.css`: `5b580e01082f0d96de5d92ad2b0f5c5807c493f701cb9e900a60437dc6c32810`
- Scheduled tasks currently report `Running`: `NianNianAi-SshForward`, `NianNianAi-Cloudflared`, and `NianNianAIControllerBridge`.

## Review Findings

- Fixed production outage: the Cloudflare-managed tunnel expects local origin `127.0.0.1:28083`; the matching SSH forward task was not running. The forward and tunnel tasks now run together and public health is restored.
- Fixed premature completion risk: local legacy status `completed` now maps to `qa_running`, not `accepted`.
- Fixed stale bridge metadata: an empty controller queue now clears `last_remote_job_id` instead of retaining a deleted task reference.
- No bridge code launches child processes, provider submissions, packaging, sending, or accepted-registry promotion.
- The bridge intentionally stops at a prepared controller intake until a formal employee thread or System A controller is assigned.

## Not Verified

- No real image/video provider submission, Step05 production, packaging, sending, or accepted-registry promotion was performed; these remain intentionally blocked.
- Persistence was verified from scheduled-task definitions and current running state, but the machine was not rebooted solely for this review.
- Public assets and live status projection were verified; a new cross-device visual screenshot pass was not repeated after the final completion-guard-only change.

---

## Local Baseline Iteration Review

Date: 2026-07-11  
Scope: Isolated local working copy of the deployed `ai.cauai.fun` source; public responsive UI and local empty-session cleanup only.

### Requested Outcome

Use the actual deployed source as a local, reversible base, remove the public mobile layout failure, and keep the existing API, upload, controller, and deployment paths intact.

### Correct Operating Path

1. Start the copied Node service with its own `DATA_DIR` and a non-production port.
2. Serve the existing public HTML, CSS, JavaScript, and API contract from that isolated directory.
3. Render the homepage and project page at desktop and mobile viewports.
4. Keep unauthenticated session discovery as an ordinary empty state; reserve `401` for protected operations.
5. Verify navigation, the mobile menu, public assets, health, and the controller test without writing to the Cloudflare deployment.

### Files Changed

- `index.html`: added a mobile navigation control, local favicon reference, and cache-safe stylesheet/script URLs.
- `styles.css`: removed desktop-only minimum-width constraints, added responsive mobile header/menu behavior, and kept the hero content within the viewport.
- `app.js`: added accessible mobile menu open/close behavior and Escape/resize handling.
- `server.js`: returns `{ "user": null }` for an unauthenticated session lookup and serves SVG assets.
- `favicon.svg`: new local vector favicon.
- `PROJECT_MANIFEST.json` and `DESIGN.md`: source-of-truth, local-boundary, and verification records.

### Changed-File Review

- The visual changes are limited to the public header, hero width, footer width, and mobile navigation. They do not modify project contracts, upload routes, bridge authorization, controller leases, or deployment files.
- The session route still returns `401` for protected project operations. Only `GET /api/auth/session` changed to represent the normal signed-out state without generating a browser console error.
- The favicon is a new SVG source asset, not a modified raster image.
- The previous live bridge events, deployment data, uploads, and credentials were excluded from the local copy.

### Verification

- `node --check app.js`, `server.js`, `mvp.js`, and `bridge/niannian_controller_bridge.js` passed.
- `package.json`, `PROJECT_MANIFEST.json`, and `bridge/transaction_intent.json` parsed successfully.
- `npm audit --omit=dev` reported zero vulnerabilities.
- Local service is reachable at `http://localhost:4188`; `/`, `/api/health`, `/api/auth/session`, and `/favicon.svg` returned HTTP `200`.
- `npm run test:controller` passed. It used a temporary data root and verified auth, lease claim, source hash, durable job contract, production index, status writeback, pipeline projection, heartbeat, and the legacy completion guard.
- Playwright desktop `1440x900` and mobile `390x844` screenshots were captured. Homepage and project page `scrollWidth` equaled `clientWidth` on mobile. The mobile menu opened, `项目管理` navigated to `#projects`, and the menu closed. Browser console ended with zero errors and zero warnings.

### Remaining Limits

- No write or deployment was made to `https://ai.cauai.fun`.
- No real user registration, upload, provider submission, bridge execution against the live controller, or production task delivery was performed in this local copy.
- The remaining public-page visual differences, SEO, accessibility audit, performance work, and deployment acceptance remain future work rather than completed claims.

---

## Workbench And Guide Iteration Review

Date: 2026-07-11  
Scope: Local-only workbench, creative guide, team view, header navigation, and responsive presentation.

### Requested Outcome

Restore the workspace-level pages missing from the local copy: a usable `工作台`, an interactive `创作指引`, and the six-route header shown in the supplied reference screenshot. The implementation must reuse the existing project API and local data boundary rather than create a separate mock application.

### Correct Operating Path

1. The header routes a user to `#workbench`, `#guide`, or `#team` through the existing single-page navigation.
2. Session and project data load from the copied service and its `data-local` directory.
3. Workbench selects a real local project and projects its stored route, pipeline, task contract, runtime state, quality gates, artifacts, and heartbeat. When there is no project, it exposes the actual creation flow instead of fake production data.
4. Guide switching updates the focused stage from the same redraw process: Step01, Step02, Step04, Step05, and QA.
5. Team view shows only the current local owner and declares the local-only collaboration boundary.

### Files Changed

- `index.html`: added the three route panels and six-route header; cache-busted the rebuilt `mvp.js` asset.
- `mvp.js`: added local-data rendering and delegated interaction for workbench, guide, and team views.
- `product.css`: added responsive layouts for the three views.
- `DESIGN.md`, `PROJECT_MANIFEST.json`: recorded the product contract, boundaries, and validation.

### Changed-File Review

- Workbench does not create, alter, or submit a project merely by rendering. Its no-project state remains a call to the existing project wizard.
- The project data comes from the existing `/api/projects` contract and is escaped before dynamic HTML insertion.
- Guide content is deterministic process guidance and has no provider, credit, upload, or controller side effect.
- Team management does not fabricate members or production permissions. It only renders the local session owner after authentication.
- The updated script query string avoids clients retaining a cached pre-workbench `mvp.js` payload.

### Verification

- `node --check mvp.js`, `app.js`, and `server.js` passed.
- Local `GET /api/health` returned HTTP `200`.
- In the browser, the six header routes were present. `#workbench` displayed the truthful no-project state for the local test account.
- With the signed-in local test account, the workbench `创建转绘项目` action opened the existing wizard and did not open the login modal.
- All five guide controls updated the active label and focus heading in sequence: `证据整理`, `干净时间轴`, `视觉与提示词`, `资产准备`, and `质量与交付`.
- `团队管理` displayed the local owner and `查看项目管理` routed to `#projects`.
- Browser development logs were empty on the fresh local verification tab.

### Not Verified

- No real source video was uploaded and no project, provider task, controller claim, package, delivery, or production artifact was created in this iteration.
- The latest three view layouts were checked in the current desktop browser. A fresh automated mobile viewport capture after this iteration was not available in the in-app browser runtime and remains a follow-up validation item.
- No deployment was made to `https://ai.cauai.fun`.

---

## Reference Workbench Deck Review

Date: 2026-07-11  
Scope: Local-only correction of the visual and information-architecture mismatch between `工作台` and `https://video.jurilu.com/ai_tools`, plus the responsive verification of `创作指引`.

### Requested Outcome

Make the local workbench look and behave like the reference workbench entry surface, while preserving truthful local project state and the existing project-creation workflow.

### Correct Operating Path

1. Render a desktop and mobile tool-deck with two primary creation concepts, project status, and explicitly unavailable future tools.
2. Route the one-click redraw action to the existing local wizard, never to a fabricated provider flow.
3. Render actual project count and selected-project state in My Works.
4. When a project exists, retain the downstream local pipeline projection below the deck.
5. Keep the creative guide as the five-stage redraw workflow and verify that switching a stage updates its focus content.

### Files Changed

- `index.html`: updated the workbench label and cache-safe `product.css` / `mvp.js` URLs.
- `mvp.js`: replaced the no-project workbench wall with a reusable tool-deck renderer; the actual redraw card opens the existing wizard, project status is derived from local state, and pipeline detail remains available for real projects.
- `product.css`: added the six-card desktop deck and a single-column mobile breakpoint so card text cannot collapse into vertical fragments.
- `DESIGN.md` and `PROJECT_MANIFEST.json`: recorded the deck contract and reference-specific validation.

### Changed-File Review

- The script-to-video, subtitle removal, HD conversion, and image-editing cards are non-interactive upcoming states. They do not suggest that providers, uploads, billing, or delivery are available.
- The only new production entry point is the existing project wizard opened by `一键转绘` and `我的作品` when there are no projects; no API request occurs until the user submits the wizard form.
- Project count, project name, and status are derived from `state.projects` and escaped before injection into the rendered card markup.
- Existing pipeline rendering is still selected from `/api/projects` data and remains below the deck only when a project actually exists.

### Verification

- `node --check mvp.js` and `node --check app.js` passed.
- `GET http://127.0.0.1:4188/api/health` returned HTTP `200`.
- `npm run test:controller` passed; it exercises authentication, job contracts, source hashes, pipeline projection, controller leases, heartbeats, status writeback, and the completion guard.
- Browser verification at desktop width rendered six workbench cards, including the real `一键转绘` entry and truthful zero-project My Works state.
- At `390x844`, workbench and guide both had `scrollWidth === clientWidth`; the initial three-column mobile regression was found, fixed, and rechecked as one card per row.
- The workbench `立即体验` button opened the existing `创建转绘项目` wizard; the wizard was then closed without submitting data.
- The guide's `02 干净时间轴` control updated both its active rail item and its focus heading.

### Not Verified

- No source video was uploaded, so the real-project workbench pipeline branch was not re-exercised in this visual correction.
- No script-to-video, subtitle removal, HD conversion, image editing, payment, provider submission, packaging, or delivery was implemented or tested.
- No online deployment or write to `https://ai.cauai.fun` was performed.

---

## Source Preflight Recovery Review

Date: 2026-07-11  
Scope: Local-only one-click-redraw source-video preflight failure, replacement, polling safety, and task-contract reset.

### Requested Outcome

An invalid source video must stop before Step01 and give the local user a real recovery path that can replace the file, rerun the local media check, and continue only after fresh evidence is written.

### Correct Operating Path

1. Upload a user-authorized source video to a local project.
2. Run `ffprobe` locally before controller claim or any provider submission.
3. On invalid media, persist a failed preflight, block Step01, and make the project ineligible for controller claim.
4. Allow recheck or source replacement only while that failure gate is active.
5. On replacement, reset the local source contract, stale probe state, runtime, dispatch lease, ledger, checkpoint, and dashboard; then run preflight against the replacement.
6. During a native file-selection dialog and while a replacement remains selected, project polling must not recreate the file input.
7. A passed preflight exposes the verified media facts and queues the project for the next local controller stage; it does not start an external provider, packaging, or delivery action.

### Files Reviewed

- `server.js`
- `mvp.js`
- `product.css`
- `index.html`
- `test_media_preflight.js`
- `DESIGN.md`
- `PROJECT_MANIFEST.json`

### Findings And Corrections

- The prior failed-state UI offered only a recheck. That cannot repair a genuinely unreadable file, so `POST /api/projects/:id/source` now accepts exactly one replacement file only when `source_preflight_failed` is active.
- Replacement rewrites the task contract and preflight artifacts before public project state is persisted; it removes the old upload only after the new state has been written. A replacement after passed preflight is rejected with `409`.
- A rerun is now likewise restricted to failed preflight. This prevents a project already eligible for controller intake from having its source evidence silently rewritten.
- The detail view originally polled every 15 seconds and could recreate a file input while its chooser was open. The UI now retains the detail view while selection is active or a file is attached, so the subsequent multipart request uses the selected file.
- Frontend asset versions were advanced so a normal page reload requests the updated JavaScript and stylesheet.

### Verification

- Syntax checks passed for `server.js`, `mvp.js`, `test_media_preflight.js`, and `test_controller_flow.js`.
- `npm run test:preflight` passed. It verifies valid media inspection, durable probe and ledger evidence, invalid-media Step01 blocking, controller-claim rejection for an invalid source, failed-only recheck, source replacement, contract reset, and the post-success replacement lock.
- `npm run test:controller` passed. It verifies authenticated lease claim, source hashing, durable contract materialization, production-index projection, heartbeat writeback, and the legacy completion guard.
- Browser verification on `http://127.0.0.1:4188` registered a local-only account, uploaded a deliberately unreadable local fixture, confirmed its blocked preflight state and recovery controls, held a valid replacement selection through a full polling interval, and submitted it successfully.
- The recovered project displayed `320 x 180 · h264`, `24 fps`, `1 条 · aac`, `1.2 秒`, two verified artifacts, a ready Step01 gate, and no recovery form.
- Browser console reported zero errors and zero warnings. The project detail had no horizontal overflow at both `390x844` and `1440x900`.

### Not Verified

- No external image/video provider request, controller claim for the recovered project, Step01 execution, packaging, sending, or user-visible acceptance was performed.
- Native chooser cancellation was guarded in source via focus recovery, but that cancel-only path was not separately automated.
- Nothing was deployed or written to `https://ai.cauai.fun`; all uploaded fixtures, project state, and the browser account remain in the local `data-local` boundary.

---

## Codex Worker Gateway Review

Date: 2026-07-11  
Scope: Local-only website-job dispatch to isolated Codex CLI workers, Skill-route locking, worker receipt validation, controller writeback, and workbench projection.

### Requested Outcome

Turn a validated website redraw project into an isolated Codex worker session that starts from the correct Skill router and continuously returns truthful progress to the website without exposing credentials or bypassing provider, packaging, delivery, or QA gates.

### Correct Operating Path

1. The website creates an owner-bound project, runs source-media preflight, and writes a task contract.
2. The authorized controller bridge claims the project, downloads the exact source, validates its SHA-256, and materializes one local direct job.
3. The Codex worker dispatcher selects only website-originated direct jobs, validates the job root, required router, source hash, cost constraints, and blocked provider gate.
4. It writes one worker dispatch packet and one locked worker prompt per local job. In `execute` mode it starts `codex -a never exec` from the isolated job directory, producing a distinct Codex session.
5. The worker must update the task state and write `employee_worker_receipt.json` with matching job/dispatch IDs and explicit false flags for provider and package/send requests.
6. The dispatcher accepts progress only when the receipt, `status.json`, and provider gate agree. Missing or unsafe receipts become `blocked_contract` rather than a false completion.
7. The controller bridge reads the worker dispatch summary and writes it to `project.runtime.worker`; the workbench renders worker state and thread ID.

### Files Reviewed

- `bridge/niannian_codex_worker_dispatcher.js`
- `bridge/run_codex_worker_dispatcher.ps1`
- `bridge/install_codex_worker_dispatcher_task.ps1`
- `bridge/niannian_controller_bridge.js`
- `server.js`
- `mvp.js`
- `product.css`
- `index.html`
- `test_codex_worker_dispatcher.js`
- `CODEX_WORKER_GATEWAY.md`
- `DESIGN.md`
- `PROJECT_MANIFEST.json`

### Findings And Corrections

- The previous bridge stopped after creating a prepared direct job; there was no isolated Codex employee ownership, route allowlist, receipt contract, or website worker projection.
- The dispatcher now validates local source integrity and the existing authorization boundary before it can launch any worker. It rejects roots outside `direct_jobs`, unallowlisted routers, missing cost constraints, open provider gates, and source hash mismatches.
- A real CLI probe caught the initial argument-order defect: Codex global approval policy belongs before `exec`. The dispatcher now invokes `codex -a never exec`, matching the verified CLI contract.
- Worker process exit and final chat text are intentionally insufficient. The dispatcher requires a matching receipt and status update, otherwise it blocks the task contract and records the reason in the status, checkpoint, and gate dashboard.
- A queued dispatch promoted to `execute` now updates its mode label before launch, so website state cannot falsely report it as queue-only while an employee is running.
- The dispatcher scripts and Windows task installer were added but not installed or started, preventing accidental model work against existing local or production jobs.

### Verification

- Syntax checks passed for the server, frontend, both bridge scripts, all three integration tests, and all worker PowerShell scripts. `package.json` and `PROJECT_MANIFEST.json` parsed successfully.
- `npm run test:preflight` passed: source evidence, invalid-media quality gating, controller rejection, failed-only recovery, source replacement, and post-success locking.
- `npm run test:controller` passed: authenticated lease claim, source hash, durable job materialization, production index, status writeback, pipeline projection, heartbeat, and completion guard.
- `npm run test:worker` passed: a temporary website job was materialized, first queued, promoted to execute, run through an isolated fake Codex process, assigned a thread ID, required to write a receipt, kept provider submission blocked, and synchronized back to `project.runtime.worker`.
- A real `codex -a never exec --ephemeral --json` smoke created an independent thread and returned the fixed no-op response. It did not read customer material, write a project, or call an image/video provider.
- Browser verification showed the new Codex worker state in the signed-in workbench. At `390x844`, `scrollWidth === clientWidth`; browser console had zero warnings and zero errors.
- Local `GET /api/health` still returned HTTP 200 after restarting the local service.

### Not Verified

- No real Codex worker was launched against a retained user project, so a model-produced Step01 artifact, Skill-router adherence in a live agent turn, and a real worker receipt remain unverified beyond the CLI smoke and isolated process test.
- No scheduled worker task was installed. The opt-in dispatcher defaults to `queue`; automatic model execution requires explicit local activation with `-Mode execute` after acceptance.
- No external image/video provider, package/send, acceptance registry, deployment, or write to `https://ai.cauai.fun` occurred.

---

## Codex Worker Windows Runtime Repair Review

Date: 2026-07-11  
Scope: Windows worker launch correctness, route-contract completeness, delayed-receipt recovery, and a real sandbox execution probe in the local-only runtime.

### Requested Outcome

Allow a website redraw task to enter one fresh, isolated Codex worker thread that can safely follow its declared Skill route, report truthful progress, and retain all existing provider, package/send, and acceptance gates.

### Correct Operating Path

1. The controller materializes the exact source and a task contract with an allowlisted root router, current executor, and advisory route decision.
2. The dispatcher verifies the job root, source SHA-256, route decision, cost constraints, and blocked provider gate.
3. On Windows, PowerShell receives only a job-local JSON argv file path and forwards that exact array to `codex -a never exec --ephemeral`.
4. The worker must update job-local state and write a matching receipt. The dispatcher validates the receipt before it exposes handoff progress to the website.
5. If a wrapper exits before a child flushes a receipt, only the exact `RECEIPT_MISSING` state may be recovered, and only after the normal receipt, status, and provider-gate checks succeed.
6. A real worker must be able to run its confined terminal tools under `workspace-write`; otherwise the truthful production status is an infrastructure blocker, not a completed Step01.

### Files Changed

- `bridge/run_codex_worker.ps1`
- `bridge/niannian_codex_worker_dispatcher.js`
- `bridge/niannian_controller_bridge.js`
- `test_codex_worker_dispatcher.js`
- `CODEX_WORKER_GATEWAY.md`
- `DESIGN.md`
- `PROJECT_MANIFEST.json`

### Findings And Corrections

- Windows PowerShell treated hyphen-prefixed Codex options as its own parameters. The wrapper now accepts only a job-local argv-file path, verifies that path remains inside the job root, parses the JSON string array, and invokes Codex with splatted arguments.
- Node's Windows `detached:true` launch caused the nested PowerShell/Codex invocation to exit without usable output. The dispatcher now owns normal child process streams and records stdout/stderr in the job log.
- The first live route-only attempt correctly found that `mx-shortdrama-01-frame-extract` was missing from the dispatch allowlist and that the router's local decision executable was absent. New controller jobs now contain both the root router and current Step01 executor in `allowed_skill_routes`, plus a controller-written advisory `route_decision.json`; the dispatcher validates both before launch.
- A wrapper can exit before the Codex child flushes its receipt. The dispatcher now revalidates and accepts a late receipt only when the dispatch was specifically blocked as `RECEIPT_MISSING`; other blocked states remain terminal.
- `--ephemeral` is now explicit in production worker arguments, preventing reuse of an old Codex conversation that happened to share the same local job directory.

### Verification

- `node --check bridge/niannian_controller_bridge.js`, `bridge/niannian_codex_worker_dispatcher.js`, and `test_codex_worker_dispatcher.js` passed.
- The PowerShell wrapper parsed successfully. A direct wrapper `--version` check passed with a job-root-contained argv file.
- `npm run test:preflight`, `npm run test:controller`, and `npm run test:worker` all passed. The worker test now checks the controller-generated route decision, root-plus-Step01 allowlist, fake-worker receipt validation, delayed-receipt recovery, provider-gate preservation, and website writeback.
- `GET http://127.0.0.1:4188/api/health` returned HTTP 200 after the local worker watcher restart.
- A real worker launch against the explicitly labeled synthetic fixture created a Codex thread, read the job contract, rechecked the exact source SHA-256, and ran `ffprobe` through the controlled route. It did not request a provider, package/send, registry promotion, or user-visible acceptance.
- A separate real ephemeral workspace-write sandbox probe was run with one harmless terminal command only. The Codex thread started, but terminal execution failed with `windows sandbox: runner error: CreateProcessAsUserW failed: 5` even with the job directory passed through `--add-dir`.

### Not Verified / Remaining Blocker

- Real Step01 production execution is **not** verified and must remain infrastructure-blocked. The Windows/Codex `workspace-write` sandbox cannot currently create its confined terminal process. The model's Node REPL fallback is not accepted as a production isolation substitute for customer materials.
- A real fresh `--ephemeral` worker receipt under the corrected root-plus-Step01 contract is not verified because the sandbox probe failed first. The fake-worker integration test verifies the receipt path structurally.
- No real customer project, image/video provider, package/send, acceptance registry, or online deployment was touched.

---

## Windows Elevated Sandbox Probe Review

Date: 2026-07-12  
Scope: One harmless administrator-context Codex sandbox probe after the `CreateProcessAsUserW failed: 5` infrastructure finding.

### Requested Outcome

Determine whether running the existing Codex profile through Windows UAC restores confined terminal execution without weakening the worker sandbox.

### Correct Operating Path

An administrator-context, ephemeral Codex process should execute one no-op terminal command inside `workspace-write`, return a command-completed event, and exit with a result record. It must not read a task file, write a business artifact, or call any provider.

### Verification

- A UAC-launched process created a fresh Codex thread and reached the confined command-execution stage.
- The command remained `in_progress` without a completion event or result file after the sandbox command process exited.
- No project task, source material, provider, package/send, or deployment action was performed.
- The one-time elevated probe script was removed after the test; its stdout/stderr logs remain only as local diagnostic evidence under `output/elevated-codex-sandbox-probe/`.

### Result

The elevated probe did not establish a reliable Windows worker runtime. Do not treat UAC elevation as a production fix. The safe next runtime is a separately configured Mac worker connected through the existing controller contract.
