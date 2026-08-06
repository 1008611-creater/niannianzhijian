# 念念 AI 本地站点

本地地址：

```text
http://127.0.0.1:8788
```

手动启动：

```powershell
$env:PORT=8788
npm start
```

主要页面：

- 首页：霓虹流体动态主视觉
- 项目管理：项目卡片与新建项目弹窗
- 作品展示：三类作品陈列
- 创作指引：三步 AI 影像工作流
- 登录、注册、预约、大客户申请弹窗

## Dola 渠道封装

工作台通过 `bridge/niannian_dola_skill_adapter.js` 接入现有 Dola2API。调用链固定为：生产路由器、一个业务 specialist、提示词路由器、视频渠道路由器、`dola-video-channel`、Dola2API。工作台不直接操作 CDP、Clash、账号表或浏览器 Cookie。

- `GET /api/video-channels/dola/preflight`：执行不扣点的登录、代理、地区、CDP 和扩展预检。
- `POST /api/projects/:projectId/video-channel-route/dola/prepare`：校验项目所有权、确认交易和 `video_task_spec.json` 的精确路径、SHA 与字节数，返回只发给念念视频主控的 typed dispatch envelope。
- 当前封装只开放 `preflight` 和 `prepare_route`。上传、真实提交、扣点、下载和交付提升保持关闭，后续必须在一次性成本授权和真实结果 QA 契约下接入。
