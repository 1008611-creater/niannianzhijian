# Canvas Provider Migration Contract

The local WSL validation service and the production systemd service use the same
provider contract. Provider credentials stay outside the repository.

1. Install `deploy/niannian-ai-canvas.env.example` as `canvas.env` in the service environment directory and fill the RunningHub and ASXS variables there. Set the exact ASXS model ID in `NIANNIAN_TEXT_MODEL`; keep the file mode restricted and never copy it into the project.
2. Sync the canonical source into the WSL Linux runtime with `bridge/sync_wsl_runtime.sh`. The sync excludes `.git`, `data`, `node_modules`, environment files, and logs; Linux dependencies come from `/home/lsb/niannianai-wsl-deps`.
3. Start `deploy/niannian-ai-local-wsl.service` for local port `4399`. The service reads the same `canvas.env` variable names as production.
4. For production, install the same env contract as `/etc/niannian-ai/canvas.env` and use `deploy/niannian-ai.service`. No canvas code or node configuration should be changed during migration.

The server reports only provider readiness, model identity, and submit flags; it
never returns credential values. A local dry-run is required before any real
image/video provider submission. Text requests use the server-side ASXS
contract and remain disabled until the text submit flag, exact model ID, and
credential are all configured.
