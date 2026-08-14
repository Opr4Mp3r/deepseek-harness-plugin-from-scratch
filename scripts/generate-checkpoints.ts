import { mkdir, readdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  checkpointOutputPath,
  diffOutputPath,
  loadLessons,
  renderLessonPatch,
} from './checkpoint-lib.ts'
import type { RenderedStep } from './checkpoint-lib.ts'

const lessons = await loadLessons()
let checkpointCount = 0

for (const lesson of lessons) {
  const expected = new Set<string>()
  let previous: RenderedStep | undefined
  for (const step of lesson.steps) {
    for (const [file, code] of Object.entries(step.repo)) {
      const path = checkpointOutputPath(lesson, step, file)
      expected.add(path)
      await writeGenerated(path, code)
    }
    if (previous !== undefined) {
      const path = diffOutputPath(lesson, previous.id, step.id)
      expected.add(path)
      await writeGenerated(path, renderLessonPatch(lesson, previous, step))
    }
    previous = step
    checkpointCount += 1
  }

  const generatedRoots = [
    resolve(lesson.directory, 'checkpoints'),
    resolve(lesson.directory, 'diffs'),
  ]
  for (const generatedRoot of generatedRoots) {
    await mkdir(generatedRoot, { recursive: true })
    await pruneGenerated(generatedRoot, expected)
  }
}

async function writeGenerated(path: string, content: string): Promise<void> {
  const absolute = resolve(path)
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content)
}

async function pruneGenerated(directory: string, expected: ReadonlySet<string>): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      await pruneGenerated(absolute, expected)
      if ((await readdir(absolute)).length === 0) await rmdir(absolute)
      continue
    }
    const relative = absolute.slice(resolve('.').length + 1).split('\\').join('/')
    if (!expected.has(relative)) await unlink(absolute)
  }
}

console.log(`generated ${checkpointCount} checkpoints across ${lessons.length} lessons`)
