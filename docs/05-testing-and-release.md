# 05｜测试真实装配，而不是只测函数

这一章不再罗列“应该有哪些测试”，而是把最小插件沿真实发布路径逐层验收。右侧仓库会依次加入 unit、fiber disposal、Loader composition、built entry、tarball consumer 和 profile activation 的可执行代码；每一步只切换到正文正在解释的文件。

这里的原则是让每层证据只证明自己真正经过的路径。直接调用工具适合固定 schema、规范结果和错误；释放 fiber 才能证明撤销；Loader 子进程才能证明 module exports、配置应用和 composition；无效配置负例才证明 schema 会拒绝错误值；隔离 consumer 与真实 profile 才能证明用户拿到的制品可安装、可激活、可启动。

## 第一步：固定模型接口和成功结果

Unit 层先把最便宜、定位最准确的行为固定下来。测试装配真实的 `SystemPrompt` 与 `ToolRuntime`，再挂载第 01 章完成的最小插件；断言同时覆盖模型可见 schema、程序使用的 canonical value 和模型收到的 content blocks。三者属于不同接口，不能只比较最终字符串。

```ts
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

interface GreetConfig {
  greeting?: string
  excited?: boolean
}

async function createRuntime(config: GreetConfig = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime)
  const greet = await import(pathToFileURL(
    resolve(process.cwd(), 'examples/progressive/src/index.ts'),
  ).href)
  await ctx.plugin(greet, config)
  return ctx
}

describe('greet unit evidence', () => {
  it('keeps the model schema, canonical value, and model text stable', async () => {
    const ctx = await createRuntime({ greeting: 'Release', excited: true })
    try {
      expect(ctx.tools.schemas()).toEqual([{
        name: 'greet',
        description: 'Greet one person by name.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The person to greet.',
            },
          },
          required: ['name'],
        },
      }])

      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId('unit-success'),
        name: 'greet',
        arguments: { name: 'Ada' },
      })
      expect(result).toEqual({
        isError: false,
        value: { message: 'Release, Ada!' },
        content: [{ type: 'text', text: 'Release, Ada!' }],
      })
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
```

[查看本步测试文件](../examples/testing/checkpoints/01-unit-success/tests/greet-unit.spec.ts)

<!-- checkpoint:01-unit-success -->

## 第二步：固定 schema 表达不了的值约束

参数 schema 能保证 `name` 是字符串，但不能保证 trim 后非空。这个测试仍然走真实 `ToolRuntime.execute()`，因此检查的是 runtime 对插件异常的规范化结果，而不是直接调用 helper 时抛出的原始异常。每个测试都在 `finally` 中释放根 fiber，避免测试进程留下活跃资源。

```ts
describe('greet value constraints', () => {
  it('rejects a blank name after schema validation', async () => {
    const ctx = await createRuntime()
    try {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: CallId('unit-error'),
        name: 'greet',
        arguments: { name: '   ' },
      })
      expect(result.isError).toBe(true)
      expect(result.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('must not be blank'),
        }),
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
```

[查看此时的完整测试](../examples/testing/checkpoints/02-unit-error/tests/greet-unit.spec.ts) · [只看本步 diff](../examples/testing/diffs/01-unit-success-to-02-unit-error.patch)

<!-- checkpoint:02-unit-error -->

## 第三步：从 registry 观察 fiber 撤销

Unit 成功不代表插件能安全热更新。生命周期测试保存 `ctx.plugin()` 返回的贡献 fiber，释放它之后重新查询 authoritative registry；只有 `greet` 确实消失，才能证明 `ctx.tools.register()` 的 contribution 随插件撤销。测试不检查内部布尔变量，因为那不能说明外部世界已经停稳。

```ts
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

it('removes the tool when its contributing fiber is disposed', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime)
    const greet = await import(pathToFileURL(
      resolve(process.cwd(), 'examples/progressive/src/index.ts'),
    ).href)
    const pluginFiber = await ctx.plugin(greet, {})

    expect(ctx.tools.get('greet')).toBeDefined()
    await pluginFiber.dispose()
    expect(ctx.tools.get('greet')).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
  }
})
```

