import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

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
  const expected = new Map<string, string>()
  let previous: RenderedStep | undefined
  for (const step of lesson.steps) {
    for (const [file, code] of Object.entries(step.repo)) {
      expected.set(checkpointOutputPath(lesson, step, file), code)
    }
    if (previous !== undefined) {
      expected.set(
        diffOutputPath(lesson, previous.id, step.id),
        renderLessonPatch(lesson, previous, step),
      )
    }
    previous = step
    checkpointCount += 1
  }

  for (const [path, wanted] of expected) {
    const actual = await readFile(resolve(path), 'utf8')
    if (actual !== wanted) throw new Error(`${path} drifted; run pnpm generate:checkpoints`)
  }

  const actualFiles = [
    ...await collectFiles(resolve(lesson.directory, 'checkpoints')),
    ...await collectFiles(resolve(lesson.directory, 'diffs')),
  ].sort()
  const wantedFiles = [...expected.keys()].sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(wantedFiles)) {
    throw new Error(`${lesson.relativeDirectory} has stale or missing generated files; run pnpm generate:checkpoints`)
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(absolute))
    else files.push(absolute.slice(resolve('.').length + 1).split('\\').join('/'))
  }
  return files
}

console.log(`verified ${checkpointCount} checkpoints across ${lessons.length} lessons`)
