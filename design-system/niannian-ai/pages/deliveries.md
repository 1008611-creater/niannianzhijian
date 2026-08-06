# Deliveries Surface Contract

**Mode:** Operate  
**Purpose:** 让用户确认并使用属于当前项目的真实产物。  
**Primary action:** 打开或下载已确认交付物。

## Structure

- Hallmark structural reference: `Index-First`, adapted as a project artifact ledger.
- Lead with project identity and current production state.
- Group artifacts by business result: Word, images, video, other files.
- Each artifact exposes its real state: processing, needs action, ready to open, ready to download, or unavailable.
- Do not show a green completion state from a database record alone.

## Required evidence

- Artifact exists on the server.
- Artifact belongs to the current project and user.
- Website can read it through the public authenticated route.
- Word opens or downloads successfully; media decodes or plays when applicable.

## Recovery states

- Production still running.
- User action required.
- Artifact temporarily unavailable.
- Production failed with a user-readable recovery action.
- Project has no deliverables yet.

## Acceptance

- A delivery is visible only after the real user path has read it successfully.
- Project A cannot read Project B's artifact.
- No local path, signed URL, Provider ID, credential, or internal error appears.
- Desktop and `390px` views keep the primary download/open action usable.
