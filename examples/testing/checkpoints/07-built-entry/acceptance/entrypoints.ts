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
