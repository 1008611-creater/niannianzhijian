# MAC_EMPLOYEE_TRAINING_REPORT

Date: 2026-07-15  
Status: `threads_visible_pin_pending` / `employee_model_channel_integrated` / `relay_ready` / `media_provider_disabled`

## Architecture truth

Mac Codex Desktop App is the employee owner. CLI, Node worker, LaunchAgent, GUI action bridge, and restricted relay are tools only. Five Mac App tasks exist through the supported local app-server path, all bound to `~/AI-Brain/niannian-ai-canonical-local`. The user explicitly confirmed all five are visible in the Mac App sidebar; pinning remains unverified because no supported app-server pin method is exposed.

| title | thread id | host/project readback | pin |
|---|---|---|---|
| 念念 AI · Mac 员工 01 | `019f6201-c013-7cf3-b155-61d2789085f4` | Mac App local project root | pending |
| 念念 AI · Mac 员工 02 | `019f6201-cb91-7cf0-819e-696eeabd9e78` | Mac App local project root | pending |
| 念念 AI · Mac 员工 03 | `019f6201-d5e8-7083-884d-c714eb1a78b0` | Mac App local project root | pending |
| 念念 AI · Mac 员工 04 | `019f6201-dff9-7f63-94d8-7f9020b3c223` | Mac App local project root | pending |
| 念念 AI · Mac 员工 05 | `019f6201-ea1b-7e22-9dd0-a3b851b15b69` | Mac App local project root | pending |

The Windows Codex host still does not expose a Mac remote host/project, so Windows task listing is not used as Mac evidence. The Mac official standalone app-server independently lists all five exact thread IDs, titles, cwd values, and completed assistant readiness turns. Current non-secret auth readback is `account_present:false` plus `requires_openai_auth:false`, which is valid for the project-approved custom-provider `env_key` contract.

The Krill Codex employee model channel uses `codex_local_access`, `wire_api=responses`, `env_key=KRILL_CODEX_API_KEY`, and `requires_openai_auth=false`. No key value, static bearer token, static HTTP authorization header, or credential payload is stored here. All five exact readiness turns have `turn/completed`, `status=completed`, `error=null`, and matching `thread/read`; no new thread was created during repair. This is integrated employee/model readiness only. It is not Mimo, Image2, `krill-image2`, media-provider authorization, spend authority, or real delivery.

## Learned / installed / blocked

### Learned

- The executable chain is `ai-video-production-router → one specialist → prompt-skill-router → locked task spec → ai-video-channel-router → exact adapter → task/poll/download → ffprobe/visual QA → ledger/receipt/website projection`.
- Authority is exact path + SHA + accepted/confirmed/verified state. `latest`, old Word, browser history, rejected/diagnostic/candidate decisions, stale `current_authority.json`, and hash drift are blockers.
- Step01 `hq_full` requires Mimo ASR, Paddle OCR, TransNetV2, HQ, and ForcedAligner. Step02 preserves source timing/speaker facts. Step05A support assets and Step05B first frames are separate; a reroll invalidates previous first-frame confirmation.
- Mimo N06 identity is `https://ai.mimo.fashion` with `/api/auth/login` and `/api/auth/verify`; the legacy NAS endpoint/session/cost identity must not mix. Mimo has no resolution parameter; `keep_720p_hard_gate` is a QA decision only.
- V002 cannot open after a fake/test-only V001; only a real V001 receipt + real media + visual QA can open it.
- Employee model-channel network and media-provider network are separate receipt nodes. The former was used for five read-only readiness turns; the latter remains false for upload, generation, task creation, spend, and delivery.

### Installed and parity-verified

