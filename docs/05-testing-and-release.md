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
- 子进程通过真实 Loader + Include 读取 `cordis.yml` 并执行工具。
- 错误 default export fixture 在同一 shipping path 上失败。
- checkpoint 逐步增长且最终与 canonical source 相同。
- 文档存在、code fence 闭合、文件以换行结尾。

教程仓库的 Loader smoke 证明这个独立插件的真实 module export、Config、fiber topology 与工具调用路径。它不是 Harness 产品 bundle 的完整 transcript；把插件移入上游时，还必须加入所属 runnable example 的 keyless snapshot、包级 `src/invariant.ts`、README/JSDoc、双语文档和 Agent Note，并在产品 app/process composition 中验证用户可见结果。

## 为什么要有 invariant

单元测试只在测试时运行。package invariant 在真实 composition 中检查拥有的关系，例如：loop-built request 的 messages/header 与 Session log 派生结果一致，或 lifecycle start/end 成对。若包没有合理运行时关系可检查，也应给出 package-specific 的空 invariant 理由，而不是生成一个无解释空文件。

## 发布前最小命令

```sh
pnpm install --frozen-lockfile
pnpm check
git diff --check
```

上游插件应按实际修改面再选择 focused tests、snapshot、build、hygiene 或 real-API e2e；不要用“跑了全套”替代对哪条接受路径被验证的说明。
