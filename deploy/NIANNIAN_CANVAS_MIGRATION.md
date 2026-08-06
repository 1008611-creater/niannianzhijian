# Canvas Provider Migration Contract

The local WSL validation service and the production systemd service use the same
provider contract. Provider credentials stay outside the repository.

1. Install `deploy/niannian-ai-canvas.env.example` as `canvas.env` in the service environment directory and fill `RUNNINGHUB_API_KEY` there. Keep the file mode restricted and never copy it into the project.
2. Sync the canonical source into the WSL Linux runtime with `bridge/sync_wsl_runtime.sh`. The sync excludes `.git`, `data`, `node_modules`, environment files, and logs; Linux dependencies come from `/home/lsb/niannianai-wsl-deps`.
3. Start `deploy/niannian-ai-local-wsl.service` for local port `4399`. The service reads the same `canvas.env` variable names as production.
4. For production, install the same env contract as `/etc/niannian-ai/canvas.env` and use `deploy/niannian-ai.service`. No canvas code or node configuration should be changed during migration.

The server reports only `credentialConfigured`, `imageSubmitEnabled`, and
`videoSubmitEnabled`; it never returns the credential value. A local dry-run is
required before any real provider submission, and real submission still needs
the user's explicit spend authorization.
