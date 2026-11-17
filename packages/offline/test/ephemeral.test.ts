import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { startEngine, type EngineFactory } from '../src/engine'

it('seeds disposable engines in memory even when IndexedDB is available', async () => {
  vi.stubGlobal('indexedDB', {})
  const writes = new Map<string, unknown>()
  let module: Parameters<EngineFactory>[0] | undefined
  const idle = vi.fn()
  const engine = await startEngine({
    source: {
      factory: async () => async mod => {
        module = mod
        mod.FS = { mkdirTree() {}, writeFile: (path, data) => { writes.set(path, data) }, readFile: () => '' }
        mod.preRun.forEach(run => run(mod))
        mod.bridge = { pushControl: vi.fn(), pushKeys: vi.fn() }
        mod.onBridgeIdle()
      },
      read: async file => file === 'prewarm/manifest.json'
        ? new TextEncoder().encode(JSON.stringify({ stamp: 'test', files: [{ path: 'db/cache', offset: 0, size: 2 }] })).buffer
        : new Uint8Array([1, 2]).buffer,
    },
    persistent: false, saveDir: '/menu-demo', args: [], onOutput() {}, onExit() {}, onIdle: idle,
  })
  expect(module!.persistent).toBe(false)
  expect(writes.get('/menu-demo/db/cache')).toEqual(new Uint8Array([1, 2]))
  expect(writes.get('/menu-demo/.prewarm-stamp')).toBe('test')
  engine.keys('s'); expect(module!.bridge!.pushKeys).toHaveBeenCalledWith('s')
  expect(idle).toHaveBeenCalledOnce()
  vi.unstubAllGlobals()
})

it('the actual engine prelude skips IndexedDB for demos while preserving normal save hydration', () => {
  const source = readFileSync(new URL('../../../engine/wasm/pre.js', import.meta.url), 'utf8')
  for (const persistent of [false, true]) {
    const mount = vi.fn(), sync = vi.fn((_read, done) => done(null))
    const module = { persistent, saveDir: '/isolated', preRun: [] as (() => void)[] }
    runInNewContext(source, { Module: module, ENV: {}, FS: { mkdir() {}, mount, syncfs: sync }, IDBFS: {}, indexedDB: {},
      addRunDependency() {}, removeRunDependency() {}, abort: vi.fn(), console })
    module.preRun.forEach(run => run())
    expect(mount).toHaveBeenCalledTimes(persistent ? 1 : 0)
    expect(sync).toHaveBeenCalledTimes(persistent ? 1 : 0)
  }
})