- 13-Skill deterministic bundle includes `prompt-skill-router`.
- Current Windows ZIP archive SHA-256: `d1ffd229a953a5258d5c74926e240c8b1fc087622d85522c7f52ed4c93a21f01`.
- Current manifest SHA-256: `83432127b0ddb34b4445f90469f3c5d315416265a897a9a82457a3b19877be91`.
- Windows source, ZIP manifest, and Mac `~/.codex/skills` each verify 13 skills / 123 Skill files with the same per-file SHA set; the manifest has 125 total entries including two GUI bridge bootstrap files.
- The final closure detected source updates during testing, rebuilt the deterministic archive, passed sensitive-content scanning, and reinstalled the exact current bundle on Mac. Mac install receipt SHA-256: `dd128fa98322febe8426a51cd152091088efde70259928ec7ccdfa72d2ab10d0`.
- Mac install receipt: `~/.config/ai-brain/mac-skill-bundle-install-receipt.json`, `installed_verified`, no provider/network/secret handling.
- Five Mimo/strict capability statuses remain truthful; missing/expired values are not promoted to ready.
- The training matrix and fixtures are project contracts under `bridge/mac-employee-training`, not files inside the 13-Skill ZIP. Their Mac copies are synchronized separately; the Skill archive itself therefore did not need a content rebuild for these fixture edits.
- A user-local Mac Python 3.12.10 runtime was installed at `~/AI-Brain/runtime/step01-python312`. `transnetv2-pytorch==1.0.5` passed CPU construction with packaged weights. The pinned `Qwen/Qwen3-ForcedAligner-0.6B` revision loaded on CPU and returned timestamped items for a synthetic macOS Chinese TTS clip; real project alignment remains unverified. `hq_full` remains blocked on current Mimo ASR/Paddle OCR credential health and composite validation.
- FFmpeg/ffprobe 7.1.1 were built from the pinned official source archive with network protocols and external autodetection disabled. A synthetic 720x1280/1s ffmpeg→ffprobe round-trip passed. The previous 4.4/4.4.1 binaries were preserved as hash-named backups.
- The Mac-local `NianNian-Step01-Credentials.command` launcher is installed in `~/Downloads` with SHA-256 `eb2e4fbdf2f9430cea6cc9d479853dbdbda36332e04fdbfc282909c15387b947`. Hidden input streams directly to `/usr/bin/security ... -w` over stdin; it never enters process arguments, project files, receipts, logs, the website, or Windows.
- Mimo ASR and Paddle OCR have no verified zero-cost health endpoint in the authoritative Skills. Keychain presence is therefore recorded only as `configured_unverified`; a real ASR/OCR request needs separate task-level authorization and may not be simulated as readiness.
- The hash-bound `hq_full` gate checks the installed Mimo/Paddle Skill entrypoints, four fresh prerequisites, and a separate synthetic composite-evidence receipt. Configured-only credentials cannot unlock it. Current real Mac readback is `hq_full ready:false` with typed reason `hq_full_composite_evidence_missing_or_invalid`.
- The GUI action card was regenerated with six remaining actions, consumed by the supported user LaunchAgent, and contains the Mimo ASR, Paddle OCR, and `runtime:hq` requests without raw-secret markers. The local prompt was launched, but user visibility/input is not claimed until the user confirms it.

### Blocked / not yet accepted

- Mac App pin readback: `pin_pending_unsupported` until supported App/UI evidence. Sidebar visibility is user-confirmed, but visibility is not pinning.
- Mac App readiness output: `integrated`. Five existing fixed threads completed read-only readiness and current `thread/read` matches. Bootstrap remains below `real_delivery` until an authorized exact production job completes its Skill route, QA, receipt, and website/customer return.
- Strict Step01: `ready:false`. `runtime:transnetv2` and `runtime:forced_aligner` are now ready from local model self-tests. Mimo ASR and Paddle OCR adapters are identified but still require secure Mac-local credential configuration. `runtime:hq` remains blocked until those current credential checks and the composite profile validation pass.
- Step01 credential bootstrap: `installed_action_card_consumed_user_input_pending`. Both Keychain entries are absent in the current readback; no credential was read or copied. Receipt: `output/mac-employee-training/mac-step01-credential-bootstrap-install-receipt.json`.
- Mimo auth/verify: launcher and redacted classification are installed, but a fresh successful Mac receipt has not been user-confirmed. No provider task, upload, generation, billing, or spend occurred.
- Real Mimo adapter submit remains disabled. Synthetic adapter is test-only and no-network.

