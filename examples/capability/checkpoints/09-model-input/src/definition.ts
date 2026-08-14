import { Service, type Context } from '@deepseek-ai/cordis'

export interface SummaryRequest {
  readonly text: string
  readonly maxCharacters?: number
}

export interface SummarySpec {
  readonly text: string
  readonly maxCharacters: number
}

export interface SummaryResult {
  readonly summary: string
  readonly truncated: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    summarizer: Summarizer
  }
}

export abstract class Summarizer extends Service {
  constructor(ctx: Context) {
    super(ctx, 'summarizer')
  }

  abstract resolve(request: SummaryRequest): SummarySpec

  abstract summarize(
    spec: SummarySpec,
    signal?: AbortSignal,
  ): Promise<SummaryResult>
}

export default Summarizer
