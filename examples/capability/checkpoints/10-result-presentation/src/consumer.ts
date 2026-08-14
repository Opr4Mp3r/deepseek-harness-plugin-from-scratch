import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type {
  InferValue,
  ToolCallView,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'
import type {} from './definition.ts'

export const name = 'tool-summarize'
export const inject = ['tools', 'summarizer']

const summaryParameters = {
  text: {
    type: 'string',
    required: true,
    description: 'The text to summarize.',
  },
  maxCharacters: {
    type: 'number',
    description: 'Preferred maximum summary length.',
  },
} as const satisfies ParameterSchemaSpec

type SummaryArgs = InferArgs<typeof summaryParameters>

const summaryOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
} as const satisfies ValueSchemaSpec

type SummaryValue = InferValue<typeof summaryOutputSchema>

function renderSummary(value: SummaryValue) {
  return [{ type: 'text' as const, text: value.summary }]
}

function presentSummaryCall(args: SummaryArgs): ToolCallView {
  return {
    card: 'generic',
    title: 'Summarize text',
    kind: 'other',
    rawInput: args,
  }
}
