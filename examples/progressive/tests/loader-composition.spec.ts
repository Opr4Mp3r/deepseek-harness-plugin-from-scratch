import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

const runner = fileURLToPath(new URL('./loader-runner.mjs', import.meta.url))

function runComposition(config: string, sourceTypescript = true): Promise<RunResult> {
  return new Promise((resolveRun, reject) => {
    const sourceArgs = sourceTypescript ? ['--import', 'tsx'] : []
    const child = spawn(process.execPath, [...sourceArgs, runner, resolve(config)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolveRun({ code, stdout, stderr }))
  })
}

describe('real Loader composition in a child process', () => {
  it('loads cordis.yml, applies Config, and executes greet', async () => {
    const run = await runComposition('examples/progressive/cordis.yml')
    expect(run.code, run.stderr).toBe(0)
    const line = run.stdout.split('\n').find(value => value.startsWith('DSH_TUTORIAL_RESULT '))
    expect(line).toBeDefined()
    const observed = JSON.parse(line!.slice('DSH_TUTORIAL_RESULT '.length)) as {
      tools: string[]
      result: unknown
    }
    expect(observed).toEqual({
      tools: ['greet'],
      result: {
        content: [{ type: 'text', text: 'Welcome, Ada!' }],
        isError: false,
        value: { message: 'Welcome, Ada!' },
      },
    })
  })

  it('loads the emitted ESM entrypoint under plain Node.js', async () => {
    const run = await runComposition('examples/progressive/cordis.built.yml', false)
    expect(run.code, run.stderr).toBe(0)
    const line = run.stdout.split('\n').find(value => value.startsWith('DSH_TUTORIAL_RESULT '))
    expect(line).toBeDefined()
    expect(JSON.parse(line!.slice('DSH_TUTORIAL_RESULT '.length))).toMatchObject({
      tools: ['greet'],
      result: { value: { message: 'Welcome, Ada!' } },
    })
  })

  it('proves the stray-default-export regression fails on the shipping path', async () => {
    const run = await runComposition('examples/progressive/cordis.invalid-default.yml')
    expect(run.code).not.toBe(0)
    expect(run.stderr).toMatch(/cannot get property "tools" without inject/)
  })
})
