import { expect, it } from 'vitest'

import { runJourney } from './harness.ts'

it('logs deferred context after the tool result and before the next request', async () => {
  const { ctx, agent, adapter } = await runJourney()
  try {
    const toolResult = agent.session.events.find(event =>
      event.type === 'tool/result')
    const projectRule = agent.session.events.find(event =>
      event.type === 'user/message'
      && event.data.source.kind === 'plugin'
      && event.data.source.plugin === 'durable-project-rule')

    expect(toolResult).toBeDefined()
    expect(projectRule).toBeDefined()
    expect(projectRule!.seq).toBeGreaterThan(toolResult!.seq)
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[1]?.messages).toContainEqual(projectRule!.data)
  } finally {
    await ctx.fiber.dispose()
  }
})
