# N06 Mimo Execution Adapter

`niannian_mimo_n06_execution_adapter.js` is the Mac-local provider execution
entrypoint for one exact N06 video group. It is not a generic Mimo CLI.

## Required Input

The website/controller must create a `real_submit_v1` spec only after the
owner has explicitly confirmed V001. The spec is exact: project/job/group IDs,
transaction ID, locked prompt SHA-256, confirmed reference paths and SHA-256,
11 seconds, `9:16`, one legal quality policy, and the estimated-credit record.

The adapter refuses dry-run specs, other providers, mismatched prompt/reference
hashes, unsupported duration/ratio, any quality policy other than
`keep_720p_hard_gate` or `accept_mimo_uncommitted_resolution`, and more than
nine image references.

## Execution Gate

The default command is plan-only and makes no network request:

```bash
node bridge/niannian_mimo_n06_execution_adapter.js --spec /exact/spec.json
```

Real execution additionally requires all of the following on Mac:

```bash
NIANNIAN_N06_REAL_MIMO_EXECUTION=on \
node bridge/niannian_mimo_n06_execution_adapter.js \
  --spec /exact/spec.json \
  --execute \
  --confirm-transaction <the-exact-transaction-id> \
  --output-root /exact/job/06_N06_EXECUTION/V001
```

Before any upload the adapter verifies the locally stored Keychain session with
`GET /api/auth/verify` and re-hashes every reference. It then uses the current
Mimo browser contract: `upload-apply`, direct object upload, `upload-commit`,
`generate`, bounded `batch-status` polling, download, and `ffprobe`.

The session token, upload session keys, provider URLs, and raw provider bodies
are never printed or written to a website receipt. A real media file is not a
delivery: `keep_720p_hard_gate` enforces true 720 x 1280 after probe, and the
adapter returns `blocked_quality_review` until visual QA has independent
evidence. Package/send and registry promotion are outside this adapter.
