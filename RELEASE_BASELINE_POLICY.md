# ai.cauai.fun 发布基线政策

## 当前唯一线上基线

当前可发布基线不是本机预览，也不是任意 Git 工作树。它是 Haika 上实际服务
`https://ai.cauai.fun` 的完整版本化应用包：

```text
release_id: niannian-web-20260804-workbench-clarity-r2-short-drama-modal-fix1
host: haika-niannian / ser087508269396
static link: /var/www/niannian-ai
application links: /opt/niannian-ai and /opt/niannian-ai-current
active package: /opt/niannian-ai-releases/niannian-web-20260804-workbench-clarity-r2-short-drama-modal-fix1/package
public origin: https://ai.cauai.fun
```

完整的逐项哈希、父版本、回滚路径和源码对应状态见：
[`release-baselines/ai.cauai.fun/20260804-workbench-clarity-r2-short-drama-modal-fix1.json`](release-baselines/ai.cauai.fun/20260804-workbench-clarity-r2-short-drama-modal-fix1.json)。

## 当前源码关系

GitHub `main` 的初始提交 `1b8d3f9` 是经过数据与凭据清理的主站源码档案。它与
当时线上包不一致的网页文件，已在下列提交中完成逐字节的安全筛选对齐：

```text
commit: 3dfaf5f34b9b5447255a2d223ab3c6e4f7d3198c
tag: online-baseline-20260804-workbench-clarity-r2-short-drama-modal-fix1
aligned files: 482
```

对齐包含当前正式首页壳、工作台、导演台、`/studio/` 画布、服务端和必要静态资源。
四个易变运行配置仍刻意留在 Git 外；它们不含在候选源码中，也不能被当作版本化产品
配置。

这份 Git 对齐提交是受控源码起点，但它仍不是“直接部署命令”。Haika 当前完整包包含
运行依赖、运行目录和数据目录，不能被整体复制进 Git，也不能用 Git 工作树直接覆盖
生产。因此：

- 不得从本机目录、旧候选、`localhost`、`sd2.cauai.fun` 或 `niannian-ai-web`
  直接发布 `ai.cauai.fun`。
- 不得把 Haika 的完整包整体复制进 Git。
- 任何未来候选仍必须在 Haika 上由上述活动完整包复制得到，并声明父版本、改动范围、
  允许文件和受保护页面；Git 提交必须提供相应的源码变更依据。

## 单一发布路径

```text
Haika 当前完整线上包
-> Haika 中单独命名的候选完整包
-> 本地构建与真实浏览器验证
-> 原子切换 /var/www/niannian-ai、/opt/niannian-ai-current、/opt/niannian-ai
-> 公网 HTML、版本化资源与用户路径回读
-> 保存下一份线上基线
```

GitHub 的作用是保存经过清理的源码、发布政策和未来可复现的变更历史；它不取代
当前 Haika 上的完整应用包，也不允许用不完整的源码工作树覆盖生产。

## 下一项工程工作

为对齐后的 Git 源码补齐可重复的“构建完整候选包”脚本与校验清单：它必须从受控源码
生成需要的静态资源，明确继承项，并在 Haika 候选包与公网浏览器回读中证明字节和行为
一致。在该构建链完成前，Git 源码用于审查、变更追溯和候选依据，不取代 Haika 完整包
作为生产发布载体。
