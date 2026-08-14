import { readFile } from 'node:fs/promises'
import { dirname, extname, posix, resolve } from 'node:path'

const CHECKPOINT_MARKER = /^(?:\/\/|#) checkpoint:(\d{2}-[a-z0-9-]+)$/

export interface Checkpoint {
  id: string
  title: string
  file: string
  focus: [number, number]
}

export interface SourceSpec {
  source: string
  file: string
  language: string
}

export interface Manifest {
  id: string
  title: string
  tutorial: string
  format: 'flat' | 'tree'
  sources: SourceSpec[]
  checkpoints: Checkpoint[]
}

interface RawManifest {
  id?: unknown
  title?: unknown
  tutorial?: unknown
  format?: unknown
  source?: unknown
  file?: unknown
  sources?: unknown
  checkpoints?: unknown
}

interface RawCheckpoint {
  id?: unknown
  title?: unknown
  file?: unknown
  focus?: unknown
}

interface RawSource {
  source?: unknown
  file?: unknown
  language?: unknown
}

export interface SourceDocument extends SourceSpec {
  content: string
}

export type RepoSnapshot = Readonly<Record<string, string>>

export interface RenderedStep {
  id: string
  title: string
  file: string
  focus: [number, number]
  repo: RepoSnapshot
  addedLines: Readonly<Record<string, readonly number[]>>
}

export interface LoadedLesson {
  manifestPath: string
  relativeDirectory: string
  directory: string
  manifest: Manifest
  sources: SourceDocument[]
  tutorial: string
  steps: RenderedStep[]
}

interface OwnedLine {
  text: string
  owner: string
}

interface RenderedSource {
  code: string
  owners: string[]
}

export async function loadLessons(root = process.cwd()): Promise<LoadedLesson[]> {
  const catalog = JSON.parse(
    await readFile(resolve(root, 'examples/tutorials.json'), 'utf8'),
  ) as { lessons?: unknown }
  if (!Array.isArray(catalog.lessons) || catalog.lessons.length === 0) {
    throw new Error('examples/tutorials.json needs a non-empty lessons array')
  }

  const manifestPaths = catalog.lessons.map((value) => {
    if (typeof value !== 'string') throw new Error('tutorial manifest paths must be strings')
    validateRelativePath(value, 'tutorial manifest path')
    return value
  })
  if (new Set(manifestPaths).size !== manifestPaths.length) {
    throw new Error('examples/tutorials.json contains a duplicate manifest')
  }

  const lessons = await Promise.all(manifestPaths.map(path => loadLesson(path, root)))
  const lessonIds = lessons.map(lesson => lesson.manifest.id)
  const tutorialPaths = lessons.map(lesson => lesson.manifest.tutorial)
  if (new Set(lessonIds).size !== lessonIds.length) throw new Error('tutorial ids must be unique')
  if (new Set(tutorialPaths).size !== tutorialPaths.length) throw new Error('tutorial document paths must be unique')
  return lessons
}

export async function loadLesson(manifestPath: string, root = process.cwd()): Promise<LoadedLesson> {
  validateRelativePath(manifestPath, 'tutorial manifest path')
  const absoluteManifest = resolve(root, manifestPath)
  const directory = dirname(absoluteManifest)
  const relativeDirectory = manifestPath.split('/').slice(0, -1).join('/')
  const raw = JSON.parse(await readFile(absoluteManifest, 'utf8')) as RawManifest
  const manifest = normalizeManifest(raw)
  const sources = await Promise.all(manifest.sources.map(async source => ({
    ...source,
    content: await readFile(resolve(directory, source.source), 'utf8'),
  })))
  const tutorial = await readFile(resolve(root, manifest.tutorial), 'utf8')
  const lesson: LoadedLesson = {
    manifestPath,
    relativeDirectory,
    directory,
    manifest,
    sources,
    tutorial,
    steps: [],
  }
  validateLessonContent(lesson)
  lesson.steps = manifest.checkpoints.map(checkpoint => renderLessonStep(lesson, checkpoint))
  validateProgression(lesson)
  return lesson
}

function normalizeManifest(raw: RawManifest): Manifest {
  if (typeof raw.id !== 'string' || !/^\d{2}-[a-z0-9-]+$/.test(raw.id)) {
    throw new Error('tutorial manifest needs a numbered id')
  }
  if (typeof raw.title !== 'string' || raw.title.length === 0) {
    throw new Error(`tutorial ${raw.id} needs a title`)
  }
  if (typeof raw.tutorial !== 'string') throw new Error(`tutorial ${raw.id} needs a document path`)
  validateRelativePath(raw.tutorial, `${raw.id} tutorial path`)

  let sources: SourceSpec[]
  let format: 'flat' | 'tree'
  if (Array.isArray(raw.sources)) {
    sources = raw.sources.map((value, index) => normalizeSource(value as RawSource, `${raw.id} source ${index + 1}`))
    format = raw.format === undefined ? 'tree' : normalizeFormat(raw.format, raw.id)
  } else {
    if (typeof raw.source !== 'string' || typeof raw.file !== 'string') {
      throw new Error(`tutorial ${raw.id} needs sources`)
    }
    sources = [normalizeSource({ source: raw.source, file: raw.file, language: extensionLanguage(raw.file) }, `${raw.id} source`)]
    format = raw.format === undefined ? 'flat' : normalizeFormat(raw.format, raw.id)
  }
  if (sources.length === 0) throw new Error(`tutorial ${raw.id} needs at least one source`)
  const files = sources.map(source => source.file)
  if (new Set(files).size !== files.length) throw new Error(`tutorial ${raw.id} has duplicate virtual files`)

  if (!Array.isArray(raw.checkpoints) || raw.checkpoints.length === 0) {
    throw new Error(`tutorial ${raw.id} needs checkpoints`)
  }
  let previousNumber = 0
  const ids = new Set<string>()
  const checkpoints = raw.checkpoints.map((value, index) => {
    const checkpoint = value as RawCheckpoint
    const match = typeof checkpoint.id === 'string' ? /^(\d{2})-[a-z0-9-]+$/.exec(checkpoint.id) : null
    if (match === null || match[1] === undefined) throw new Error(`invalid checkpoint id in ${raw.id}: ${String(checkpoint.id)}`)
    const number = Number(match[1])
    if (number <= previousNumber) throw new Error(`${raw.id} checkpoint numbers must be strictly increasing`)
    if (ids.has(checkpoint.id as string)) throw new Error(`duplicate checkpoint id: ${String(checkpoint.id)}`)
    if (typeof checkpoint.title !== 'string' || checkpoint.title.length === 0) {
      throw new Error(`${raw.id} checkpoint ${index + 1} needs a title`)
    }
    const file = typeof checkpoint.file === 'string'
      ? checkpoint.file
      : sources.length === 1 ? sources[0]!.file : undefined
    if (file === undefined || !files.includes(file)) {
      throw new Error(`${raw.id} checkpoint ${checkpoint.id as string} needs a declared file`)
    }
    if (
      !Array.isArray(checkpoint.focus)
      || checkpoint.focus.length !== 2
      || !checkpoint.focus.every(item => Number.isInteger(item) && (item as number) > 0)
      || (checkpoint.focus[0] as number) > (checkpoint.focus[1] as number)
    ) {
      throw new Error(`${raw.id} checkpoint ${checkpoint.id as string} needs a positive focus range`)
    }
    previousNumber = number
    ids.add(checkpoint.id as string)
    return {
      id: checkpoint.id as string,
      title: checkpoint.title,
      file,
      focus: [checkpoint.focus[0] as number, checkpoint.focus[1] as number] as [number, number],
    }
  })
  if (format === 'flat' && sources.length !== 1) {
    throw new Error(`${raw.id} flat generation supports exactly one source`)
  }
  return { id: raw.id, title: raw.title, tutorial: raw.tutorial, format, sources, checkpoints }
}

function normalizeSource(raw: RawSource, label: string): SourceSpec {
  if (typeof raw.source !== 'string' || typeof raw.file !== 'string') {
    throw new Error(`${label} needs source and file paths`)
  }
  validateRelativePath(raw.source, `${label} source path`)
  validateRelativePath(raw.file, `${label} virtual path`)
  const language = raw.language === undefined ? extensionLanguage(raw.file) : raw.language
  if (typeof language !== 'string' || !/^[a-z0-9-]+$/.test(language)) {
    throw new Error(`${label} has an invalid language`)
  }
  return { source: raw.source, file: raw.file, language }
}

function normalizeFormat(value: unknown, id: string): 'flat' | 'tree' {
  if (value !== 'flat' && value !== 'tree') throw new Error(`${id} has an invalid generation format`)
  return value
}

function validateRelativePath(value: string, label: string): void {
  if (value.length === 0 || value.startsWith('/') || value.includes('\\') || value.split('/').includes('..')) {
    throw new Error(`invalid ${label}`)
  }
}

function extensionLanguage(file: string): string {
  const extension = extname(file).slice(1)
  return extension === 'yml' || extension === 'yaml' ? 'yaml' : extension || 'text'
}

function validateLessonContent(lesson: LoadedLesson): void {
  const ids = lesson.manifest.checkpoints.map(checkpoint => checkpoint.id)
  const checkpointById = new Map(lesson.manifest.checkpoints.map(checkpoint => [checkpoint.id, checkpoint]))
  const markerIds: string[] = []
  for (const source of lesson.sources) {
    for (const line of source.content.trimEnd().split('\n')) {
      const marker = CHECKPOINT_MARKER.exec(line)
      if (marker?.[1] === undefined) continue
      markerIds.push(marker[1])
      const checkpoint = checkpointById.get(marker[1])
      if (checkpoint === undefined) throw new Error(`${lesson.manifest.id} source has unknown marker ${marker[1]}`)
      if (checkpoint.file !== source.file) {
        throw new Error(`${lesson.manifest.id} checkpoint ${marker[1]} belongs to ${checkpoint.file}, not ${source.file}`)
      }
    }
  }
  const sourceIds = [...new Set(markerIds)].sort()
  const expectedSourceIds = [...ids].sort()
  if (JSON.stringify(sourceIds) !== JSON.stringify(expectedSourceIds)) {
    throw new Error(`${lesson.manifest.id} source markers must match its manifest exactly`)
  }

  const tutorialMatches = Array.from(
    lesson.tutorial.matchAll(/^<!-- checkpoint:(\d{2}-[a-z0-9-]+) -->$/gm),
  )
  const tutorialIds = tutorialMatches.map(match => match[1])
  if (JSON.stringify(tutorialIds) !== JSON.stringify(ids)) {
    throw new Error(`${lesson.manifest.id} tutorial markers must match its manifest exactly and in order`)
  }

  let previousMarkerEnd = 0
  for (const match of tutorialMatches) {
    const id = match[1]
    if (id === undefined) throw new Error('tutorial checkpoint marker needs an id')
    const markerStart = match.index
    const section = lesson.tutorial.slice(previousMarkerEnd, markerStart).trimEnd()
    const snippets = Array.from(
      section.matchAll(/```[a-z0-9-]*\n([\s\S]*?)\n```/g),
      snippet => snippet[1],
    )
    const snippet = snippets.at(-1)
    const lastLine = section.split('\n').at(-1) ?? ''
    if (snippet === undefined || !/^\[查看[^\n]+\)/.test(lastLine)) {
      throw new Error(`${lesson.manifest.id} must explain and link checkpoint ${id} before revealing it`)
    }
    const checkpoint = checkpointById.get(id)!
    const source = lesson.sources.find(value => value.file === checkpoint.file)!
    const sourceLines = checkpointAttributedLines(source.content, id).filter(line => line.trim().length > 0)
    const snippetLines = snippet.split('\n').filter(line => line.trim().length > 0)
    if (JSON.stringify(snippetLines) !== JSON.stringify(sourceLines)) {
      throw new Error(`${lesson.manifest.id} tutorial snippet for ${id} must equal its attributed source lines`)
    }
    const linkTargets = Array.from(
      lastLine.matchAll(/\[[^\]]+\]\(([^)]+)\)/g),
      link => link[1],
    )
    const tutorialDirectory = posix.dirname(lesson.manifest.tutorial)
    const snapshotTarget = posix.relative(
      tutorialDirectory,
      checkpointOutputPath(lesson, checkpoint, checkpoint.file),
    )
    if (linkTargets[0] !== snapshotTarget) {
      throw new Error(`${lesson.manifest.id} tutorial link for ${id} must target ${snapshotTarget}`)
    }
    if (linkTargets.length > 2) {
      throw new Error(`${lesson.manifest.id} tutorial checkpoint ${id} has unexpected extra links`)
    }
    if (linkTargets.length === 2) {
      const checkpointIndex = lesson.manifest.checkpoints.findIndex(value => value.id === id)
      const previous = lesson.manifest.checkpoints[checkpointIndex - 1]
      if (previous === undefined) {
        throw new Error(`${lesson.manifest.id} first checkpoint cannot link a generated diff`)
      }
      const diffTarget = posix.relative(
        tutorialDirectory,
        diffOutputPath(lesson, previous.id, id),
      )
      if (linkTargets[1] !== diffTarget) {
        throw new Error(`${lesson.manifest.id} tutorial diff for ${id} must target ${diffTarget}`)
      }
    }
    previousMarkerEnd = markerStart + match[0].length
  }
}

