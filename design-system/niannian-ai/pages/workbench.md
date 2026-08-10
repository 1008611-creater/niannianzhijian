# Workbench Surface Contract

**Mode:** Operate  
**Purpose:** 在当前项目中选择创作工具。  
**Primary action:** 进入四个正式入口之一。

## Structure

- Hallmark structural reference: `Workbench`.
- The first viewport contains exactly four parallel entry units:
  1. 无限画布
  2. 一键转绘
  3. 一键制剧
  4. 智能剪辑
- Do not add a fifth tool, a task dashboard, a fake progress bar, or an explanatory marketing section to the first viewport.
- Project name and return-to-projects action remain visible without competing with the three entries.

## Entry contracts

- 无限画布 -> formal `/studio/` project deep link.
- 一键转绘 -> project-bound source-video input route; not the retired seven-stage surface.
- 一键制剧 -> project-bound script input route; not an unowned global modal.
- 智能剪辑 -> external editor entry with the current capability state.

## States

- Current project loading.
- Four entries ready.
- One entry unavailable because its backend production contract is not yet released.
- Auth or project ownership failure.
- Return navigation.

## Visual constraints

- Four entries share a visual grammar but are not generic nested cards.
- Use neutral monochrome differentiation through typography, rules, spacing, and iconography; no hue-coded product colors.
- Entry labels describe the user result, not implementation details.
- Do not display Provider names, internal job IDs, or “completed” before a real project delivery exists.

## Acceptance

- Exactly four entry units are visible in the first viewport.
- Each entry has one real same-site destination.
- Desktop and `390px` layouts remain coherent with no overlap or horizontal scroll.
- Home, Studio, Director Desk, Step01, and Step04 protected surfaces do not change from a workbench-only edit.
