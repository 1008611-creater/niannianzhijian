# 系统边界与共享代码清单

**记录日期：** 2026-07-13 (Asia/Shanghai)  
**目的：** 只建立当前代码、运行时和交接边界的事实与护栏。本文不决定产品合并、不修改业务逻辑、不代表线上状态实时探测，也不读取凭据。

## 结论先行

1. `ai.cauai.fun` 当前的主网站、一键转绘和小说一键生成短剧共享同一个 Node 应用目录与同一套本地 JSON 数据模型；它们不是可独立合并的两个仓库。
2. `sd2.cauai.fun` 是独立的 Next.js 应用 `niannian-ai-web`，拥有独立认证、积分、任务与 Mac agent 协议。它与前者存在产品名称和 Mac/Codex 概念上的关联，但本次盘点没有发现两者之间的直接 API、数据库或共享源码依赖。
3. `mature-web` 是 canonical-local 内嵌的另一套 Next.js 私测原型；其 README 明确说明不读取旧站的用户、会话、上传、bridge 事件或凭据。它不是本次确认的 `ai.cauai.fun` 当前运行源。
4. `server.js`、`mvp.js`、`product.css` 和 controller bridge 是高冲突共享资产。canonical-local 目录当前不是 Git 工作树，因此没有分支、提交或三方合并来防止并发覆盖。

## 系统映射

| 表面 / 产品域 | 源码目录 | 已知运行与发布边界 | 认证与数据 | 任务与 Worker | 本次判断 |
| --- | --- | --- | --- | --- | --- |
| `ai.cauai.fun` 主站 + 一键转绘 | `E:\codex\aisp\aidaihuo\niannian-ai-canonical-local` | 本地预览在 `127.0.0.1:4188`。既有发布交接记录指向 Linux 上的 Node 服务；本次未登录或实时修改该服务。 | `server.js` 使用 email/password 用户、哈希会话 Cookie；本地默认 `data-local`，实际由 `DATA_DIR` 选择数据目录。 | 转绘项目、Step01 预检、Windows controller bridge、Mac forced-command relay 与 isolated Codex receipt 链路。provider/package-send 仍由合同门禁控制。 | **当前主站 / 转绘实现**。 |
| `ai.cauai.fun` 小说一键生成短剧 | **同上，同一 canonical-local 根目录** | 与主站同一 Node 进程、同一静态前端包和同一发布边界；没有独立域名、独立服务或独立仓库。 | 同一 users/sessions；小说业务另写 `script-projects.json`、`script-sources`、`script-workspaces`，但仍在同一 `DATA_DIR` 根下。 | N00-N07 状态、DOCX/文本导入、N01 worker 合同及后续 N05/N06 门禁都在同一个 `server.js`/`mvp.js`。 | **同服务中的功能域，不是独立应用。** |
| `sd2.cauai.fun` 视频工作台 | `E:\codex\aisp\aidaihuo\niannian-ai-web` | Next.js 15；本地默认 `3026`；Nginx 配置将 `sd2.cauai.fun` 代理到远端 `127.0.0.1:18084`。其项目清单记录腾讯云 Lighthouse + Docker Compose + Cloudflare DNS 发布链路。 | 自身 email/password/OTP；PostgreSQL，未配置时可 SQLite fallback；自有 credits、credit ledger 与管理接口。 | 自有 `video_task_spec`、server worker、`mac-agent` claim/heartbeat/result 协议和渠道脚本。 | **独立视频工作台，禁止由主站/小说改动者顺手修改。** |
| `mature-web` 私测原型 | `E:\codex\aisp\aidaihuo\niannian-ai-canonical-local\mature-web` | 独立 Next.js，本地常用 `4190`。README 说明生产需要 PostgreSQL、Redis、COS 和密钥管理。 | 开发模式 `.local/beta-store.json`，明确不读取旧站本地用户、会话、上传、bridge 事件。 | provider、真实 worker、部署、发送默认关闭。 | **平行原型，不是 canonical Node 站的生产事实来源。** |

## `ai.cauai.fun` 的共享与专属资产