function validateProgression(lesson: LoadedLesson): void {
  let previous: RepoSnapshot = {}
  for (const step of lesson.steps) {
    const files = new Set([...Object.keys(previous), ...Object.keys(step.repo)])
    for (const file of files) {
      const before = previous[file]
      const after = step.repo[file]
      if (before !== undefined && after === undefined) {
        throw new Error(`${lesson.manifest.id} checkpoint ${step.id} removes ${file}`)
      }
      if (before !== undefined && after !== undefined && !isInsertionOnly(before, after)) {
        throw new Error(`${lesson.manifest.id} checkpoint ${step.id} rewrites ${file}`)
      }
    }
    const additions = step.addedLines[step.file] ?? []
    if (additions.length === 0) throw new Error(`${lesson.manifest.id} checkpoint ${step.id} adds no explained code`)
    const focused = step.repo[step.file]
    if (focused === undefined) throw new Error(`${lesson.manifest.id} checkpoint ${step.id} has no focused file`)
    const lineCount = focused.trimEnd().split('\n').length
    if (step.focus[1] > lineCount) {
      throw new Error(`${lesson.manifest.id} checkpoint ${step.id} focus exceeds ${step.file}`)
    }
    const focusLines = Array.from(
      { length: step.focus[1] - step.focus[0] + 1 },
      (_value, index) => step.focus[0] + index,
    )
    if (!focusLines.every(line => additions.includes(line))) {
      throw new Error(`${lesson.manifest.id} checkpoint ${step.id} focus must stay within attributed lines`)
    }
    const renderedLines = focused.trimEnd().split('\n')
    if (!focusLines.some(line => renderedLines[line - 1]?.trim().length)) {
      throw new Error(`${lesson.manifest.id} checkpoint ${step.id} focus needs a non-empty attributed line`)
    }
    previous = step.repo
  }

  const final = lesson.steps.at(-1)?.repo
  if (final === undefined) throw new Error(`${lesson.manifest.id} needs a final checkpoint`)
  const canonical = Object.fromEntries(lesson.sources.map(source => [source.file, renderCanonicalSource(source.content)]))
  if (JSON.stringify(final) !== JSON.stringify(canonical)) {
    throw new Error(`${lesson.manifest.id} final checkpoint must equal every canonical source`)
  }
}

