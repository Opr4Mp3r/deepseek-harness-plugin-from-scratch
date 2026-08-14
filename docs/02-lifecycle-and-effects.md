# 02｜生命周期：注册必须能完整撤销

这一章不再扩展 `greet`。我们会实现一个独立的脉冲源：它定时发出可等待事件，另一个插件负责打印；随后分别卸载监听器和脉冲源，并证明 `dispose()` 会等待已经开始的异步回调结束。

## 第一步：声明需要等待的事件

脉冲源不能在监听器仍运行时声称自己已经停止，因此这里使用 `parallel` 调度对应的返回类型：每个监听器可以同步完成，也可以返回 `Promise<void>`。事件 JSDoc 用 `@mode parallel` 固定调用方式，用 `@param` 解释 payload；这个进程级事件没有 agent 或 session 作用域键，所以还要显式标记 `@dshScopeScan unsupported`。事件声明只规定通信含义，不负责启动定时器。

```ts
import type {} from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Notify listeners of one monotonically increasing pulse.
     * @param sequence - Pulse number, starting at one.
     * @mode parallel
     * @dshScopeScan unsupported
     */
    'pulse/tick'(sequence: number): Promise<void> | void
  }
}
```

[查看本步快照](../examples/lifecycle/checkpoints/01-event-contract/src/events.ts)
<!-- checkpoint:01-event-contract -->

## 第二步：让部署者控制频率

定时频率会随部署环境变化，必须由 `Config` 暴露，不能藏在插件中的魔法数字里。Schemastery 负责补默认值，`resolveConfig()` 再拒绝 schema 无法表达的非有限值和非正数；错误会在插件加载时立即出现。

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from './events.ts'

export const name = 'pulse-source'

export interface Config {
  intervalMs?: number
}

export const Config: z<Config> = z.object({
  intervalMs: z.number().default(100),
})

type ResolvedConfig = Required<Config>

function resolveConfig(config: Config): ResolvedConfig {
  const resolved = config as ResolvedConfig
  if (!Number.isFinite(resolved.intervalMs) || resolved.intervalMs <= 0) {
    throw new Error('pulse-source: intervalMs must be a positive finite number')
  }
  return resolved
}
```

[查看本步快照](../examples/lifecycle/checkpoints/02-source-config/src/source.ts)
<!-- checkpoint:02-source-config -->

## 第三步：记录外部资源的运行状态

`PulseSource` 是 Cordis 不认识的外部资源。它必须知道当前 timer、尚未结算的回调和下一个序号，才能在释放时回答“还有没有旧实例的工作会继续发生”。此时类已经完整且可类型检查，只是还不能启动。

```ts
class PulseSource {
  #timer: NodeJS.Timeout | undefined
  #inFlight = new Set<Promise<void>>()
  #sequence = 0

  constructor(private readonly intervalMs: number) {}
}
```

[查看本步快照](../examples/lifecycle/checkpoints/03-resource-state/src/source.ts)
<!-- checkpoint:03-resource-state -->

## 第四步：记住每个在途回调

timer 回调本身不能 `await` 事件，但可以保存 `ctx.parallel()` 返回的 promise。监听器失败先留下明确诊断，再把已结算任务从集合删除；错误既不会悄悄丢失，也不会变成无人接收的 rejection。

```ts
  start(handler: (sequence: number) => Promise<void>): void {
    this.#timer = setInterval(() => {
      const task = handler(++this.#sequence).catch((error: unknown) => {
        console.error('pulse-source: tick listener failed', error)
      })
      this.#inFlight.add(task)
      void task.then(() => this.#inFlight.delete(task))
    }, this.intervalMs)
  }
