# Short-Drama Input Surface Contract

**Mode:** Operate  
**Purpose:** 收集当前项目的剧本输入，创建一个可追踪的真实短剧任务。  
**Primary action:** 保存输入并创建项目任务。

## Structure

- Use a focused single-task form, not a marketing hero and not a seven-stage legacy production canvas.
- Required input: script text or `.docx`, project requirements, and rights confirmation.
- Show the current project identity and a clear return path.
- After submission, move to a project-bound status view; do not leave the user in a modal with an ambiguous success message.

## States

- Empty input.
- File validation.
- Text input.
- Uploading and resumable upload.
- Rights confirmation missing.
- Submission in progress.
- Already submitted with the same idempotency key.
- Production queued, processing, blocked, failed, and delivered.

## Copy constraints

- Explain the next user action and real business state.
- Do not show employee thread IDs, Provider task IDs, internal paths, SHA values, or raw error codes.
- Do not claim video generation when only script ingestion or a Word artifact exists.

## Acceptance

- The saved script remains visible after refresh.
- A repeated submission does not create a duplicate production task.
- The project delivery page can open or download the real fourth-step Word when it exists.
- Cross-project access is rejected without leaking the other project's existence.
