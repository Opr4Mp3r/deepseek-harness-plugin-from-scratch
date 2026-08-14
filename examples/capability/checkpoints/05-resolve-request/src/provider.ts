import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import Summarizer from './definition.ts'
import type {
  SummaryRequest,
  SummaryResult,
  SummarySpec,
} from './definition.ts'

export interface Config {
  defaultMaxCharacters?: number
  maxCharactersCap?: number
}

export const Config: z<Config> = z.object({
  defaultMaxCharacters: z.number().default(80),
  maxCharactersCap: z.number().default(400),
})

type ResolvedConfig = Required<Config>

function positiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`summarizer-local: ${name} must be a positive integer`)
  }
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved = config as ResolvedConfig
  positiveInteger('defaultMaxCharacters', resolved.defaultMaxCharacters)
  positiveInteger('maxCharactersCap', resolved.maxCharactersCap)
  if (resolved.defaultMaxCharacters > resolved.maxCharactersCap) {
    throw new Error('summarizer-local: defaultMaxCharacters must not exceed maxCharactersCap')
  }
  return resolved
}

function resolveRequest(
  config: ResolvedConfig,
  request: SummaryRequest,
): SummarySpec {
  const requested = request.maxCharacters ?? config.defaultMaxCharacters
  positiveInteger('request.maxCharacters', requested)
  return {
    text: request.text,
    maxCharacters: Math.min(requested, config.maxCharactersCap),
  }
}
