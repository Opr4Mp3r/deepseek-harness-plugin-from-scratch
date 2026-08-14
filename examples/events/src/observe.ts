// checkpoint:01-live-waterfall
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export function observeToolLatency(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    const started = performance.now()
    try {
      return await next()
    } finally {
      const elapsed = Math.round(performance.now() - started)
      ctx.logger.debug('%s completed in %dms', exec.name, elapsed)
    }
  })
}
