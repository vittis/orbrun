// Capture-only replay of the repository's anonymous server recording. Never part of the app bundle.
import '../src/styles.css'
import { GameScreen } from '../src/game'
import { defaultSettings } from '../src/settings'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { loadGamedata } from '@orbrun/gamedata'
import { buildScene } from '@orbrun/scene-webtiles'
import { Render25d } from '@orbrun/render-2.5d'
import type { Session, SessionEvent } from '../src/session'
import type { GamepadInput } from '../src/gamepad'
import recording from '../../../packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson?raw'

const version = 'acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8'
const data = await loadGamedata({ base: '/capture-gamedata', version, io: {
  fetchText: async url => { const response = await fetch(url); if (!response.ok) throw new Error(url); return response.text() },
  loadImage: url => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url }),
} })
const messages = recording.trim().split('\n').map(line => JSON.parse(line) as { t: number; m: ServerMessage })
const state = initialState()
const start = 35000, end = 57000
for (const { t, m } of messages) if (t <= start) reduce(state, m)
state.options.tile_show_minihealthbar = false
state.options.tile_show_minimagicbar = false
let scene = buildScene(state, data), pending = false
const listeners = new Set<(event: SessionEvent) => void>()
const session = {
  state, scene, gamedata: data, loading: false, watching: true, server: { offline: false }, conn: {}, closed: false, diagnostics: [],
  on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  flushScene: () => {
    if (!pending) return false
    pending = false
    scene = buildScene(state, data, { previous: scene, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
    state.dirtyCells.clear(); state.mapCleared = false
    session.scene = scene
    for (const fn of listeners) fn({ type: 'scene', scene })
    return true
  }, send: () => { throw new Error('Capture must never send commands') }, deviceRc: () => null,
} as unknown as Session
const renderer = new Render25d({ animate: true })
let impacts = 0
const impact = renderer.impact.bind(renderer)
renderer.impact = (...args) => { impacts++; impact(...args) }
const screen = new GameScreen(document.getElementById('app')!, session, {
  settings: () => ({ ...defaultSettings, depthAnimate: true, hints: 'off', soundEnabled: false }), renderer: () => renderer,
  onSystem: () => {}, settingsPanel: () => ({ el: document.createElement('div'), rows: [] }),
  gamepad: { kind: 'xbox', isHeld: () => false, virtualRelease() {} } as unknown as GamepadInput,
})
const canvas = document.querySelector<HTMLCanvasElement>('canvas.view')!
const output = document.createElement('canvas'); output.width = 1280; output.height = 720
const ctx = output.getContext('2d')!
function compose(alpha = 1) {
  ctx.fillStyle = '#080d0a'; ctx.fillRect(0, 0, 1280, 720)
  ctx.globalAlpha = Math.max(0, alpha)
  const width = canvas.width * 720 / canvas.height
  ctx.drawImage(canvas, 860 - width / 2, 0, width, 720)
  ctx.globalAlpha = 1
}
let ready = true
async function capture() {
  if (!ready) throw new Error('Reload before capturing again')
  ready = false
  const stream = output.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 1_600_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = e => chunks.push(e.data)
  const done = new Promise<Blob>(resolve => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
  const begin = performance.now()
  const timers = messages.filter(e => e.t > start && e.t <= end).map(({ t, m }) => setTimeout(() => {
    reduce(state, m); pending = true; session.sceneChangedAt = performance.now()
    for (const fn of listeners) fn({ type: 'state', msg: m })
  }, t - start + 1000))
  recorder.start()
  await new Promise<void>(resolve => {
    const draw = () => {
      const elapsed = performance.now() - begin
      // Capture only genuine renderer pixels. HUD, names, messages and all DOM stay out.
      compose(Math.min(1, elapsed / 900, (24000 - elapsed) / 900))
      if (elapsed < 24000) requestAnimationFrame(draw)
      else resolve()
    }
    draw()
  })
  recorder.stop()
  const blob = await done
  timers.forEach(clearTimeout); stream.getTracks().forEach(t => t.stop())
  screen.destroy()
  return { data: await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob) }), impacts, duration: 24 }
}
Object.assign(window, { menuCapture: { capture, poster: () => { compose(); return output.toDataURL('image/jpeg', .88) } } })
