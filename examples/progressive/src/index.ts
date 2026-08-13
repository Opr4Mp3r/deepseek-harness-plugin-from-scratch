/**
 * Final tutorial plugin: a configurable `greet` tool whose registration follows
 * the Cordis fiber lifecycle.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

// checkpoint:plugin
export const name = 'greet-tool'
export const inject = ['tools']

// checkpoint:config
export interface Config {
  greeting?: string
  excited?: boolean
}

export const Config: z<Config> = z.object({
  greeting: z.string().default('Hello'),
  excited: z.boolean().default(false),
})

type ResolvedConfig = Required<Config>

// checkpoint:tool
export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet one person by name.',
    parameters: {
      name: {
        type: 'string',
        required: true,
        description: 'The person to greet.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args) {
      const person = args.name.trim()
      if (person.length === 0) {
        throw new Error('greet: `name` must not be blank')
      }
      const punctuation = resolved.excited ? '!' : '.'
      return { message: `${resolved.greeting}, ${person}${punctuation}` }
    },
    presentCall: args => ({
      card: 'generic',
      title: 'Greet person',
      kind: 'other',
      rawInput: args,
    }),
  }))
}
