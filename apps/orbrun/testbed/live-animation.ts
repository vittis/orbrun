// Exercises the actual live GameScreen scheduler with an idle local scene.
// No testbed RAF drives the renderer, and there is no server connection.
import '../src/styles.css'
import { GameScreen } from '../src/game'
import { Render25d } from '@orbrun/render-2.5d'
import { initialState, reduce, MouseMode, UiState, type ServerMessage } from '@orbrun/webtiles'
import { cellKey, type TileSource } from '@orbrun/scene'
import { defaultSettings, type Settings } from '../src/settings'
import type { Session, SessionEvent } from '../src/session'
import type { GamepadInput, PadEvent } from '../src/gamepad'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'

const tiles = await loadRoomTiles(), { scene } = antechamberScene(tiles)
scene.playerOnLevel = true; scene.player = { x: 11, y: 5 }
scene.billboards.push({ kind: 'player', x: 11, y: 5, tile: 4519, height: 0.7, life: { motion: 'breath' } },
  { kind: 'monster', name: 'goblin', ref: { id: 1 }, x: 11, y: 3, tile: 7189, height: 0.5, life: { motion: 'breath' } })
scene.cells.get(cellKey(10, 2))!.life = { motion: 'flame', lights: [{ colour: [255, 158, 64], radius: 4.2, power: 0.7, pulse: 'fire' }] }
const state = initialState(); state.phase = 'playing'; state.inputMode = MouseMode.COMMAND; state.uiState = UiState.NORMAL
Object.assign(state.player, { received: true, name: 'Animation check', title: 'the Magician', species: 'Formicid', pos: scene.player, hp: 30, hp_max: 30, mp: 6, mp_max: 6, xl: 3, place: 'Dungeon', depth: 1 })
state.map.viewCenter = scene.player; state.map.playerOnLevel = true
const listeners = new Set<(e: SessionEvent) => void>()
const sent: unknown[] = []
let scenePending = false
const session = {
  state, scene, gamedata: null, loading: false, watching: false, server: { offline: false }, conn: {}, closed: false, diagnostics: [],
  on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  flushScene: () => {
    if (!scenePending) return false
    scenePending = false
    for (const fn of listeners) fn({ type: 'scene', scene })
    return true
  }, send: (msg: unknown) => { sent.push(msg); if (sent.length > 32) sent.shift() }, deviceRc: () => null,
} as unknown as Session
const params = new URLSearchParams(location.search)
const updateLOS = () => {
  if (!params.has('los')) return
  for (const cell of scene.cells.values()) cell.visibility = cell.x + cell.y * 0.65 < (scene.player.x === 11 ? 10 : 11) ? 'remembered' : 'visible'
}
updateLOS()
const settings: Settings = { ...defaultSettings, hints: 'off' }
const renderer = new Render25d(); renderer.setTiles(tiles as TileSource)
let frames = 0, totalFrames = 0, frameTimes: number[] = [], actorImages = new Set<number>()
let pixelSamples = 0, lastSampleAt = -Infinity, destroyed = false
let hits = 0
let moves = 0, maxPlayerDrift = 0
let impacts = 0
const impact = renderer.impact.bind(renderer)
renderer.impact = (...args) => { impacts++; impact(...args) }
// A fixed sample time allows exact pixel comparisons across HUD changes.
const sampleTime = params.has('frameTime') ? Number(params.get('frameTime')) : undefined
const draw = renderer.render.bind(renderer)
renderer.render = now => {
  draw(sampleTime ?? now); frames++; totalFrames++; frameTimes.push(now!); frameTimes = frameTimes.slice(-120)
  const player = scene.billboards.find(b => b.kind === 'player')!
  const feet = renderer.projectBillboard(player)
  const frameCanvas = document.querySelector<HTMLCanvasElement>('#app canvas.view')
  if (moves && frameCanvas) maxPlayerDrift = Math.max(maxPlayerDrift, Math.abs(feet.x - frameCanvas.clientWidth / 2))
  const canvas = document.querySelector<HTMLCanvasElement>('#app canvas.view')
  const q = renderer.project(scene.player.x, scene.player.y)
  if (params.has('sample') && pixelSamples < 12 && performance.now() - lastSampleAt >= 250 && canvas && q) {
    pixelSamples++; lastSampleAt = performance.now()
    const dpr = canvas.width / canvas.clientWidth
    const pixels = canvas.getContext('2d')!.getImageData(Math.floor((q.x - 20) * dpr), Math.floor((q.y - 50) * dpr), Math.ceil(40 * dpr), Math.ceil(55 * dpr)).data
    let hash = 2166136261
    for (let i = 0; i < pixels.length; i++) hash = Math.imul(hash ^ pixels[i], 16777619)
    actorImages.add(hash)
  }
}
const screen = new GameScreen(document.getElementById('app')!, session, {
  settings: () => settings, renderer: () => renderer, onSystem: () => {},
  settingsPanel: () => ({ el: document.createElement('div'), rows: [] }),
  gamepad: { kind: 'xbox', isHeld: () => false, virtualRelease() {} } as unknown as GamepadInput,
})
;(screen as unknown as { hideLoading(): void }).hideLoading()
const hit = (text = 'You perforate the goblin like a sieve!!!') => {
  hits++
  const msg = { msg: 'msgs', messages: [{ text, turn: ++state.player.turn }] }
  reduce(state, msg); for (const fn of listeners) fn({ type: 'state', msg })
}
document.getElementById('hit')!.addEventListener('click', () => hit())
// Receipt-style updates drive only the fake server. GameScreen owns every render frame.
const walk = () => {
  const x = scene.player.x === 11 ? 12 : 11, y = 5
  scene.player = { x, y }
  updateLOS()
  scene.billboards = scene.billboards.map(b => b.kind === 'player' ? { ...b, x, y } : b)
  scene.revision++; moves++
  state.map.viewCenter = { x, y }
  scenePending = true
  session.sceneChangedAt = performance.now()
  const msg = { msg: 'player', pos: { x, y }, turn: ++state.player.turn }
  reduce(state, msg); for (const fn of listeners) fn({ type: 'state', msg })
}
const timers: ReturnType<typeof setTimeout>[] = []
const later = (fn: () => void, delay: number) => timers.push(setTimeout(fn, delay))
if (params.has('check')) {
  const thorns = new URLSearchParams(location.search).has('ice-thorns')
  later(() => hit(thorns ? 'The ice thorns skewer the goblin but do no damage.' : undefined), 400)
  later(walk, 600)
  later(walk, 690)
  later(walk, 780)
  later(() => hit(thorns ? 'The ice thorns skewer the goblin.' : undefined), 1100)
}
const snapshot = () => {
  const player = scene.billboards.find(b => b.kind === 'player')!
  const feet = renderer.projectBillboard(player)
  const scale = renderer.project(scene.player.x + 1, scene.player.y).x - renderer.project(scene.player.x, scene.player.y).x
  const rect = document.querySelector('canvas.view')?.getBoundingClientRect()
  const playerProjection = { x: (rect?.left ?? 0) + feet.x, y: (rect?.top ?? 0) + feet.y, scale }
  return { frames, totalFrames, hits, moves, maxPlayerDrift, impacts, sent: [...sent], messages: state.messages.lines.length, listeners: listeners.size, playerOnLevel: scene.playerOnLevel, xl: state.player.xl, playerProjection, uniqueActorFrames: actorImages.size, pixelSamples, clockAdvances: frameTimes.length > 1 && frameTimes.at(-1)! > frameTimes[0], animating: renderer.animating, destroyed }
}
const interval = setInterval(() => { document.getElementById('result')!.textContent = JSON.stringify(snapshot()) }, 100)
function destroy() {
  if (destroyed) return
  destroyed = true; clearInterval(interval); timers.forEach(clearTimeout)
  screen.destroy()
  document.getElementById('result')!.textContent = JSON.stringify(snapshot())
}
const receive = (msg: ServerMessage) => {
  reduce(state, msg)
  for (const fn of listeners) fn({ type: 'state', msg })
}
const pad = (event: PadEvent) => screen.pad(event)
declare global { interface Window { __orbrunLiveAnimation: { snapshot: typeof snapshot; destroy: typeof destroy; receive: typeof receive; walk: typeof walk; pad: typeof pad } } }
window.__orbrunLiveAnimation = { snapshot, destroy, receive, walk, pad }
window.addEventListener('pagehide', destroy, { once: true })
