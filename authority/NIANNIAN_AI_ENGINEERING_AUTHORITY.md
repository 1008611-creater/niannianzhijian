# NianNian AI Engineering Authority

Status: local evidence handover, 2026-08-10. This file records the current
engineering boundary; it does not authorize production deployment.

## Source authority

- Canonical working root: `E:\codex\niannianai\niannianai`
- Baseline evidence: `release_baseline_review_evidence_20260809_canonical_main.json`
- Baseline attestation: `release_baseline_attestation_20260809_canonical_main.json`
- The baseline evidence captured revision `a60964aece7ed76b30e4cf749a4c3f6573f2daad` and explicitly did not claim online parity.
- The current documentation work is on the Issue 51 feature branch. It must be merged through the repository workflow before it becomes a release input.

## Protected product surfaces

Preserve the current NianNian homepage and brand, the Studio project library,
the current Studio canvas family, resource library, Image2 and H3 adapters,
Step01-Step04 contracts, and the director-desk route. Do not restore the retired
Nomi self-built canvas, `#canvas`, or `owned-canvas-director-import`.

## Evidence and change rules

1. A target image freezes hierarchy and protected surfaces; it is not proof of a working feature.
2. A local HTTP response, build, task id, or screenshot is not a user delivery; the user must open or download a real Word or video result.
3. A visible change requires clean-browser evidence at 1440x900 and 390x844, plus the relevant persistence and delivery readback.
4. One write owner controls each file range. Cross-boundary API changes are isolated in their own reviewable change.
5. Credentials, cookies, user media, signed URLs, raw provider responses, and runtime state stay outside source, documents, issues, and Git.

## Current beta capability boundary

The planned beta scope is ASXS text with `gpt-5.6-luna`, RunningHub Image2, and
RunningHub H3. Audio, 3D generation, whiteboard, panorama, and scene-3D remain
edit/reference-only until a complete server execution path exists.

## Image2 routing metadata

The user-supplied `yunfei-1k` channel is recorded in
`authority/IMAGE2_CHANNELS.md` as a 1024x1024-only fallback. It cannot replace
the required 2048x1152 desktop visual direction image. Its credential remains
outside the repository and must never be copied into a Skill or document.

## Known gaps

- The historical `authority/README.md`, prior engineering authority file, V1 project brief, and approved homepage screenshot were not present in the current repository or the checked rollback archive when audited.
- The current visual direction image is a real NianNian brand reference copy because the attempted Krill channels returned 403/429; it is not an Image2 generation result.
- Online parity remains unverified and deployment remains unauthorized.
