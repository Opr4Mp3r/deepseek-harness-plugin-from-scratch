import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createContext, Script } from 'node:vm'
import { loadLessons } from './checkpoint-lib.ts'

const MINIMAL_LESSON_ID = '01-minimal-plugin'
const root = resolve(import.meta.dirname, '..')
const lessons = await loadLessons(root)
const minimalLesson = lessons.find(lesson => lesson.manifest.id === MINIMAL_LESSON_ID)
if (minimalLesson === undefined) throw new Error(`preview verifier needs ${MINIMAL_LESSON_ID}`)
const clientChecks = []
const child = spawn(process.execPath, ['--import', 'tsx', 'preview/server.mjs', '.', '0'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')

let stdout = ''
let stderr = ''
child.stdout.on('data', chunk => { stdout += chunk })
child.stderr.on('data', chunk => { stderr += chunk })

const deadline = Date.now() + 10_000
let previewUrl
try {
  while (previewUrl === undefined && Date.now() < deadline) {
    const match = /Preview ready: (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout)
    if (match?.[1] !== undefined) {
      previewUrl = match[1]
      break
    }
    if (child.exitCode !== null) {
      throw new Error(`preview exited before startup (${child.exitCode})\n${stderr}`)
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 25))
  }
  if (previewUrl === undefined) throw new Error(`preview startup timed out\n${stderr}`)

  async function request(path) {
    const response = await fetch(`${previewUrl}${path}`)
    return { response, body: await response.text() }
  }

  for (const lesson of lessons) {
    const path = `/${lesson.manifest.tutorial}`
    const tutorial = await request(path)
    if (tutorial.response.status !== 200) throw new Error(`${path} returned ${tutorial.response.status}`)
    const renderedAnchors = tutorial.body.match(/data-checkpoint="[^"]+"/g) ?? []
    if (renderedAnchors.length !== lesson.steps.length) {
      throw new Error(`${path} rendered ${renderedAnchors.length} of ${lesson.steps.length} checkpoints`)
    }
    for (const step of lesson.steps) {
      if (!tutorial.body.includes(`data-checkpoint="${step.id}"`)) throw new Error(`${path} omitted checkpoint ${step.id}`)
      if (!tutorial.body.includes(JSON.stringify(step.file).slice(1, -1))) throw new Error(`${path} omitted checkpoint file ${step.file}`)
    }
    if (!tutorial.body.includes(`>${lesson.manifest.title}</a>`)) {
      throw new Error(`${path} omitted its current chapter navigation label`)
    }
    for (const marker of ['innerHeight * 0.42', 'id="editor-lock"', 'id="mobile-panel-button"']) {
      if (!tutorial.body.includes(marker)) throw new Error(`${path} omitted interaction marker ${marker}`)
    }
    for (const marker of [
      'id="lesson-article"',
      'id="reading-progress-bar"',
      'id="file-tree"',
      'id="code-tabs"',
      'id="code-scroll"',
      'id="empty-code"',
      'id="panel-column"',
      'id="drawer-close"',
      'id="drawer-backdrop"',
      'id="mobile-completion"',
      'id="theme-toggle"',
      'id="mobile-nav-toggle"',
      'id="chapter-nav"',
    ]) {
      if (!tutorial.body.includes(marker)) throw new Error(`${path} omitted responsive navigation marker ${marker}`)
    }
    for (const marker of [
      'grid-template-columns:minmax(0,1fr) auto',
      '.brand { min-width:0;',
      '.github-link { display:none; }',
    ]) {
      if (!tutorial.body.includes(marker)) throw new Error(`${path} omitted compact-header rule ${marker}`)
    }
    if (!tutorial.body.includes('localStorage.setItem(\'reader-theme\'')) {
      throw new Error(`${path} omitted persistent manual theme selection`)
    }
    const clientScripts = Array.from(tutorial.body.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1])
    const clientScript = clientScripts.at(-1)
    if (clientScript === undefined) throw new Error(`${path} omitted its client script`)
    clientChecks.push([clientScript, lesson])
    if (lesson.manifest.id === MINIMAL_LESSON_ID && (!tutorial.body.includes('真实 Loader smoke 已通过') || !tutorial.body.includes('Acceptance, Ada!'))) {
      throw new Error('minimal tutorial omitted the successful real-Loader evidence')
    }
    if (lesson.manifest.id !== MINIMAL_LESSON_ID && !tutorial.body.includes('本章 checkpoint 绑定已验证')) {
      throw new Error(`${path} omitted its lesson-specific verification evidence`)
    }
  }

  const rootTutorial = await request('/')
  if (rootTutorial.response.status !== 200 || !rootTutorial.body.includes(minimalLesson.manifest.title)) {
    throw new Error('root tutorial alias did not render the minimal lesson')
  }

  for (const path of ['/docs/00-architecture-map.md']) {
    const page = await request(path)
    if (page.response.status !== 200) throw new Error(`${path} returned ${page.response.status}`)
  }
  const hidden = await request('/.git/config')
  if (hidden.response.status !== 404) throw new Error(`hidden repository path returned ${hidden.response.status}`)
  const missing = await request('/preview-file-that-does-not-exist.md')
  if (missing.response.status !== 404) throw new Error(`missing repository path returned ${missing.response.status}`)

  const probeDirectory = await mkdtemp(join(tmpdir(), 'dsh-preview-link-'))
  const probeTarget = join(probeDirectory, 'outside.md')
  const probeName = `preview-symlink-probe-${process.pid}.md`
  const probeLink = resolve(root, probeName)
  try {
    await writeFile(probeTarget, '# outside\n')
    await symlink(probeTarget, probeLink)
    const escaped = await request(`/${probeName}`)
    if (escaped.response.status !== 403) {
      throw new Error(`out-of-root symlink returned ${escaped.response.status}`)
    }
  } finally {
    await rm(probeLink, { force: true })
    await rm(probeDirectory, { force: true, recursive: true })
  }
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  if (child.exitCode === null) {
    await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('preview did not stop')), 5_000)),
    ])
  }
}

