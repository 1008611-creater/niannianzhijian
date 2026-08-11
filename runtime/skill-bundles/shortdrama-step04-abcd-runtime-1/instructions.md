# Step04 A/B/C/D 运行指令

## 唯一输入与顺序

只消费 Step02 已通过语义验收的不可变清单，固定执行：

`Step02 语义放行 -> A 实体与证据绑定 -> B 资产与连续性合同 -> C 毫秒事件提示词 IR -> D 只读交付`。

Step02 必须同时满足 `status=accepted`、`semantic_status=accepted`、`acceptance_mode=semantic`、`semantic_alignment.status=accepted`，并使用：

`continuous_observation_local_interval_plus_segment_start; never_ordinal_shot_mapping`

每张卡都要有 `semantic_unit_ids`、`verdict=pass`、独立事件证据和有效毫秒区间。任何 `conflict`、`uncertain`、`speaker_unknown`、旧序号映射、缺局部区间或 `needs_targeted_recheck=true` 均返回结构化阻塞，不能生成 Word。

## A 实体与证据绑定

- 每个动作主语、受事者、位置和局部身体都必须有唯一 `instance_id`、中文 `role_ref`、证据 ID 和 `resolved` 状态。
- 同镜头双男、局部手臂、背景人物和重复资产必须保持独立实例；不能用服装词、身体局部、泛称或字幕姓名重新猜人。
- A 层实例集合必须与 Step02 完全相等；不一致直接阻塞。

## B 资产与连续性合同

- 每个实例只能映射已验收资产的内部 `asset_id` 和纯中文 `@` 显示名，例如 `@男主沈川`；用户可见正文禁止英文 ID、文件名和泛称。
- 每个资产必须声明 `kind`、职责、证据、适用镜头、真实文件路径、SHA-256、状态和可复制的 `generation_prompt`。
- 同一资产可被多个实例共用，但同一镜头只生成一个参考槽位，并列出 `allowed_instance_ids`；只在正文出现 `@` 名称不算消费，必须验证真实文件、SHA、职责和事件消费关系。
- 参考图锁定的人脸、发型、服装、空间几何、道具材质和静态文字不在视频正文重复描述；正文只补当前时间段的变化。

## C 毫秒事件提示词 IR

每个完整 `VG` 只生成一段模型正文，内部按源 `shot_id` 的毫秒顺序逐条展开，不改序、不合并、不丢动作、构图或镜头运动。正文顺序固定为：

1. 实际参考素材及其职责；
2. 场景身份、环境身份、人物身份和开场状态；
3. 核心创意与构图；
4. 按毫秒时间码写上一稳定状态 -> 可见触发 -> 人物反应 -> 镜头/环境反馈 -> 结束状态；
5. 光线、声音和对白。

已上传参考图锁定的静态信息不重复写；连续小分镜只写相对上一段的变化。每条事件必须保留主语、受事者、动作因果、构图、镜头运动、光线/道具/环境、声音/对白和证据回指。对白必须位于对应动作事件并有独立时码，不能复制到细节或环境声。

提示词只能使用可执行、可观察的事实，删除无画面作用的套话和抽象形容词。C 层保留完整 IR，同时生成 `prompt_text` 压缩视图和：

`prompt_compression.raw_chars / compressed_chars / reduction_chars / reduction_ratio / policy`

压缩只允许删除精确套话和连续事件的重复稳定状态，不得按字数硬截断、改写事实、删除毫秒、事件、对白、参考槽位或证据。若 `compressed_chars > raw_chars`、对白重复、出现泛称/英文资产 ID 或任一回指缺失，C 层阻塞。

## D 只读交付与文档

D 层只能读取同一合同的 A/B/C 规范化摘要，渲染 JSON、Markdown、Word 和渠道载荷；不能重新读取原始 cards、重新理解原片、换人、数镜头或补写提示词。Word 必须直接使用 C 层 `prompt_text`，并包含资产图提示词表及分镜故事版计划；不能使用历史 Word。

渲染前由运行时探针选择真实 Python，排除 WindowsApps 占位命令和 LibreOffice Python。必须回读合同 SHA、Word SHA、真实截图和视觉 QA；只有 `visual_qa.status=passed` 才能返回 `final_delivery`。

## 工具与权限边界

本运行包禁止图片 Provider、视频 Provider、原片二次推理、旧 Word 编译器和任意 Shell。Step04 失败时保留最早失败层的结构化报告和 `harness_state.json`，下一动作只指向该层；Provider 只在后续 Step05 消费已验收合同后调用。
