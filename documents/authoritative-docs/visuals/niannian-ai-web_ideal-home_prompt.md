# 念念 AI 主站目标首页 / 工作台首屏 Image2 提示词

## 生成记录

- 参考图：`E:/codex/niannianai/niannianai/assets/home/niannian-hero-oil-paint-quiet-v1.png`
- 要求中的批准参考图：`authority/approved/homepage/r11-1440.png`（当前项目缺失，待补齐）
- 输出图：`E:/codex/niannianai/niannianai/documents/authoritative-docs/visuals/niannian-ai-web_ideal-home.png`
- 模型：`gpt-image-2`，尺寸：`2048x1152`

## Prompt

Create a high-fidelity visual direction board for the NianNian AI short-drama creation platform's target homepage/workbench first viewport. Use the supplied dark oil-paint brand texture as a color and material reference only; do not copy its composition. The product is a project-centered production workspace, not a generic AI marketing landing page.

Composition: a wide 16:9 dark editorial production environment with black and deep-gold liquid-paint material, high contrast warm-white typography areas, and one restrained magenta accent. Use an asymmetric left content rail and a broad right project-status workspace with generous negative space. The first viewport should visibly communicate: a primary create-project action, three real production entry labels (一键短剧, 一键转绘, 无限画布), a compact project production status strip, and a real delivery-oriented destination such as 可打开 / 可下载成果. Show a believable project-center hierarchy: current project identity, one active scene or episode, input readiness, task status, and delivery state.

Visual language: quiet cinematic black shell, deep gold liquid highlights, subtle paper/oil texture, crisp warm-white type blocks, thin neutral dividers, restrained magenta selection marker. The visual should feel like a professional film-production desk with a clear next action, not a dashboard full of decorative metrics.

Strict exclusions: no purple or blue AI gradients, no glassmorphism, no floating decorative orbs, no generic three-card marketing layout, no fake analytics dashboard, no provider names, no API keys, no internal task IDs, no server paths, no signatures, no fake buttons, no fake navigation, no fake form controls, no unreadable tiny UI text, no copied website composition, no third-party logos or proprietary assets. Keep all visible controls as abstract visual placeholders only; the implementation will use real HTML components.

Output a polished visual direction image only, with no explanatory annotations and no embedded browser chrome. Preserve safe empty areas where real HTML text and controls can later be placed. Use 2048x1152 landscape framing.

## 生成状态与人工审图结论

- 2026-08-10：默认 `krill` 渠道返回 HTTP 403，原因是令牌没有服务 `gpt-image-2` 的渠道权限。
- 2026-08-10：已配置 `meinianda` 渠道返回 HTTP 429，原因是无可用令牌池。
- 因此当前输出路径暂存仓库现有真实品牌主资源 `assets/home/niannian-hero-oil-paint-quiet-v1.png` 的可审阅副本；它不是本次 Image2 生成结果，不得视为目标图最终通过。
- 当前可审结论：黑色/深色油画质感和洋红单一强调色可作为品牌基线；项目创建、三入口、生产状态条和交付导向尚未由图像生成验证，待 Krill 渠道恢复后原位替换并重新审图。
- 该图只作为视觉方向图，不作为可交互页面证据；真实导航、按钮、项目状态和下载必须由 HTML/前端组件实现。
