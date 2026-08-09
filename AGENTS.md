# NianNian AI Execution Contract

This directory is the canonical source for NianNian AI's Haika server execution workflow.

## Default behavior

- Own the user's requested outcome. For a visible defect, continue through diagnosis, the smallest durable repair, state recovery, deployment when authorized, and an end-to-end readback.
- A diagnosis, raw error, failed retry, or blocked report is not a completion point when the next repair is safe and in scope.
- Make ordinary technical decisions yourself. Escalate only when a choice materially changes the product goal, cost, irreversible external outcome, or a stated acceptance standard.
- Keep the same job identity and source authority through recovery. Do not replace the task with a new diagnostic artifact or an unrelated route.
- Report only verified state as complete. Distinguish queued, running, blocked, and delivered.

## Delegated Technical Execution

- When the product owner states an outcome or says to continue, make ordinary technical decisions and execute the full in-scope path without requesting step-by-step confirmation. This includes complex code changes, diagnosis, tests, local tooling, repository configuration, CI, documentation, and reversible GitHub operations.
- Treat confirmation as unnecessary for implementation detail, command choice, debugging strategy, test selection, or routine repository maintenance. Do not hand a technical decision back merely because it is complex.
- Escalate only when the next action changes the product goal, incurs material cost, accesses or rotates a credential, makes an irreversible external change, changes account permissions, publishes or deploys, or has an explicitly stated acceptance tradeoff. Preserve every existing hard boundary.
- After acting, report the outcome first: what changed, how it was verified, any deviation from the stated goal, and the one real blocker or next action. Do not expose internal command-by-command narration unless it changes the product decision.

## Value-First Execution And Test Authority

- Before every continuation or new execution phase, identify the current
  highest-value unfinished user path and its smallest executable action. Tell
  the product owner that action, why it has the highest information or delivery
  value, and the selected Skill route before executing it.
- Route the action through the narrowest applicable local Skill or verified
  GitHub method. State the Skill's exact section and only the direct
  dependencies that affect the current result; do not stack unrelated routes.
- The product owner grants standing authority for tests, simulations, browser
  smoke checks, and real provider test submissions within the already approved
  NianNian beta scope. Execute those tests directly without asking for another
  permission step, while respecting the existing H3 test limit of 5 seconds per
  run and 10,000 seconds total.
- This standing test authority does not authorize production deployment,
  account or permission changes, credential access or rotation, public release,
  destructive data operations, or a provider/model/route change that alters
  the product goal or cost boundary.
- After each test, report only the verified result, its practical value, actual
  provider spend when known, and the earliest remaining blocker or next action.

## User-facing behavior

- Never expose internal error codes, token/controller/lease terminology, paths, hashes, or recovery mechanics in the product UI.
- Preserve uploaded source media and completed preflight through recoverable failures. Do not ask the user to re-upload unless source validation actually fails.
- A recoverable backend failure must become a clear user-facing recovery state and a retry path, not an internal exception string.

## Hard boundaries

- Do not read, copy, print, store, inject, or transmit passwords, tokens, cookies, API keys, or raw provider responses.
- Do not submit generation, incur cost, publish, package/send, change accounts, or deploy externally without the authority the user has explicitly granted for that action.
- Do not claim a generated asset, media file, QA result, or delivery exists without the required exact evidence.
- Do not silently change a provider, model, route, source, job owner, or production/training boundary when that changes the result or cost.

## Workflow discipline

- Use the smallest compatible route for the current phase. Do not stack overlapping skills or switch routes repeatedly without an evidence-backed reason.
- A phase may consume only its declared, verified inputs. Preserve authoritative paths and SHA256 values when the workflow requires them.
- Keep failed historical receipts for audit, but they must not overwrite a newer authorized recovery state.
- When an in-scope repair creates a new blocker, repair that blocker before reporting back unless it crosses a hard boundary above.

## Server Execution Constraints

- Step01 source-video analysis runs only on Haika through the server Responses executor. Mac, Windows desktop bridges, and desktop App tasks are historical compatibility paths, not production dependencies.
- The server may use only the task's allowlisted routes, current source hash, and source-bound analysis authorization. It must not treat the model channel as media-provider authorization.
- Keep credentials in systemd environment files only. Do not record them in task contracts, artifacts, receipts, logs, or the website.
- For production media, retain the route's required preflight, evidence validation, ledger, and website projection before calling work delivered.

