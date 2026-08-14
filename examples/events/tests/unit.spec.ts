// checkpoint:06-execution-unit
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { expect, it } from 'vitest'

import * as projectRulePlugin from '../src/index.ts'

it('returns deferred context from the real ToolRuntime', async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(projectRulePlugin)
  try {
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: CallId('unit-rule'),
      name: 'remember_project_rule',
      arguments: { rule: 'Keep public APIs documented.' },
    })
    expect(result.isError).toBe(false)
    expect(result.additionalContexts?.[0]).toMatchObject({
      source: { kind: 'plugin', plugin: 'durable-project-rule' },
      content: [{
        type: 'text',
        text: 'Project rule for the rest of this session:\nKeep public APIs documented.',
      }],
    })
  } finally {
    await ctx.fiber.dispose()
  }
})
