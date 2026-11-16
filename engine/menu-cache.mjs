// Reuse the published binary by source + recipe. A fresh app deploy needs no C++ toolchain.
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { recipe } from './recipe.mjs'

const origin = 'https://dcss-client.vittis.workers.dev/menu-engine/'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function restoreMenuCache({ root = import.meta.dirname, fetchAsset = fetch, expectedRecipe = recipe() } = {}) {
  const commit = readFileSync(join(root, 'menu-commit'), 'utf8').trim()
  let cache
  try { cache = JSON.parse(readFileSync(join(root, 'menu-cache.json'), 'utf8')) } catch { return false }
  if (cache.commit !== commit || cache.recipe !== expectedRecipe) return false
  const build = `${commit}-${expectedRecipe}`
  const paths = Object.keys(cache.files)
  if (!paths.length || paths.some(path => path.includes('..') || ![`builds/${build}/`, `gamedata/${commit}/`].some(prefix => path.startsWith(prefix)))) {
    throw new Error('Invalid menu engine cache paths')
  }
  // Write the pointer only after every artifact was verified.
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < paths.length) {
      const path = paths[next++], expected = cache.files[path]
      const response = await fetchAsset(origin + path, { signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`Menu engine cache unavailable (${response.status}): ${path}. Retry deployment; no rebuild needed.`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length !== expected.size || sha256(bytes) !== expected.sha256) throw new Error(`Menu engine cache checksum mismatch: ${path}`)
      const file = join(root, 'dist', path)
      mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes)
    }
  }))
  const pointer = { channel: 'menu', commit, recipe: expectedRecipe, build, gamedata: commit,
    files: paths.map(path => [path, cache.files[path].size]) }
  mkdirSync(join(root, 'dist/menu'), { recursive: true })
  writeFileSync(join(root, 'dist/menu/engine.json'), JSON.stringify(pointer) + '\n')
  console.log(`Reused published menu engine ${build} (${paths.length} files; no compilation).`)
  return true
}
