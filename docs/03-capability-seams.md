# 03｜可替换能力：三种角色缺一不可

当一项能力有多个后端，或接口、实现和模型呈现需要独立演进时，再把它设计成 capability seam。

## 三种角色

| 角色 | 拥有什么 | 不应该拥有什么 |
|---|---|---|
| Service Definition | 稳定 request/result/handle/error、Context key、生命周期语义 | 某个 API 协议、工具 prose、UI |
| Service Provider | 外部协议、资源、provider config、取消与错误归一化 | 模型 schema、Consumer UI |
| Consumer | tool schema、prompt guidance、canonical output、render intent | 具体 provider 类型 |

Provider 和 Consumer 都只依赖 Definition，彼此不依赖。三个角色不需要独立演进时可以同包；不要为想象中的未来先拆三包。

## 四种常见拓扑

### 单例执行器：Shell

Definition 是抽象 `ShellExecutor`，Provider 子类本身提供唯一 `ctx.shell`。装配时只挂 Provider + Consumer，不要再单独挂抽象类。Provider 通过显式 `resolve(request): spec` 落定默认值和上限，`run(spec)` 不再隐藏 `?? default`。

### 多 Provider registry：Web

Definition 是具体 `WebRuntime`，拥有 provider registry、重复 id 检查和选择规则。Provider 是函数插件，只向 registry 注册。Consumer 注册稳定的 `web_search` / `web_fetch` 工具；更换 provider 不应改变模型 schema。

### 分层目录：Skill

Definition 合并 global、preset、agent scope。Provider 提供发现数据并绑定 watcher 生命周期。Consumer 决定哪些 skill 对模型可见。registry 保持 invocation-neutral，安全策略在真正暴露或调用的 operation 上执行。

### 长生命周期引擎：Workflow

Definition 明确 start、cancel、result、dispose 和 quiescence。Provider 管理 worker/thread。Consumer 把需要 replay 的事实写成 Session event；live `workflow/*` event 只用于当前运行观察，不能替代持久记录。

## 推荐目录

```text
packages/<group>/
  <capability>/              Service Definition
    src/index.ts
    src/types.ts
    src/invariant.ts
  <capability>-<provider>/   Service Provider
    src/index.ts
    src/provider.ts
    src/invariant.ts
  tool-<capability>/         Consumer
    src/index.ts
    src/render.ts
    src/invariant.ts
```

Service 包默认导出 Service 类；function Provider/Consumer 只 named-export `name`、`inject`、`Config`、`apply`。

## Definition 的错误分界

Definition 必须说明“成功但不理想的领域结果”和“基础设施错误”如何区分。例如 shell 非零 exit 可以是成功返回的 `ShellRunResult`，而 spawn failure 才 reject；HTTP non-2xx 可以是 fetch 结果，而 provider 缺失或网络失败才 throw。所有 Provider 必须服从同一分界，Consumer 才能稳定呈现。
