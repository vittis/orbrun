// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MenuBackdrop } from '../src/menu-backdrop'
import { defaultSettings, saveSettings } from '../src/settings'

let settings = { ...defaultSettings }
vi.mock('../src/settings', async original => ({ ...await original<object>(), getSettings: () => settings,
  saveSettings: vi.fn(next => { settings = next; window.dispatchEvent(new Event('orbrun-settings')) }) }))
const { load, demo } = vi.hoisted(() => ({ load: vi.fn(), demo: { setActive: vi.fn(), refresh: vi.fn(), destroy: vi.fn() } }))
vi.mock('../src/menu-demo', () => ({ loadMenuDemo: load }))
let view: MenuBackdrop
let reduced: EventTarget & { matches: boolean }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks()
  settings = { ...defaultSettings }
  reduced = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => reduced)
  vi.stubGlobal('Worker', undefined)
  vi.stubGlobal('WebAssembly', {})
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  load.mockResolvedValue(demo)
})
afterEach(() => { view?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren() })
function create() { const host = document.createElement('div'); document.body.append(host); return view = new MenuBackdrop(host) }
async function start() { await vi.advanceTimersByTimeAsync(0) }

it('starts the recording without Worker or Wasm support', async () => {
  const v = create()
  expect(v.el.querySelector('.menu-entrance')).not.toBeNull()
  expect(v.el.dataset.loading).toBe('true')
  await start()
  expect(load).toHaveBeenCalledOnce()
})

it('previews tilt on input, preserves other settings, and hides controls outside active playback', async () => {
  settings.depthZoom = 1.5
  const v = create(), slider = v.el.querySelector<HTMLInputElement>('input[type="range"]')!
  const controls = slider.closest<HTMLElement>('.menu-replay-controls')!
  expect(controls.hidden).toBe(true)
  await start()
  expect(controls.hidden).toBe(false)
  expect(slider.closest('[aria-hidden="true"]')).toBeNull()
  slider.value = '72'; slider.dispatchEvent(new Event('input', { bubbles: true }))
  expect(saveSettings).toHaveBeenLastCalledWith({ ...defaultSettings, depthZoom: 1.5, depthTilt: 72 })
  expect(slider.getAttribute('aria-valuetext')).toBe('72 degrees')
  expect(demo.refresh).toHaveBeenCalled()
  v.cover(true); expect(controls.hidden).toBe(true)
  settings.depthTilt = 35
  v.cover(false); expect(controls.hidden).toBe(false); expect(slider.value).toBe('35')
  reduced.matches = true; reduced.dispatchEvent(new Event('change'))
  expect(controls.hidden).toBe(true)
  v.destroy()
  const refreshes = demo.refresh.mock.calls.length
  window.dispatchEvent(new Event('orbrun-settings'))
  expect(demo.refresh).toHaveBeenCalledTimes(refreshes)
})

it('chooses a recording immediately, retains the choice across reduced motion, and returns to shuffle', async () => {
  const v = create(); await start()
  const picker = v.el.querySelector('select')!
  const file = picker.options[1].value
  picker.value = file; picker.dispatchEvent(new Event('change'))
  await start()
  expect(load.mock.lastCall?.[2].file).toBe(file)
  const count = load.mock.calls.length
  load.mock.lastCall?.[3].finished()
  expect(load).toHaveBeenCalledTimes(count) // A manual choice loops the loaded clip.
  reduced.matches = true; reduced.dispatchEvent(new Event('change'))
  reduced.matches = false; reduced.dispatchEvent(new Event('change')); await start()
  expect(load.mock.lastCall?.[2].file).toBe(file)
  picker.value = ''; picker.dispatchEvent(new Event('change')); await start()
  const shuffled = load.mock.lastCall?.[2].file
  load.mock.lastCall?.[3].finished(); await start()
  expect(load.mock.lastCall?.[2].file).not.toBe(shuffled)
  expect(saveSettings).not.toHaveBeenCalled()
})

it('never loads for initial Still, and cancels short visits', async () => {
  settings.depthAnimate = false
  const v = create(); await start(); expect(load).not.toHaveBeenCalled()
  settings.depthAnimate = true; v.applySettings(); v.cover(true)
  await start(); expect(load).not.toHaveBeenCalled()
  v.cover(false); await start(); expect(load).toHaveBeenCalledOnce()
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

it('explains a failed load and retries only when requested', async () => {
  load.mockRejectedValue(new Error('unavailable'))
  const v = create(); await start()
  expect(v.canvas.hidden).toBe(true)
  expect(v.el.dataset.loading).toBe('false')
  v.cover(true); v.cover(false); await start()
  expect(load).toHaveBeenCalledOnce()
  load.mockResolvedValue(demo)
  v.el.querySelector('button')!.click(); await start()
  expect(load).toHaveBeenCalledTimes(2)
  expect(demo.setActive).toHaveBeenLastCalledWith(true)
})

it('allows a progressing slow load and can retry even if the stalled request never settles', async () => {
  load.mockReturnValueOnce(new Promise(() => {}))
  const v = create(); await start()
  const [, signal, , callbacks] = load.mock.calls[0]
  await vi.advanceTimersByTimeAsync(45_000)
  callbacks.progress()
  await vi.advanceTimersByTimeAsync(45_000)
  expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(signal.aborted).toBe(true)
  v.el.querySelector('button')!.click(); await start()
  expect(demo.setActive).toHaveBeenLastCalledWith(true)
})

it('releases a loaded demo if starting playback fails', async () => {
  demo.setActive.mockImplementationOnce(() => { throw new Error('playback failed') })
  const v = create(); await start()
  expect(demo.destroy).toHaveBeenCalledOnce()
  expect(v.canvas.hidden).toBe(true)
  v.cover(true); v.cover(false); await start()
  expect(load).toHaveBeenCalledOnce()
})

it('removes only retired menu asset caches, preserving development engines and saves', async () => {
  const remove = vi.fn(async () => true)
  vi.stubGlobal('caches', { keys: async () => ['orbrun-menu-assets-v1-old', 'orbrun-offline', 'orbrun-shell-v1'], delete: remove })
  settings.depthAnimate = false
  create(); await start()
  expect(remove.mock.calls).toEqual([['orbrun-menu-assets-v1-old']])
  expect(load).not.toHaveBeenCalled()
})
