# Image2 Channel Registry

The Canvas uses only Yunwu Image2. Credentials are injected through Agent
Vault and never belong in this file, a Skill, source code, prompts, logs, or
Git.

## Yunwu Image2

- Text-to-image: `yunwu-gpt-image-2-c`, `2160x3840`, `9:16`.
- Image-to-image: `yunwu-gpt-image-2-c-edit`, `3840x2160`, `16:9`.
- Provider: Agent Vault-backed Yunwu service.
- Unsupported channel identifiers and unsupported size/aspect combinations are
  rejected before a provider request is sent.