class TestClassList {
  values = new Set()

  add(...names) {
    names.forEach(name => this.values.add(name))
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name))
  }

  contains(name) {
    return this.values.has(name)
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : Boolean(force)
    if (enabled) this.values.add(name)
    else this.values.delete(name)
    return enabled
  }
}

class TestElement {
  attributes = new Map()
  classList = new TestClassList()
  dataset = {}
  hidden = false
  innerHTML = ''
  listeners = new Map()
  offsetTop = 0
  scrollLeft = 0
  scrollTop = 0
  style = {}
  textContent = ''
  title = ''
  clientHeight = 600

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  focus() {}

  getAttribute(name) {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name) {
    return this.attributes.has(name)
  }

  querySelector(selector) {
    const line = /^\[data-line="(\d+)"\]$/.exec(selector)?.[1]
    if (line === undefined || !this.innerHTML.includes(`data-line="${line}"`)) return null
    return { offsetTop: Number(line) * 22 }
  }

  querySelectorAll() {
    return []
  }

  removeAttribute(name) {
    this.attributes.delete(name)
  }

  scrollTo(options) {
    this.scrollTop = options.top ?? this.scrollTop
    this.scrollLeft = options.left ?? this.scrollLeft
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value))
  }
}

function exerciseClientState(source, lesson) {
  const desktop = createClientHarness(source, lesson, 1280)
  const final = lesson.steps.at(-1)
  if (final === undefined) throw new Error(`${lesson.manifest.id} has no final client checkpoint`)
  desktop.anchors.forEach(anchor => { anchor.top = 0 })
  desktop.dispatchWindow('scroll')
  desktop.flushFrames()

  const selected = desktop.elements.codeScroll.getAttribute('aria-label')
  if (selected !== final.file) {
    throw new Error(`${lesson.manifest.id} client selected ${String(selected)} instead of ${final.file}`)
  }
  for (const file of Object.keys(final.repo)) {
    if (!desktop.elements.fileTree.innerHTML.includes(`data-file="${file}"`)) {
      throw new Error(`${lesson.manifest.id} client file tree omitted ${file}`)
    }
  }
  const expectedNewLines = final.addedLines[final.file]?.length ?? 0
  const renderedNewLines = desktop.elements.codeScroll.innerHTML.match(/class="code-line is-new(?: is-entering)?"/g)?.length ?? 0
  if (renderedNewLines !== expectedNewLines) {
    throw new Error(`${lesson.manifest.id} client highlighted ${renderedNewLines} of ${expectedNewLines} new lines`)
  }

  const alternate = Object.keys(final.repo).find(file => file !== final.file)
  if (alternate !== undefined) {
    desktop.elements.fileTree.dispatch('click', {
      target: {
        closest: selector => selector === 'button[data-file]' ? { dataset: { file: alternate } } : null,
      },
    })
    desktop.flushFrames()
    if (desktop.elements.codeScroll.getAttribute('aria-label') !== alternate) {
      throw new Error(`${lesson.manifest.id} client could not select ${alternate}`)
    }
  }

  if (lesson.manifest.id !== MINIMAL_LESSON_ID) return
  const mobile = createClientHarness(source, lesson, 320)
  if (!mobile.elements.panelColumn.hasAttribute('inert')) {
    throw new Error('mobile code panel must start inert')
  }
  mobile.elements.drawerOpenButton.dispatch('click')
  mobile.flushFrames()
  if (
    !mobile.elements.panelColumn.classList.contains('is-mobile-open')
    || mobile.elements.panelColumn.hasAttribute('inert')
    || mobile.elements.drawerBackdrop.hidden
  ) {
    throw new Error('mobile code drawer did not open')
  }
  mobile.elements.drawerCloseButton.dispatch('click')
  if (!mobile.elements.panelColumn.hasAttribute('inert') || !mobile.elements.drawerBackdrop.hidden) {
    throw new Error('mobile code drawer did not close')
  }
  mobile.elements.mobileNavButton.dispatch('click')
  if (
    !mobile.elements.chapterNav.classList.contains('is-open')
    || mobile.elements.mobileNavButton.getAttribute('aria-expanded') !== 'true'
  ) {
    throw new Error('mobile chapter navigation did not open')
  }
}

