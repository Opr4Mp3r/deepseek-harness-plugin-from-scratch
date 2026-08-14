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
