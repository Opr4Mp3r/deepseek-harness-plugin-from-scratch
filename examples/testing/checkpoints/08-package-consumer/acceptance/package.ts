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
