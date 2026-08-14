// checkpoint:11-register-consumer
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
// checkpoint:09-model-input
import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
// checkpoint:10-result-presentation
import type {
  InferValue,
  ToolCallView,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'
// checkpoint:08-consumer-dependencies
import type {} from './definition.ts'

export const name = 'tool-summarize'
export const inject = ['tools', 'summarizer']

// checkpoint:09-model-input
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

// checkpoint:10-result-presentation
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

// checkpoint:11-register-consumer
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'summarize_text',
    description: 'Summarize text with the configured summarizer.',
    parameters: summaryParameters,
    output: {
      schema: summaryOutputSchema,
      render: (_args, value) => renderSummary(value),
    },
    execute(args, exec) {
      const spec = ctx.summarizer.resolve(args)
      return ctx.summarizer.summarize(spec, exec.signal)
    },
    presentCall: presentSummaryCall,
  }))
}
