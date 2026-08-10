# Image2 Channel Registry

This registry contains non-secret routing metadata only. API keys never belong
in this file, a Skill, source code, prompts, logs, or Git.

## `yunfei-1k`

- Base URL: `https://img.yunfei.best`
- Model: `gpt-image-2`
- Supported size: `1024x1024` only
- Intended use: square asset experiments and low-resolution previews
- Not suitable for: the authoritative 2048x1152 desktop interface targets
- Credential location: protected local channel configuration, outside this repository

The existing `krill-image2` Skill already enforces the channel's 1K size
restriction. A working protected credential must be configured locally before
execution; this registry does not authorize a Provider call by itself.

## `yunfei-hd`

- Base URL: `https://img.yunfei.best`
- Model: `gpt-image-2`
- Supported sizes: `2048x1152` (2K) and `3840x2160` (4K) only
- Intended use: authoritative desktop interface targets and high-resolution page redraws
- Not suitable for: square 1:1 asset experiments (use `yunfei-1k`)
- Credential location: protected local channel configuration, outside this repository

## Size routing rule (2026-08-10)

- 1K square assets (`1024x1024`) use the `yunfei-1k` key.
- 2K (`2048x1152`) and 4K (`3840x2160`) use the `yunfei-hd` key.
- Never mix the two keys; never write either key into this file, a Skill,
  source code, prompts, logs, or Git.
