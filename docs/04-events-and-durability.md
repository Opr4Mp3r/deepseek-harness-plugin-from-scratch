# 04｜事件与持久化：模型看到的必须能重建

这一章做一个 `remember_project_rule` 插件。模型调用工具后，插件产生一条带来源的上下文；真实 AgentLoop 先记录 `tool/result`，再把上下文记录为下一步的 `user/message`。最终测试从 JSON 化的 Session log 重建出完全相同的模型历史，全程不调用真实模型。

Harness 有两类容易混淆的事件：Cordis live events 是当前进程内的扩展点，Session events 是可重放的事实。判断标准很直接：只服务本次执行的观测、策略和包装使用 live event；reload、replay、fork 或模型请求仍要依赖的内容必须进入 Session log。

```text
事实需要 reload / replay / fork 吗？
├─ 是 → 使用 Harness 已支持的 durable event
│       模型消息从 Session.deriveMessages() 派生
└─ 否 → 使用 live Cordis event
        waterfall 观察器必须调用 next()
```

本教程面向仓库外可安装插件，因此不声明自定义 `SessionEventMap` 成员。审计版本明确说明[下游事件不在生成的已知集合中，且尚无注册接口](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/session/src/known-event-types.ts#L8-L17)；持久化读取器会[拒绝未知且非 `ignorable` 的记录](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/session/session-persistence/src/coordinator.ts#L1051-L1065)。类型合并虽然能通过 TypeScript，stock Harness 仍无法恢复这种日志。这里使用公开且可恢复的 `user/message`、`tool/call`、`tool/result` 和 `request/header`。

## 第一步：用 waterfall 观察，而不是保存状态

`tools/execute` 是 around waterfall。对 `dsh-tools` 的 type-only import 会加载它对 Cordis `Events` 的声明合并，使这个文件和最早的独立 checkpoint 都能获得 `exec`、`next` 的真实类型。计时器在 `next()` 前后包住下游执行，并在 `finally` 中记录耗时；它不向 Session 写任何状态，因为耗时不参与恢复或模型请求。省略 `next()` 会短路工具执行。

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

export function observeToolLatency(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    const started = performance.now()
    try {
      return await next()
    } finally {
      const elapsed = Math.round(performance.now() - started)
      ctx.logger.debug('%s completed in %dms', exec.name, elapsed)
    }
  })
}
```

[查看本步源码](../examples/events/checkpoints/01-live-waterfall/src/observe.ts)
<!-- checkpoint:01-live-waterfall -->

## 第二步：先构造带来源的模型上下文

模型消息不是裸字符串。`createUserMessage()` 生成稳定 id，并用 `source.kind = 'plugin'` 说明内容来自哪个插件。这个函数只构造消息；调用它本身还没有写日志。

```ts
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'

export function createProjectRuleContext(rule: string): UserMessage {
  return createUserMessage({
    content: [{
      type: 'text',
      text: `Project rule for the rest of this session:\n${rule}`,
    }],
    source: { kind: 'plugin', plugin: 'durable-project-rule' },
  })
}
```

[查看本步源码](../examples/events/checkpoints/02-plugin-context/src/context.ts)
<!-- checkpoint:02-plugin-context -->

## 第三步：把输入和规范结果分开声明

模型只看到参数 schema；程序返回值另有 output schema。两者都保留为 `as const`，让 `defineTool()` 在下一步推导出 `args.rule` 和结果类型。

```ts
import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

export const projectRuleParameters = {
  rule: {
    type: 'string',
    required: true,
    description: 'One project rule to preserve in model context.',
  },
} as const satisfies ParameterSchemaSpec

export const projectRuleOutput = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rule: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec
```

[查看本步源码](../examples/events/checkpoints/03-tool-contracts/src/contracts.ts)
<!-- checkpoint:03-tool-contracts -->

## 第四步：把上下文附着到工具结果

`exec.deferContext()` 不会在工具体内擅自修改模型请求。它把消息附着到这次执行结果；AgentLoop 只有在工具结果提交后才接收它，并按工具调用顺序送入下一步。空白值是 schema 无法表达的约束，因此在执行函数中尽早失败。

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

import { createProjectRuleContext } from './context.ts'
import { projectRuleOutput, projectRuleParameters } from './contracts.ts'

export const rememberProjectRule = defineTool({
  name: 'remember_project_rule',
  description: 'Add one project rule to the next model step.',
  parameters: projectRuleParameters,
  output: {
    schema: projectRuleOutput,
    render: (_args, value) => [{
      type: 'text',
      text: `Saved project rule: ${value.rule}`,
    }],
  },
  async execute(args, exec) {
    const rule = args.rule.trim()
    if (rule.length === 0) {
      throw new Error('remember_project_rule: `rule` must not be blank')
    }
    exec.deferContext(createProjectRuleContext(rule))
    return { rule }
  },
})
```

[查看本步源码](../examples/events/checkpoints/04-defer-context/src/tool.ts)
<!-- checkpoint:04-defer-context -->

## 第五步：把两个 contribution 装进同一插件 fiber

插件只有一个必需依赖 `tools`。`ctx.on()` 和 `ctx.tools.register()` 都由当前 fiber 拥有；卸载插件时，观察器和工具会一起撤销。

```ts
import type { Context } from '@deepseek-ai/cordis'

import { observeToolLatency } from './observe.ts'
import { rememberProjectRule } from './tool.ts'

export const name = 'durable-project-rule'
export const inject = ['tools']

export function apply(ctx: Context): void {
  observeToolLatency(ctx)
  ctx.tools.register(rememberProjectRule)
}
```

