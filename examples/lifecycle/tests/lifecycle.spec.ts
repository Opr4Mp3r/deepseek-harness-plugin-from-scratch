// checkpoint:08-observe-teardown
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

// checkpoint:09-await-quiescence
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
// checkpoint:08-observe-teardown
})
