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
