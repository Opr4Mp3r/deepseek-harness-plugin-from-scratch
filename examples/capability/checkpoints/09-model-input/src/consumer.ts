import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
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