## NianNian project authority

This directory is the independent canonical project root for NianNian AI. Work from this directory, not from a sibling candidate, downloaded package, or online deployment copy.

- Preserve the current NianNian canvas and all user-approved homepage, studio, asset-library, API adapter, and branding behavior. Do not restore the retired Nomi self-built canvas, `#canvas`, or `owned-canvas-director-import` routes.
- Treat the existing source and user-approved behavior as the baseline. Before changing a shared route or UI, identify the exact files, assets, API mappings, and protected surfaces involved.
- Develop, build, simulate, and verify locally first. The local WSL/browser URL is a candidate preview, not the online site. Do not connect to or deploy the online server unless the user explicitly authorizes that separate step.
- Keep one bounded candidate per change. Do not merge files from several old candidates or overwrite the canonical source with a validation package.
- Never replace confirmed assets, API adapters, canvas behavior, or project data with placeholders, guessed resources, stale bundles, or empty provider responses.
- A change is complete only after the real local browser path is tested, including the requested interaction, loaded assets, relevant API response, and the protected desktop/mobile surface when UI is changed.
- For static Studio builds, keep the HTML module entry and dynamically imported shared chunks on the same physical module filename and identity; duplicate renamed copies can create separate React contexts and surface false Provider-missing errors. Check the import graph and real browser console before delivery.
- Keep secrets, API keys, cookies, signed URLs, `.env` files, user media, generated outputs, and runtime state out of source, documentation, commits, and migration copies.

## Migration boundary

The former `niannian-ai-canonical-local` directory has been moved to `E:\codex\archive\niannian-ai-canonical-local-retired-20260807` as a read-only rollback/reference source. It must not be silently treated as the active development root after this project is verified. The `local-wsl-validation-*` directories are candidates only and never become the source of truth.

When a task says `继续`, continue from the current approved scope and this directory. Do not change the canvas family, route, provider, or release baseline unless the user explicitly changes that decision.

## Fixed Two-Person Git Collaboration

- The personal private GitHub repository, once connected as `origin`, and its
  `main` branch are the shared source authority. Offline source archives are
  backup only and never a merge source.
- The primary implementation owner is the only integrator and production
  operator. Production deployment still requires explicit approval from the
  product owner for that candidate.
- Workstream A owns server/provider paths: `server.js`,
  `bridge/niannian_canvas_*.js`, `bridge/niannian_runninghub_*.js`, `deploy/`,
  and `test_canvas_*.js`. Workstream B owns Studio paths: `studio/**`, `sw.js`,
  `test_studio_*.js`, `test_r3f_*.js`, `test_web_canvas_persistence_binding.js`,
  and `test_web_runtime_adapter.js`. Do not cross these boundaries except in a
  separately reviewed API-contract change.
- Each work item starts from current `main` on an Issue-linked short-lived
  branch, uses focused commits, and returns through a pull request. No direct
  push or force push to `main`; rebase before review and let the owner of an
  owned path resolve its conflict.
- Merge Studio recovery before provider-runtime work, then build and verify a
  release candidate only from the merged `main`. A clean browser must save and
  refresh a canvas before any real provider generation is accepted as evidence.
- Current beta scope is ASXS text with `gpt-5.6-luna`, RunningHub Image2, and
  RunningHub H3 only. Audio, 3D, whiteboard, panorama, and scene-3D remain
  edit/reference-only until a full server execution path exists.
- Provider credentials, user media, runtime state, generated outputs, and raw
  provider responses remain outside GitHub Issues, pull requests, commits, and
  collaboration handovers. See `COLLABORATION_AND_HANDOVER.md` for the exact
  handover and release procedure.
- Until the second contributor has accepted repository access, the primary
  owner normally advances Workstream A through Issue #2 and keeps Workstream B
  reserved. When the product owner directs an immediate Studio recovery because
  it blocks the real generation path, the primary owner may take that Issue on
  a new Issue-linked branch, merge it before provider-runtime work, then return
  to Workstream A. `main` remains pull-request-only with force pushes and
  deletion disallowed as a required team process, but the current GitHub Free
  private-repository plan cannot enforce it technically. No approving-review
  count is configured unless the product owner explicitly changes that decision.

## Engineering Baseline

