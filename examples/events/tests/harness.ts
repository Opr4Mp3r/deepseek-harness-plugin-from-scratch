// checkpoint:08-real-agent-loop
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import * as projectRulePlugin from '../src/index.ts'
import { ScriptedAdapter } from './scripted-adapter.ts'

export interface Journey {
  ctx: Context
  agent: Agent
  adapter: ScriptedAdapter
}

export async function runJourney(): Promise<Journey> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: false,
    persona: '',
  })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(projectRulePlugin)

  const adapter = new ScriptedAdapter()
  ctx.llm.registerAdapter(['scripted'], adapter)
  const agent = ctx.agentLoop.create(SessionId('events-tutorial'), {
    provider: 'scripted',
    model: 'scripted',
  })
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: 'Remember our documentation rule.' }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  return { ctx, agent, adapter }
}