### 强共享资产：必须串行交接

| 文件 / 服务 | 共享原因 | 主要风险 |
| --- | --- | --- |
| `server.js` | 同时含认证、会话、转绘上传/预检/项目 API、小说文本/DOCX/N00-N07 API、controller 接口。 | 一方的宽泛重构、路由排序变化或数据结构变更可直接破坏另一条生产链。 |
| `mvp.js` | 同时渲染主网站项目入口、转绘工作台/制作台、小说 N00-N07 制作台。 | 同文件内的状态、哈希路由、事件委托和 UI 文案容易被整体覆盖。 |
| `index.html`、`product.css`、`styles.css` | 两个域共用应用壳、项目创建入口与视觉层。 | CSS/DOM class 或共享入口变更会跨域回归。 |
| `data-local`（或部署时的 `DATA_DIR`） | 同一 users、sessions、审计与两类项目目录共用数据根。 | 迁移、清理和数据 schema 修改会影响两个域；不应以手工 JSON 改写替代 API。 |
| `bridge/niannian_controller_bridge.js`、Step01 reducer/orchestrator、relay/dispatcher 合同 | 转绘控制面和网站状态投影使用它们；小说也复用 worker dispatcher 的入口、任务约束与 receipt 基础合同。 | 改动 allowlist、receipt 状态、来源哈希或调度规则可能同时影响 Step01 和 N01。 |

### 以功能为界的专属资产

| 归属 | 主要专属内容 | 备注 |
| --- | --- | --- |
| 转绘 | 视频 MIME/时长预检、`sourceVideo` 上传、Step01 证据与源视频项目合同、`test_redraw_step01_flow.js` | `sourceVideo` 等内部字段是既有合同名；用户文案可称“参考视频”，不应为文案改名破坏接口。 |
| 小说 | `script-projects.json`、`script-sources`、`script-workspaces`、DOCX 文本抽取、N00-N07、`test_script_project_flow.js`、`test_script_worker_dispatcher.js`、N05 相关测试 | 仍依赖共享认证、路由、前端壳和 dispatcher。 |
| SD2 视频工作台 | `niannian-ai-web/app`、`lib`、`scripts`、`mac-agent`、PostgreSQL schema、credit ledger、Nginx `sd2.cauai.fun.conf` | 单独维护。其 LDXP/积分实现不应复制进 canonical 主站。 |

## 已验证集成与未验证关联

| 关系 | 证据等级 | 事实 |
| --- | --- | --- |
| canonical 主站 ↔ 转绘 controller ↔ Mac relay | 代码级已验证 | canonical bridge 包含 claim、来源 SHA、job materialization、dispatch/receipt 投影；Mac gateway 仅允许 `status` 与 `execute-once`。 |
| canonical 主站 ↔ 小说 N00/N01 worker | 代码级已验证 | `server.js` 创建小说任务合同，`mvp.js` 显示 N00-N07；dispatcher allowlist 接受 `niannian_ai_web_script`。 |
| canonical 主站 ↔ `sd2.cauai.fun` | **未发现当前直接集成** | 本次静态检查未发现指向当前 `E:\codex\aisp\aidaihuo\niannian-ai-web`、`sd2.cauai.fun`、端口 `3026/18084` 的跨域 API、共享数据库、共享 session、共享项目记录或 shared import。二者仅在“念念 AI / Mac Codex / 视频生产”产品概念上相关。 |
| canonical 主站 ↔ `mature-web` | 边界已验证 | `mature-web/README.md` 明确说明本地演示数据不读取旧站用户、会话、上传、bridge 或凭据。 |
| 线上状态 | 未在本次读取 | 目录内的 README/manifest 和既有交接记录可证明设计/历史部署记录，不能替代本次线上健康、数据一致性或 worker 在线验证。 |

### 需隔离的历史路径债务

