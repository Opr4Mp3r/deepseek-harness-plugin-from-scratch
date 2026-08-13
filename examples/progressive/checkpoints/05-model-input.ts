import z from '@deepseek-ai/schemastery'
import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
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
