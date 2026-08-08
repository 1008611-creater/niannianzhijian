# NianNian AI Collaboration and Handover

## Confirmed decisions

- The authoritative source is this repository and its `main` branch.
- The shared repository will be a personal, private GitHub repository. GitHub
  is the collaboration source of truth; offline archives are backup only.
- The beta product scope is text with `gpt-5.6-luna`, RunningHub Image2, and
  RunningHub H3. Audio, 3D, whiteboard, panorama, and scene-3D are not public
  generation capabilities until each has a complete server execution path.
- User pricing, usage quotas, and automated spend limits are intentionally not
  defined before beta. Public launch is blocked until the owner defines them.
- The primary implementation owner is the sole integrator and production
  operator. Every production deployment still requires the product owner's
  explicit approval.

## Current handover state

- Local authority branch: `main` at the commit that introduces this document,
  tagged `baseline/two-person-collaboration-20260808`.
- Current source root: `E:\codex\niannianai\niannianai`.
- The configured server-side generation routes are ASXS text (`gpt-5.6-luna`),
  RunningHub Image2, and RunningHub H3. Credential values are intentionally
  absent from this repository and this document.
- The immediate product blocker is Studio module/cache instability that can
  prevent canvas persistence and generation from being verified in a clean
  browser. Provider readiness alone is not acceptance evidence.

## Workstream A: Server and provider delivery

Owner: primary implementation owner.

Branch: `feat/canvas-provider-runtime`.

Owned paths:

- `server.js`
- `bridge/niannian_canvas_*.js`
- `bridge/niannian_runninghub_*.js`
- `deploy/niannian-ai*.service`
- `deploy/niannian-ai-canvas.env.example`
- `test_canvas_*.js`

Required result:

1. Keep credentials server-side only and preserve `gpt-5.6-luna` as the text
   model selected by the product owner.
2. Verify project ownership, node persistence, provider task lifecycle,
   generated-asset registration, and refresh readback through the real API.
3. Preserve explicit authorization before Image2 or H3 incurs a provider call.
4. Keep unsupported node types rejected by the generation API until a complete
   provider adapter, polling, asset registration, and browser readback exist.

This workstream must not modify `studio/**`, `sw.js`, or Studio UI styles.

## Workstream B: Studio canvas and product completion

Owner: team implementation owner.

Branch: `feat/studio-canvas-recovery`.

Owned paths:

- `studio/**`
- `sw.js`
- `test_studio_*.js`
- `test_r3f_*.js`
- `test_web_canvas_persistence_binding.js`
- `test_web_runtime_adapter.js`

Required result:

1. Eliminate stale-module and React Provider failures in a browser without
   prior site data while preserving the confirmed NianNian canvas family.
2. Verify a fresh project can add, save, refresh, and retain nodes, prompts,
   models, connections, and project assets before a generation request begins.
3. Keep text, Image2, and H3 connected to the existing server APIs without
   browser-side credentials, fake jobs, or placeholder provider responses.
4. Present audio, 3D, whiteboard, panorama, and scene-3D as editing or
   reference-only capabilities until their real backend paths are delivered.
5. Verify changed Studio flows on desktop, mobile, and a clean browser.

This workstream must not modify `server.js`, `bridge/niannian_canvas_*.js`, or
`deploy/**`. A cross-boundary API change requires a separate agreed PR.

## Shared runtime contract

- `GET /api/canvas/provider-status` exposes readiness only and never a key.
- Text uses `POST /api/projects/:projectId/text/jobs`.
- Image2 and H3 use `POST /api/projects/:projectId/canvas/jobs`, then the
  explicit authorization endpoint.
- A node must be persisted before either generation route is called.
- Generated output must become a project-owned asset and survive refresh.

## GitHub workflow

1. The repository owner creates an empty private repository named
   `niannian-ai`, without an initial README, `.gitignore`, or license.
2. The primary owner adds it as `origin`, pushes `main`, creates the baseline
   tag, and pushes both workstream branches from that same baseline.
3. Every work item starts as a GitHub Issue, then a branch from current `main`.
   No one commits directly to `main`.
4. Each PR is focused on one user-visible path, names its Issue, lists changed
   paths, and states exact verification evidence and remaining gaps.
5. Before review, the branch is rebased on current `main`. The owner of a path
   resolves conflicts in that path.
6. The primary owner reviews and merges Workstream B first, then Workstream A.
   A merged `main` is the only input for a release candidate.

Recommended `main` repository protection:

- Require pull requests; disallow direct pushes and force pushes.
- Require one review from the primary owner before merge.
- Do not configure a GitHub status check until the corresponding CI check has
  been added and proven reliable.

## Current collaboration mode and resume point

- The second contributor is not yet onboarded. Until their GitHub username is
  supplied and their invitation is accepted, the primary owner works alone on
  Workstream A through Issue #2 and `feat/canvas-provider-runtime`.
- Workstream B and Issue #1 remain reserved for the second contributor. The
  primary owner does not make speculative Studio changes in its owned paths
  while waiting, preventing a later two-person merge conflict.
- When the contributor is ready, the primary owner invites them with repository
  write access, assigns Issue #1, and enables `main` protection: pull requests
  required, force pushes disabled, and one approving review required.
- If the product owner says `继续` before the contributor is ready, resume the
  earliest unfinished Workstream A item from Issue #2. If the contributor is
  ready, first complete onboarding and protection, then progress both issues
  under their respective file boundaries.

## Handover procedure

An owner handing a branch to the other person provides one PR or Issue comment
with:

1. Branch name and the exact `main` commit it was rebased onto.
2. Completed user path and exact verification run.
3. Remaining failure, decision, or dependency, if any.
4. Files intentionally not touched because they belong to the other stream.
5. Whether any real provider spend occurred. Never include a credential,
   provider raw response, user media, or signed URL.

The receiving owner reads the current PR diff and repeats only the smallest
relevant test before continuing. A handover is not complete merely because a
branch exists or a test command returned success.

## Release path

1. Merge both approved workstreams into `main`.
2. Build an isolated release candidate from that exact commit.
3. Verify the real browser path: fresh project, node save, refresh readback,
   text generation, Image2 generation, H3 generation, asset-library readback,
   desktop, mobile, and a clean browser.
4. Keep the prior production release and persistent user-data directory intact
   as the rollback source.
5. Request the product owner's explicit deployment approval. Only then may the
   primary owner deploy and perform the production readback.

## Known risks and controls

| Risk | Control |
| --- | --- |
| Both contributors edit the same runtime or Studio file | Strict path ownership and a separate PR for API changes |
| A branch becomes stale | Rebase onto current `main` before review |
| Old browser or Service Worker assets mask a fix | Clean-browser validation with real module and console checks |
| Generation costs occur before canvas data is saved | Persistence acceptance runs before real provider submission |
| Release replaces data or assets | Persistent data remains outside the release package; rollback retains the prior release |
| A credential enters source control or an Issue | Keys stay in server environment files; review rejects credentials and runtime data |
| A personal GitHub account becomes unavailable | Enable two-factor authentication and keep a current offline Git bundle backup |

## Beta done definition

`main` is ready for a beta release only when a clean project can save and
refresh its canvas, create a real `gpt-5.6-luna` text result, create real
Image2 and H3 results, show all results in the project asset library, and
retain them after refresh on desktop and mobile. Public launch additionally
requires the product owner to define the commercial and usage policy.
