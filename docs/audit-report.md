# 代码审计报告

本报告记录教程范式的证据链。审计对象固定为 [`deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)，审计日期 2026-08-13。链接全部使用 commit permalink，避免上游行号漂移。

## 方法

审计排除了 vendored Cordis 实现，先读取上游 architecture、package rules、testing policy，再横向比较 shell、web、skill、workflow、filesystem、tools 与 agent-loop。结论必须至少有架构规则和一个生产实现或回归测试互相印证。

本报告不是 API 清单。上游生成的 subsystem、tool/config catalog 才是精确签名的事实源；这里保留插件作者需要的跨包模式和风险。

## 结论与证据

### 1. 组合优先于修改 loop

- [architecture：一切皆插件、注册可逆、没有特权核心](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L9-L13)
- [architecture：扩展点选择表](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L106-L127)
- [agent-loop：扩展点实现而非业务插件模板](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L225-L320)

### 2. 插件导出形式是运行时约定

- [package rule：Service default export，function plugin named exports](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/AGENTS.md#L5-L6)
- [真实事故：default export 令 Loader 丢失 inject](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/postmortem/0001-acp-default-export-drops-inject.md#L27-L54)
- [生产函数插件：timeout policy](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/guard/timeout-policy/src/index.ts#L27-L80)

### 3. required、optional-read、optional-child 是三种不同依赖

- [package rule：可选 service 用 ctx.get](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/AGENTS.md#L6-L7)
- [事故分析：traceable shadow 的祖先查找为何失败](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/postmortem/0001-acp-default-export-drops-inject.md#L56-L88)
- [tool-fs：attachments 存在时才注册 read_image](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/fs/tool-fs/src/index.ts#L53-L78)

### 4. 所有贡献都必须可撤销

- [Cordis primer：registrations are reversible effects](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md#L7-L15)
- [Web registry：注册、重复检查、effect disposer](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/web/src/index.ts#L96-L129)
- [testing policy：每个 registry 证明 HMR cleanup](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/testing.md#L7-L9)

### 5. 能力由 Definition / Provider / Consumer 共同构成

- [architecture：capability seam 定义](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L98-L104)
- [Shell Definition：Context key、抽象 service、request/spec](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/shell/shell/src/index.ts#L40-L101)
- [Shell Provider：Config 与显式 resolve](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/shell/bash-local/src/index.ts#L102-L171)
- [Web Consumer：只拥有稳定 tools 和 consumer config](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/tool-web/src/index.ts#L20-L90)
- [能力角色完整对照表](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/capability-seams.md)

### 6. Config 是类型与运行时 schema 的组合

- [基础教程：同名 interface 与 Schemastery Config](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/user/develop/basic/config.md#L9-L31)
- [bash-local：schema 之外的正数、finite 与 timer bound 检查](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/shell/bash-local/src/index.ts#L69-L112)
- [provider resolve：运行阶段只接收已解析 spec](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/shell/bash-local/src/index.ts#L139-L171)

### 7. waterfall 是 around middleware

- [Cordis primer：必须 next，返回而不 next 即短路](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cordis-primer.md#L26-L37)
- [timeout policy：替换 signal、await next、finally 恢复](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/guard/timeout-policy/src/index.ts#L50-L80)
- [tools 事件：pre/around/post/result 的 mode 与责任](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/tools/src/index.ts#L137-L207)

### 8. model-visible 必须 logged

- [architecture：Session log 是模型上下文事实源](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L86-L96)
- [agent-loop：durable turn/step/user message](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L255-L320)
- [agent-loop：request/header 在模型调用前提交](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/agent.ts#L458-L469)
- [运行时 invariant：真实 request 与 log derivation 比较](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/invariant.ts#L19-L54)
- [Session event 的 merge-extensible map](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/types.ts#L230-L333)

### 9. Tool 的 canonical value、模型 content 和 UI intent 分层

- [工具 authoring contract](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/cookbook/adding-a-tool.md#L40-L67)
- [tool-web：Consumer 拥有 schema、limits、presentation](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/web/tool-web/src/index.ts#L1-L6)
- [packages rule：model-facing contract 从模型视角写](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/AGENTS.md#L12-L16)

### 10. 测试真实装配路径

- [testing policy：产品可见插件要求 real Loader composition](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/testing.md#L31-L35)
- [testing policy：何时必须 keyless snapshot](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/testing.md#L47-L49)
- [事故总结：100% line coverage 不能证明 shipping path](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/postmortem/0001-acp-default-export-drops-inject.md#L89-L112)

## 横向比较摘要

| Seam | Topology | Provider 选择 | 生命周期重点 | Consumer 重点 |
|---|---|---|---|---|
| Shell | 单例抽象 executor | composition 选择唯一 service | subprocess、timeout、background quiescence | terminal result、领域 exit status |
| Web | 具体 registry + 多 provider | id/可用性，禁止依赖注册顺序 | network cancellation、redirect/size policy | 稳定 search/fetch schema 与 web card |
| Skill | scope-aware 分层 registry | global/preset/agent 覆盖规则 | watcher、invalidate、last-good snapshot | invocation policy、durable context |
| Workflow | 长生命周期 engine | composition 选择 engine | cancel、dispose、worker quiescence | live event 投影为 durable Session event |

## 审计限制

- 上游处于预发布期，结论只对固定 commit 和 npm rc 版本负责。
- 本仓库没有复制上游源码；代码片段是独立教学实现，证据通过 permalink 引用。
- 没有用真实 API key 运行 provider e2e；范式由上游实现、测试和文档交叉验证，教程示例本身只做 keyless 验证。
