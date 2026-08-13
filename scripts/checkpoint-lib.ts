import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface Checkpoint {
  id: string
  title: string
  focus: [number, number]
}

export interface Manifest {
  source: string
  file: string
  tutorial: string
  checkpoints: Checkpoint[]
}

export async function loadProgressive(root = process.cwd()): Promise<{
  manifest: Manifest
  source: string
  tutorial: string
}> {
  const directory = resolve(root, 'examples/progressive')
  const manifest = JSON.parse(
    await readFile(resolve(directory, 'checkpoints.json'), 'utf8'),
  ) as Manifest
  validateManifestFields(manifest)
  const source = await readFile(resolve(directory, manifest.source), 'utf8')
  const tutorial = await readFile(resolve(root, manifest.tutorial), 'utf8')
  validateProgressiveContent(manifest, source, tutorial)
  return { manifest, source, tutorial }
}

function validateManifestFields(manifest: Manifest): void {
  for (const [field, value] of Object.entries({
    source: manifest.source,
    file: manifest.file,
    tutorial: manifest.tutorial,
  })) {
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.split('/').includes('..')) {
      throw new Error(`invalid progressive manifest ${field}`)
    }
  }
  if (!Array.isArray(manifest.checkpoints) || manifest.checkpoints.length === 0) {
    throw new Error('progressive manifest needs checkpoints')
  }
  let previousNumber = 0
  const ids = new Set<string>()
  for (const checkpoint of manifest.checkpoints) {
    const match = /^(\d{2})-[a-z0-9-]+$/.exec(checkpoint.id)
    if (match === null || match[1] === undefined) throw new Error(`invalid checkpoint id: ${checkpoint.id}`)
    const number = Number(match[1])
    if (number <= previousNumber) throw new Error('checkpoint numbers must be unique and strictly increasing')
    if (ids.has(checkpoint.id)) throw new Error(`duplicate checkpoint id: ${checkpoint.id}`)
    if (typeof checkpoint.title !== 'string' || checkpoint.title.length === 0) {
      throw new Error(`checkpoint ${checkpoint.id} needs a title`)
    }
    if (
      !Array.isArray(checkpoint.focus)
      || checkpoint.focus.length !== 2
      || !checkpoint.focus.every(value => Number.isInteger(value) && value > 0)
      || checkpoint.focus[0] > checkpoint.focus[1]
    ) {
      throw new Error(`checkpoint ${checkpoint.id} needs a positive focus range`)
    }
    previousNumber = number
    ids.add(checkpoint.id)
  }
}

function validateProgressiveContent(manifest: Manifest, source: string, tutorial: string): void {
  const ids = manifest.checkpoints.map(checkpoint => checkpoint.id)
  const markerIds = Array.from(source.matchAll(/^\/\/ checkpoint:(\d{2}-[a-z0-9-]+)$/gm), match => match[1])
  const sourceIds = [...new Set(markerIds)].sort()
  const expectedSourceIds = [...ids].sort()
  if (JSON.stringify(sourceIds) !== JSON.stringify(expectedSourceIds)) {
    throw new Error('canonical source markers must match the checkpoint manifest exactly')
  }
  const tutorialMatches = Array.from(tutorial.matchAll(/^<!-- checkpoint:(\d{2}-[a-z0-9-]+) -->$/gm))
  const tutorialIds = tutorialMatches.map(match => match[1])
  if (JSON.stringify(tutorialIds) !== JSON.stringify(ids)) {
    throw new Error('tutorial markers must match the checkpoint manifest exactly and in order')
  }
  let previousMarkerEnd = 0
  for (const match of tutorialMatches) {
    const id = match[1]
    if (id === undefined) throw new Error('tutorial checkpoint marker needs an id')
    const markerStart = match.index
    const section = tutorial.slice(previousMarkerEnd, markerStart).trimEnd()
    const snippets = Array.from(section.matchAll(/```ts\n([\s\S]*?)\n```/g), snippet => snippet[1])
    const snippet = snippets.at(-1)
    if (snippet === undefined || !/^\[查看[^\n]+\)$/m.test(section.split('\n').at(-1) ?? '')) {
      throw new Error(`tutorial must explain and link checkpoint ${id} before revealing it`)
    }
    const sourceLines = checkpointAttributedLines(source, id).filter(line => line.trim().length > 0)
    const snippetLines = snippet.split('\n').filter(line => line.trim().length > 0)
    if (JSON.stringify(snippetLines) !== JSON.stringify(sourceLines)) {
      throw new Error(`tutorial snippet for ${id} must equal its attributed source lines`)
    }
    previousMarkerEnd = markerStart + match[0].length
  }

  let previous = ''
  for (const checkpoint of manifest.checkpoints) {
    const current = renderCheckpoint(source, checkpoint)
    if (previous.length > 0 && !isInsertionOnly(previous, current)) {
      throw new Error(`${checkpoint.id} rewrites earlier code instead of inserting lines`)
    }
    const additions = insertedLines(previous, current)
    if (!additions.some(line => line.trim().length > 0)) {
      throw new Error(`${checkpoint.id} does not add any explained code`)
    }
    const lineCount = current.trimEnd().split('\n').length
    if (checkpoint.focus[1] > lineCount) {
      throw new Error(`${checkpoint.id} focus exceeds its ${lineCount}-line snapshot`)
    }
    const attributedLineNumbers = checkpointAttributedLineNumbers(source, checkpoint.id)
    if (!attributedLineNumbers.includes(checkpoint.focus[0])) {
      throw new Error(`${checkpoint.id} focus must start on an attributed source line`)
    }
    previous = current
  }
}

function checkpointAttributedLines(source: string, id: string): string[] {
  let activeId: string | undefined
  const lines: string[] = []
  for (const line of source.trimEnd().split('\n')) {
    const marker = /^\/\/ checkpoint:(\d{2}-[a-z0-9-]+)$/.exec(line)
    if (marker !== null) {
      activeId = marker[1]
      continue
    }
    if (activeId === id) lines.push(line)
  }
  return lines
}

function checkpointAttributedLineNumbers(source: string, id: string): number[] {
  const target = checkpointNumber(id)
  let activeId: string | undefined
  let renderedLine = 0
  const lines: number[] = []
  for (const line of source.trimEnd().split('\n')) {
    const marker = /^\/\/ checkpoint:(\d{2}-[a-z0-9-]+)$/.exec(line)
    if (marker !== null) {
      activeId = marker[1]
      continue
    }
    if (activeId === undefined || checkpointNumber(activeId) > target) continue
    renderedLine += 1
    if (activeId === id) lines.push(renderedLine)
  }
  return lines
}

function insertedLines(previous: string, current: string): string[] {
  const before = previous.trimEnd().length === 0 ? [] : previous.trimEnd().split('\n')
  const after = current.trimEnd().split('\n')
  const additions: string[] = []
  let cursor = 0
  for (const line of after) {
    if (line === before[cursor]) cursor += 1
    else additions.push(line)
  }
  return additions
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