export function renderLessonStep(lesson: LoadedLesson, checkpoint: Checkpoint): RenderedStep {
  const repo: Record<string, string> = {}
  const ownersByFile: Record<string, string[]> = {}
  for (const source of lesson.sources) {
    const rendered = renderOwnedSource(source.content, checkpoint.id)
    if (rendered.code.length === 0) continue
    repo[source.file] = rendered.code
    ownersByFile[source.file] = rendered.owners
  }
  const added = ownersByFile[checkpoint.file]
    ?.flatMap((owner, index) => owner === checkpoint.id ? [index + 1] : []) ?? []
  return {
    id: checkpoint.id,
    title: checkpoint.title,
    file: checkpoint.file,
    focus: checkpoint.focus,
    repo,
    addedLines: { [checkpoint.file]: added },
  }
}

function renderOwnedSource(source: string, targetId: string): RenderedSource {
  const target = checkpointNumber(targetId)
  const lines: OwnedLine[] = []
  let activeId: string | undefined
  for (const line of source.split('\n')) {
    const marker = CHECKPOINT_MARKER.exec(line)
    if (marker?.[1] !== undefined) {
      activeId = marker[1]
      continue
    }
    if (activeId === undefined) {
      if (line.trim().length > 0) throw new Error('canonical source must start with a checkpoint marker')
      continue
    }
    if (checkpointNumber(activeId) <= target) lines.push({ text: line, owner: activeId })
  }
  while (lines[0]?.text.trim().length === 0) lines.shift()
  while (lines.at(-1)?.text.trim().length === 0) lines.pop()
  if (lines.length === 0) return { code: '', owners: [] }
  return {
    code: lines.map(line => line.text).join('\n') + '\n',
    owners: lines.map(line => line.owner),
  }
}

