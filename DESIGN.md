---
name: "念念 AI"
description: "项目级 AI 视频生产工作台的视觉与交互合同"
colors:
  workspace: "#000000"
  surface: "#18181B"
  surface-raised: "#27272A"
  foreground: "#FAFAFA"
  muted: "#A1A1AA"
  border: "#3F3F46"
  action: "#F8FAFC"
  action-text: "#18181B"
  destructive: "#EF4444"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  control: "4px"
  panel: "6px"
spacing:
  tight: "8px"
  standard: "16px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  tool-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
---

## Overview

**Creative North Star: "电影感留在首页，生产决策留给工具。"** 念念 AI 是项目级视频生产工具，不是通用 AI 营销页。用户进入项目后，应先识别项目与当前动作，再看到真实状态、证据、下一步和交付物。

**The Protected Surface Rule.** 首页、已经由用户批准的工作台三入口、导演台和 Step01-Step04 是既有视觉证据。新功能不得借由共享 CSS、通用脚本或路由清理改变它们；需要重做时必须另行建立同一项目数据下的桌面与移动端对比。

**The Truthful Tool Rule.** 不用 mock、演示数据、Provider 原始回执或文件存在状态伪装生成完成。只有网站可读取的项目产物才可显示为交付。

## Colors

新建项目工具页使用近黑工作区、层级化深灰面板、暖白内容和中性灰边界。白色动作色只强调一个当前操作；红色只表示破坏性操作或明确失败。新页面不引入紫色、玫红、靛蓝、装饰渐变、玻璃拟态或环境光球。

**The Neutral Evidence Rule.** 状态必须同时依靠文案、图标或结构表达，不能只依赖颜色。已批准旧页面中的历史色彩不扩散为新页面规范。

## Typography

采用现有本地可用的无衬线字体栈。项目身份和当前动作使用紧凑清晰的标题层级；证据、状态、时间和元信息保持可扫读，不使用营销式巨型标题或人为缩小的小字。

**The Operational Hierarchy Rule.** 工具页的阅读顺序固定为：项目身份、当前动作、真实状态、下一动作、交付或恢复。长解释文字不是默认内容。

## Layout

桌面端工具页为高密度、稳定轨道的操作界面；移动端按项目身份、当前状态、主操作、证据列表的顺序折叠。工作台首屏只保留三个等权入口。画布保持空间连续性，侧栏、检查器和浮层不能遮挡退出、保存、错误与主要操作。

**The Stable Geometry Rule.** 固定格式控件、工具栏、节点、预览与状态区必须有稳定尺寸约束；加载、长项目名、错误文本或状态变化不能推挤画布和主操作。所有新页面在 `390px` 不得出现横向滚动。

## Elevation & Depth

以层级面板、细边框和轻微阴影表达深度，而非大面积悬浮卡片。模态框、工具检查器和画布浮层可以高于工作区；页面分区不是漂浮卡片堆叠。

## Shapes

控件使用克制的小圆角，面板最多 `6px`。图标按钮保持稳定的正方形触控区，图标来自一致图标库；只有明确命令可使用文字按钮。

## Components

- 主按钮：每页只有一个与当前任务对应的主操作；加载和禁用状态不改变尺寸。
- 次按钮与图标按钮：用于返回、关闭、缩放、撤销、重做、过滤和检查；陌生图标必须有悬停提示。
- 节点：标题、输入/输出端口、状态和结果引用清晰分层；节点存储资产 ID 与任务 ID，不展示私有 URL 或 Provider 细节。
- 状态：排队中、处理中、需要处理、已完成、失败与恢复动作必须为业务语言。
- 交付项：仅展示当前项目且网站可读的 Word、图片、视频或其他媒体；打开、播放和下载是独立的真实动作。

## Do's and Don'ts

- 保持首页不动；新产品页沿用黑白近黑、紧凑、安静、可扫描的工具方向。
- 为键盘焦点、错误、空状态、权限拒绝、长文本和 `prefers-reduced-motion` 提供完整状态。
- 动效只解释节点连接、任务状态、导入完成、面板切换和镜头预览；只使用 `transform` 与 `opacity`，时长约 150-220ms。
- 不新增“第四个入口”、假指标、装饰性徽章、营销段落或低价值演示界面。
- 不把浏览器本地状态、Provider Key、签名链接、文件路径、任务编号、SHA 或内部提示词显示给用户。
