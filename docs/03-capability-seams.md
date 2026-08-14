# 03｜可替换能力：Definition、Provider、Consumer

只有一个实现、一个调用者且不会独立演进的功能，不需要 capability seam。本章用一个可本地运行的 summarizer 展示真正的三角色拆分：Definition 固定服务义务，Provider 决定默认值和算法，Consumer 把能力呈现给模型；最后在进程中替换 Provider，而工具 schema 保持不变。

## 第一步：先固定三种稳定值

Definition 从调用者和实现都必须理解的数据开始。`SummaryRequest` 允许调用者省略偏好，`SummarySpec` 是 Provider 已经补全并限制过的执行输入，`SummaryResult` 则是所有实现必须返回的领域结果。三者都不知道模型 schema 或具体算法。

```ts
export interface SummaryRequest {
  readonly text: string
  readonly maxCharacters?: number
}

export interface SummarySpec {
  readonly text: string
  readonly maxCharacters: number
}

export interface SummaryResult {
  readonly summary: string
  readonly truncated: boolean
}
```

[查看本步快照](../examples/capability/checkpoints/01-stable-values/src/definition.ts)
<!-- checkpoint:01-stable-values -->

## 第二步：让 Definition 拥有服务键

声明合并让 `ctx.summarizer` 在编译期可见；`super(ctx, 'summarizer')` 在运行期占有同名 service。抽象 Definition 可以默认导出供包使用，但装配时挂载的是后面的具体 Provider，不要把抽象类再挂一次。

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    summarizer: Summarizer
  }
}

export abstract class Summarizer extends Service {
  constructor(ctx: Context) {
    super(ctx, 'summarizer')
  }
}

export default Summarizer
```

[查看本步快照](../examples/capability/checkpoints/02-service-key/src/definition.ts)
<!-- checkpoint:02-service-key -->

## 第三步：写义务，不写算法

Definition 要求每个 Provider 先 `resolve(request)`，再执行完整的 `SummarySpec`；这样默认值和上限不会偷偷散落在执行函数中。截断是带 `truncated` 的成功结果，基础设施失败和取消才 reject；可选 `AbortSignal` 让所有实现遵守同一取消入口。

```ts
  abstract resolve(request: SummaryRequest): SummarySpec

  abstract summarize(
    spec: SummarySpec,
    signal?: AbortSignal,
  ): Promise<SummaryResult>
```

[查看本步快照](../examples/capability/checkpoints/03-service-operations/src/definition.ts)
<!-- checkpoint:03-service-operations -->

## 第四步：配置只属于 Provider

默认长度和部署上限会因实现而异，因此放在本地 Provider，而不是稳定 Definition 或模型参数里。Schemastery 补全配置，`resolveConfig()` 在加载时拒绝非正整数和互相矛盾的上下限。

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import Summarizer from './definition.ts'
import type {
  SummaryRequest,
  SummaryResult,
  SummarySpec,
} from './definition.ts'

export interface Config {
  defaultMaxCharacters?: number
  maxCharactersCap?: number
}

export const Config: z<Config> = z.object({
  defaultMaxCharacters: z.number().default(80),
  maxCharactersCap: z.number().default(400),
})

type ResolvedConfig = Required<Config>

function positiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`summarizer-local: ${name} must be a positive integer`)
  }
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved = config as ResolvedConfig
  positiveInteger('defaultMaxCharacters', resolved.defaultMaxCharacters)
  positiveInteger('maxCharactersCap', resolved.maxCharactersCap)
  if (resolved.defaultMaxCharacters > resolved.maxCharactersCap) {
    throw new Error('summarizer-local: defaultMaxCharacters must not exceed maxCharactersCap')
  }
  return resolved
}
```

[查看本步快照](../examples/capability/checkpoints/04-provider-config/src/provider.ts)
<!-- checkpoint:04-provider-config -->

## 第五步：显式落定默认值和上限

`resolveRequest()` 是从开放 request 到完整 spec 的唯一入口：省略值取 Provider 默认值，显式值先验证再受部署上限约束。后面的执行函数只接收 `SummarySpec`，所以不再出现隐蔽的 `?? default`。

```ts
function resolveRequest(
  config: ResolvedConfig,
  request: SummaryRequest,
): SummarySpec {
  const requested = request.maxCharacters ?? config.defaultMaxCharacters
  positiveInteger('request.maxCharacters', requested)
  return {
    text: request.text,
    maxCharacters: Math.min(requested, config.maxCharactersCap),
  }
}
```

[查看本步快照](../examples/capability/checkpoints/05-resolve-request/src/provider.ts)
<!-- checkpoint:05-resolve-request -->

## 第六步：实现算法并尊重取消

本地实现按 Unicode code point 截取文本，并把“被截断”作为普通结果返回。`throwIfAborted()` 发生在任何工作之前；函数是 `async`，所以取消以 Promise rejection 进入 Definition 约定的错误路径。

```ts
async function summarizeLocally(
  spec: SummarySpec,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  signal?.throwIfAborted()
  const characters = Array.from(spec.text)
  if (characters.length <= spec.maxCharacters) {
    return { summary: spec.text, truncated: false }
  }
  const body = characters.slice(0, Math.max(0, spec.maxCharacters - 1)).join('')
  return { summary: `${body}…`, truncated: true }
}
```

