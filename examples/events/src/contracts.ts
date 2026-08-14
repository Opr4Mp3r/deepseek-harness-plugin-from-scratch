// checkpoint:03-tool-contracts
import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

export const projectRuleParameters = {
  rule: {
    type: 'string',
    required: true,
    description: 'One project rule to preserve in model context.',
  },
} as const satisfies ParameterSchemaSpec

export const projectRuleOutput = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rule: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec
