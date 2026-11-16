// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MenuBackdrop } from '../src/menu-backdrop'
import { defaultSettings } from '../src/settings'

let settings = { ...defaultSettings }
vi.mock('../src/settings', async original => ({ ...await original<object>(), getSettings: () => settings }))
let view: MenuBackdrop
let reduced: EventTarget & { matches: boolean }
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  settings = { ...defaultSettings }
  reduced = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => reduced)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { view?.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren() })
function create() { const host = document.createElement('div'); document.body.append(host); return view = new MenuBackdrop(host) }

it('uses the poster without requesting video for initial Still, then responds to both preferences', async () => {
  settings.depthAnimate = false
  const v = create()
  expect(v.video.hasAttribute('src')).toBe(false)
  expect(play).not.toHaveBeenCalled()
  settings.depthAnimate = true; v.applySettings()
  expect(v.video.getAttribute('src')).toBe('/menu/crawl.webm')
  expect(v.video.muted).toBe(true)
  reduced.matches = true; reduced.dispatchEvent(new Event('change'))
  expect(v.video.hidden).toBe(true)
  expect(v.el.parentElement?.dataset.menuMotion).toBe('off')
  expect(pause).toHaveBeenCalled()
  reduced.matches = false; reduced.dispatchEvent(new Event('change'))
  expect(v.video.hidden).toBe(false)
})

it('parks playback and CSS motion while covered or hidden, releasing listeners and source on teardown', async () => {
  const v = create()
  v.cover(true)
  expect(v.el.parentElement?.dataset.menuMotion).toBe('off')
  v.cover(false)
  Object.defineProperty(document, 'hidden', { value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(v.el.parentElement?.dataset.menuMotion).toBe('off')
  v.destroy()
  expect(v.video.hasAttribute('src')).toBe(false)
  const before = play.mock.calls.length
  reduced.dispatchEvent(new Event('change')); document.dispatchEvent(new Event('visibilitychange'))
  await Promise.resolve()
  expect(play).toHaveBeenCalledTimes(before)
  expect(v.el.isConnected).toBe(false)
})

it('keeps a usable poster after rejected autoplay or media error', async () => {
  play.mockRejectedValue(new Error('autoplay denied'))
  const v = create()
  await Promise.resolve(); await Promise.resolve()
  expect(v.video.hidden).toBe(true)
  v.video.dispatchEvent(new Event('error'))
  const before = play.mock.calls.length
  v.cover(true); v.cover(false)
  expect(play).toHaveBeenCalledTimes(before)
})

it('pauses a delayed play resolution after the menu has been destroyed', async () => {
  let finish!: () => void
  play.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
  const v = create()
  v.destroy(); pause.mockClear(); finish(); await Promise.resolve()
  expect(pause).toHaveBeenCalled()
})
