# 模型配置与积分控制面

## 现状审计

- 权威可修改源码是 `E:\codex\niannianai\niannianai`。`E:\codex\wangzhan` 是通用文档/技能仓，`niannian-web-*` 仅有 Next 编译产物，不能直接修改 `.next` 哈希包。
- 画布 Image2、H3 和动作迁移已经通过 `server.js` 的任务服务与现有服务端适配器执行；浏览器不持有供应商密钥。
- 旧的 `/api/canvas/provider-status` 过去返回供应商地址、凭据配置标志和提交开关；生成授权也没有积分预留、结算、退款流水。
- Next 编译站的 “Failed to fetch” 上传链是预签名对象存储 PUT。当前没有可修改的 Next 源码，根因需要检查 `S3_PUBLIC_ENDPOINT` 的 DNS/TLS、PUT CORS 和代理可达性；Canonical 画布 CAS 上传是同源服务端 multipart 路径，已有独立合同测试。

## 本次最小改造

数据文件位于服务 `DATA_DIR`，不会写入密钥：

- `model-control-config.json`：供应商、模型、租户、启用状态、积分价和 `agent-vault://...` 引用。只保存引用，不接受或回显原始密钥。
- `credit-ledger.json`：追加式 `reserve`、`settle`、`refund`、`admin_adjustment` 流水；同一用户/租户/任务的幂等键只产生一笔变更。

浏览器接口：

- `GET /api/canvas/model-catalog`：只返回当前租户启用模型、能力和 `priceCredits`。
- `GET /api/canvas/provider-status`：兼容旧调用，但已删除地址、凭据标志和 Vault 信息。
- `GET /api/admin/model-config`：管理员脱敏快照。
- `PUT /api/admin/model-config/provider`：管理员维护供应商元数据和 Vault 引用。
- `PUT /api/admin/model-config/model`：管理员维护模型、租户、启用状态和积分价格。
- `POST /api/admin/credits/adjust`、`GET /api/admin/credits/ledger`：管理员授予/审计积分。

生成授权流程现在是：确认费用 → 校验管理员启用的租户模型 → 原子预留积分 → 调用既有服务器任务服务；提交明确失败自动退款，查询到成功结算，查询到失败/复核状态退款。预留、结算、退款都使用任务级幂等键，未知网络状态不自动重提。

## 部署与验证

1. 在服务器 `DATA_DIR` 设置现有 Agent Vault/Provider 环境变量；不要把密钥放入模型配置 JSON、任务记录、前端或 Git。
2. 用管理员身份调用模型配置接口启用模型并设置积分价；普通用户刷新后只会看到可用模型。
3. 运行 `npm run typecheck`、`npm run lint`、`npm run build`，再运行 `npm run test:model-control-plane-http`、`npm run test:canvas-generation-http`、`npm run test:canvas-assets-http`。
4. 发布前从完整活动包启动隔离候选，检查 `/api/health`、登录、模型目录、素材上传和 dry-run；本次实现不发起付费 Provider 调用，也不自动部署生产。

## 尚未完成

`E:\codex\niannian-web-project-management-stage-20260814` 没有可验证的 Next/TypeScript 源码入口，因此无法安全把管理员菜单从该编译站重建出来，也不能通过修改 `.next` 文件声称完成。需要补回对应源码仓或提供构建入口后，再把管理员配置页接到上述接口；在此之前，普通用户不会收到配置入口或敏感状态。
