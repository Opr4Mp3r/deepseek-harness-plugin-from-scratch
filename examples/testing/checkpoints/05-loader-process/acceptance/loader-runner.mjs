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
