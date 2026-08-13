/** Register a configurable `greet` tool with lifecycle cleanup. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { ToolCallView } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export interface Config {
  greeting?: string
  excited?: boolean
}

export const Config: z<Config> = z.object({
  greeting: z.string().default('Hello'),
  excited: z.boolean().default(false),
})

type ResolvedConfig = Required<Config>

function resolveConfig(config: Config): ResolvedConfig {
  return config as ResolvedConfig
}

const greetParameters = {
  name: {
    type: 'string',
    required: true,
    description: 'The person to greet.',
  },
} as const satisfies ParameterSchemaSpec

type GreetArgs = InferArgs<typeof greetParameters>

const greetOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec

type GreetValue = InferValue<typeof greetOutputSchema>

function renderGreeting(value: GreetValue) {
  return [{ type: 'text' as const, text: value.message }]
}

async function executeGreeting(
  config: ResolvedConfig,
  args: GreetArgs,
): Promise<GreetValue> {
  const person = args.name.trim()
  if (person.length === 0) {
    throw new Error('greet: `name` must not be blank')
  }
  const punctuation = config.excited ? '!' : '.'
  const sentence = `${config.greeting}, ${person}`
  return { message: sentence + punctuation }
}

function presentGreetCall(args: GreetArgs): ToolCallView {
  return {
    card: 'generic',
    title: 'Greet person',
    kind: 'other',
    rawInput: args,
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet one person by name.',
    parameters: greetParameters,
    output: {
      schema: greetOutputSchema,
      render: (_args, value) =>
        renderGreeting(value),
    },
    execute: args => executeGreeting(
      resolved,
      args,
    ),
    presentCall: presentGreetCall,
  }))
}
