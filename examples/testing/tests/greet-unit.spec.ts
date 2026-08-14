// checkpoint:01-unit-success
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface GreetConfig {
  greeting?: string
  excited?: boolean
}

async function createRuntime(config: GreetConfig = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  const greet = await import(pathToFileURL(
    resolve(process.cwd(), 'examples/progressive/src/index.ts'),
  ).href)
  await ctx.plugin(greet, config)
  return ctx
}

describe('greet unit evidence', () => {
  it('keeps the model schema, canonical value, and model text stable', async () => {
    const ctx = await createRuntime({ greeting: 'Release', excited: true })
    try {
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

      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId('unit-success'),
        name: 'greet',
        arguments: { name: 'Ada' },
      })
      expect(result).toEqual({
        isError: false,
        value: { message: 'Release, Ada!' },
        content: [{ type: 'text', text: 'Release, Ada!' }],
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})

// checkpoint:02-unit-error
describe('greet value constraints', () => {
  it('rejects a blank name after schema validation', async () => {
    const ctx = await createRuntime()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId('unit-error'),
        name: 'greet',
        arguments: { name: '   ' },
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('must not be blank'),
        }),
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
