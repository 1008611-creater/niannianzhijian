# ai.cauai.fun 候选包合同

本文件只约束 `https://ai.cauai.fun`。唯一源码边界是本仓库；唯一生产主机是 Haika 的 `haika-niannian`。本地候选包用于审查和完整性验证，不能直接覆盖生产，也不能替代 Haika 当前完整活动包。

## 构建

先从当前 Git 提交得到一个隔离目录，再为该候选明确声明父发布、范围和允许变更文件：

```powershell
node .\build_canonical_release_stage.js `
  --output ..\release-staging\<release-id> `
  --release-id <release-id> `
  --parent-release <active-haika-release-id> `
  --scope "<one bounded change>" `
  --allowed-file "<changed-file-1>,<changed-file-2>"
```

输出目录包含：

- `package/`：隔离的完整候选包，含锁定的运行依赖、首页、工作台、`/studio/` 和导演台静态树；不含用户数据、运行状态、日志、输出或 `.env`。
- `release-package-manifest.json`：候选身份、父发布、Git 提交、允许变更范围、全部文件和 SHA-256。
- `release-candidate-summary.json`：本地验证结论，不代表线上发布。

## 必经校验

```powershell
npm run test:release-governance
npm run test:release-stage
node .\test_verify_remote_release_manifest.js
```

校验会拒绝错误源码边界、`data/` 等运行路径、目录外文件、缺失的 HTML 入口资源、缺失的 JavaScript 动态分包、清单以外文件和任意哈希篡改。CSS 中缺失的图像或字体会作为明确告警保留，不会被伪造为存在；它必须在相关页面候选中修复或被有意删除后，才能作为视觉验收通过。

## 上线仍需的独立步骤

1. 在 Haika 从当前活动完整包复制出同名候选包，再仅叠加已验证的允许变更文件。
2. 对 Haika 候选运行同一份清单与静态资源校验。
3. 在真实公网浏览器验证改动路径和受保护页面的桌面、390px 视口。
4. 仅在用户已授权的发布操作中原子切换，并回读实际 HTML、资源哈希、用户路径和回滚目录。

`HTTP 200`、本地构建成功或 Provider 编号都不是用户交付或线上验收。
