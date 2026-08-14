// checkpoint:05-plugin-assembly
import type { Context } from '@deepseek-ai/cordis'

import { observeToolLatency } from './observe.ts'
import { rememberProjectRule } from './tool.ts'

export const name = 'durable-project-rule'
export const inject = ['tools']

export function apply(ctx: Context): void {
  observeToolLatency(ctx)
  ctx.tools.register(rememberProjectRule)
}
