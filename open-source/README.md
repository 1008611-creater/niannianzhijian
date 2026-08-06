# 念念 AI 开放源码发布目录

`/open-source/` 是线上 Nomi 画布和念念智剪集成的对应源码入口。

每个发布必须同时更新：

1. `downloads/niannian-nomi-smart-cut-source-<release>.zip`：完整 Nomi 画布源码、锁定依赖、AGPL 文本、构建说明和 release manifest。
2. `downloads/niannian-smart-cut-bridge-source-<release>.zip`：主站桥、编辑器桥接插件、验证文件、配置样例和 release manifest。
3. `AGPL-3.0.txt`：与上游一致的 GNU Affero General Public License v3.0 全文。

禁止放入用户媒体、`data/`、`.env`、私钥、访问令牌、Cookie、临时签名 URL 或服务端运行日志。
