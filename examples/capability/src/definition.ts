// checkpoint:02-service-key
import { Service, type Context } from '@deepseek-ai/cordis'

// checkpoint:01-stable-values
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

// checkpoint:02-service-key
declare module '@deepseek-ai/cordis' {
  interface Context {
    summarizer: Summarizer
  }
}

export abstract class Summarizer extends Service {
  constructor(ctx: Context) {
    super(ctx, 'summarizer')
  }

// checkpoint:03-service-operations
  abstract resolve(request: SummaryRequest): SummarySpec

  abstract summarize(
    spec: SummarySpec,
    signal?: AbortSignal,
  ): Promise<SummaryResult>
// checkpoint:02-service-key
}

export default Summarizer
