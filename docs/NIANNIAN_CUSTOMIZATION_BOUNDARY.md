# 念念智剪定制边界

这份记录用于同步 OpenChatCut 上游更新。它回答两个问题：哪些路径属于念念智剪定制，哪些上游变更可以直接吸收。

## 当前基线

- 定制基线：`e80afe0`（上游原始编辑器基线）
- 当前稳定分支：`codex/qwen-forced-aligner-cuda126`
- 上游远程：`upstream/main`
- 生成完整路径清单：`node scripts/niannian-customization-manifest.mjs`
- 历史上“删除”的源码同样属于定制边界；上游重新添加这些文件时必须人工审阅，不能按新增文件自动合并。

## 定制能力和主要 Owner

| 能力 | 主要路径 | 同步规则 |
| --- | --- | --- |
| MiMo ASR/TTS、自定义供应商 | `server/plugins/mimo-*`, `server/plugins/voice-*`, `src/generate/voice.ts`, `src/agent/skills/voice/` | 上游触碰时手工移植；不得恢复旧 Provider 注册表 |
| Qwen3 ForcedAligner | `server/plugins/qwen-forced-aligner.ts`, `server/qwen-forced-aligner-worker.py`, `src/transcript/qwenForcedAligner.ts`, `src/agent/tools/forced-aligner-tools.ts`, `local-wsl-dev/setup-qwen-forced-aligner.sh` | 保留 CUDA 12.6、词/字级完整覆盖校验；上游本地 ASR 不直接替换 |
| SSO、积分和念念账户边界 | `server/plugins/niannian-account.ts`, `server/plugins/niannian-smart-cut.ts`, `server/proxy.ts`, `vite.config.ts` | 只允许手工移植，禁止自动覆盖线上回调、密钥和扣费边界 |
| 预览、上传和导出修复 | `src/components/preview/`, `src/media/`, `src/export/`, `server/plugins/media-preview.ts`, `server/plugins/upload-*`, `server/plugins/export-*` | 逐文件验证真实浏览器、预览和导出；上游独立修复可先合并到同步分支 |
| 智能剪辑和 Agent 工作流 | `src/agent/`, `src/components/chat/`, `src/agent/tools/rough-cut-*`, `server/plugins/asset-intelligence.ts` | Agent runtime、只读工具、素材引用和 MiMo 口播需手工适配 |
| 品牌与中文界面 | `public/niannian-logo.svg`, `src/i18n/`, `src/index.css`, `index.html`, `src/components/` | 保留“念念智剪”品牌；上游 UI 变更逐项审阅 |
| 本地 WSL 与发布适配 | `local-wsl-dev/`, `ITERATION_PLAN_ZH.md`, `.env.example`, `package.json`, `package-lock.json` | 本地 WSL 先验收；发行包排除媒体、`.env` 和凭据 |

## 同步判定

```text
上游提交文件列表
  -> 与定制路径和历史删除路径求交集
  -> 无交集：可在同步分支自动 cherry-pick
  -> 有交集：手工移植并运行对应 verify/build
  -> 触碰生产配置、密钥、媒体、SSO/积分：禁止自动合并
  -> 本地 WSL 浏览器验收通过：制作完整候选并一次性发布
```

## 已知暂缓的上游方向

- Agent ToolActivation/只读激活：当前念念智剪已删除上游文件，需移植到现有 runtime，不能恢复旧模块。
- 本地 Whisper、音乐智能、视觉几何和大范围项目存储：会触碰 MiMo、Qwen3、素材存储或服务端边界，单独评估。
- 外部 Agent 服务端直编、桌面自动更新和 Provider 注册表：不符合当前线上发布边界，暂不自动同步。

## 维护方式

每次同步在独立 `sync/upstream-*` 分支完成；稳定分支只接收经过本地 WSL 构建、真实浏览器路径和导出验证的候选。同步提交、跳过的冲突及手工移植结果写入对应提交说明，不把用户媒体、密钥或临时 URL 写入仓库。
