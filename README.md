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

## 5 分钟运行与阅读

需要 Node.js `^22.19.0` 或 `>=24`，以及 pnpm 11。审计和本地锁定环境是 Node.js `22.21.1`、pnpm `11.7.0`。

```sh
pnpm install --frozen-lockfile
pnpm smoke:source
pnpm smoke:loader
pnpm check
```

这些命令不需要 API key，也不会发起模型请求。`smoke:source` 验证仓库内的 TypeScript 源码；`smoke:loader` 先生成 `lib/index.js`，再由 plain Node.js 通过真实 Loader + Include 执行一次 `greet`。`pnpm check` 还会把 tarball 安装进隔离 consumer，以裸包名重新执行 Loader，防止源码相对路径掩盖发布错误。

本地交互阅读器不需要构建：

```sh
pnpm preview
```

打开 `http://127.0.0.1:4175`。正文越过三个 checkpoint 时，右侧 `src/index.ts` 会从空文件增长到 12、25、65 行；新增行按相邻快照 diff 显示。阅读器只投影仓库中的 Markdown 和自动生成快照，不维护第二份教程源码，也不部署网站。

## 安装进 Harness profile

当前仓库尚未发布到 npm registry。先从 checkout 生成包含 `lib/` 和组合层的 tarball，再安装：

```sh
pnpm pack
dsh plugin --profile tutorial add ./deepseek-harness-plugin-from-scratch-0.1.0.tgz
dsh --profile tutorial --dump-config
```

最后一条命令应出现 `# == deepseek-harness-plugin-from-scratch` 层和 `id: greet-tool`。包内的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；该 patch 使用裸包名加载已构建入口。缺少这两项时，`dsh plugin add` 只会安装普通依赖，不会激活插件。

默认配置是 `Hello, <name>.`。如需修改，在该 profile 的 `cordis.patch.yml` 中覆盖整行配置；patch 不会深度合并 `config`，因此两个字段都要重述：

```yaml
- id: greet-tool
  config:
    greeting: '你好'
    excited: true
```

仓库用下面的独立检查执行完整安装路径：打包、`dsh plugin add`、配置层检查、启动 profile、调用 `greet`。默认使用固定的公开 CLI `@deepseek-ai/dsh@0.1.0-rc.6`，需要联网但不需要密钥：

```sh
pnpm check:profile
```

维护者审计上游新提交时，可把 `DSH_HARNESS_ROOT` 指向已安装依赖的 Harness checkout；同一脚本会改用该 checkout 的源码 CLI。也可以直接从 GitHub 安装，把占位符替换为已审计的完整 commit SHA：

```sh
dsh plugin --profile tutorial add 'github:Opr4Mp3r/deepseek-harness-plugin-from-scratch#FULL_COMMIT_SHA'
```

仓库为 GitHub dependency 提供自包含 `prepare`，但 pnpm 10 及以上会先拒绝执行并打印需要加入该 profile `pnpm-workspace.yaml` 的确切 `allowBuilds` 键。只对已审计并锁定到 commit 的源码授权，然后重新执行安装命令；希望避免安装时执行构建时，请使用上面的预构建 tarball。

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
7. [反模式](docs/anti-patterns.md)：审计中最容易踩的 17 个坑。
8. [交付检查单](docs/checklist.md)：可以直接复制到 PR 描述。
9. [审计报告](docs/audit-report.md)：每条结论对应的上游源码证据。

## 仓库结构

```text
docs/                         渐进教程、参考和审计证据
examples/progressive/src/     唯一手工维护的最终插件
examples/progressive/tests/   keyless 行为与 HMR disposal 测试
examples/progressive/checkpoints/  自动生成的阅读快照
cordis.patch.yml              安装后加入 profile 的组合层
lib/                          构建生成的 ESM 入口与类型声明（不提交）
preview/                      无构建的本地 scrollytelling 阅读器
scripts/                      checkpoint 与文档防漂移检查
audit-manifest.json           审计 commit、日期与运行时版本基线
```

## 兼容性

本教程同时钉住两类版本：

- 审计语义：Harness commit `47f943859bef60e4160492346772ded9b24f765a`。
- 可运行示例：公开 npm 包 `@deepseek-ai/dsh-*` `0.1.0-rc.6` 与 `@deepseek-ai/cordis` `4.0.1`。
- 装配与配置：`@deepseek-ai/cordis-plugin-include` `1.0.6`、`@deepseek-ai/cordis-plugin-loader` `1.0.2`、`@deepseek-ai/schemastery` `3.18.1`。
- 发布包 peer window：`@deepseek-ai/cordis` `^4.0.1`、`@deepseek-ai/dsh-tools` `^0.1.0-rc.5`；CI 与 tarball smoke 仍锁定上面的 rc.6 实现。

上游在首个正式 tag 前明确不承诺兼容旧格式，因此升级依赖时应重新执行[审计清单](docs/checklist.md)，而不是只看 TypeScript 是否通过。

## 参考与边界

本仓库借鉴 [PI from Scratch](https://github.com/SaladDay/pi-from-scratch/tree/db85b87976812997398a757d9ff609a34ebd7de7) 的方法：先画模块地图，再沿数据流引入概念；最终源码是事实源，教程 checkpoint 由脚本生成。仓库不构建或部署网站；GitHub 内可以直接浏览编号快照和 diff，本地 `pnpm preview` 则提供滚动驱动的代码演进效果。

教程中的代码是为教学而缩小的 Consumer 插件。要把它合并进 Harness 主仓库，还需满足上游的 package invariant、真实 Loader composition、keyless snapshot、README/JSDoc、双语文档与 Agent Note 等仓库规则，详见[测试与发布](docs/05-testing-and-release.md)。

## 参与贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。项目采用 [MIT License](LICENSE)。