- Treat GitHub `main` as authoritative only after the focused pull-request CI
  has passed. The required current checks are `Local contract tests` and
  `Clean-browser Studio smoke test`; a locally passing command is not a
  substitute for their first real GitHub run.
- Keep the completed GitHub controls in use: focused Issue and branch, pull
  request template, CODEOWNERS routing, Dependabot alerts and updates, the
  weekly production dependency audit, security policy, and draft release notes.
  A draft Release is changelog preparation only, never deployment authority.
- On every dependency or workflow change, inspect the resulting GitHub Actions
  status and open Dependabot alerts. Fix a proven CI or dependency failure in a
  focused follow-up change; do not merge around it or label it as a false alarm.
- Branch protection, rulesets, Secret Scanning, and private vulnerability
  reporting are unavailable on the current private-repository plan. Keep their
  required behavior in this contract, state the limitation in the handover, and
  do not claim GitHub is enforcing controls it cannot enforce.
- Observability, persistent worker recovery, multi-user storage, and public
  beta policy are planned production capabilities, not completed controls.
  Their acceptance criteria and ownership remain in GitHub Issues #6 through
  #10; do not describe the product as public-ready until those applicable
  outcomes are actually delivered.

## Frontend Authority And Stage Gates

- `PRODUCT.md` owns product truth, `DESIGN.md` owns durable visual and
  interaction decisions, `FRONTEND_EXECUTION_PLAN.md` owns the current stage
  order and acceptance evidence, and `docs/frontend-targets/` owns the target
  interface images. Read all four before a frontend redesign, new surface, or
  structural Studio change. Do not begin implementation when the current stage
  has no named user result, target image, material states, responsive behavior,
  and completion evidence.
- For any reference-derived redesign, use this exact route and state it before
  execution:

  ```text
  真实页面或当前实现证据
  -> Hallmark study：references/study.md
  -> UI/UX Pro Max：Workflow Step 1-4
  -> Impeccable：shape / audit / polish
  -> 目标图、实现、桌面与移动端证据
  ```

  Reference sites are evidence only. Never pixel-clone their layout, copy
  proprietary assets or text, or let their model/provider taxonomy replace
  NianNian's user language.
- `Impeccable shape` confirms the bounded Operate-mode surface before code;
  `audit` and `polish` are post-implementation quality gates. UI/UX Pro Max
  recommendations are subordinate to `PRODUCT.md`, `DESIGN.md`, the protected
  NianNian surfaces, and verified project constraints. Generic AI purple,
  glassmorphism, glow, marketing heroes, and card-heavy dashboards are not
  authority for this product.
- Every frontend Issue and pull request must name exactly one stage from
  `FRONTEND_EXECUTION_PLAN.md`, one primary user result, the matching target
  image, affected files/API contracts, protected surfaces, material states,
  desktop/mobile proof, and anything not verified. Keep one bounded surface per
  change; a shared-shell or API-contract change must be isolated and reviewed
  as its own change.
- Target images define information hierarchy, state visibility, action
  placement, and responsive retention, not fabricated backend capability.
  Production UI must replace every example value with real project data and
  must not turn the target image into a static mock, fake success state, empty
  fallback, or placeholder workflow.
- After implementation, verify the real local browser path at the target
  viewport in `DESIGN.md`, plus the relevant clean-browser save/refresh,
  loaded assets, API response, task recovery, and user-visible result. A test,
  screenshot, HTTP `200`, queued task, or internal receipt alone is not
  completion; the requested user action and readable project result are the
  acceptance boundary.
- A design change must not silently alter the approved homepage, Logo, current
  canvas family, director desk, asset library, Image2/H3 adapters, Step01-Step04,
  project data, or production routes. When real behavior conflicts with a
  target image, preserve the working product, document the conflict, and update
  the authority in a separate approved design change before broadening scope.

## Professional Website Development Skill

- Use the `niannian-web-development` Skill for any NianNian website change,
  GitHub Issue/PR handoff, release candidate, production deployment, rollback,
  beta-readiness, CI, observability, backup/recovery, or provider lifecycle
  work. Its `Workflow` section is the default execution order and its
  `references/quality-gates.md` selects the smallest sufficient proof.
- The Skill supplements this project contract; it must not override its canvas
  authority, credential boundaries, user approvals, or production constraints.