function checkpointAttributedLines(source: string, id: string): string[] {
  let activeId: string | undefined
  const lines: string[] = []
  for (const line of source.trimEnd().split('\n')) {
    const marker = CHECKPOINT_MARKER.exec(line)
    if (marker?.[1] !== undefined) {
      activeId = marker[1]
      continue
    }
    if (activeId === id) lines.push(line)
  }
  return lines
}

/** Return a canonical lesson file without generator-only checkpoint markers. */
export function renderCanonicalSource(source: string): string {
  const lines = source
    .split('\n')
    .filter(line => !CHECKPOINT_MARKER.test(line))
  while (lines[0]?.trim().length === 0) lines.shift()
  while (lines.at(-1)?.trim().length === 0) lines.pop()
  return lines.join('\n') + '\n'
}

/** Whether `current` only inserts lines into `previous`. */
export function isInsertionOnly(previous: string, current: string): boolean {
  if (previous.length === 0) return true
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
  if (match?.[1] === undefined) throw new Error(`invalid checkpoint id: ${id}`)
  return Number(match[1])
}

export function checkpointOutputPath(
  lesson: LoadedLesson,
  step: Pick<RenderedStep, 'id'>,
  file: string,
): string {
  const prefix = lesson.relativeDirectory.length === 0 ? '' : `${lesson.relativeDirectory}/`
  if (lesson.manifest.format === 'flat') {
    const extension = extname(file) || '.txt'
    return `${prefix}checkpoints/${step.id}${extension}`
  }
  return `${prefix}checkpoints/${step.id}/${file}`
}

