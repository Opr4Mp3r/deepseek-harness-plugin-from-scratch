import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface Checkpoint {
  id: string
  title: string
  through: string | null
}

export interface Manifest {
  source: string
  checkpoints: Checkpoint[]
}

export async function loadProgressive(root = process.cwd()): Promise<{
  manifest: Manifest
  source: string
}> {
  const directory = resolve(root, 'examples/progressive')
  const manifest = JSON.parse(
    await readFile(resolve(directory, 'checkpoints.json'), 'utf8'),
  ) as Manifest
  const source = await readFile(resolve(directory, manifest.source), 'utf8')
  return { manifest, source }
}

export function renderCheckpoint(source: string, checkpoint: Checkpoint): string {
  if (checkpoint.through === null) return source
  const offset = source.indexOf(checkpoint.through)
  if (offset === -1) throw new Error(`missing marker ${JSON.stringify(checkpoint.through)}`)
  return source.slice(0, offset).trimEnd() + '\n'
}

export function renderAppendPatch(
  previousId: string,
  previous: string,
  currentId: string,
  current: string,
): string {
  if (!current.startsWith(previous)) {
    throw new Error(`${currentId} rewrites ${previousId} instead of extending it`)
  }
  const addition = current.slice(previous.length).trimEnd()
  const addedLines = addition.length === 0 ? [] : addition.split('\n')
  const oldLineCount = previous.trimEnd().split('\n').length
  const from = `examples/progressive/checkpoints/${previousId}.ts`
  const to = `examples/progressive/checkpoints/${currentId}.ts`
  return [
    `diff --git a/${from} b/${to}`,
    `--- a/${from}`,
    `+++ b/${to}`,
    `@@ -${oldLineCount},0 +${oldLineCount + 1},${addedLines.length} @@`,
    ...addedLines.map(line => `+${line}`),
    '',
  ].join('\n')
}