## Synthetic training evidence

- `route_matrix.json` has 12 route rows and all required fields.
- Golden redraw Step01 fixture carries the five strict capabilities and fails closed until strict readiness.
- Golden script N06 fixture binds project `NS-MRGUJUH9-9E8904`, job `web_ns-ns-mrgujuh9-9e8904`, EP001, exact four V001 references, 11s, 9:16, 22-credit estimate, Mimo-only, `keep_720p_hard_gate`, and no provider resolution parameter.
- Negative fixture stably rejects stale SHA, rejected ref, missing confirmation, unauthorized submit, wrong endpoint, and forged resolution parameter.
- `node test_mac_employee_training_synthetic.js` proves synthetic prepare → transaction/spec SHA → fake task/poll/download → 720x1280/11s ffprobe evidence → integrated visual QA → ledger/checkpoint/result manifest/website projection; V002 returns `SCRIPT_N06_V001_ONLY`; replay is rejected.
- Current durable synthetic evidence is under `output/mac-employee-training/d017-synthetic-v001-v002-20260715-v2/synthetic-n06`. V001 receipt SHA is `5b4c9c38f72a0b86630a23b0925b467c142649cae0fb4a3a40dd594b14414a6e`; V002 typed-blocker receipt SHA is `5adaf76926ea04d76d0509153ad060db2419879a7e603725fc77337f1b653a81`.
- Current synthetic receipts explicitly separate `employee_model_channel` from `media_provider_network_requested` / submit/upload. The legacy ambiguous generic provider-network field is absent.
- Synthetic outputs are `test_only`; structural/integrated QA does not become `real_delivery`.

## Verification commands

- `node test_mac_skill_bundle_install.js`
- `node bridge/mac-employee-training/validate_training_contract.js`
- `node test_mac_employee_training_contract.js`
- `node test_mac_employee_training_synthetic.js`
- `node test_mac_codex_app_employee_bootstrap.js`
- `node test_install_mac_step01_runtimes.js`
- `node test_install_mac_ffmpeg_runtime.js`
- `node test_self_test_mac_forced_aligner.js`
- `node test_niannian_mimo_session_bridge_launcher.js`
- `node test_niannian_mimo_keychain_session.js`
- `node test_niannian_mimo_n06_preflight.js`
- `node test_niannian_mac_user_action_request.js`
- `node test_niannian_mac_user_action_bridge.js`
- `node test_niannian_step01_keychain_credentials.js`
- `node test_niannian_step01_hq_full_gate.js`
- `node test_niannian_step01_credentials_launcher.js`
- `node test_niannian_employee_preflight.js`
- `node --check` on changed JS and `bash -n` on changed Mac shell launchers

Runtime/App receipts:

- `output/mac-employee-training/mac-step01-runtime-install-receipt.json` SHA-256 `17eac4e7503547da7451c68555dd2f2976f93bd04705acc5e3a146956ad673b4`
- `output/mac-employee-training/mac-codex-five-employee-bootstrap-receipt.json` SHA-256 `6396382d1b533b601e539f0c138b44e37724c8b428ca93785ee97abb5b7d1182`
- `output/mac-employee-training/mac-ffmpeg-runtime-receipt.json` SHA-256 `f785add36442fd8498850c2f9a9cbaa4e56571f9ff987f78692bc794c48b96c3`
- `output/mac-employee-training/mac-forced-aligner-model-install-receipt.json` SHA-256 `6e17e12f56902864d23b40f9197691f27c0fd65877540439d3cb7c9453f56d9a`
- `output/mac-employee-training/mac-forced-aligner-self-test-receipt.json` SHA-256 `e2be57b7feb24d4f09bd334188bc426a4de3b441c5806746033126927d6ff8fd`
- `output/mac-employee-training/mac-step01-hq-full-gate-receipt.json` SHA-256 `12a030ec709bd40573000426aaa01f4b26875add659a0a15f5077d6d3d64a5bb`
- `output/mac-employee-training/mac-step01-credential-bootstrap-install-receipt.json` SHA-256 `9201eae51578c41055e27f146a4bcb21f44e0ea9f09a05920e2ee7c585d49321` (Mac SHA/readback and action-card delivery receipt; user input still pending)

