import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

import * as greet from '../src/index.ts'

async function setup(config: greet.Config = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(greet, config)
  return ctx
}

describe('greet-tool', () => {
  it('publishes only the model-facing schema', async () => {
    const ctx = await setup()
    expect(ctx.tools.schemas()).toEqual([{
      name: 'greet',
      description: 'Greet one person by name.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The person to greet.',
          },
        },
        required: ['name'],
      },
    }])
    await ctx.fiber.dispose()
  })

  it('returns canonical JSON and renders model text', async () => {
    const ctx = await setup({ greeting: 'Welcome', excited: true })
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('call-1'),
      name: 'greet',
      arguments: { name: 'Ada' },
    })
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Welcome, Ada!' }],
      isError: false,
      value: { message: 'Welcome, Ada!' },
    })
    await ctx.fiber.dispose()
  })

  it('rejects a value constraint the schema cannot express', async () => {
    const ctx = await setup()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('call-2'),
      name: 'greet',
      arguments: { name: '   ' },
    })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('must not be blank') }),
    ])
    await ctx.fiber.dispose()
  })

  it('unregisters when the contributing fiber is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(greet, {})
    expect(ctx.tools.get('greet')).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('greet')).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
