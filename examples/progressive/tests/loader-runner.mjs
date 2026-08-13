/** Tiny app entrypoint used to prove the plugin's real Loader/process path. */

import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { CallId } from '@deepseek-ai/dsh-llm'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const configPath = resolve(process.argv[2] ?? 'examples/progressive/cordis.yml')
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
  process.stdout.write(`DSH_TUTORIAL_RESULT ${JSON.stringify({
    tools: ctx.tools.schemas().map(schema => schema.name),
    result,
  })}\n`)
} finally {
  await ctx.fiber.dispose()
}
