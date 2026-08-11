# 时间归属合同 `niannian.shot_text_overlap.v1`

所有数值按秒解析；无法解析或缺少必要时间字段的行不得猜测，必须原样进入顶层 `unassigned_dialogue` 或 `unassigned_ocr`，并带 `reason=missing_or_invalid_time`。当前权威 fixture 中两者均为 0。

## Dialogue / forced alignment 区间

对正时长事件 `E=[event_start,event_end]` 与镜头证据区间 `S=[shot_start,shot_end]`，计算：

`overlap_sec = max(0, min(event_end, shot_end) - max(event_start, shot_start))`

`overlap_sec > 0` 时映射。跨镜头文本映射到每个具有正重叠的镜头，保留同一个 `event_id`，并在每个关联中记录 overlap。不能为了单镜头展示而裁改原始文本或原始起止时间。

零时长事件或只发生边界接触、没有正重叠时：若时间等于某镜头 start，归属于该 starting shot；否则若等于某镜头 end，归属于 ending shot；否则进入 unassigned。若同一时刻同时是前镜头 end 与后镜头 start，starting shot 优先，因此只映射后镜头。

`forced_alignment` 与 dialogue 使用相同事件映射，不重算或改写 Qwen3 forced alignment 的原始时间。

## OCR 时间点

OCR 是点事件。候选条件是 `shot_start <= time_sec <= shot_end`。无候选则 unassigned；单候选直接归属；同一边界命中两个镜头时，选择 `start_sec` 最大的镜头，即后开始的镜头。每个 OCR row 恰好零或一个归属，不复制到多个镜头。

## 空集合

镜头没有 dialogue、forced alignment 或 OCR 时，字段值必须是 `[]`。空数组是有效事实，不是 evidence 失败，也不得用占位文本伪造内容。
