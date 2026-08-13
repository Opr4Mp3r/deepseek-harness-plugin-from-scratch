import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadProgressive, renderAppendPatch, renderCheckpoint } from './checkpoint-lib.ts'

const { manifest, source } = await loadProgressive()
const seen = new Set<string>()
const expectedCheckpointFiles: string[] = []
const expectedDiffFiles: string[] = []
let previous = ''
let previousId: string | undefined

for (const checkpoint of manifest.checkpoints) {
  if (!/^\d{2}-[a-z0-9-]+$/.test(checkpoint.id)) {
    throw new Error(`invalid checkpoint id: ${checkpoint.id}`)
  }
  if (seen.has(checkpoint.id)) throw new Error(`duplicate checkpoint id: ${checkpoint.id}`)
  seen.add(checkpoint.id)
  expectedCheckpointFiles.push(`${checkpoint.id}.ts`)
  const expected = renderCheckpoint(source, checkpoint)
  const path = resolve('examples/progressive/checkpoints', `${checkpoint.id}.ts`)
  const actual = await readFile(path, 'utf8')
  if (actual !== expected) {
    throw new Error(`${path} drifted; run pnpm generate:checkpoints`)
  }
  if (!expected.startsWith(previous)) {
    throw new Error(`${checkpoint.id} rewrites earlier code instead of extending it`)
  }
  if (previousId !== undefined) {
    const name = `${previousId}-to-${checkpoint.id}.patch`
    expectedDiffFiles.push(name)
    const path = resolve('examples/progressive/diffs', name)
    const actualPatch = await readFile(path, 'utf8')
    const expectedPatch = renderAppendPatch(previousId, previous, checkpoint.id, expected)
    if (actualPatch !== expectedPatch) {
      throw new Error(`${path} drifted; run pnpm generate:checkpoints`)
    }
  }
  previous = expected
  previousId = checkpoint.id
}

if (previous !== source) throw new Error('the final checkpoint must equal the canonical source')

async function verifyFileSet(directory: string, expected: string[]): Promise<void> {
  const actual = (await readdir(directory)).sort()
  const wanted = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${directory} has stale or missing generated files; run pnpm generate:checkpoints`)
  }
}

await verifyFileSet('examples/progressive/checkpoints', expectedCheckpointFiles)
await verifyFileSet('examples/progressive/diffs', expectedDiffFiles)
console.log(`verified ${manifest.checkpoints.length} progressive checkpoints`)
