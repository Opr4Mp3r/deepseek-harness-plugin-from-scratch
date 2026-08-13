import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadProgressive, renderAppendPatch, renderCheckpoint } from './checkpoint-lib.ts'

const output = resolve('examples/progressive/checkpoints')
const diffs = resolve('examples/progressive/diffs')
const { manifest, source } = await loadProgressive()
await mkdir(output, { recursive: true })
await mkdir(diffs, { recursive: true })

const checkpointFiles = new Set<string>()
const diffFiles = new Set<string>()
let previous: { id: string; code: string } | undefined
for (const checkpoint of manifest.checkpoints) {
  const code = renderCheckpoint(source, checkpoint)
  const checkpointName = `${checkpoint.id}.ts`
  checkpointFiles.add(checkpointName)
  await writeFile(resolve(output, checkpointName), code)
  if (previous !== undefined) {
    const name = `${previous.id}-to-${checkpoint.id}.patch`
    diffFiles.add(name)
    await writeFile(resolve(diffs, name), renderAppendPatch(previous.id, previous.code, checkpoint.id, code))
  }
  previous = { id: checkpoint.id, code }
}

async function pruneGenerated(directory: string, expected: Set<string>, suffix: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(suffix) && !expected.has(entry.name)) {
      await unlink(resolve(directory, entry.name))
    }
  }
}

await pruneGenerated(output, checkpointFiles, '.ts')
await pruneGenerated(diffs, diffFiles, '.patch')