[查看生命周期测试](../examples/testing/checkpoints/03-fiber-disposal/tests/fiber-disposal.spec.ts) · [只看本步 diff](../examples/testing/diffs/02-unit-error-to-03-fiber-disposal.patch)

<!-- checkpoint:03-fiber-disposal -->

## 第四步：用 `cordis.yml` 声明真实装配

直接 `ctx.plugin(greet)` 会绕过 Loader 的 module namespace 解包、named exports、`inject` 等待和配置 schema。发布验收因此需要一份真实 composition：先提供插件必需的 services，再按配置文件相对路径加载 TypeScript 源码。特意使用 `Acceptance` 和 `excited: true`，让后续断言能证明 Loader 确实应用了配置。

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: '../progressive/src/index.ts'
  config:
    greeting: 'Acceptance'
    excited: true
```

[查看 Loader composition](../examples/testing/checkpoints/04-loader-config/cordis.yml) · [只看本步 diff](../examples/testing/diffs/03-fiber-disposal-to-04-loader-config.patch)

<!-- checkpoint:04-loader-config -->

## 第五步：让 Loader runner 自己校验结果

这一层不再把真实装配藏在测试 helper 后面。独立进程创建 `Context`，挂载 Loader，注册 Include builtin，读取上一步的 `cordis.yml`，再从 authoritative tool registry 执行 `greet`。runner 同时校验工具集合、错误标记与 canonical value；源码 smoke、built smoke 和隔离 consumer 都复用这一份 owner。

```js
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { CallId } from '@deepseek-ai/dsh-llm'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const configArgument = process.argv[2]
const expectedMessage = process.argv[3]
if (configArgument === undefined || expectedMessage === undefined) {
  throw new Error('usage: loader-runner.mjs <cordis.yml> <expected-message>')
}

const configPath = resolve(configArgument)
const configRequire = createRequire(configPath)
const ctx = new Context()

try {
  ctx.baseUrl = pathToFileURL(dirname(configPath)).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier) {
      return import(pathToFileURL(configRequire.resolve(specifier)).href)
    },
  }
  ctx.loader.builtins.include = Include
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()

  const result = await ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId('loader-smoke'),
    name: 'greet',
    arguments: { name: 'Ada' },
  })
  const observed = {
    tools: ctx.tools.schemas().map(schema => schema.name),
    result,
  }
  if (
    JSON.stringify(observed.tools) !== JSON.stringify(['greet'])
    || result.isError !== false
    || result.value?.message !== expectedMessage
  ) {
    throw new Error(`Loader returned ${JSON.stringify(observed)}`)
  }
  process.stdout.write(`DSH_TUTORIAL_RESULT ${JSON.stringify(observed)}\n`)
} finally {
  await ctx.fiber.dispose()
}
```

[查看 Loader runner](../examples/testing/checkpoints/05-loader-process/acceptance/loader-runner.mjs) · [只看本步 diff](../examples/testing/diffs/04-loader-config-to-05-loader-process.patch)

<!-- checkpoint:05-loader-process -->

## 第六步：固定命令工作目录、超时和失败证据

发布层需要构建、打包和启动 CLI，因此用同步命令边界保留真实退出码。仓库根目录由当前模块位置计算，不依赖调用者的 `cwd`；子进程显式继承环境，失败消息同时带回 stdout 与 stderr。profile owner 仍会在自己的边界覆盖 `DSH_HOME`，避免读取用户 profile。

```ts
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export const repositoryRoot = resolve(import.meta.dirname, '../../..')

export interface CommandEvidence {
  status: number | null
  stdout: string
  stderr: string
}

export function runCommand(
  executable: string,
  args: readonly string[],
  timeout = 120_000,
): CommandEvidence {
  const result = spawnSync(executable, [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env },
    timeout,
  })
  if (result.error !== undefined) throw result.error
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function requireSuccess(label: string, evidence: CommandEvidence): void {
  if (evidence.status !== 0) {
    throw new Error([
      `${label} failed (${String(evidence.status)})`,
      `stdout:\n${evidence.stdout}`,
      `stderr:\n${evidence.stderr}`,
    ].join('\n'))
  }
}

