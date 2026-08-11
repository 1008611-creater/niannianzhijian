# Step02 Server Runtime Contract

Status: current authoritative contract for the exact NianNian project
`NN-20260715083045-8120F5`.

The only accepted input is an immutable, owner-bound Step01 Snapshot created from
the server-read-back ShotReviewModel ETag. The runtime creates one independent
variant per locale (`es-MX`, `pt-BR`, or `en-US`), keeps 37 source-shot mappings,
and stores manual revisions and AI candidates append-only.

The read API also returns the exact strong revision in
`X-Shot-Review-Revision`. Clients must prefer this application header over the
standard `ETag`, because HTTP compression layers may legally weaken the latter.
When the current immutable Snapshot reports the same `shot_review_revision`, the
client reuses it and enters the market gate without another confirmation write.

Page load and variant reads never call a model. A model call occurs only after the
user creates a market variant, asks for a single-shot candidate, or confirms the
current variant for fresh whole-episode QA. No image or video Provider is part of
Step02.

Authoritative APIs:

```text
POST /api/projects/:id/step01/confirm
GET  /api/projects/:id/step01/snapshots/current
GET  /api/projects/:id/step02/variants
POST /api/projects/:id/step02/variants
GET  /api/projects/:id/step02/variants/:variantId
POST /api/projects/:id/step02/variants/:variantId/shots/:shotId/revisions
POST /api/projects/:id/step02/variants/:variantId/shots/:shotId/candidates
POST /api/projects/:id/step02/variants/:variantId/shots/:shotId/adopt
POST /api/projects/:id/step02/variants/:variantId/confirm
```

All writes require owner binding and current ETag readback. Variant creation also
requires the exact idempotency key:

```text
sha256(project_id + ":" + snapshot_sha256 + ":" + locale + ":whole_episode_v1")
```

Snapshot, variant, candidate, and revision-chain hashes are verified again on
every authoritative read. Concurrent writes for one variant are serialized and a
stale write receives `409` instead of creating two sequence entries. A server
restart scans only persisted `created` or `generating` variants, reuses completed
batches and the saved global context, and resumes the unfinished batches. A
terminal `failed` variant is retried only by an explicit idempotent user action.

`qa_failed` is an editable state. The website must display the relevant findings,
allow manual shot revisions, and let the user explicitly run confirmation QA
again. It must not hide the failure, auto-apply a candidate, or issue a model call
from page load, refresh, polling, or ordinary reads.

Every localized row keeps a one-to-one source binding: `source_shot_ids` must
contain only that row's `shot_id`. Merge, split, or added-beat intent belongs in
`structure_change`; it must not duplicate another row's source binding.

Source dialogue, OCR, manual notes, and visible screen text are untrusted evidence.
They are never model instructions and cannot expand the server tool allowlist.
