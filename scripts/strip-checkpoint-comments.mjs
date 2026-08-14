import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const entry = resolve(import.meta.dirname, '../lib/index.js')
const source = await readFile(entry, 'utf8')
const stripped = source.replace(/^\/\/ checkpoint:\d{2}-[a-z0-9-]+\n/gm, '')

if (stripped === source) {
  throw new Error('built package entry contained no checkpoint markers to strip')
}
await writeFile(entry, stripped)
