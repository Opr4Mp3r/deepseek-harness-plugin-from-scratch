// checkpoint:03-fiber-disposal
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('removes the tool when its contributing fiber is disposed', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    const greet = await import(pathToFileURL(
      resolve(process.cwd(), 'examples/progressive/src/index.ts'),
    ).href)
    const pluginFiber = await ctx.plugin(greet, {})

    expect(ctx.tools.get('greet')).toBeDefined()
    await pluginFiber.dispose()
    expect(ctx.tools.get('greet')).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
  }
})
