// After deploying a changed engine, pin its published artifacts for subsequent app-only deploys.
// Usage: node engine/record-menu-cache.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { recipe } from './recipe.mjs'
const root = import.meta.dirname, origin = 'https://dcss-client.vittis.workers.dev/menu-engine/'
const commit = readFileSync(join(root, 'menu-commit'), 'utf8').trim(), build = `${commit}-${recipe()}`
const manifestResponse = await fetch(origin + 'manifest.json')
if (!manifestResponse.ok) throw new Error('Published engine manifest unavailable')
const manifest = await manifestResponse.json()
if (manifest.protocol !== 1 || manifest.build !== build || manifest.gamedata !== commit) throw new Error('Deploy the current engine before recording its cache')
const paths = ['crawl.js', 'crawl.wasm', 'crawl.data', 'prewarm/manifest.json', 'prewarm/prewarm.bin'].map(path => `builds/${build}/${path}`)
paths.push(...['enums.js', 'status-icon-sizes.js', ...['floor', 'wall', 'feat', 'main', 'player', 'gui', 'icons'].flatMap(a => [`tileinfo-${a}.js`, `${a}.png`])].map(path => `gamedata/${commit}/${path}`))
const files = {}
let next = 0
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < paths.length) {
    const path = paths[next++]
    const response = await fetch(origin + path, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`Missing published engine file: ${path}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    files[path] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  }
}))
writeFileSync(join(root, 'menu-cache.json'), JSON.stringify({ commit, recipe: recipe(), files: Object.fromEntries(paths.map(path => [path, files[path]])) }, null, 2) + '\n')
console.log(`Recorded ${paths.length} published engine artifacts for ${build}.`)
