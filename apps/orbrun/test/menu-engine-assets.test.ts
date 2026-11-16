import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { menuEngineFiles } from '../menu-engine-assets'
const roots: string[] = []
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })
it('packages only a complete matching build and refuses stale artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'orbrun-menu-assets-')); roots.push(root)
  const commit = 'a'.repeat(40), recipe = 'b'.repeat(16), build = `${commit}-${recipe}`
  const pointer = join(root, 'menu/engine.json'); mkdirSync(dirname(pointer), { recursive: true })
  writeFileSync(pointer, JSON.stringify({ commit, recipe, build, gamedata: commit }))
  expect(() => menuEngineFiles(root, commit, recipe)).toThrow()
  const files = ['crawl.js', 'crawl.wasm', 'crawl.data', 'prewarm/manifest.json', 'prewarm/prewarm.bin'].map(f => `builds/${build}/${f}`)
  files.push(...['enums.js', 'status-icon-sizes.js', ...['floor', 'wall', 'feat', 'main', 'player', 'gui', 'icons'].flatMap(a => [`tileinfo-${a}.js`, `${a}.png`])].map(f => `gamedata/${commit}/${f}`))
  for (const path of [...files, 'menu/secret-save.cs']) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), 'asset') }
  expect(menuEngineFiles(root, commit, recipe).files.map(f => f.path)).toEqual(files)
  expect(() => menuEngineFiles(root, commit, 'c'.repeat(16))).toThrow('stale')
})
