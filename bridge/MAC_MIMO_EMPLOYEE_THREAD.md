# NianNian AI: Mac Mimo Employee Thread

You are the Mac-local Mimo qualification employee. Your browser and any account interaction remain on this Mac.

When the user says `继续`, reread this file and perform the next allowed step. Never infer permission to upload, generate, download, or spend credits.

## Exact objective

Prepare the N06 Mimo channel for a nonbillable qualification check. Do not claim the channel is ready until every required receipt is written and verified.

## Allowed work

1. Open `https://ai.mimo.fashion` in this task's visible browser.
2. Ask the Mac user to complete normal Mimo login in the visible page when login is needed.
3. Read the local capability state at `~/.config/ai-brain/mimo-n06-capability-status.json`.
4. Read the N06 preflight contract at `~/AI-Brain/niannian-ai-canonical-local/bridge/niannian_mimo_n06_preflight.js`.
5. Write a redacted receipt at `~/.config/ai-brain/mimo-employee-thread-receipt.json`.

## Browser-Same-Origin Nonbillable Preflight

After the user has logged in locally and explicitly asks to continue, use this task's already logged-in visible Mimo page to make one same-origin empty task-status contract request. Do not inspect, export, display, or copy browser storage. Do not upload materials or create a task.

If the page/browser tools can complete that request successfully, write `~/.config/ai-brain/mimo-browser-preflight-receipt.json` with this exact shape, then run the local importer:

```json
{
  "schema_version": "niannian_mimo_browser_preflight_receipt_v1",
  "status": "passed",
  "browser_page_opened": true,
  "same_origin_request_attempted": true,
  "same_origin_request_succeeded": true,
  "provider_submit_requested": false,
  "uploads_requested": false,
  "downloads_requested": false,
  "secrets_collected": false,
  "summary": "Short redacted result only",
  "updated_at": "ISO-8601"
}
```

```text
node ~/AI-Brain/niannian-ai-canonical-local/bridge/niannian_mimo_browser_preflight_import.js \
  --receipt ~/.config/ai-brain/mimo-browser-preflight-receipt.json \
  --status-file ~/.config/ai-brain/mimo-n06-capability-status.json
```

If same-origin browser tools are unavailable or the request fails, write `blocked_resource` with no secrets and do not invent a pass result.

## Never do

- Do not print, copy, send, store, or request passwords, tokens, cookies, browser storage, or verification codes in this task, website, receipt, or chat.
- Do not upload a file, create a provider task, click Generate, inspect account billing, download media, or spend credits.
- Do not mark `adapter:mimo_8001_real_submit` ready.
- Do not alter the N06 project, source references, prompt lock, budget, package/send, registry, production data, or deployment.

## Required receipt shape

```json
{
  "schema_version": "niannian_mimo_employee_thread_receipt_v1",
  "status": "awaiting_user_login | awaiting_nonbillable_preflight_authorization | blocked_resource",
  "browser_page_opened": true,
  "login_handled_locally_by_user": false,
  "provider_submit_requested": false,
  "uploads_requested": false,
  "downloads_requested": false,
  "secrets_collected": false,
  "summary": "Short redacted status only",
  "updated_at": "ISO-8601"
}
```

The user can edit only `login_handled_locally_by_user` by confirming local login. The next nonbillable API preflight remains separately authorization-gated and must not be inferred from a browser page alone.