Real provider submission, upload, generation, billing, package/send, registry promotion, production data writes, and deployment remain unverified and disabled.

## 2026-07-15 website → fixed Mac App vertical and Step01 gate addendum

The current website shell is `mvp r49 / service-worker release r63 / shell r41`. The script-studio focus race remains fixed and passed five consecutive `test_script_project_flow.js` runs. The browser suite passed 8/8. Duplicate `gsap` metadata remains removed and package/package-lock dependency parity passes.

The N06 carrier is now structurally connected from the website dispatch route through manifest-bound export, restricted SSH/SCP transfer, atomic Mac import, fixed App dispatcher, final return manifest, Windows import, automatic reconcile, and a test-only website projection. The launcher reads only the presence of `KRILL_CODEX_API_KEY` from launchd and injects the value into the worker/AppServer child tree without argv, logs, receipts, files, or Windows transfer. Completed inbox packages are archived atomically under a manifest-bound recovery name; exact replay removes only a re-created verified inbox. Focused fake-run tests pass, Windows/Mac file SHA parity passes, and current Windows/Mac worker orphan readback is zero. This is still `structural/injected`: no authenticated website package, real Mac App turn id, return manifest, or refreshed website projection exists yet.

Step01 now has one canonical fixed-App phase schema: `bridge/niannian_redraw_step01_mac_app_phase.js`. The isolated parallel helper was reviewed, its stricter execution-surface/output/fallback fields were merged, and the helper/test were removed. The phase binds `NN-*`, `web_nn-*`, source SHA/bytes, authorization event, settings version, route-matrix SHA, dispatch id, selected fixed employee, and isolated workspace. It checks all five hq_full capabilities plus freshness, Mac host/project root, and settings. A blocked/missing/stale receipt writes a typed blocker/checkpoint/dashboard and creates no dispatch package. A fresh-ready synthetic fixture can enter an App preflight turn, but its evidence manifest is empty/non-consumable and the receipt remains `preflight_ready_not_executed`, `step01_verified:false`, `real_delivery:false`.

The dispatcher now uses an employee-scoped mutex plus a phase lease. Two different phases/idempotency keys assigned to the same employee cannot both pass an idle `thread/read`; the second receives a typed lease conflict with zero `turn/start`. Replay revalidates source, authorization, settings, phase, employee/thread, completion event, and every false side-effect field. Legacy `relay_complete` is directly tested and rejected as `STEP01_LEGACY_RELAY_RECEIPT_REJECTED / blocked_contract`; the current orchestrator has no PowerShell relay, `codex exec --ephemeral`, CLI fallback, or thread-creation path.

The website now persists source rights as `rights_authority.json` with exact authenticated user id, source SHA/bytes, scope, declaration, and time. `task.json`, Artifact Ledger, result/checkpoint, and dashboard bind the event. Replacing a source requires a new declaration and supersedes the old event.

Current real Step01 status remains `blocked_resource_hq_full_no_dispatch_package`. The existing receipt is blocked/old and lacks current Mimo ASR, Paddle OCR, `runtime:hq`, fresh Mac host/settings binding, and composite proof. No source-media analysis or analysis-service network call ran. The next implementation branch is a typed Step01 carrier and real hq_full worker with a separate `analysis_service_network_authority`, large evidence bundle/manifest return, atomic Windows import, controller reducer, and website projection. It must not overload `media_provider_network_requested`.

Authoritative review: `post_coding_review_d017_website_mac_vertical_step01_fixed_app_20260715.md` SHA-256 `3f5cd69232505f27c44504b08147a2336e785117a94950f6ea2185d035ada4af`.
