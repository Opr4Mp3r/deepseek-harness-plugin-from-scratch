# 05｜测试真实装配，而不是只测函数

Harness 曾出现过一个典型事故：178 个测试全绿、100% 行覆盖，但 ACP 在真实编辑器第一次连接时就崩溃。原因是函数插件多了 default export，Loader 丢掉 `inject`；另一个可选 service 又通过错误的 Context 路径读取。手工 `ctx.plugin(...)` 的测试绕过了两条真实路径。

## 五层证据

| 层 | 证明什么 |
|---|---|
| Unit | 边界、错误、取消、race、纯 render |
| HMR disposal | contribution 随 fiber 消失 |
| Real Loader composition | export normalization、fiber topology、`cordis.yml` |
| Built entry smoke | 发布后的 `lib/` 能由 plain Node 使用 |
| Keyless snapshot / e2e | 模型、协议、UI 或人类可见行为在完整应用中成立 |

有真实 API 的 Provider 还应有 self-skip 的 with-key e2e，但默认验证不能依赖密钥。

## 本仓库验证什么

`pnpm check` 包括：

- TypeScript strict 编译。
- 真实 `ToolRuntime.execute()` 的成功和失败路径。
- fiber disposal 后 registry 中不存在工具。
- 子进程通过真实 Loader + Include 读取 TypeScript 源码并执行工具。
- emitted `lib/index.js` 由 plain Node.js 通过相同 Loader 装配。
- 错误 default export fixture 在真实 Loader 路径上失败。
- tarball 只包含入口、类型声明、组合层、README 和许可证。
- tarball 安装进隔离 consumer 后，可以从其 `node_modules` 以裸包名加载并执行。
- checkpoint 逐步增长且最终与 canonical source 相同。
- 本地阅读器实际启动、关键路由可访问、三个 checkpoint 已注入且客户端脚本可以解析。
- 文档、审计链接、运行时基线、peer window 与包 manifest 保持一致。

`pnpm check:profile` 是单独的联网验收。它使用固定的 `@deepseek-ai/dsh` CLI，把新生成的 tarball 交给 `dsh plugin add`，检查插件名已进入 `dsh.profile.bundles`，检查 config dump 的组合层，然后启动 profile 并执行 `greet`。如要复核尚未发布的 Harness checkout，设置 `DSH_HARNESS_ROOT=/absolute/path/to/deepseek-harness`；脚本会使用该 checkout 的源码 CLI，其他安装与执行步骤不变。

教程仓库的这些 smoke 证明独立插件的 module exports、Config、fiber topology、构建产物、裸包名解析、组合层激活与工具调用路径。它不是 Harness 产品完整 transcript；把插件移入上游时，还必须加入所属 runnable example 的 keyless snapshot、包级 `src/invariant.ts`、README/JSDoc、双语文档和 Agent Note，并在产品 app/process composition 中验证用户可见结果。

## 一个可安装包必须交付什么

TypeScript 源码通过测试，不等于用户能安装。组合包至少需要：

- `main`、`types` 和 `exports` 指向真实生成的 `lib/` 文件。
- `files` 只收录运行入口、声明、许可证、README 和组合层。
- `dsh.bundle.patch` 指向包内的 `cordis.patch.yml`。
- `cordis.patch.yml` 用包名而不是 checkout 内相对路径加载插件。
- Harness 提供的 Cordis 与 Service Definition 包列为 peer dependencies；插件自己拥有的实现依赖列为 dependencies。
- npm 或 tarball 在分发前构建；GitHub 源码安装则提供自包含 `prepare`。

这些要求来自上游的[组合包 manifest 与激活规则](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.zh.md#L33-L64)和[安装、配置检查流程](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/publish.zh.md#L75-L110)。GitHub dependency 的 `prepare` 会在用户机器、agent 沙箱之外执行；pnpm 因此要求显式构建授权。发布预构建 tarball 或 npm 包可以消除这项安装时授权。

## 为什么要有 invariant

单元测试只在测试时运行。package invariant 在真实 composition 中检查拥有的关系，例如：loop-built request 的 messages/header 与 Session log 派生结果一致，或 lifecycle start/end 成对。若包没有合理运行时关系可检查，也应给出 package-specific 的空 invariant 理由，而不是生成一个无解释空文件。

## 发布前最小命令

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:profile
git diff --check
```

所有检查都不需要密钥，也不调用模型。`pnpm check` 的隔离 consumer 优先使用本地 pnpm store，缺少 registry metadata 或包时会联网补齐固定依赖；`check:profile` 会下载固定 CLI。上游插件应按实际修改面再选择 focused tests、snapshot、build、hygiene 或 real-API e2e；不要用“跑了全套”替代对哪条接受路径被验证的说明。
