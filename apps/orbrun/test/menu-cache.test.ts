import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { restoreMenuCache } from '../../../engine/menu-cache.mjs'
const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'menu-cache-')); roots.push(root)
  const commit = 'a'.repeat(40), recipe = 'b'.repeat(16), path = `builds/${commit}-${recipe}/crawl.wasm`
  writeFileSync(join(root, 'menu-commit'), commit)
  writeFileSync(join(root, 'menu-cache.json'), JSON.stringify({ commit, recipe, files: {
    [path]: { size: 6, sha256: createHash('sha256').update('binary').digest('hex') },
  } }))
  return { root, path, expectedRecipe: recipe }
}
it('restores the matching published binary and writes a usable pointer', async () => {
  const options = fixture(), fetchAsset = vi.fn(async () => new Response('binary'))
  expect(await restoreMenuCache({ ...options, fetchAsset })).toBe(true)
  expect(readFileSync(join(options.root, 'dist', options.path), 'utf8')).toBe('binary')
  expect(JSON.parse(readFileSync(join(options.root, 'dist/menu/engine.json'), 'utf8')).files).toEqual([[options.path, 6]])
})
it('leaves a changed recipe for compilation without downloading an old binary', async () => {
  const options = fixture(), fetchAsset = vi.fn()
  expect(await restoreMenuCache({ ...options, expectedRecipe: 'c'.repeat(16), fetchAsset })).toBe(false)
  expect(fetchAsset).not.toHaveBeenCalled()
})
it.each([new Response('broken'), new Response('missing', { status: 404 })])('never publishes partial or corrupt downloads', async response => {
  const options = fixture()
  await expect(restoreMenuCache({ ...options, fetchAsset: async () => response })).rejects.toThrow()
  expect(existsSync(join(options.root, 'dist/menu/engine.json'))).toBe(false)
})
