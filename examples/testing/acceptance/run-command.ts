// checkpoint:06-command-evidence
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