export function diffOutputPath(lesson: LoadedLesson, previousId: string, currentId: string): string {
  const prefix = lesson.relativeDirectory.length === 0 ? '' : `${lesson.relativeDirectory}/`
  return `${prefix}diffs/${previousId}-to-${currentId}.patch`
}

export function renderLessonPatch(
  lesson: LoadedLesson,
  previous: RenderedStep,
  current: RenderedStep,
): string {
  const chunks: string[] = []
  const files = [...new Set([...Object.keys(previous.repo), ...Object.keys(current.repo)])].sort()
  for (const file of files) {
    const before = previous.repo[file]
    const after = current.repo[file]
    if (after === undefined || before === after) continue
    const from = before === undefined ? undefined : checkpointOutputPath(lesson, previous, file)
    const to = checkpointOutputPath(lesson, current, file)
    chunks.push(renderInsertionPatch(from, before ?? '', to, after))
  }
  return chunks.join('')
}

function renderInsertionPatch(
  previousPath: string | undefined,
  previous: string,
  currentPath: string,
  current: string,
): string {
  if (!isInsertionOnly(previous, current)) throw new Error(`${currentPath} rewrites earlier code`)
  const before = previous.length === 0 ? [] : previous.trimEnd().split('\n')
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
  const header = previousPath === undefined
    ? [
        `diff --git a/${currentPath} b/${currentPath}`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ b/${currentPath}`,
      ]
    : [
        `diff --git a/${previousPath} b/${currentPath}`,
        `--- a/${previousPath}`,
        `+++ b/${currentPath}`,
      ]
  return [...header, ...hunks, ''].join('\n')
}
