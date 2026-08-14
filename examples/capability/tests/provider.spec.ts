import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import LocalSummarizer from '../src/provider.ts'

describe('LocalSummarizer', () => {
  it('resolves defaults and caps overrides before execution', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSummarizer, {
      defaultMaxCharacters: 4,
      maxCharactersCap: 6,
    })
    expect(ctx.summarizer.resolve({ text: 'abcdefghi' })).toEqual({
      text: 'abcdefghi',
      maxCharacters: 4,
    })
    expect(ctx.summarizer.resolve({ text: 'abcdefghi', maxCharacters: 20 })).toEqual({
      text: 'abcdefghi',
      maxCharacters: 6,
    })
    await expect(ctx.summarizer.summarize({
      text: 'abcdefghi',
      maxCharacters: 4,
    })).resolves.toEqual({ summary: 'abc…', truncated: true })
    await ctx.fiber.dispose()
  })

  it('rejects invalid requests and observes cancellation', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSummarizer, {
      defaultMaxCharacters: 4,
      maxCharactersCap: 6,
    })
    expect(() => ctx.summarizer.resolve({ text: 'x', maxCharacters: 0 }))
      .toThrow('request.maxCharacters must be a positive integer')
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(ctx.summarizer.summarize(
      { text: 'abcdefghi', maxCharacters: 4 },
      controller.signal,
    )).rejects.toThrow('cancelled')
    await ctx.fiber.dispose()
  })
})
