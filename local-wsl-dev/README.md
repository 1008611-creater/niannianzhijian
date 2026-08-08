# 本地 WSL 开发入口

这里是念念智剪的独立本地 WSL 开发入口。它使用当前目录作为编辑器源码，并读取原工作区中的念念 AI 主站：

- 主站：`E:\codex\aisp\aidaihuo\niannian-ai-web`
- 智剪：`E:\codex\niannianai\niannianzhijian`

默认地址：

- 主站：`http://127.0.0.1:3026`
- 智剪：`http://127.0.0.1:5199`

服务器不参与本地启动，也不会被本脚本写入。发布仍然必须从本地构建并验证后的发行包进行。

## 启动

在 WSL Ubuntu 中执行：

```bash
cd /mnt/e/codex/niannianai/niannianzhijian
bash local-wsl-dev/start-local.sh
```

可用环境变量覆盖端口：

```bash
EDITOR_PORT=5200 MAIN_PORT=3032 bash local-wsl-dev/start-local.sh
```

## 停止和查看状态

```bash
bash local-wsl-dev/status-local.sh
bash local-wsl-dev/stop-local.sh
```

页面可用性检查：

```bash
bash local-wsl-dev/verify-local.sh
```

运行日志和 PID 在 `local-wsl-dev/runtime/`，本地媒体在 `local-wsl-dev/data/`，均不会提交到 Git。

## 依赖

编辑器使用仓库自带的 `package-lock.json`。首次在 WSL 上准备 Linux 原生依赖：

```bash
cd /mnt/e/codex/niannianai/niannianzhijian
npm install --ignore-scripts --no-save --include=optional @rolldown/binding-linux-x64-gnu@1.1.5
```

主站使用仓库自带的 `node_modules` 和本地 PostgreSQL `127.0.0.1:55432`。如果依赖被清理，再在对应源码目录运行 `npm ci`。

## Qwen3 强制对齐

MiMo 只返回转写文本。要让字幕、去停顿和文字剪辑使用真实字词时间戳，请在首次使用前准备本地 Qwen3 ForcedAligner：

```bash
cd /mnt/e/codex/niannianai/niannianzhijian
bash local-wsl-dev/setup-qwen-forced-aligner.sh
```

脚本只写入 `.work/qwen-forced-aligner`，下载公开模型和已固定版本的官方 Transformers 源码依赖；模型权重、缓存和用户媒体不会进入发行包。运行时会用 FFmpeg 将当前本地媒体临时解码为单声道 WAV，完成对齐后立即删除临时文件。
