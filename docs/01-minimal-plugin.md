# 01｜从一个最小 Consumer 开始

这章写一个真正能被 Harness Loader 加载的 `greet` 工具插件。它没有可替换后端，也没有独立演进的 service interface，因此不需要拆成 Definition / Provider / Consumer 三个包；一个函数插件就是合适的最小单位。

右侧一开始是空仓库。每一步先说明问题，再给出本步要加入的代码；当代码片段下方的 checkpoint 越过视口 42% 处的阅读线时，右侧才把这些行插入 `src/index.ts`。向上滚动会撤回对应增量。中间快照只承担渐进讲解，最后一份与进入 strict TypeScript 检查、可构建且可安装的 canonical source 完全一致。

> 想停下来浏览代码时，点击编辑器右上角的锁。快照仍会随正文演进，但页面不会抢走你正在看的文件和位置；解锁后会回到当前步骤。

## 第一步：声明插件身份和必需依赖

Cordis Loader 读取模块的 named exports。`name` 标识插件本身；稍后注册的工具会另有一个 `name: 'greet'`，两者不是同一个名字。函数插件不要添加 `export default apply`，否则真实 Loader 会优先解包 default export，同级的 `name`、`inject` 和 `Config` 都会丢失。

`inject = ['tools']` 声明必需的生命周期依赖：`tools` 不存在时插件保持 pending；服务消失时插件随之卸载；服务再次出现时插件重新挂载。

```ts
export const name = 'greet-tool'
export const inject = ['tools']
```

[查看此时的完整文件](../examples/progressive/checkpoints/01-identity.ts)

<!-- checkpoint:01-identity -->

## 第二步：写出部署者可以提供的配置

配置作者只需要写想覆盖的字段，所以输入类型里的两个属性都是 optional。`greeting` 控制问候语，`excited` 控制最后使用 `!` 还是 `.`。这里的 interface 只服务于 TypeScript，运行时会被擦除。

```ts
export interface Config {
  greeting?: string
  excited?: boolean
}
```

[查看此时的完整文件](../examples/progressive/checkpoints/02-config-type.ts) · [只看本步 diff](../examples/progressive/diffs/01-identity-to-02-config-type.patch)

<!-- checkpoint:02-config-type -->

## 第三步：让 Loader 校验并补全配置

Loader 不能执行已经被擦除的 interface，因此插件还要导出同名的 Standard Schema。`z<Config>` 让运行时 schema 与上一步的作者类型保持一致；两个 `.default()` 在插件挂载前补齐缺省值。字符串或布尔类型错误也会在加载阶段失败，而不是等到第一次工具调用。

```ts
import z from '@deepseek-ai/schemastery'

export const Config: z<Config> = z.object({
  greeting: z.string().default('Hello'),
  excited: z.boolean().default(false),
})
```

[查看此时的完整文件](../examples/progressive/checkpoints/03-config-schema.ts) · [只看本步 diff](../examples/progressive/diffs/02-config-type-to-03-config-schema.patch)

<!-- checkpoint:03-config-schema -->

## 第四步：把已校验配置变成运行时类型

公开的 `Config` 必须允许部署者省略默认字段，但插件运行时需要知道两个值都已存在。`ResolvedConfig` 表达这一区别。`resolveConfig()` 里的断言成立有一个明确前提：模块必须经 Loader 挂载，且 Loader 已应用导出的 `Config` schema；它不是给任意未校验对象使用的通用转换器。

```ts
type ResolvedConfig = Required<Config>

function resolveConfig(config: Config): ResolvedConfig {
  return config as ResolvedConfig
}
```

[查看此时的完整文件](../examples/progressive/checkpoints/04-resolved-config.ts) · [只看本步 diff](../examples/progressive/diffs/03-config-schema-to-04-resolved-config.patch)

<!-- checkpoint:04-resolved-config -->

## 第五步：定义模型可以提交的参数

工具参数是模型可见的输入协议。`type` 和 `required` 决定执行前的运行时校验，`description` 帮模型选择正确的值。`satisfies ParameterSchemaSpec` 检查作者写的 DSL，却保留对象的精确字面量类型；`InferArgs` 随后从同一份 schema 推导执行函数的参数类型，避免手写第二份 interface。

```ts
import type { InferArgs, ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'

const greetParameters = {
  name: {
    type: 'string',
    required: true,
    description: 'The person to greet.',
  },
} as const satisfies ParameterSchemaSpec

type GreetArgs = InferArgs<typeof greetParameters>
```

[查看此时的完整文件](../examples/progressive/checkpoints/05-model-input.ts) · [只看本步 diff](../examples/progressive/diffs/04-resolved-config-to-05-model-input.patch)

<!-- checkpoint:05-model-input -->

## 第六步：定义程序使用的规范结果

工具先返回稳定的 canonical JSON value，再分别投影给模型或 UI。本例的规范结果只有 `{ message: string }`。显式的 `additionalProperties: false` 防止实现悄悄返回未声明字段；属性上的 `required: true` 让 `message` 在推导出的 `GreetValue` 中保持必填。

```ts
import type { InferValue, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'

const greetOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    message: { type: 'string', required: true },
  },
} as const satisfies ValueSchemaSpec

type GreetValue = InferValue<typeof greetOutputSchema>
```

