# Projects Surface Contract

**Mode:** Operate  
**Purpose:** 让用户找到自己的项目、创建项目并进入项目工作台。  
**Primary action:** 创建项目或打开一个已有项目。

## Structure

- Hallmark structural reference: `Ecosystem Index` for project discovery, adapted to an authenticated product surface.
- Show the user's projects, not a global task dump.
- Keep project identity, current business status, next user action, and last activity scannable.
- Use filters only when they reduce retrieval time; do not add decorative statistics.

## Required states

- 首次使用：没有项目时只显示创建项目。
- 有项目：项目列表和明确的打开项目动作。
- 加载中：保留稳定布局，不跳动。
- 暂时读取失败：保留登录态，提供重试，不显示内部错误。
- 无权限：不泄露项目名称、素材、任务或交付信息。

## Visual constraints

- Black/white/near-black only, with neutral borders and restrained emphasis.
- No purple, magenta, indigo, gradients, glass blur, or retired top Logo.
- Project items may be framed individually; the page itself is not a stack of nested cards.
- Desktop density supports repeated scanning; mobile collapses each project to identity, status, and one action.

## Acceptance

- A signed-in user can create or open only their own project.
- Project selection leads to `/workspace/:projectId`.
- `390px` has no horizontal overflow and keeps the primary action visible.
- No internal paths, Provider IDs, hashes, or private media URLs appear.
