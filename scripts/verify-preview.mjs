import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Script } from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const checkpointManifest = JSON.parse(
  await readFile(resolve(root, 'examples/progressive/checkpoints.json'), 'utf8'),
)
const checkpointIds = checkpointManifest.checkpoints.map(checkpoint => checkpoint.id)
const finalCheckpointId = checkpointIds.at(-1)
if (finalCheckpointId === undefined) throw new Error('preview verifier needs a final checkpoint')
const child = spawn(process.execPath, ['preview/server.mjs', '.', '0'], {
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

  const tutorial = await request('/')
  if (tutorial.response.status !== 200) throw new Error(`tutorial returned ${tutorial.response.status}`)
  const checkpoints = tutorial.body.match(/data-checkpoint="[^"]+"/g) ?? []
  if (checkpoints.length !== checkpointIds.length) {
    throw new Error(`tutorial rendered ${checkpoints.length} of ${checkpointIds.length} checkpoints`)
  }
  for (const id of checkpointIds) {
    if (!tutorial.body.includes(`data-checkpoint="${id}"`)) throw new Error(`tutorial omitted checkpoint ${id}`)
  }
  if (!tutorial.body.includes('真实 Loader smoke 已通过') || !tutorial.body.includes('Welcome, Ada!')) {
    throw new Error('tutorial omitted the successful real-Loader evidence')
  }
  for (const marker of ['function addedLines(', 'innerHeight * 0.42', 'id="editor-lock"', 'id="mobile-panel-button"']) {
    if (!tutorial.body.includes(marker)) throw new Error(`tutorial omitted interaction marker ${marker}`)
  }
  for (const marker of ['id="theme-toggle"', 'id="mobile-nav-toggle"', 'id="chapter-nav"']) {
    if (!tutorial.body.includes(marker)) throw new Error(`tutorial omitted responsive navigation marker ${marker}`)
  }
  if (!tutorial.body.includes('localStorage.setItem(\'reader-theme\'')) {
    throw new Error('tutorial omitted persistent manual theme selection')
  }
  const clientScripts = Array.from(tutorial.body.matchAll(/<script>([\s\S]*?)<\/script>/g), match => match[1])
  const clientScript = clientScripts.at(-1)
  if (clientScript === undefined) throw new Error('tutorial omitted its client script')
  new Script(clientScript, { filename: 'preview-client.js' })

  for (const path of ['/docs/00-architecture-map.md', `/examples/progressive/checkpoints/${finalCheckpointId}.ts`]) {
    const page = await request(path)
    if (page.response.status !== 200) throw new Error(`${path} returned ${page.response.status}`)
  }
  const hidden = await request('/.git/config')
  if (hidden.response.status !== 404) throw new Error(`hidden repository path returned ${hidden.response.status}`)
} finally {
  if (child.exitCode === null) child.kill('SIGTERM')
  if (child.exitCode === null) {
    await Promise.race([
      once(child, 'close'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('preview did not stop')), 5_000)),
    ])
  }
}

console.log('verified preview HTTP routes, checkpoints, client script, and Loader evidence')
