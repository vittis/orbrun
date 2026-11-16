// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MenuBackdrop } from '../src/menu-backdrop'
import { defaultSettings } from '../src/settings'

let settings = { ...defaultSettings }
vi.mock('../src/settings', async original => ({ ...await original<object>(), getSettings: () => settings }))
const { load, demo } = vi.hoisted(() => ({ load: vi.fn(), demo: { setActive: vi.fn(), destroy: vi.fn() } }))
vi.mock('../src/menu-demo', () => ({ loadMenuDemo: load }))
let view: MenuBackdrop
let reduced: EventTarget & { matches: boolean }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  settings = { ...defaultSettings }
  reduced = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => reduced)
  vi.stubGlobal('Worker', class {})
  vi.stubGlobal('WebAssembly', { Suspending: class {} })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  load.mockResolvedValue(demo)
})
afterEach(() => { view?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren() })
function create() { const host = document.createElement('div'); document.body.append(host); return view = new MenuBackdrop(host) }
async function start() { await vi.advanceTimersByTimeAsync(0) }

it('starts immediately with an entrance instead of the old recorded poster', async () => {
  const v = create()
  expect(v.el.querySelector('.menu-entrance')).not.toBeNull()
  expect(v.el.dataset.loading).toBe('true')
  await start()
  expect(load).toHaveBeenCalledOnce()
})

it('never loads for initial Still or unsupported browsers, and cancels short visits', async () => {
  settings.depthAnimate = false
  const v = create(); await start(); expect(load).not.toHaveBeenCalled()
  settings.depthAnimate = true; v.applySettings(); v.cover(true)
  await start(); expect(load).not.toHaveBeenCalled()
  vi.stubGlobal('WebAssembly', {})
  v.cover(false); await start(); expect(load).not.toHaveBeenCalled()
})

it('pauses while covered or hidden, releases the demo for reduced motion, and cleans up listeners', async () => {
  const v = create(); await start()
  expect(load).toHaveBeenCalledTimes(1)
  expect(demo.setActive).toHaveBeenLastCalledWith(true)
  v.cover(true); expect(demo.setActive).toHaveBeenLastCalledWith(false)
  v.cover(false); expect(demo.setActive).toHaveBeenLastCalledWith(true)
  Object.defineProperty(document, 'hidden', { value: true }); document.dispatchEvent(new Event('visibilitychange'))
  expect(demo.setActive).toHaveBeenLastCalledWith(false)
  Object.defineProperty(document, 'hidden', { value: false }); document.dispatchEvent(new Event('visibilitychange'))
  reduced.matches = true; reduced.dispatchEvent(new Event('change'))
  expect(v.el.parentElement?.dataset.menuMotion).toBe('off')
  expect(demo.destroy).toHaveBeenCalledTimes(1)
  reduced.matches = false; reduced.dispatchEvent(new Event('change')); await start()
  expect(load).toHaveBeenCalledTimes(2)
  v.destroy()
  const calls = demo.setActive.mock.calls.length
  document.dispatchEvent(new Event('visibilitychange')); reduced.dispatchEvent(new Event('change'))
  await start(); expect(demo.setActive).toHaveBeenCalledTimes(calls)
  expect(v.el.isConnected).toBe(false)
})

it('aborts a covered load and disposes a late result without starting it', async () => {
  let finish!: (value: typeof demo) => void
  load.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const v = create(); await start()
  const signal = load.mock.calls[0][1] as AbortSignal
  v.cover(true); expect(signal.aborted).toBe(true)
  finish(demo); await start()
  expect(demo.destroy).toHaveBeenCalledOnce()
  expect(demo.setActive).not.toHaveBeenCalled()
})

it('keeps the entrance without loading text on failure and avoids retry storms', async () => {
  load.mockRejectedValue(new Error('unavailable'))
  const v = create(); await start()
  expect(v.canvas.hidden).toBe(true)
  expect(v.el.dataset.loading).toBe('false')
  v.cover(true); v.cover(false); await start()
  expect(load).toHaveBeenCalledOnce()
})

it('times out an unresponsive asset load and aborts it', async () => {
  load.mockImplementation((_canvas, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))))
  create(); await start(); await vi.advanceTimersByTimeAsync(60_000)
  expect(load.mock.calls[0][1].aborted).toBe(true)
  view.cover(true); view.cover(false); await start()
  expect(load).toHaveBeenCalledOnce()
})

it('releases a loaded demo if starting its worker fails', async () => {
  demo.setActive.mockImplementationOnce(() => { throw new Error('worker refused') })
  const v = create(); await start()
  expect(demo.destroy).toHaveBeenCalledOnce()
  expect(v.canvas.hidden).toBe(true)
  v.cover(true); v.cover(false); await start()
  expect(load).toHaveBeenCalledOnce()
})