export function requireFailure(label: string, evidence: CommandEvidence): void {
  if (evidence.status === 0) throw new Error(`${label} unexpectedly succeeded`)
}
```

[查看命令验收 helper](../examples/testing/checkpoints/06-command-evidence/acceptance/run-command.ts) · [只看本步 diff](../examples/testing/diffs/05-loader-process-to-06-command-evidence.patch)

<!-- checkpoint:06-command-evidence -->

## 第七步：验证 schema 拒绝、built entry 和错误导出

这个 owner 先构建发布入口，再在仓库内创建一次性 composition。第一条用 plain Node 加载 `lib/index.js`；第二条把 `greeting` 设成数字，要求 Loader 因 `expected string` 失败；第三条动态生成带多余 default export 的模块，要求它以缺失 `inject` 的已知原因失败。临时文件位于仓库下，使 bare Harness 依赖按真实项目依赖树解析，并在 `finally` 中删除。

```ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  repositoryRoot,
  requireFailure,
  requireSuccess,
  runCommand,
} from './run-command.ts'

const runner = resolve(repositoryRoot, 'examples/testing/acceptance/loader-runner.mjs')
const sourceEntry = resolve(repositoryRoot, 'examples/progressive/src/index.ts')
const builtEntry = resolve(repositoryRoot, 'lib/index.js')
const temporaryRoot = await mkdtemp(join(repositoryRoot, '.dsh-entrypoints-'))

function configFor(entry: string, config: readonly string[]): string {
  return [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    `- name: ${JSON.stringify(entry)}`,
    '  config:',
    ...config.map(line => `    ${line}`),
    '',
  ].join('\n')
}

try {
  const build = runCommand('pnpm', ['run', 'build:package'])
  requireSuccess('package build', build)

  const builtConfig = join(temporaryRoot, 'built.yml')
  await writeFile(builtConfig, configFor(builtEntry, [
    "greeting: 'Built'",
    'excited: true',
  ]))
  const built = runCommand(process.execPath, [runner, builtConfig, 'Built, Ada!'])
  requireSuccess('plain-Node built entry smoke', built)

  const invalidConfigPath = join(temporaryRoot, 'invalid-config.yml')
  await writeFile(invalidConfigPath, configFor(sourceEntry, [
    'greeting: 42',
    'excited: true',
  ]))
  const invalidConfig = runCommand(process.execPath, [
    '--import',
    'tsx',
    runner,
    invalidConfigPath,
    'unused',
  ])
  requireFailure('invalid Config regression', invalidConfig)
  if (!invalidConfig.stderr.includes('expected string')) {
    throw new Error(`invalid Config failed for the wrong reason:\n${invalidConfig.stderr}`)
  }

  const invalidModule = join(temporaryRoot, 'default-export.mjs')
  const builtUrl = pathToFileURL(builtEntry).href
  await writeFile(invalidModule, [
    `export { name, inject, Config, apply } from ${JSON.stringify(builtUrl)}`,
    `export { apply as default } from ${JSON.stringify(builtUrl)}`,
    '',
  ].join('\n'))
  const invalidDefaultPath = join(temporaryRoot, 'invalid-default.yml')
  await writeFile(invalidDefaultPath, configFor(invalidModule, [
    "greeting: 'Invalid'",
    'excited: true',
  ]))
  const invalidDefault = runCommand(process.execPath, [
    runner,
    invalidDefaultPath,
    'unused',
  ])
  requireFailure('default-export Loader regression', invalidDefault)
  if (!invalidDefault.stderr.includes('cannot get property "tools" without inject')) {
    throw new Error(`default-export regression failed for the wrong reason:\n${invalidDefault.stderr}`)
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log('verified Config rejection, built entry, and default-export regression')
```

[查看 entrypoint 验收](../examples/testing/checkpoints/07-built-entry/acceptance/entrypoints.ts) · [只看本步 diff](../examples/testing/diffs/06-command-evidence-to-07-built-entry.patch)

<!-- checkpoint:07-built-entry -->

## 第八步：检查 tarball，再从隔离 consumer 加载裸包名

`check:package` 直接执行下面这个 owner。它先检查 manifest 与 bundle patch，并确认构建步骤已经移除只供教程生成器使用的 checkpoint 注释，再通过 `pnpm pack` 比较完整 allowlist。随后它创建无 workspace 继承关系的 consumer，安装 tarball 和固定 Harness 依赖，复制第五步已经展示的 plain-JavaScript Loader runner，并用发布包裸名称执行 `greet`。安装使用 `--ignore-scripts`，所以成功不能依赖 consumer 再次运行 `prepare`。

```ts
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '../../..')
const packageName = 'deepseek-harness-plugin-from-scratch'
const expectedTarEntries = [
  'package/LICENSE',
  'package/README.md',
  'package/cordis.patch.yml',
  'package/lib/index.d.ts',
  'package/lib/index.js',
  'package/package.json',
].sort()

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
  private?: boolean
  main?: string
  types?: string
  exports?: Record<string, unknown>
  files?: string[]
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
}