[查看此时的完整文件](../examples/progressive/checkpoints/06-canonical-output.ts) · [只看本步 diff](../examples/progressive/diffs/05-model-input-to-06-canonical-output.patch)

<!-- checkpoint:06-canonical-output -->

## 第七步：把规范结果渲染给模型

模型不会直接消费 canonical value，而是接收 content blocks。这个纯函数只把 `message` 映射为文本，不执行注册、日志或 I/O。`'text' as const` 保留联合类型的判别字段；去掉它，独立函数的返回类型会扩大成普通 `string`，无法满足 Harness 的 `ContentBlock` 类型。

```ts
function renderGreeting(value: GreetValue) {
  return [{ type: 'text' as const, text: value.message }]
}
```

[查看此时的完整文件](../examples/progressive/checkpoints/07-model-render.ts) · [只看本步 diff](../examples/progressive/diffs/06-canonical-output-to-07-model-render.patch)

<!-- checkpoint:07-model-render -->

## 第八步：实现执行和字符串值约束

参数 schema 能证明 `name` 是 string，却不能证明 trim 后仍有字符，因此执行函数在最早可判定点拒绝空白姓名。`excited` 的默认值已经由 Loader 补齐，所以这里可以直接选择标点。成功路径返回上一节定义的 `{ message }`，而不是模型专用的 content block。

`defineTool()` 要求执行函数返回 Promise，因此 helper 保持 `async`。抛出的错误会被 ToolRuntime 归一化为 `isError` 结果；只有当工具通过完整的 agent/session consumer 路径调用时，宿主才进一步把调用写入 Session 日志，本教程不把直接 `ctx.tools.execute()` 冒充为持久化证明。

```ts
async function executeGreeting(
  config: ResolvedConfig,
  args: GreetArgs,
): Promise<GreetValue> {
  const person = args.name.trim()
  if (person.length === 0) {
    throw new Error('greet: `name` must not be blank')
  }
  const punctuation = config.excited ? '!' : '.'
  const sentence = `${config.greeting}, ${person}`
  return { message: sentence + punctuation }
}
```

[查看此时的完整文件](../examples/progressive/checkpoints/08-execution.ts) · [只看本步 diff](../examples/progressive/diffs/07-model-render-to-08-execution.patch)

<!-- checkpoint:08-execution -->

## 第九步：声明 UI 如何展示调用

`presentCall` 描述界面如何显示“即将调用 greet”，它仍然是只依赖参数的纯函数。`card: 'generic'` 选择通用卡片，`title` 是人类可读标题，`kind` 给宿主一个调用类别，`rawInput` 保留原始参数供展开查看。本例的结果只是一行文字，通用结果展示已经足够，所以不额外实现 `presentResult`。

```ts
import type { ToolCallView } from '@deepseek-ai/dsh-tools'

function presentGreetCall(args: GreetArgs): ToolCallView {
  return {
    card: 'generic',
    title: 'Greet person',
    kind: 'other',
    rawInput: args,
  }
}
```

[查看此时的完整文件](../examples/progressive/checkpoints/09-presentation.ts) · [只看本步 diff](../examples/progressive/diffs/08-execution-to-09-presentation.patch)

<!-- checkpoint:09-presentation -->

## 第十步：把各部分注册成完整插件

现在才引入 Cordis `Context` 和 `defineTool()`，因为前九步已经分别定义了它们要组装的配置、输入、输出、执行和展示。Loader 调用 named export `apply(ctx, config)`；函数先取得已解析配置，再把完整定义注册到 `tools` service。工具自己的 `name` 是模型调用的 `greet`，`description` 会进入模型可见 schema。

`ctx.tools.register()` 把贡献绑定到当前 plugin fiber。释放 fiber 时注册自动撤销，所以 `apply()` 不需要把 registry disposer 再返回一遍。模块职责注释也在模块真正完成时加入，而不是在第一步提前宣称尚不存在的功能。

```ts
/** Register a configurable `greet` tool with lifecycle cleanup. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet one person by name.',
    parameters: greetParameters,
    output: {
      schema: greetOutputSchema,
      render: (_args, value) =>
        renderGreeting(value),
    },
    execute: args => executeGreeting(
      resolved,
      args,
    ),
    presentCall: presentGreetCall,
  }))
}
```

[查看最终源码](../examples/progressive/checkpoints/10-assembly.ts) · [只看本步 diff](../examples/progressive/diffs/09-presentation-to-10-assembly.patch)

<!-- checkpoint:10-assembly -->

## 运行真实装配验证

下面的 smoke 不是手工调用 `apply()`：Loader 从 `cordis.yml` 读取插件，按真实 module namespace 和依赖关系挂载，再通过 ToolRuntime 执行 `greet`。

```bash
pnpm smoke:source
```

预期结果包含：

```text
DSH_TUTORIAL_RESULT {"tools":["greet"],"result":{"isError":false,"content":[{"type":"text","text":"Welcome, Ada!"}],"value":{"message":"Welcome, Ada!"}}}
```

`smoke:source` 证明真实 Loader 能挂载并执行工具；`pnpm test` 中的生命周期用例会单独释放插件 fiber，再查询 registry，确认 `greet` 已消失。下一章会把同一条可逆 effect 规则推广到 timer、watcher、连接和多步异步释放。
