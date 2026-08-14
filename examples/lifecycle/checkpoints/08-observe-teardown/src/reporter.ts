import type { Context } from '@deepseek-ai/cordis'
import type {} from './events.ts'

export const name = 'pulse-reporter'

export function apply(ctx: Context): void {
  ctx.on('pulse/tick', (sequence) => {
    console.log(`[pulse] ${sequence}`)
  })
}
