# 权威目标图对照表（2026-08-10）

本批目标图以线上真实页面截图（`https://ai.cauai.fun/`）为来源，按
`authority/IMAGE2_REFERENCE_WORKFLOW.md` 的 Reference 优先级生成；项目管理
页中的真实项目编号与名称已替换为示例数据（`NN-EXAMPLE-*`），不包含用户
媒体或真实项目数据。

## 渠道说明

历史 2K 重绘渠道曾用于目标图入库；当前静态图片渠道已统一为云雾。项目管理目标图
`01-project-hub-desktop.png` 已于 2026-08-10 由新实现真实页面截图经
历史图生图重绘为 2K 源图，再缩放到 1440×900 入库；其余目标图
仍为“真实截图 + 标注”方案，结构、品牌、文案与可见控件保持原样，不
虚构能力。2K 源图为 16:9，权威视口为 16:10（1440×900），入库时按
左对齐裁剪以保留完整六项导航；右侧账户区与操作列末端为裁剪取舍，不
代表实现缺失。

## 对照表

| 目标图 | 真实来源（2026-08-10） | 视口 | 现状关键点 | 目标提升点 |
| --- | --- | --- | --- | --- |
| 00-home-desktop.png | `https://ai.cauai.fun/#home` | 1440×900 | 首页保持现状；权威基线为 `authority/approved/homepage/r11-1440.png` | 不参与 Image2 重绘；主 CTA 进入工作台 |
| 01-project-hub-desktop.png | 新实现本地验证页 `/#projects`（Issue #60，桌面 1440×900） | 1440×900 | 生产通告单看板：四段可点击计数条、毛线工具条、通告单式行表（序号/身份/类型/状态/细进度/业务下一步/更新时间/继续动作）；示例数据 NN-EXAMPLE-0001~0005 | 已由历史 2K 重绘入库；蓝色=制作中、琥珀=待处理、绿色=已交付、红色=阻塞；无内部节点/渠道名词 |
| 02-studio-canvas-desktop.png | `https://ai.cauai.fun/studio/#/studio?projectId=NN-web-3cb455a8ead644a1a9268e4d820a6b1d` | 1440×900 | 顶部导航、左侧工具、中央画布、文本节点与生成按钮 | 保持画布结构与节点输入完整性表达 |
| 03-generation-inspector-desktop.png | 同一 Studio 画布（生成区） | 1440×900 | 画布内生成检查器与文本结果 | 结果播放/采用/重试按阶段 1 目标图补充 |
| 04-asset-library-desktop.png | 同一 Studio 画布（素材库面板） | 1440×900 | 素材库面板：全部素材/项目素材/智能分组/上传/空状态 | 保留空状态；有素材时显示使用引用 |
| 05-studio-mobile.png | `https://ai.cauai.fun/?_r=ref3-20260810#workbench` | 390×844 | 移动端工作台四入口纵向卡片，无横向滚动 | 保留单列卡片与主操作可达性 |
| 06-workbench-desktop.png | `https://ai.cauai.fun/#workbench` | 1440×900 | 四等权入口卡片 01-04，选中态与箭头 | 与六项导航、路由语义保持一致 |
| 07-studio-project-library-desktop.png | `https://ai.cauai.fun/studio/#/studio` | 1440×900 | Studio 项目库三种开始动作、来源筛选 | 与现有项目列表/最近项目合并语义一致 |
| 08-director-desk-desktop.png | `https://ai.cauai.fun/#director-desk` | 1440×900 | 3D 视口、场景树、机位检查器、主站返回路径 | 保留 3D 视口与受保护路由 |

## 继承矩阵复核

上述每张目标图已按 `docs/frontend-inheritance-matrix.md` 的 A/B/C/D 对照
复核：A 保持受保护表面（首页/Logo/画布/素材库/Image2/H3/Step01-Step04/
导演台路由）；B 不引用旧 Nomi 画布与已撤下入口；C 与当前真实页面结构
一致；D 不因目标图虚构未实现的 Provider 能力。任何后续改动必须先更新本
对照表与继承矩阵，再改目标图。
