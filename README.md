# DeepSeek Harness Plugin from Scratch

一套从真实代码审计中提炼的 DeepSeek Harness 插件开发范式，以及一个可以安装、运行和逐步阅读的 TypeScript 插件。

这个仓库回答的不是“`apply()` 怎么写”，而是一个插件如何在真实 Harness 中做到：依赖正确、配置可验证、注册可撤销、服务可替换、模型可见内容可回放、测试覆盖真实装配路径。

> 非官方社区教程。审计基线是 [`deepseek-ai/deepseek-harness@47f9438`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)，日期为 2026-08-13；示例依赖公开包 `0.1.0-rc.6`。Harness 尚处于预发布阶段，请先看[兼容性说明](#兼容性)。

## 先得到一张地图

Harness 的核心设计可以压缩成六句话：

1. 一切行为都是插件，普通功能不修改 `agent-loop`。
2. 必需依赖用 `inject`；可选读取用 `ctx.get()`；可选子贡献用 `ctx.inject()`。
3. 所有注册和外部资源都必须属于可撤销 effect。
4. 可替换能力由 Service Definition、Service Provider、Consumer 三种角色组成。
5. `waterfall` 是 around middleware；除非有意短路，监听器必须调用 `next()`。
6. 模型能看到的内容必须能从 Session log 重建：`model-visible ⇔ logged`。

```text
cordis.yml / preset
        │
        ▼
  Cordis plugin fiber ── inject ──► services
        │                             │
        ├── reversible effects        ├── Definition
        │   (tools/events/resources)  ├── Provider
        │                             └── Consumer
        ▼
  agent extension points ──► Session log ──► model request / replay / UI
```

## 5 分钟运行

需要 Node.js `^22.19.0` 或 `>=24`，以及 pnpm 11。审计和本地锁定环境是 Node.js `22.21.1`、pnpm `11.7.0`。

```sh
pnpm install --frozen-lockfile
pnpm smoke:loader
pnpm check
```

这不需要 API key，也不会发起模型请求。`smoke:loader` 会通过真实 Loader + Include 读取 `cordis.yml` 并输出一次 `greet` 调用结果；完整检查还覆盖 API 级挂载、fiber disposal，以及一个故意带错误 default export 的装配场景，证明这类 shipping-path 回归会让测试变红。

## 像读文章一样看代码

`examples/progressive/src/index.ts` 是唯一手工维护的最终源码。三份 checkpoint 由它生成，CI 验证每一步只能在上一步末尾继续添加，最终一步必须与源码逐字相同。

| 进度 | 本步目标 | 阅读代码 | 与上一步比较 | 运行证据 |
|---|---|---|---|---|
| 1/3 | 插件身份与必需依赖 | [`01-plugin.ts`](examples/progressive/checkpoints/01-plugin.ts) | — | `pnpm check:checkpoints` |
| 2/3 | TypeScript 类型 + 运行时 Config schema | [`02-config.ts`](examples/progressive/checkpoints/02-config.ts) | [`01 → 02`](examples/progressive/diffs/01-plugin-to-02-config.patch) | `pnpm check:checkpoints` |
| 3/3 | canonical output、render、execute、UI intent | [`03-tool.ts`](examples/progressive/checkpoints/03-tool.ts) | [`02 → 03`](examples/progressive/diffs/02-config-to-03-tool.patch) | `pnpm test` |

diff 也是由同一个生成器产生的 unified patch，因此读者在 GitHub 内就能看到本步新增代码。想修改教程代码时，只改 `src/index.ts` 与 `checkpoints.json`，然后运行：

```sh
pnpm generate:checkpoints
pnpm check
```

## 学习路径

1. [架构地图](docs/00-architecture-map.md)：插件、Context、Service、event、Session log 如何协作。
2. [最小插件](docs/01-minimal-plugin.md)：从空 `apply` 到一个完整工具。
3. [生命周期与 effect](docs/02-lifecycle-and-effects.md)：HMR、安全释放、必需与可选依赖。
4. [能力三角色](docs/03-capability-seams.md)：什么时候拆 Definition / Provider / Consumer，以及四种常见拓扑。
5. [事件与持久化](docs/04-events-and-durability.md)：waterfall、commit point、`model-visible ⇔ logged`。
6. [测试与发布](docs/05-testing-and-release.md)：为何 100% 单测仍可能完全不可用。
7. [反模式](docs/anti-patterns.md)：审计中最容易踩的 16 个坑。
8. [交付检查单](docs/checklist.md)：可以直接复制到 PR 描述。
9. [审计报告](docs/audit-report.md)：每条结论对应的上游源码证据。

## 仓库结构

```text
docs/                         渐进教程、参考和审计证据
examples/progressive/src/     唯一手工维护的最终插件
examples/progressive/tests/   keyless 行为与 HMR disposal 测试
examples/progressive/checkpoints/  自动生成的阅读快照
scripts/                      checkpoint 与文档防漂移检查
audit-manifest.json           审计 commit、日期与运行时版本基线
```

## 兼容性

本教程同时钉住两类版本：

- 审计语义：Harness commit `47f943859bef60e4160492346772ded9b24f765a`。
- 可运行示例：公开 npm 包 `@deepseek-ai/dsh-*` `0.1.0-rc.6` 与 `@deepseek-ai/cordis` `4.0.1`。
- 装配与配置：`@deepseek-ai/cordis-plugin-include` `1.0.6`、`@deepseek-ai/cordis-plugin-loader` `1.0.2`、`@deepseek-ai/schemastery` `3.18.1`。

上游在首个正式 tag 前明确不承诺兼容旧格式，因此升级依赖时应重新执行[审计清单](docs/checklist.md)，而不是只看 TypeScript 是否通过。

## 参考与边界

本仓库借鉴 [PI from Scratch](https://github.com/SaladDay/pi-from-scratch/tree/db85b87976812997398a757d9ff609a34ebd7de7) 的方法：先画模块地图，再沿数据流引入概念；最终源码是事实源，教程 checkpoint 由脚本生成。这里只保留 GitHub 原生的阅读体验，不构建网站。

教程中的代码是为教学而缩小的 Consumer 插件。要把它合并进 Harness 主仓库，还需满足上游的 package invariant、真实 Loader composition、keyless snapshot、README/JSDoc、双语文档与 Agent Note 等仓库规则，详见[测试与发布](docs/05-testing-and-release.md)。

## 参与贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。项目采用 [MIT License](LICENSE)。
