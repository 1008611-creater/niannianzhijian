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