[查看本步源码](../examples/events/checkpoints/05-plugin-assembly/src/index.ts)
<!-- checkpoint:05-plugin-assembly -->

## 第六步：单元层只证明结果携带上下文

这项测试通过真实 `ToolRuntime` 执行工具，确认成功结果包含 `additionalContexts`。它故意不声称消息已经持久化：直接调用 ToolRuntime 会停在工具边界，只有 AgentLoop 才负责随后写入 `user/message`。

```ts
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
```

[查看本步源码](../examples/events/checkpoints/06-execution-unit/tests/unit.spec.ts)
<!-- checkpoint:06-execution-unit -->

## 第七步：用脚本模型驱动两次请求

完整路径不需要 API key。第一次响应要求调用 `remember_project_rule`，第二次返回普通文本；adapter 同时保留它实际收到的两个请求，供后面的重建断言使用。

```ts
import {
  CallId,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

const RULE = 'Keep public APIs documented.'

function toolCallResponse(): StreamChunk[] {
  const call = {
    type: 'tool-call' as const,
    id: CallId('remember-rule'),
    name: 'remember_project_rule',
    arguments: JSON.stringify({ rule: RULE }),
  }
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'block-end', index: 0, block: call },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

function textResponse(): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Rule received.' },
    {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: 'Rule received.' },
    },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.requests.length === 1
      ? toolCallResponse()
      : textResponse()
    for (const chunk of chunks) yield chunk
  }
}
```

[查看本步源码](../examples/events/checkpoints/07-scripted-model/tests/scripted-adapter.ts)
<!-- checkpoint:07-scripted-model -->

## 第八步：装配真实 AgentLoop

测试只替换不确定的模型边界。SessionStore、SystemPrompt、ToolRuntime、AgentRegistry 和 AgentLoop 都使用真实实现；一次普通 follow-up 会驱动“模型请求工具 → 工具提交结果与上下文 → 第二次模型请求”的完整状态机。

```ts
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
```

[查看本步源码](../examples/events/checkpoints/08-real-agent-loop/tests/harness.ts)
<!-- checkpoint:08-real-agent-loop -->

## 第九步：证明 deferred context 已进入 durable log

提交顺序是行为的一部分：`tool/result` 先进入日志，deferred context 随后在下一步成为 `user/message`，第二次请求才能看到它。测试同时检查事件 seq 和 adapter 实际收到的消息，而不是相信工具返回的自我报告。

```ts
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
```

[查看本步源码](../examples/events/checkpoints/09-durable-order/tests/log-order.spec.ts)
<!-- checkpoint:09-durable-order -->

## 第十步：从 dispatch 前的日志前缀重建请求

最终日志比第二次请求多出第二次模型响应，所以测试截在该响应的第一个 chunk 之前。`Session.deriveMessages()` 重建 messages，`foldRequestHeader()` 重建完整 call config、system 与 tools；`callConfigEquals()` 会逐项比较 provider、model 和可选采样字段，其余三项也必须与 adapter 收到的请求逐字一致。

```ts
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
```

[查看本步源码](../examples/events/checkpoints/10-request-reconstruction/tests/request-reconstruction.spec.ts)
<!-- checkpoint:10-request-reconstruction -->

## 第十一步：跨 JSON 存储边界重放

Session event payload 必须是 lossless JSON。这里用 stringify/parse 模拟后端的序列化边界，再从存储记录创建新 Session；重建出的完整模型历史必须与原 Session 相同。这证明事件内容和 projection 可重放，但不冒充某个具体文件或数据库后端的 flush 测试。

```ts
import {
  Session,
  SessionId,
  type SessionEvent,
} from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'

import { runJourney } from './harness.ts'

it('replays identical model history after a JSON storage round trip', async () => {
  const { ctx, agent } = await runJourney()
  try {
    const stored = JSON.parse(
      JSON.stringify(agent.session.events),
    ) as SessionEvent[]
    const replay = Session.create(SessionId('json-replay'), stored)

    expect(replay.deriveMessages()).toEqual(agent.session.deriveMessages())
  } finally {
    await ctx.fiber.dispose()
  }
})
```

[查看本步源码](../examples/events/checkpoints/11-json-replay/tests/replay.spec.ts)
<!-- checkpoint:11-json-replay -->

## 这条链路证明了什么

`tools/execute` 的计时只存在于 live 生命周期；`remember_project_rule` 的模型可见结果由 `tool/result` 保存；插件上下文由下一步的 `user/message` 保存；工具 schema 和其他 request header 字段由 `request/header` 保存。真实请求因此可以由 `deriveMessages()` 与 `foldRequestHeader()` 重建。

`agent.inject()` 遵循同一原则：它只把上下文排入下一次 pre-step，不唤醒 idle Agent，也不在入队瞬间承诺持久化；消息被下一次已接受的 step 写成 `user/message` 后才进入 durable history。需要独立于模型消息保存的插件状态，应使用 Harness 已注册的 durable event，或把该能力作为上游 package 连同 event catalog、projection、invariant 和 snapshot 一起实现。

Harness live event 的 `@mode` 约定属于 Cordis `Events` 声明：`emit` 同步观察，`parallel` 等待所有监听器，`serial` 按顺序决定，`waterfall` 通过 `next()` 委托。Session events 不使用 `@mode`；它们需要说明 payload、是否进入 model-visible surface，以及如何 fold 或与其他事件配对。
