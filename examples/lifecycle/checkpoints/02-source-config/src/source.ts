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
