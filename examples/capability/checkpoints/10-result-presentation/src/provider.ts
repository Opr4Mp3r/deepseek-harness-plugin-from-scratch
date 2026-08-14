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

async function summarizeLocally(
  spec: SummarySpec,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  signal?.throwIfAborted()
  const characters = Array.from(spec.text)
  if (characters.length <= spec.maxCharacters) {
    return { summary: spec.text, truncated: false }
  }
  const body = characters.slice(0, Math.max(0, spec.maxCharacters - 1)).join('')
  return { summary: `${body}…`, truncated: true }
}

export default class LocalSummarizer extends Summarizer {
  static Config = Config

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = resolveConfig(config)
  }

  resolve(request: SummaryRequest): SummarySpec {
    return resolveRequest(this.config, request)
  }

  summarize(spec: SummarySpec, signal?: AbortSignal): Promise<SummaryResult> {
    return summarizeLocally(spec, signal)
  }
}
