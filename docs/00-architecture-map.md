# 00｜先画地图：插件到底插在哪里

先不要写代码。Harness 的扩展面分为三层，选择错误的层会让一个看似能跑的插件在替换后端、恢复 Session 或热更新时失效。

## 三层事实

| 层 | 负责什么 | 典型入口 |
|---|---|---|
| Session | 需要恢复、分叉、回放的持久事实 | `SessionEventMap`、`session.append()` |
| Agent | 一次 turn/step 正在发生的协调 | `agent/pre-step`、`agent/request`、`agent/turn-stopping` |
| Capability | 可调用能力和它的策略、观察 | `ctx.tools`、`ctx.fs`、`ctx.web`、`tools/*` |

判断方法很直接：事实需要 reload/replay，就写入 Session event；只影响正在发生的 Agent 生命周期，就使用 `agent/*`；属于某项能力的调用、策略或观察，就使用该 capability 的 service/event。普通插件不应先改 `agent-loop`。

## Cordis 的五个概念

1. **Plugin**：函数模块或 `Service` 子类，是生命周期单元。
2. **Context**：按稳定 key 暴露 service，例如 `ctx.tools`。
3. **Inject**：声明插件必须等待哪些 service。
4. **Typed event**：插件之间的松耦合扩展点。
5. **Effect**：安装时产生、卸载时撤销的贡献。

函数插件只导出 named `name`、`inject`、可选 `Config` 和 `apply`。Service 包默认导出 `Service` 子类。不要把两种形式混在一个模块里。

## 一次工具调用的数据流

```text
Consumer 注册 tool schema
          │
          ▼
agent-loop 组装 request/header（schema 进入日志）
          │
          ▼
模型发出 tool/call（进入日志）
          │
          ▼
tools/pre-execute → tools/execute → Tool.execute → tools/post-execute
          │
          ▼
canonical JSON value → output.render → tool/result（进入日志）
          │
          ├── 模型收到 content
          ├── Code Mode 收到 canonical value
          └── UI 从 presentation intent / durable meta 渲染
```

这里有一个关键分层：工具的 canonical value 是程序接口；`output.render` 产生模型文本；`presentCall` / `presentResult` 产生 UI 意图。不要让任一调用方解析另一层的 prose。

## 下一步

[01｜最小插件](01-minimal-plugin.md)从这张图中只取第一条路径：向现有 `ctx.tools` 注册一个 Consumer。
