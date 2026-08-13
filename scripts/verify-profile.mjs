import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const root = resolve(import.meta.dirname, '..')
const packageName = 'deepseek-harness-plugin-from-scratch'
const manifest = JSON.parse(await readFile(resolve(root, 'audit-manifest.json'), 'utf8'))
const cliVersion = manifest.profileBaseline?.['@deepseek-ai/dsh']
if (typeof cliVersion !== 'string') throw new Error('audit manifest needs a profile CLI baseline')
const sourceHarnessRoot = process.env.DSH_HARNESS_ROOT
const dshCommand = sourceHarnessRoot === undefined
  ? { executable: 'pnpm', prefix: ['dlx', `@deepseek-ai/dsh@${cliVersion}`], cwd: root }
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
    "    process.stdout.write(`DSH_PROFILE_RESULT ${JSON.stringify(result)}\\n`)",
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
