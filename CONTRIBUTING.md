# Contributing

感谢改进这套教程。请让每个 PR 同时保持“代码可运行”和“叙事可追溯”。

## 开发流程

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm check:profile
```

修改渐进示例时，只编辑对应章节的 canonical source、`checkpoints.json` 和正文中紧邻 marker 的解释与代码片段，然后运行：

```sh
pnpm generate:checkpoints
pnpm check
```

不要手改 `examples/*/checkpoints/` 或 `examples/*/diffs/` 下的生成文件。

## 更新上游基线

升级 Harness commit 或 npm rc 版本不是普通依赖更新。PR 必须：

1. 更新 README 的审计 commit、日期和兼容版本。
2. 逐项重跑 `docs/checklist.md`，检查旧结论是否仍成立。
3. 将 `docs/audit-report.md` 的 permalink 和行号更新到新 commit。
4. 运行 `pnpm check` 和 `pnpm check:profile`，并在 PR 中列出实际验证命令。
5. 明确记录被新增、修改或撤回的范式。

## 文档写法

- 说明当前行为，不写审阅过程或临时推理。
- 一个事实一个主要出处；其他页面链接过去。
- 示例必须来自 canonical source 或明确标成不可运行伪代码。
- 对 caller-visible failure、ownership、timing、cancellation 与 durability 写完整句子。

## Pull request

PR 描述请说明：改了什么、为什么、读者影响、验证命令、是否改变审计结论或兼容基线。改变 package 入口、组合层或运行时依赖时，必须同时更新 tarball 与 profile smoke。提交前运行 `git diff --check`。
