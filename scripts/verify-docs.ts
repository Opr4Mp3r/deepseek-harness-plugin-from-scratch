import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const required = [
  'README.md',
  'docs/00-architecture-map.md',
  'docs/01-minimal-plugin.md',
  'docs/02-lifecycle-and-effects.md',
  'docs/03-capability-seams.md',
  'docs/04-events-and-durability.md',
  'docs/05-testing-and-release.md',
  'docs/anti-patterns.md',
  'docs/checklist.md',
  'docs/audit-report.md',
]

for (const path of required) {
  const text = await readFile(path, 'utf8')
  if (!text.endsWith('\n')) throw new Error(`${path} needs one trailing newline`)
  const fences = text.match(/^```/gm)?.length ?? 0
  if (fences % 2 !== 0) throw new Error(`${path} has an unclosed code fence`)
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1]
    if (target === undefined || /^(?:https?:|mailto:|#)/.test(target)) continue
    const file = decodeURIComponent(target.split(/[?#]/, 1)[0] ?? '')
    if (file.length === 0) continue
    try {
      await access(resolve(dirname(path), file))
    } catch {
      throw new Error(`${path} links to missing local target ${JSON.stringify(target)}`)
    }
  }
}

const manifest = JSON.parse(await readFile('audit-manifest.json', 'utf8')) as {
  upstream?: { repository?: string; commit?: string }
  runtimeBaseline?: Record<string, string>
  profileBaseline?: Record<string, string>
  packageCompatibility?: { peerDependencies?: Record<string, string> }
  reference?: { repository?: string; commit?: string }
}
const commit = manifest.upstream?.commit
if (manifest.upstream?.repository !== 'deepseek-ai/deepseek-harness') {
  throw new Error('audit-manifest.json needs the audited upstream repository')
}
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error('audit-manifest.json needs a full upstream commit SHA')
}
const baseline = manifest.runtimeBaseline
if (!baseline) throw new Error('audit-manifest.json needs runtimeBaseline')

for (const path of required) {
  const text = await readFile(path, 'utf8')
  for (const match of text.matchAll(/https:\/\/github\.com\/deepseek-ai\/deepseek-harness\/(?:blob|tree)\/([^/#?)]+)/g)) {
    if (match[1] !== commit) {
      throw new Error(`${path} has a DeepSeek Harness link outside the audited commit`)
    }
  }
}

for (const path of ['README.md', 'docs/audit-report.md']) {
  const text = await readFile(path, 'utf8')
  if (!text.includes(commit)) throw new Error(`${path} does not cite the audited commit`)
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  packageManager?: string
}
const dependencies = packageJson.dependencies ?? {}
const devDependencies = packageJson.devDependencies ?? {}
const pinnedPackages = { ...dependencies, ...devDependencies }
const baselinePackages = Object.keys(baseline).filter(name => name.startsWith('@'))
for (const name of baselinePackages) {
  if (pinnedPackages[name] !== baseline[name]) {
    throw new Error(`package.json dependency or devDependency ${name} must equal runtimeBaseline ${baseline[name]}`)
  }
}
for (const [name, version] of Object.entries(pinnedPackages)) {
  if (name.startsWith('@deepseek-ai/') && baseline[name] !== version) {
    throw new Error(`runtimeBaseline.${name} must equal package.json pinned version ${version}`)
  }
}
const expectedPeers = manifest.packageCompatibility?.peerDependencies
if (expectedPeers === undefined) throw new Error('audit-manifest.json needs packageCompatibility.peerDependencies')
if (JSON.stringify(packageJson.peerDependencies ?? {}) !== JSON.stringify(expectedPeers)) {
  throw new Error('package.json peerDependencies must equal the audited compatibility window')
}
const profileBaseline = manifest.profileBaseline
if (profileBaseline?.['@deepseek-ai/dsh'] === undefined) {
  throw new Error('audit-manifest.json needs a fixed profile CLI baseline')
}
if (packageJson.packageManager !== `pnpm@${baseline.pnpm}`) {
  throw new Error('packageManager must equal the audited pnpm baseline')
}
if ((await readFile('.nvmrc', 'utf8')).trim() !== baseline.node) {
  throw new Error('.nvmrc must equal the audited Node.js baseline')
}

const lockfile = await readFile('pnpm-lock.yaml', 'utf8')
for (const [name, version] of Object.entries(pinnedPackages)) {
  if (name === '@types/node' || !name.startsWith('@deepseek-ai/')) continue
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const entry = new RegExp(`^[ ]{6}['\"]?${escaped}['\"]?:\\n[ ]{8}specifier: ${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
  if (!entry.test(lockfile)) throw new Error(`pnpm-lock.yaml does not pin ${name}@${version}`)
}

const readme = await readFile('README.md', 'utf8')
const tutorialCatalog = JSON.parse(await readFile('examples/tutorials.json', 'utf8')) as {
  lessons?: unknown
}
if (!Array.isArray(tutorialCatalog.lessons) || tutorialCatalog.lessons.length === 0) {
  throw new Error('examples/tutorials.json needs a non-empty lessons array')
}
let tutorialCheckpointCount = 0
for (const manifestPath of tutorialCatalog.lessons) {
  if (typeof manifestPath !== 'string') throw new Error('tutorial manifest paths must be strings')
  const tutorialManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    checkpoints?: unknown
  }
  if (!Array.isArray(tutorialManifest.checkpoints)) {
    throw new Error(`${manifestPath} needs checkpoints`)
  }
  tutorialCheckpointCount += tutorialManifest.checkpoints.length
}
if (!readme.includes(`${tutorialCheckpointCount} 个 checkpoint`)) {
  throw new Error(`README.md must cite the generated ${tutorialCheckpointCount} checkpoint total`)
}
for (const version of new Set([
  ...Object.values(baseline),
  ...Object.values(profileBaseline),
  ...Object.values(expectedPeers),
])) {
  if (!readme.includes(version)) throw new Error(`README.md does not cite runtime baseline ${version}`)
}

const preview = await readFile('preview/server.mjs', 'utf8')
if (/\/(?:Users|private\/tmp)\//.test(preview)) {
  throw new Error('preview/server.mjs must not contain machine-local absolute paths')
}
if (!preview.includes("from 'marked'")) {
  throw new Error('preview/server.mjs must resolve its renderer from package dependencies')
}

const referenceCommit = manifest.reference?.commit
if (manifest.reference?.repository !== 'SaladDay/pi-from-scratch') {
  throw new Error('audit-manifest.json needs the audited reference repository')
}
if (!referenceCommit || !/^[0-9a-f]{40}$/.test(referenceCommit)) {
  throw new Error('audit-manifest.json needs a full reference commit SHA')
}
for (const match of readme.matchAll(/https:\/\/github\.com\/SaladDay\/pi-from-scratch\/(?:blob|tree)\/([^/#?)]+)/g)) {
  if (match[1] !== referenceCommit) {
    throw new Error('README.md has a PI from Scratch link outside the audited reference commit')
  }
}

console.log(`verified ${required.length} documentation files`)