`bridge/transaction_intent.json` 保留了早期 `D:/codex-work/zhuanhui/outputs/niannian-ai-web/...` 绝对路径。该路径与当前视频工作台根目录 `E:\codex\aisp\aidaihuo\niannian-ai-web` 不同，且本次没有发现其指向 `sd2.cauai.fun` 的运行调用。它仍会让名称检索产生“同一应用”的错觉：在 controller 合同迁移前，应将其作为**历史路径债务**处理，不得据此推断两个现行产品已集成，也不得在未验证的情况下批量替换。

## 并发覆盖风险快照

此目录没有 `.git`，`git status` 返回“not a git repository”。因此以下仅是本地快照，不是可合并的版本历史。

| 文件 | UTC 修改时间 | SHA-256 | 风险等级 |
| --- | --- | --- | --- |
| `server.js` | 2026-07-12 16:21:22 | `FD2F20C6F2D4022FFB2FB63E8C596E8C47372FC8D824DFA786052C4161FE4076` | 高 |
| `mvp.js` | 2026-07-12 17:05:50 | `746D93DA28E702D71712B5017D14688D03FA7E9CEB3E1C0320C8138E15D38A11` | 高 |
| `index.html` | 2026-07-12 17:08:06 | `6E35952A245B286F03A2CEF266DD3235BCC6ADDA6A0FACC7E2F9C0F57E3029B6` | 中 |
| `product.css` | 2026-07-12 16:47:54 | `ACD80AE9BD71D35DA06789E13EA611297A619F2633C6C6924A8E16D00D848971` | 高 |
| `styles.css` | 2026-07-11 12:34:41 | `F9CEF74F8586E0971789FD1010AFB6D1850A7865184DF992C3D6BA2F7B566DAA6` | 中 |
| `bridge/niannian_controller_bridge.js` | 2026-07-12 15:59:25 | `2709972D702E7941C4B42AC99A918320838F7F8629F797B14FDF054AF6C54FDD` | 高 |

截至本记录，没有可用的跨线程编辑锁或版本控制元数据来断言“没有其他人正在改同一文件”。新近修改时间加上共享大文件结构本身，足以构成**高并发覆盖风险**。任何补丁在写入前必须重新读取目标上下文并比对上游提供的 SHA/时间快照。

## 最小文件所有权与交接规则

1. **主控拥有共享文件裁决权。** `server.js`、`mvp.js`、`index.html`、`product.css`、共享数据 schema 和 bridge 合同只能由主控串行安排；模块所有者不得对这些文件做整段替换、格式化或顺手重构。
2. **转绘所有者只改转绘命名空间。** 例如 redraw render/API/test 分支和 Step01 专属测试；不得重写小说 N00-N07 分支或 SD2 目录。
3. **小说所有者只改小说命名空间。** 例如 `script*`、N00-N07、DOCX 与专属测试；不得重写 redraw render/API 分支或 SD2 目录。
4. **同一共享文件的双人改动必须串行。** 先由第一人提交最小补丁、文件 SHA、精确行/函数范围与测试结果；第二人重新读取文件后只在相邻范围打补丁。发生 SHA 不一致时停止覆盖并交由主控合并。
5. **数据与合同变更先写兼容策略。** 任何项目状态、source hash、approval、receipt 或 asset schema 变更必须说明旧项目读取、迁移、回滚和两条工作流的回归测试。
6. **测试随所有权交接。** 共享改动至少附带受影响的转绘和小说测试；桥接/dispatcher 改动还需附带 receipt/relay 测试。没有真实执行授权时，只报告结构、测试或 dry-run 验证，不能称真实 worker/交付完成。
7. **发布与线上改动只由集成人执行。** 模块所有者不得将本地局部通过直接解释为 `ai.cauai.fun` 或 `sd2.cauai.fun` 已更新。部署前必须重新确认目标源目录、域名、服务、数据兼容和回滚点。

## 本次记录的范围

- 没有修改 `sd2.cauai.fun` / `niannian-ai-web`。
- 没有读取或输出私钥、Token、Cookie、密码、数据库连接串或原始 Codex 对话。
- 没有启动 worker、调用 provider、部署、打包或发送。
- 本文是静态源和本地运行配置清单；线上健康、真实支付、真实 provider 和真实 worker 结果必须另行按实际读回验证。
