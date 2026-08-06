# Mac Codex Desktop App — five employee bootstrap

This is a one-time App-visible bootstrap handoff. It is not a CLI employee, provider task, or deployment instruction.

## Current Mac App task receipts

The five tasks were created in the Mac Codex Desktop App through the supported local app-server path. The official standalone app-server lists all five exact IDs/titles/cwd values. All five read-only readiness turns now have an exact `turn/completed` success event with `status=completed` and `error=null`; current `thread/read` matches. The app-server reports `account_present:false` and `requires_openai_auth:false`, which is valid for the project-approved `env_key` custom-provider contract.

The user explicitly confirmed that all five tasks are visible in the Mac Desktop App sidebar. Pinning is still pending because the app-server protocol has no pin method; do not write the Codex database or claim `pinned:true` without supported App/UI proof.

| employee | title | thread id | exact synthetic job | isolated workspace | pin state |
|---|---|---|---|---|---|
| 01 | 念念 AI · Mac 员工 01 | `019f6201-c013-7cf3-b155-61d2789085f4` | `mac-training-employee-01` | `~/.local/share/niannian-ai/employee-workspaces/01` | pending |
| 02 | 念念 AI · Mac 员工 02 | `019f6201-cb91-7cf0-819e-696eeabd9e78` | `mac-training-employee-02` | `~/.local/share/niannian-ai/employee-workspaces/02` | pending |
| 03 | 念念 AI · Mac 员工 03 | `019f6201-d5e8-7083-884d-c714eb1a78b0` | `mac-training-employee-03` | `~/.local/share/niannian-ai/employee-workspaces/03` | pending |
| 04 | 念念 AI · Mac 员工 04 | `019f6201-dff9-7f63-94d8-7f9020b3c223` | `mac-training-employee-04` | `~/.local/share/niannian-ai/employee-workspaces/04` | pending |
| 05 | 念念 AI · Mac 员工 05 | `019f6201-ea1b-7e22-9dd0-a3b851b15b69` | `mac-training-employee-05` | `~/.local/share/niannian-ai/employee-workspaces/05` | pending |

All five tasks use the same project root `~/AI-Brain/niannian-ai-canonical-local`, the same 13-Skill manifest, and the same training matrix. They must not share job workspaces or write shared canonical authority files.

## Model-channel contract

The Codex employee uses the non-secret configuration contract `codex_local_access` → `responses` → `env_key=KRILL_CODEX_API_KEY` with `requires_openai_auth=false`. The key stays in the owning Mac process environment. Static experimental bearer-token fields, static HTTP authorization headers, config-embedded keys, prompts, receipts, and chat are forbidden.

This model channel is not Mimo, Image2, or `krill-image2`. A successful employee turn grants no media upload, generation, spend, deployment, or production-data authority.

Use audit-only mode for routine readback; do not start another readiness turn when one already completed:

```bash
~/.local/bin/node ~/AI-Brain/niannian-ai-canonical-local/bridge/mac_codex_app_employee_bootstrap.js --audit-only
```

The script reads the five existing thread IDs. It skips dispatch for an active turn or an existing completed assistant readiness turn, and it starts only a read-only bootstrap when the thread is still empty and the model-channel contract is valid. It never creates a duplicate thread. `thread/list` is not sidebar or pin proof.

## Per-task training job

Each employee independently runs `prepare → execute-once` against its own synthetic job, reads the golden route matrix, and writes only its own workspace artifacts. The synthetic N06 fixture must produce a test-only V001 receipt and a typed `SCRIPT_N06_V001_ONLY` V002 blocker. Employee model-channel network and media-provider network are separate receipt nodes. No media-provider network, upload, generation, billing, package/send, registry, production-data mutation, or deployment action is allowed.

## Required App-visible receipt

Each task must return: `thread_id`, `host_id`, `project_id`, title, `pinned`, project root, bundle archive SHA, manifest SHA, training matrix SHA, exact job/workspace, artifact manifest, receipt, QA level, and blocker. `pinned` is false/unknown until App/UI evidence exists.
