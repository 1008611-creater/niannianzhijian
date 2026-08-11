# Shot Review API 与修订合同

这是供共享 server/UI 后续实现的版本化合同，不代表现有 `server.js` 已提供这些端点。现有现场 API 只投影 Step01 evidence/source facts；尚无 revision store 或 single-shot reanalysis 端点。

## 读取模型

`GET /api/projects/{project_id}/shot-review?analysis_run_id={analysis_run_id}`

- `200`：返回 `ShotReviewModel`；ETag 为模型的 evidence binding + active revision vector。
- `404 PROJECT_NOT_FOUND`：项目不存在或不属于当前用户。
- `409 EVIDENCE_BINDING_MISMATCH`：project/run/source binding 不一致，fail closed。
- 读取只合并 active overlay 的投影；底层 evidence 和历史 overlay 原文始终保留。

`GET /api/projects/{project_id}/shot-review/shots/{shot_id}` 返回单镜头投影和该镜头 revision history。历史必须按 append sequence/created_at 可追溯，不能只返回最新值。

## 人工修订

`POST /api/projects/{project_id}/shot-review/shots/{shot_id}/revisions`

请求体遵循 `revision-overlay.schema.json`，同时要求：

- `If-Match: "{base_revision-or-evidence-etag}"`；header、body.base_revision 和服务端当前 active_revision 三者必须一致。
- `revision_id` 全局唯一；相同 ID + 完全相同 body 可安全重放并返回原 `201` 结果，不同 body 使用同 ID 返回 `409 IDEMPOTENCY_PAYLOAD_MISMATCH`。
- changed_fields 必须与 patch 顶层键完全相同；禁止 patch `frames`、时间范围、source binding、analysis run 或原始 evidence。
- stale/missing base 返回 `409 REVISION_CONFLICT`，响应含 current_revision；事务不得追加历史、不得改变 active revision。
- 成功时原子地 append overlay 并将 active pointer 移向新 revision；返回 `201`。不得 update/delete 旧 revision。

## AI 单镜头重分析

`POST /api/projects/{project_id}/shot-review/shots/{shot_id}/reanalysis`

请求遵循 input schema，并要求 `Idempotency-Key` header 等于 body 值。key 的规范生成式为：

`sha256(project_id + ':' + analysis_run_id + ':' + shot_id + ':' + (base_revision || 'evidence') + ':' + evidence_binding_sha256 + ':' + sorted(requested_fields).join(','))`

同 key + 同规范化请求必须返回同一持久化 candidate/result，不重复推理；同 key + 不同请求返回 `409 IDEMPOTENCY_PAYLOAD_MISMATCH`。服务端必须先核对当前 base；stale base 返回 `409 REVISION_CONFLICT`，不得调用分析执行器。

允许输入严格限于：当前 shot 的 `[start_sec,end_sec]`、恰好 start/mid/end 三帧的 immutable 引用、已经由本合同映射的 dialogue/forced_alignment/OCR。禁止传原片路径、其他镜头帧或文本。

输出遵循 output schema。`candidate_revision.actor_type=ai_candidate`，`requires_user_confirmation=true`，并且 candidate 创建时不得改变 active revision。用户明确采用时，客户端把 candidate 作为新的 revision POST；服务端再次校验 base，成功后才改变 active pointer。拒绝 candidate 只记录审计状态，不删除候选或证据。

## Skill 路由边界

- 当前合同只定义逻辑能力 `shot-review-single-shot-reanalysis/v1`，没有授权或调用任何现存模型/Provider。
- 后续 controller 只能把 schema 已校验的单镜头封包交给专用实现；实现不得转发到整片生产 router，不得调用 `mx-shortdrama-02-source-timeline`，不得启动 Step02–05。
- capability manifest 必须声明 `scope=single_shot_evidence_only`、`external_tools=false`、`provider_submission=false`、`step02_start=false`。任一声明不满足即 `422 REANALYSIS_SCOPE_REJECTED`，且不执行。
- 专用实现只能返回结构化 candidate；它没有写 evidence、采用 revision、发送、部署或消费付费资源的权限。

## 错误与审计

所有写请求记录 request/revision ID、actor type、source evidence binding、base、changed fields、created_at 和结果码；不得记录图像 signed URL、Authorization、Cookie、Token 或任何凭据。日志中的本地 evidence path 也应使用相对 artifact ID，而不是外部可访问 URL。
