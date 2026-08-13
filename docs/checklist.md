# 插件交付检查单

## 架构

- [ ] 先选择已有 extension point；常规功能不修改 `agent-loop`。
- [ ] 简单贡献保持一个函数插件；角色独立演进时才拆 capability seam。
- [ ] 完整 seam 有 Definition、Provider、Consumer；Consumer 不导入具体 Provider。
- [ ] Service key 的单复数与角色一致；跨包 opaque id 使用 branded type。
- [ ] 默认化需要时使用显式 request/spec split。

## 导出、依赖与生命周期

- [ ] Service 类 default export；函数插件只有 named `name` / `inject` / `Config` / `apply`。
- [ ] `inject` 只列必需依赖；可选读取使用 `ctx.get()`，可选子贡献使用 `ctx.inject()`。
- [ ] register/listener/timer/watcher/connection/process 都属于 effect。
- [ ] registry `register()` 返回精确 disposer。
- [ ] fiber dispose 后贡献确实消失。
- [ ] cancellation 和 dispose 都等待 quiescence。
- [ ] 单 Agent 贡献注册在 `agent.ctx`。

## Config 与错误

- [ ] 每个 deployment-varying tunable 都能由 `cordis.yml` 配置。
- [ ] TypeScript Config 与同名运行时 schema 同时存在。
- [ ] DSL 无法表达的非空、正数、整数、跨字段约束另行验证。
- [ ] 自包含错误在 load time fail loud；动态外部错误在最早可判定点失败。
- [ ] Definition 明确领域结果与基础设施错误的分界。
- [ ] bounds 作用于包含 wrapper/metadata 的完整结果。

## Tool / UI

- [ ] parameters 与 canonical output schema 完整。
- [ ] `execute()` honor `exec.signal`。
- [ ] 程序不需要解析模型 prose 获取 id 或字段。
- [ ] `output.render()` 只负责模型 content。
- [ ] 已决定 generic / terminal / diff / search / web 等 UI intent。
- [ ] presenter 是只依赖 args/result/meta 的纯函数。
- [ ] replay 需要的 result-time UI 数据经 `presentationMeta` 持久化。
- [ ] schema 隐藏的禁用能力仍在 executor 拒绝。

## Event 与持久化

- [ ] typed event JSDoc 包含 `@mode` 和所有 `@param`。
- [ ] waterfall listener 调用 `next()`，或明确拥有并测试短路决定。
- [ ] 只在 commit point 之后 emit/publish。
- [ ] 模型可见输入可从 Session log 重建。
- [ ] reload/replay 需要的事实扩展 `SessionEventMap`。
- [ ] durable lifecycle 关系由 package invariant 检查。

## 测试与文档

- [ ] unit 覆盖正常、invalid config、error、abort、race 与 dispose。
- [ ] 每个 registry 有 HMR disposal test。
- [ ] 产品可见插件有真实 Loader + app/process composition test。
- [ ] 非 index runtime artifact 有 plain Node built smoke。
- [ ] 模型、协议、UI 或人类可见变化有 keyless snapshot。
- [ ] e2e 验证外部世界，不相信模型自述。
- [ ] package 有 `src/invariant.ts`。
- [ ] README/JSDoc 记录 config、failure、ownership、timing、cancellation、Model Experience 和 limitation。
- [ ] 非平凡上游变更附 Agent Note，并同步相关双语文档。
