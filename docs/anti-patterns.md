# 反模式：16 个看似合理、实际会坏的写法

1. **函数插件同时 `export default apply`**：Loader 可能丢掉 namespace 中的 `inject`、`Config` 和 `name`。
2. **可选 service 用 `ctx.optionalService`**：shadow/fiber 拓扑下兄弟 provider 不可见；用 `ctx.get()`。
3. **忘记 required `inject`**：插件可能在依赖未就绪时运行；反过来把可选依赖写进 inject 会永久 pending。
4. **waterfall 忘记 `next()`**：日志或 metrics 插件会悄悄吞掉工具执行或模型请求。
5. **registry mutation、timer、watcher 不属于 effect**：HMR 后留下旧工具、旧监听器和旧资源。
6. **先修改 `agent-loop`**：行为被焊死在一个 driver；先找现有 service/event extension point。
7. **把模型输入放在非日志通道**：当前调用有效，resume/fork/replay/UI 失真，运行时 invariant 也会失败。
8. **只有 TypeScript `Config` interface**：真实 Loader 没有运行时 schema，错误配置可能在半注册后才暴露。
9. **在 `run()` 里 `?? default`**：Provider 的最终决策不可见；用显式 `resolve(request): spec`。
10. **只实现 Provider 或只实现 Tool 就称为 seam**：Consumer 会开始导入具体实现，无法替换。
11. **全局注册本应单 Agent 的能力**：prompt/tool/listener 泄漏；使用 `agent.ctx`。
12. **先 emit，后 commit**：失败操作被 observer 当成成功。
13. **让调用方解析 render prose**：canonical JSON、模型文本和 UI intent 混成一个脆弱接口。
14. **presenter 读时钟、网络或实时 Session**：live 与 replay 渲染不一致。
15. **忽略 `exec.signal` 或 dispose 不等 quiescence**：取消后旧工作继续改变世界。
16. **只有手工挂载单测**：无法证明 Loader、真实 fiber topology、发布 artifact 和产品 composition 可用。

每条反模式及其生产代码证据见[审计报告](audit-report.md)。
