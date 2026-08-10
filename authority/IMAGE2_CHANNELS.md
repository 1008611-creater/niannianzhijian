# Image2 Channel Registry

This registry contains non-secret routing metadata only. API keys never belong
in this file, a Skill, source code, prompts, logs, or Git.

## `yunfei-1k`

- Base URL: `https://img.yunfei.best`
- Model: `gpt-image-2`
- Supported size: `1024x1024` only
- Intended use: square asset experiments and low-resolution previews
- Not suitable for: the authoritative 2048x1152 desktop interface targets
- Credential location: protected server environment (`YUNFEI_IMAGE2_1K_API_KEY`), outside this repository

The existing `krill-image2` Skill already enforces the channel's 1K size
restriction. A working protected credential must be configured locally before
execution; this registry does not authorize a Provider call by itself.

## `yunfei-hd`

- Base URL: `https://img.yunfei.best`
- Model: `gpt-image-2`
- Supported sizes: `2048x1152` (2K) and `3840x2160` (4K) only
- Intended use: authoritative desktop interface targets and high-resolution page redraws
- Not suitable for: square 1:1 asset experiments (use `yunfei-1k`)
- Credential location: protected server environment (`YUNFEI_IMAGE2_HD_API_KEY`), outside this repository

## Size routing rule (2026-08-10)

- 1K square assets (`1024x1024`) use the `yunfei-1k` key.
- 2K (`2048x1152`) and 4K (`3840x2160`) use the `yunfei-hd` key.
- Never mix the two keys; never write either key into this file, a Skill,
  source code, prompts, logs, or Git.
- The canvas exposes each channel as an independent Image2 model. Selecting the
  1K channel persists `1024x1024 / 1:1`; selecting the HD channel persists
  either `2048x1152 / 16:9` or `3840x2160 / 16:9`. Unsupported combinations
  are rejected before a provider request is sent.
