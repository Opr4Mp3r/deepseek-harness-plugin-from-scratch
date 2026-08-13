import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface Checkpoint {
  id: string
  title: string
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
  const target = checkpointNumber(checkpoint.id)
  const rendered: string[] = []
  let active: number | undefined
  for (const line of source.split('\n')) {
    const marker = /^\/\/ checkpoint:(\d{2}-[a-z0-9-]+)$/.exec(line)
    if (marker !== null && marker[1] !== undefined) {
      active = checkpointNumber(marker[1])
      continue
    }
    if (active === undefined) {
      if (line.trim().length > 0) throw new Error('canonical source must start with a checkpoint marker')
      continue
    }
    if (active <= target) rendered.push(line)
  }
  return rendered.join('\n').trim() + '\n'
}

/** Return the canonical source without generator-only checkpoint markers. */
export function renderCanonicalSource(source: string): string {
  return source
    .split('\n')
    .filter(line => !/^\/\/ checkpoint:\d{2}-[a-z0-9-]+$/.test(line))
    .join('\n')
    .trim() + '\n'
}

/** Whether `current` only inserts lines into `previous`. */
export function isInsertionOnly(previous: string, current: string): boolean {
  const before = previous.trimEnd().split('\n')
  const after = current.trimEnd().split('\n')
  let cursor = 0
  for (const line of after) {
    if (line === before[cursor]) cursor += 1
  }
  return cursor === before.length
}

function checkpointNumber(id: string): number {
  const match = /^(\d{2})-[a-z0-9-]+$/.exec(id)
  if (match === null || match[1] === undefined) throw new Error(`invalid checkpoint id: ${id}`)
  return Number(match[1])
}

export function renderAppendPatch(
  previousId: string,
  previous: string,
  currentId: string,
  current: string,
): string {
  if (!isInsertionOnly(previous, current)) {
    throw new Error(`${currentId} rewrites ${previousId} instead of inserting lines`)
  }
  const before = previous.trimEnd().split('\n')
  const after = current.trimEnd().split('\n')
  let cursor = 0
  let additionStart = 0
  let additions: string[] = []
  const hunks: string[] = []
  function flushAdditions(): void {
    if (additions.length === 0) return
    hunks.push(
      `@@ -${cursor},0 +${additionStart + 1},${additions.length} @@`,
      ...additions.map(line => `+${line}`),
    )
    additions = []
  }
  after.forEach((line, index) => {
    if (line === before[cursor]) {
      flushAdditions()
      cursor += 1
      return
    }
    if (additions.length === 0) additionStart = index
    additions.push(line)
  })
  flushAdditions()
  const from = `examples/progressive/checkpoints/${previousId}.ts`
  const to = `examples/progressive/checkpoints/${currentId}.ts`
  return [
    `diff --git a/${from} b/${to}`,
    `--- a/${from}`,
    `+++ b/${to}`,
    ...hunks,
    '',
  ].join('\n')
}
