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