```

[查看本步快照](../examples/lifecycle/checkpoints/04-track-callbacks/src/source.ts)
<!-- checkpoint:04-track-callbacks -->

## 第五步：停止新工作，再等待旧工作

`clearInterval()` 只阻止未来的 tick，不能撤销已经进入监听器的 promise。`close()` 先断开新工作的来源，再等待集合快照全部结算；只有这两个动作都完成，资源才达到完全停稳。

```ts
  async close(): Promise<void> {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer)
      this.#timer = undefined
    }
    await Promise.allSettled([...this.#inFlight])
  }
```

[查看本步快照](../examples/lifecycle/checkpoints/05-quiescent-close/src/source.ts)
<!-- checkpoint:05-quiescent-close -->

## 第六步：把资源所有权交给 fiber

外部资源必须在 `ctx.effect()` 内获取，并从同一个 effect 返回完整 disposer。插件因显式卸载、HMR、父 composition 释放或依赖消失而卸载时，Cordis 都会调用这个异步 disposer；业务代码不需要另存一份清理函数。

```ts
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.effect(() => {
    const source = new PulseSource(resolved.intervalMs)
    source.start(sequence => ctx.parallel('pulse/tick', sequence))
    return () => source.close()
  })
}
```

[查看本步快照](../examples/lifecycle/checkpoints/06-own-with-effect/src/source.ts)
<!-- checkpoint:06-own-with-effect -->

## 第七步：让框架管理监听器

`ctx.on()` 本身就是 effect，所以 reporter 不应手写 `off()`。监听器属于挂载 reporter 的 fiber：卸载 reporter 会撤销打印行为，但不会停止由另一个 fiber 拥有的脉冲源。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from './events.ts'

export const name = 'pulse-reporter'

export function apply(ctx: Context): void {
  ctx.on('pulse/tick', (sequence) => {
    console.log(`[pulse] ${sequence}`)
  })
}
```

[查看本步快照](../examples/lifecycle/checkpoints/07-listener-effect/src/reporter.ts)
<!-- checkpoint:07-listener-effect -->

## 第八步：观察卸载后的外部世界

生命周期测试不检查私有的 `closed = true`，而是继续推进时钟并观察事件和日志。reporter 卸载后 tick 仍增长但日志不再增加；source 卸载后 tick 也停止，这才证明两个 contribution 都从外部世界消失。

```ts
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as reporter from '../src/reporter.ts'
import * as source from '../src/source.ts'

describe('pulse lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('removes a listener and stops an external source with their fibers', async () => {
    vi.useFakeTimers()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const ctx = new Context()
    let ticks = 0
    ctx.on('pulse/tick', () => { ticks += 1 })

    const sourceFiber = await ctx.plugin(source, { intervalMs: 10 })
    const reporterFiber = await ctx.plugin(reporter)
    await vi.advanceTimersByTimeAsync(10)
    expect(ticks).toBe(1)
    expect(log).toHaveBeenCalledTimes(1)

    await reporterFiber.dispose()
    await vi.advanceTimersByTimeAsync(20)
    expect(ticks).toBe(3)
    expect(log).toHaveBeenCalledTimes(1)

    await sourceFiber.dispose()
    await vi.advanceTimersByTimeAsync(20)
    expect(ticks).toBe(3)
    await ctx.fiber.dispose()
  })
})
```

[查看本步快照](../examples/lifecycle/checkpoints/08-observe-teardown/tests/lifecycle.spec.ts)
<!-- checkpoint:08-observe-teardown -->

## 第九步：证明 dispose 等到完全停稳

最后让一个监听器故意停在 gate 上。`fiber.dispose()` 在 gate 放行前不能结算；放行后才完成。这个测试锁定的是调用者真正依赖的时序保证，而不是某个实现字段。

```ts
  it('does not finish disposal while an emitted callback is running', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const gate = Promise.withResolvers<void>()
    let entered = false
    ctx.on('pulse/tick', async () => {
      entered = true
      await gate.promise
    })
    const fiber = await ctx.plugin(source, { intervalMs: 10 })
    await vi.advanceTimersByTimeAsync(10)
    expect(entered).toBe(true)

    let disposed = false
    const disposal = Promise.resolve(fiber.dispose()).then(() => { disposed = true })
    await Promise.resolve()
    expect(disposed).toBe(false)

    gate.resolve(undefined)
    await disposal
    expect(disposed).toBe(true)
    await ctx.fiber.dispose()
  })
```

[查看本步快照](../examples/lifecycle/checkpoints/09-await-quiescence/tests/lifecycle.spec.ts)
<!-- checkpoint:09-await-quiescence -->

现在两个插件的所有权互不混淆：Cordis 撤销 `ctx.on()`，自定义 effect 负责 timer 和在途 promise，`dispose()` 的完成就是资源完全停稳的承诺。真实 Harness 中组合 registry 注销与后端关闭的实现可对照 `dsh-storage-json`；第 03 章会把同样的生命周期规则用于可替换服务。
