# 01｜从一个最小 Consumer 开始

教程先写一个 `greet` 工具。它不值得拆成独立 capability seam：没有可替换后端，也没有独立演进的 service interface。一个函数插件就足够。

## 第一步：声明插件身份和必需依赖

[查看本步完整代码](../examples/progressive/checkpoints/01-plugin.ts)

```ts
export const name = 'greet-tool'
export const inject = ['tools']
```

`inject` 不是类型提示，而是生命周期依赖。`tools` 不存在时插件保持 pending；`tools` 消失时插件被卸载；服务再次出现时插件重新挂载。

函数插件必须保留 module namespace，因此不要添加 `export default apply`。真实 Loader 会优先解包 default export，导致同级 `name`、`inject` 和 `Config` 丢失。

## 第二步：同时定义类型和运行时 schema

[查看本步完整代码](../examples/progressive/checkpoints/02-config.ts)

```ts
export interface Config {
  greeting?: string
  excited?: boolean
}

export const Config: z<Config> = z.object({
  greeting: z.string().default('Hello'),
  excited: z.boolean().default(false),
})
```

TypeScript interface 只在编译期存在。Loader 需要 Standard Schema 才能在挂载前校验 `cordis.yml` 并填充默认值。DSL 表达不了的跨字段或值约束仍需在加载或执行的最早可判定点验证。

## 第三步：注册工具

[查看最终代码](../examples/progressive/checkpoints/03-tool.ts)

一个工具有四种不同的公开事实：

- `parameters`：模型能提交什么；registry 在 `execute` 前校验。
- `output.schema`：程序拿到的 canonical JSON value。
- `output.render`：模型收到的 content。
- `presentCall` / `presentResult`：UI 的纯 render intent。

教程返回 `{ message }`，而不是直接返回 content block。这样 Code Mode 可以稳定读取字段，Native 模式则从同一 canonical value 渲染文字。

```ts
async execute(args) {
  const person = args.name.trim()
  if (person.length === 0) {
    throw new Error('greet: `name` must not be blank')
  }
  return { message: `${resolved.greeting}, ${person}.` }
}
```

schema 能证明 `name` 是 string，却不能证明 trim 后非空；因此这个约束仍由插件检查。抛出会被 ToolRuntime 归一化成 `isError`，不会绕过观察者或 Session 记录。

## `apply()` 为什么不返回 disposer

`ctx.tools.register()` 内部把注册绑定到调用它的 plugin fiber。释放该 fiber 就自动注销工具。教程的第四个测试不是检查某个内部 flag，而是释放 fiber 后再次查询 registry，证明世界真的改变了。

下一章会把这条规则推广到 timer、watcher、连接和多步异步释放。
