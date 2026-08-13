# 04｜事件与持久化：模型看到的必须能重建

Harness 同时有 live Cordis events 和 durable Session events。它们名字可能相似，但用途不同。

## 选择哪一种

```text
事实需要 reload / replay / fork 吗？
├─ 是 → SessionEventMap + session.append()
│       UI / projection / model history 从 log 派生
└─ 否
   ├─ 正在进行的 Agent 生命周期 → agent/*
   └─ 能力策略或观察 → capability/*
```

live event 不应被当作持久状态。需要恢复的 workflow start/end、插件自有状态或模型输入必须另写 Session event，并由纯 fold/projection 重建。

## Harness 公共事件的四种主要 mode

| mode | 语义 |
|---|---|
| `emit` | 同步观察，无返回值 |
| `parallel` | 并行等待所有监听器 |
| `serial` | 按顺序等待，可产生决定 |
| `waterfall` | around middleware，通过 `next()` 进入下游 |

`waterfall` 监听器若只记录、包装或注解，必须调用 `next()`。只有明确拥有该决策槽的 policy 才可有意短路。

```ts
ctx.on('tools/execute', async (exec, next) => {
  const started = performance.now()
  try {
    return await next()
  } finally {
    metrics.observe(performance.now() - started)
  }
})
```

## `model-visible ⇔ logged`

Agent loop 把 tool schemas 和 system prompt 写入 `request/header`，用户输入写入 `user/message`，模型输出写入 `assistant/*`，工具调用与结果写入 `tool/*`。运行时 invariant 会将真实 LLM request 与 Session log 的即时派生结果比较。

因此：

- 不要在 `agent/request` 中偷偷改 messages。
- 新的动态模型输入需要 durable event。
- Session event 数据必须是 lossless JSON。
- stable model-visible prose 需要 snapshot，而不仅是单元测试。

`agent.inject()` 适合把插件内容放进下一次已准入的模型请求；它是 durable context，不会唤醒 idle Agent。

## Typed event 的公共约定

事件通过 declaration merging 声明。每个 Harness event 的 JSDoc 应写 `@mode`，并给每个 payload 写 `@param`。closed discriminated union 用 `assertNever`；merge-extensible union 使用有说明的 default。
