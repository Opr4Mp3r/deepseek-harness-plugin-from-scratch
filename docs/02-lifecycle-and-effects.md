# 02｜生命周期：注册必须能完整撤销

插件不是启动时执行一次的脚本。它会因配置 HMR、必需服务消失、父 composition 释放或 Agent 销毁而反复挂载和卸载。

## 三种依赖

| 需求 | 写法 | 行为 |
|---|---|---|
| 没有它就不能运行 | `inject = ['tools']` | 等待 service；消失时整个插件卸载 |
| 用到时才查询 | `ctx.get('metrics')` | 当前可用则返回，否则 `undefined` |
| service 存在时贡献一个子功能 | `ctx.inject(['attachments'], child => …)` | 随可选 service 单独挂载和撤销 |

不要用未声明注入的 `ctx.optionalService`。Cordis 的 traceable/shadow 代理按 fiber 祖先查找，兄弟 provider 可能不可见；`ctx.get()` 才是拓扑无关的可选读取。

## 框架注册与外部资源

`ctx.on()`、`ctx.plugin()`、Service 注册和 Harness registry 注册都是 effect。对于 Cordis 不知道的资源，用 `ctx.effect()` 声明完整生命周期：

```ts
ctx.effect(() => {
  const socket = connect()
  return async () => {
    socket.close()
    await socket.closed
  }
})
```

“发出 close”不是释放完成。disposer 应等待 quiescence：没有回调还会触发、没有子进程仍在运行、没有 promise 会在旧插件实例释放后继续修改状态。

## HMR 安全测试

```ts
const fiber = await ctx.plugin(plugin, config)
expect(ctx.tools.get('greet')).toBeDefined()

await fiber.dispose()

expect(ctx.tools.get('greet')).toBeUndefined()
```

每个 registry contribution 都应有这种测试。测试内部的 `registered = false` 没有价值；应该查询 registry、重读文件或观察进程，验证外部世界。

## 作用域属于谁

全局 `ctx` 注册对 composition 可见；`agent.ctx` 注册只对一个 Agent 可见，并随该 Agent 释放。单 Agent 的 prompt、tool 或 listener 不应通过全局过滤来模拟隔离。

## 发布时点

状态变化遵守 commit-first：先让 authoritative mutation 成功，再 append Session event、emit notification 或更新 projection。否则失败操作会被 UI、缓存和 observer 当成成功。
