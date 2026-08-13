import z from '@deepseek-ai/schemastery'
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