[查看本步快照](../examples/capability/checkpoints/06-run-provider/src/provider.ts)
<!-- checkpoint:06-run-provider -->

## 第七步：用具体 Service 提供能力

具体类继承 Definition，因此挂载这个默认导出就会注册唯一的 `ctx.summarizer`。构造器只解析部署配置；两个公开方法分别委托给刚才的 resolve 和执行逻辑。Provider 文件没有导入 `dsh-tools`。

```ts
export default class LocalSummarizer extends Summarizer {
  static Config = Config

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.config = resolveConfig(config)
  }

  resolve(request: SummaryRequest): SummarySpec {
    return resolveRequest(this.config, request)
  }

  summarize(spec: SummarySpec, signal?: AbortSignal): Promise<SummaryResult> {
    return summarizeLocally(spec, signal)
  }
}
```

[查看本步快照](../examples/capability/checkpoints/07-concrete-provider/src/provider.ts)
<!-- checkpoint:07-concrete-provider -->

## 第八步：Consumer 只依赖稳定服务

Consumer 通过 type-only import 获得 `ctx.summarizer` 的声明合并，运行时只要求 `tools` 和 `summarizer` 两个 service。它没有导入 `LocalSummarizer`，因此配置可以替换实现而不修改 Consumer。

```ts
import type {} from './definition.ts'

export const name = 'tool-summarize'
export const inject = ['tools', 'summarizer']
```

[查看本步快照](../examples/capability/checkpoints/08-consumer-dependencies/src/consumer.ts)
<!-- checkpoint:08-consumer-dependencies -->

## 第九步：模型输入属于 Consumer

模型看到的参数不是 Provider 配置。它只提交待摘要文本和一次调用的长度偏好；`InferArgs` 从同一份 schema 推导执行参数，避免另写一套可能漂移的接口。

```ts
import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

const summaryParameters = {
  text: {
    type: 'string',
    required: true,
    description: 'The text to summarize.',
  },
  maxCharacters: {
    type: 'number',
    description: 'Preferred maximum summary length.',
  },
} as const satisfies ParameterSchemaSpec

type SummaryArgs = InferArgs<typeof summaryParameters>
```

[查看本步快照](../examples/capability/checkpoints/09-model-input/src/consumer.ts)
<!-- checkpoint:09-model-input -->

## 第十步：分开程序结果、模型文本和 UI

`summaryOutputSchema` 是程序可调用的规范 JSON；`renderSummary()` 从该值生成模型文本；`presentSummaryCall()` 只返回 UI 渲染意图。这三层都属于 Consumer，但用途不同，不能让 Provider 的响应格式直接泄漏给模型或界面。

```ts
import type {
  InferValue,
  ToolCallView,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'

const summaryOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', required: true },
    truncated: { type: 'boolean', required: true },
  },
} as const satisfies ValueSchemaSpec

type SummaryValue = InferValue<typeof summaryOutputSchema>

function renderSummary(value: SummaryValue) {
  return [{ type: 'text' as const, text: value.summary }]
}

function presentSummaryCall(args: SummaryArgs): ToolCallView {
  return {
    card: 'generic',
    title: 'Summarize text',
    kind: 'other',
    rawInput: args,
  }
}
```

[查看本步快照](../examples/capability/checkpoints/10-result-presentation/src/consumer.ts)
<!-- checkpoint:10-result-presentation -->

## 第十一步：通过 Definition 调用 Provider

注册时，Consumer 把模型参数交给 `ctx.summarizer.resolve()`，再把完整 spec 和工具取消信号交给 `summarize()`。这里唯一出现的调用面是 Definition；更换 Provider 不会改变工具名称、参数、输出或展示。

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'summarize_text',
    description: 'Summarize text with the configured summarizer.',
    parameters: summaryParameters,
    output: {
      schema: summaryOutputSchema,
      render: (_args, value) => renderSummary(value),
    },
    execute(args, exec) {
      const spec = ctx.summarizer.resolve(args)
      return ctx.summarizer.summarize(spec, exec.signal)
    },
    presentCall: presentSummaryCall,
  }))
}
```

[查看本步快照](../examples/capability/checkpoints/11-register-consumer/src/consumer.ts)
<!-- checkpoint:11-register-consumer -->

## 第十二步：替换 Provider，保持模型接口

最后的测试装配真实 `SystemPrompt`、`ToolRuntime`、本地 Provider 和 Consumer。它同时检查规范 value、模型 content 和 `presentCall()` 的 UI 意图。释放 Provider 后，`inject = ['summarizer']` 会让 Consumer 同步卸载，工具随之消失；挂载另一个 Provider 后 Consumer 自动恢复。前后 schema 完全相同，模型 render 仍由 Consumer 控制，但规范结果来自新实现。

```ts
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
```

[查看本步快照](../examples/capability/checkpoints/12-swap-provider/tests/capability.spec.ts)
<!-- checkpoint:12-swap-provider -->

这套装配属于 Shell 式单例执行器：具体 Provider 子类占有唯一 service。需要多实现同时注册并在调用时选择时，Definition 可以像 Harness 的 `WebRuntime` 一样拥有 provider registry；三种角色的依赖方向仍保持不变。
