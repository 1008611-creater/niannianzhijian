# Dola FastAPI（接口服务）

本服务接收画布节点的提示词和素材，再转发到本机 `9190` Dola PW（Playwright，浏览器自动化）桥接。它不保存账号、密码或 Cookie。

启动：

```powershell
$env:DOLA_FASTAPI_KEY = "替换为随机密钥"
.\api\Start-DolaFastApi.ps1
```

调用：

```powershell
curl.exe -X POST http://127.0.0.1:8091/v1/jobs `
  -H "X-API-Key: 替换为随机密钥" `
  -H "X-Generation-Authorization: submit" `
  -F "prompt=雨夜中的女主拔剑，镜头缓慢推进" `
  -F "aspect_ratio=16:9" `
  -F "image=@C:\素材\女主.png"
```

返回 `job_id` 后轮询 `GET /v1/jobs/{job_id}`；成功时访问 `output_url` 下载视频。

画布接入配置：让画布服务与本机 Dola 在同一台机器，并设置：

```text
NIANNIAN_CANVAS_DOLA_SUBMIT=on
NIANNIAN_DOLA_API_URL=http://127.0.0.1:8091
NIANNIAN_DOLA_API_KEY=同一个密钥
NIANNIAN_DOLA_PLAYWRIGHT=off
```

这样画布 Dola 视频节点会走 FastAPI；FastAPI 再走 `9190` PW 桥接。正式部署前必须把 `127.0.0.1:8091` 换成受保护的内网地址，并保留 `X-API-Key`。