if (packageJson.private === true) throw new Error('the tutorial bundle must be publishable')
if (packageJson.main !== './lib/index.js') throw new Error('package main must target emitted JavaScript')
if (packageJson.types !== './lib/index.d.ts') throw new Error('package types must target emitted declarations')
if (!packageJson.exports?.['.']) throw new Error('package exports must expose the plugin entrypoint')
if (packageJson.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('package must declare its Harness bundle patch')
}
const expectedDependencies = { '@deepseek-ai/schemastery': '3.18.1' }
const expectedPeers = {
  '@deepseek-ai/cordis': '^4.0.1',
  '@deepseek-ai/dsh-tools': '^0.1.0-rc.5',
}
if (JSON.stringify(packageJson.dependencies) !== JSON.stringify(expectedDependencies)) {
  throw new Error('package dependencies must contain only the plugin-owned runtime implementation')
}
if (JSON.stringify(packageJson.peerDependencies) !== JSON.stringify(expectedPeers)) {
  throw new Error('package peerDependencies must contain the Harness-provided services')
}
for (const path of ['lib/index.js', 'lib/index.d.ts', 'cordis.patch.yml']) {
  if (!packageJson.files?.includes(path)) throw new Error(`package files must include ${path}`)
}
const builtEntry = await readFile(resolve(root, 'lib/index.js'), 'utf8')
if (/^\/\/ checkpoint:/m.test(builtEntry)) {
  throw new Error('published JavaScript must not contain tutorial checkpoint markers')
}

