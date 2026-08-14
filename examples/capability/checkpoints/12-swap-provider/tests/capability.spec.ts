import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import * as consumer from '../src/consumer.ts'
import Summarizer from '../src/definition.ts'
import type {
  SummaryRequest,
  SummaryResult,
  SummarySpec,
} from '../src/definition.ts'
import LocalSummarizer from '../src/provider.ts'

class FixedSummarizer extends Summarizer {
  resolve(request: SummaryRequest): SummarySpec {
    return { text: request.text, maxCharacters: request.maxCharacters ?? 1 }
  }

  summarize(_spec: SummarySpec): Promise<SummaryResult> {
    return Promise.resolve({ summary: 'replacement provider', truncated: false })
  }
}

describe('summarizer capability seam', () => {
  it('swaps the Provider without changing the Consumer schema', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    const provider = await ctx.plugin(LocalSummarizer, {
      defaultMaxCharacters: 8,
      maxCharactersCap: 12,
    })
    await ctx.plugin(consumer)
    const schema = ctx.tools.schemas()

    const local = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('local'),
      name: 'summarize_text',
      arguments: { text: 'abcdefghijk' },
    })
    expect(local.value).toEqual({ summary: 'abcdefg…', truncated: true })
    expect(local.content).toEqual([{ type: 'text', text: 'abcdefg…' }])
    expect(ctx.tools.get('summarize_text')?.presentCall?.({
      text: 'abcdefghijk',
    })).toEqual({
      card: 'generic',
      title: 'Summarize text',
      kind: 'other',
      rawInput: { text: 'abcdefghijk' },
    })

    await provider.dispose()
    expect(ctx.tools.get('summarize_text')).toBeUndefined()

    await ctx.plugin(FixedSummarizer)
    await vi.waitFor(() => expect(ctx.tools.get('summarize_text')).toBeDefined())
    expect(ctx.tools.schemas()).toEqual(schema)
    const replaced = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('replacement'),
      name: 'summarize_text',
      arguments: { text: 'anything' },
    })
    expect(replaced.value).toEqual({
      summary: 'replacement provider',
      truncated: false,
    })
    expect(replaced.content).toEqual([{
      type: 'text',
      text: 'replacement provider',
    }])
    await ctx.fiber.dispose()
  })
})
