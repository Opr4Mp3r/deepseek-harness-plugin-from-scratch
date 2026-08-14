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

class PulseSource {
  #timer: NodeJS.Timeout | undefined
  #inFlight = new Set<Promise<void>>()
  #sequence = 0

  constructor(private readonly intervalMs: number) {}

  start(handler: (sequence: number) => Promise<void>): void {
    this.#timer = setInterval(() => {
      const task = handler(++this.#sequence).catch((error: unknown) => {
        console.error('pulse-source: tick listener failed', error)
      })
      this.#inFlight.add(task)
      void task.then(() => this.#inFlight.delete(task))
    }, this.intervalMs)
  }

}