function createClientHarness(source, lesson, width) {
  const names = [
    'article',
    'progressBar',
    'fileTree',
    'codeTabs',
    'codeScroll',
    'emptyCode',
    'lockButton',
    'panelColumn',
    'drawerOpenButton',
    'drawerCloseButton',
    'drawerBackdrop',
    'mobileCompletion',
    'themeButton',
    'mobileNavButton',
    'chapterNav',
  ]
  const elements = Object.fromEntries(names.map(name => [name, new TestElement()]))
  elements.drawerBackdrop.hidden = true
  const anchors = lesson.steps.map(() => ({
    top: 10_000,
    getBoundingClientRect() { return { top: this.top } },
  }))
  elements.article.querySelectorAll = selector => selector === '[data-checkpoint]' ? anchors : []
  elements.article.getBoundingClientRect = () => ({ height: 12_000, top: 0 })

  const selectors = new Map([
    ['#lesson-article', elements.article],
    ['#reading-progress-bar', elements.progressBar],
    ['#file-tree', elements.fileTree],
    ['#code-tabs', elements.codeTabs],
    ['#code-scroll', elements.codeScroll],
    ['#empty-code', elements.emptyCode],
    ['#editor-lock', elements.lockButton],
    ['#panel-column', elements.panelColumn],
    ['#mobile-panel-button', elements.drawerOpenButton],
    ['#drawer-close', elements.drawerCloseButton],
    ['#drawer-backdrop', elements.drawerBackdrop],
    ['#mobile-completion', elements.mobileCompletion],
    ['#theme-toggle', elements.themeButton],
    ['#mobile-nav-toggle', elements.mobileNavButton],
    ['#chapter-nav', elements.chapterNav],
  ])
  const documentListeners = new Map()
  const windowListeners = new Map()
  const frames = []
  const body = new TestElement()
  const documentElement = new TestElement()
  const document = {
    activeElement: null,
    body,
    documentElement,
    addEventListener(type, listener) { documentListeners.set(type, listener) },
    querySelector(selector) { return selectors.get(selector) ?? null },
    querySelectorAll() { return [] },
  }
  const context = createContext({
    URL,
    addEventListener(type, listener) { windowListeners.set(type, listener) },
    document,
    innerHeight: 720,
    innerWidth: width,
    localStorage: { setItem() {} },
    location: { origin: 'http://127.0.0.1' },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      frames.push(callback)
      return frames.length
    },
  })
  new Script(source, { filename: `${lesson.manifest.id}-preview-client.js` }).runInContext(context)
  return {
    anchors,
    elements,
    dispatchWindow(type) {
      const listener = windowListeners.get(type)
      if (listener === undefined) throw new Error(`${lesson.manifest.id} client omitted ${type} listener`)
      listener()
    },
    flushFrames() {
      while (frames.length > 0) frames.shift()()
    },
  }
}

for (const [source, lesson] of clientChecks) exerciseClientState(source, lesson)

console.log('verified preview HTTP routes, checkpoint client state, and Loader evidence')
