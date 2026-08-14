import {
  foldRequestHeader,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
import { callConfigEquals } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'

import { runJourney } from './harness.ts'

it('reconstructs the second model request from its durable prefix', async () => {
  const { ctx, agent, adapter } = await runJourney()
  try {
    const boundary = agent.session.events.findIndex(event =>
      event.type === 'assistant/chunk'
      && event.data.step === 2)
    expect(boundary).toBeGreaterThan(0)

    const prefix = agent.session.events.slice(0, boundary)
    const replay = Session.create(SessionId('request-prefix'), prefix)
    const request = adapter.requests[1]
    const header = foldRequestHeader(prefix)

    expect(request).toBeDefined()
    expect(header).toBeDefined()
    expect(callConfigEquals(request!, header!.config)).toBe(true)
    expect(request?.messages).toEqual(replay.deriveMessages())
    expect(request?.system).toBe(header?.system)
    expect(request?.tools).toEqual(header?.tools)
  } finally {
    await ctx.fiber.dispose()
  }
})