const patch = await readFile(resolve(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes(`name: ${packageName}`)) {
  throw new Error('bundle patch must load the published package by its bare name')
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-package-'))
try {
  const packDirectory = join(temporaryRoot, 'pack')
  const consumerDirectory = join(temporaryRoot, 'consumer')
  await mkdir(packDirectory)
  await mkdir(consumerDirectory)

  await run('pnpm', ['pack', '--pack-destination', packDirectory], { cwd: root })
  const tarballs = (await readdir(packDirectory)).filter(path => path.endsWith('.tgz'))
  if (tarballs.length !== 1 || tarballs[0] === undefined) {
    throw new Error(`expected one package tarball, found ${tarballs.length}`)
  }
  const tarball = join(packDirectory, tarballs[0])
  const { stdout: tarOutput } = await run('tar', ['-tf', tarball], { cwd: root })
  const actualTarEntries = tarOutput.trim().split('\n').sort()
  if (JSON.stringify(actualTarEntries) !== JSON.stringify(expectedTarEntries)) {
    throw new Error(`unexpected tarball contents:\n${actualTarEntries.join('\n')}`)
  }

  await writeFile(join(consumerDirectory, 'package.json'), JSON.stringify({
    name: 'dsh-plugin-package-smoke',
    private: true,
    type: 'module',
  }, null, 2) + '\n')
  await run('pnpm', [
    'add',
    '--prefer-offline',
    '--ignore-scripts',
    tarball,
    '@deepseek-ai/cordis@4.0.1',
    '@deepseek-ai/cordis-plugin-include@1.0.6',
    '@deepseek-ai/cordis-plugin-loader@1.0.2',
    '@deepseek-ai/dsh-llm@0.1.0-rc.6',
    '@deepseek-ai/dsh-system-prompt@0.1.0-rc.6',
    '@deepseek-ai/dsh-tools@0.1.0-rc.6',
  ], { cwd: consumerDirectory })

  const loaderConfig = join(consumerDirectory, 'cordis.yml')
  await writeFile(loaderConfig, [
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'",
    `- name: '${packageName}'`,
    '  config:',
    "    greeting: 'Packaged'",
    '    excited: true',
    '',
  ].join('\n'))
  const runner = join(consumerDirectory, 'loader-runner.mjs')
  await writeFile(
    runner,
    await readFile(resolve(root, 'examples/testing/acceptance/loader-runner.mjs'), 'utf8'),
  )
  const { stdout: smokeOutput } = await run(
    process.execPath,
    [runner, loaderConfig, 'Packaged, Ada!'],
    { cwd: consumerDirectory },
  )
  if (!smokeOutput.includes('DSH_TUTORIAL_RESULT ')) {
    throw new Error('installed package smoke produced no result')
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log('verified publish tarball and isolated bare-package Loader composition')
```

[查看 package 验收 owner](../examples/testing/checkpoints/08-package-consumer/acceptance/package.ts) · [只看本步 diff](../examples/testing/diffs/07-built-entry-to-08-package-consumer.patch)

<!-- checkpoint:08-package-consumer -->

## 第九步：安装、激活并启动真实 profile

最终 owner 从审计 manifest 读取固定 CLI 版本，在临时 `DSH_HOME` 中生成 tarball 并执行 `dsh plugin --profile tutorial add`。它检查 bundle 列表和 `--dump-config`，再向该 profile 加入只用于验收的 Consumer；Consumer 等待 Loader 完成后调用已安装的 `greet`，输出结果并触发正常终止。设置 `DSH_HARNESS_ROOT` 时只替换 CLI 入口，tarball 安装、profile 组合与启动路径保持不变。

```js
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '../../..')
const packageName = 'deepseek-harness-plugin-from-scratch'
const manifest = JSON.parse(await readFile(resolve(root, 'audit-manifest.json'), 'utf8'))
const cliVersion = manifest.profileBaseline?.['@deepseek-ai/dsh']
if (typeof cliVersion !== 'string') throw new Error('audit manifest needs a profile CLI baseline')
const sourceHarnessRoot = process.env.DSH_HARNESS_ROOT
const dshCommand = sourceHarnessRoot === undefined
  ? {
      executable: 'pnpm',
      prefix: ['dlx', '--allow-build=node-pty', `@deepseek-ai/dsh@${cliVersion}`],
      cwd: root,
    }
  : {
      executable: process.execPath,
      prefix: ['--import', 'tsx/esm', resolve(sourceHarnessRoot, 'apps/cli/src/bin.ts')],
      cwd: resolve(sourceHarnessRoot),
    }
const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-plugin-profile-'))

function runDsh(arguments_, environment, timeout) {
  return run(dshCommand.executable, [...dshCommand.prefix, ...arguments_], {
    cwd: dshCommand.cwd,
    env: environment,
    timeout: timeout ?? 120_000,
  })
}

try {
  const packDirectory = join(temporaryRoot, 'pack')
  const harnessHome = join(temporaryRoot, 'home')
  await mkdir(packDirectory)
  const environment = { ...process.env, DSH_HOME: harnessHome }

  await run('pnpm', ['pack', '--pack-destination', packDirectory], { cwd: root, env: environment })
  const tarballName = (await readdir(packDirectory)).find(path => path.endsWith('.tgz'))
  if (tarballName === undefined) throw new Error('profile smoke could not find the package tarball')
  const tarball = join(packDirectory, tarballName)

  await runDsh(['plugin', '--profile', 'tutorial', 'add', '--prefer-offline', tarball], environment)

  const profileDirectory = join(harnessHome, 'profiles', 'tutorial')
  const profileManifest = JSON.parse(await readFile(join(profileDirectory, 'package.json'), 'utf8'))
  const bundles = profileManifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles) || !bundles.includes(packageName)) {
    throw new Error('dsh plugin add did not activate the tutorial bundle')
  }

  const { stdout: dump } = await runDsh(['--profile', 'tutorial', '--dump-config'], environment)
  if (!dump.includes(`# == ${packageName}`) || !dump.includes('id: greet-tool')) {
    throw new Error('profile config dump does not contain the tutorial bundle layer and greet row')
  }

  const runnerPath = join(temporaryRoot, 'profile-runner.mjs')
  await writeFile(runnerPath, [
    "export const name = 'tutorial-profile-smoke'",
    "export const inject = ['tools']",
    '',
    'export function apply(ctx) {',
    '  void ctx.loader.await().then(async () => {',
    '    const result = await ctx.tools.execute({',
    "      signal: new AbortController().signal, callId: 'profile-smoke',",
    "      name: 'greet', arguments: { name: 'Ada' },",
    '    })',
    '    process.stdout.write(`DSH_PROFILE_RESULT ${JSON.stringify(result)}\\n`)',
    "    process.kill(process.pid, 'SIGTERM')",
    '  })',
    '}',
    '',
  ].join('\n'))
  await writeFile(join(profileDirectory, 'cordis.patch.yml'), [
    '- insert:',
    '    - id: tutorial-profile-smoke',
    `      name: '${pathToFileURL(runnerPath).href}'`,
    '',
  ].join('\n'))

  const { stdout: bootOutput } = await runDsh(['--profile', 'tutorial'], environment, 30_000)
  const resultLine = bootOutput.split('\n').find(line => line.startsWith('DSH_PROFILE_RESULT '))
  if (resultLine === undefined) throw new Error('installed profile boot produced no greet result')
  const observed = JSON.parse(resultLine.slice('DSH_PROFILE_RESULT '.length))
  if (observed.isError !== false || observed.value?.message !== 'Hello, Ada.') {
    throw new Error(`installed profile returned ${JSON.stringify(observed)}`)
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log('verified dsh plugin add, profile layer composition, and installed greet execution')
```

[查看 profile 验收 owner](../examples/testing/checkpoints/09-profile-activation/acceptance/profile.mjs) · [只看本步 diff](../examples/testing/diffs/08-package-consumer-to-09-profile-activation.patch)

<!-- checkpoint:09-profile-activation -->

## 按成本递增地运行

开发循环先运行与修改面匹配的快速证据，再走发布制品和 profile：

```sh
pnpm exec vitest run examples/testing/tests/greet-unit.spec.ts examples/testing/tests/fiber-disposal.spec.ts
pnpm run smoke:source
pnpm run smoke:loader
pnpm run check:package
pnpm run check:profile
```

这些阶段都不调用模型，也不需要 API key。源码、unit 与 built entry 完全本地；package 验收优先使用本地 pnpm store，固定依赖缺失时会访问 registry；profile 验收还需要固定 CLI 或通过 `DSH_HARNESS_ROOT` 指定已安装依赖的 Harness checkout。

## 独立插件证据与上游交付证据

这里的验收证明独立插件的导出、配置、fiber topology、构建制品、裸包名解析和 profile 激活，但不等于 Harness 产品 transcript。把插件移入上游时，模型、协议、UI 或人类可见变化还需要所属 runnable example 的 keyless snapshot；durable lifecycle 关系需要由 package invariant 比较 authoritative runtime state，不能用“service 存在”代替。README/JSDoc、双语文档与非平凡变更的 Agent Note 也必须随代码提交。完整条目见[交付检查单](checklist.md)，对应上游源码证据见[审计报告](audit-report.md)。
