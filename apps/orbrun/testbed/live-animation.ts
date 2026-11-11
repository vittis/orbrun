// Exercises the actual live GameScreen scheduler with an idle local scene.
// No testbed RAF drives the renderer, and there is no server connection.
import '../src/styles.css'
import { GameScreen } from '../src/game'
import { Render25d } from '@orbrun/render-2.5d'
import { initialState, reduce, MouseMode, UiState } from '@orbrun/webtiles'
import { cellKey, type TileSource } from '@orbrun/scene'
import { defaultSettings, type Settings } from '../src/servers'
import type { Session, SessionEvent } from '../src/session'
import type { GamepadInput } from '../src/gamepad'
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
const session = {
  state, scene, gamedata: null, loading: false, watching: false, server: { offline: false }, conn: {}, closed: false, diagnostics: [],
  on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  flushScene: () => false, send: () => {}, deviceRc: () => null,
} as unknown as Session
let settings: Settings = { ...defaultSettings, renderer: '2.5d', depthAnimate: true, hints: 'off' }
const deviceMotion = new EventTarget() as EventTarget & { matches: boolean; media: string }
deviceMotion.matches = false; deviceMotion.media = '(prefers-reduced-motion: reduce)'
const nativeMatch = window.matchMedia.bind(window)
window.matchMedia = query => query === deviceMotion.media ? deviceMotion as unknown as MediaQueryList : nativeMatch(query)
const renderer = new Render25d({ animate: true }); renderer.setTiles(tiles as TileSource)
let frames = 0, frameTimes: number[] = [], actorImages = new Set<number>()
const draw = renderer.render.bind(renderer)
renderer.render = now => {
  draw(now); frames++; frameTimes.push(now!); frameTimes = frameTimes.slice(-120)
  const canvas = document.querySelector<HTMLCanvasElement>('#app canvas.view')
  const q = renderer.project(scene.player.x, scene.player.y)
  if (canvas && q) {
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
const reset = () => { frames = 0; frameTimes = []; actorImages.clear() }
document.getElementById('motion')!.addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value
  settings = { ...settings, depthAnimate: value === 'auto' ? 'auto' : value === 'on' }; screen.applySettings(); reset()
})
document.getElementById('reduced')!.addEventListener('change', event => {
  deviceMotion.matches = (event.target as HTMLInputElement).checked; deviceMotion.dispatchEvent(new Event('change')); reset()
})
document.getElementById('hit')!.addEventListener('click', () => {
  const msg = { msg: 'msgs', messages: [{ text: 'You hit the goblin for 12 damage.', turn: ++state.player.turn }] }
  reduce(state, msg); for (const fn of listeners) fn({ type: 'state', msg })
})
setInterval(() => {
  const number = document.querySelector<HTMLElement>('.combat-number')
  document.getElementById('result')!.textContent = JSON.stringify({ frames, uniqueActorFrames: actorImages.size, clockAdvances: frameTimes.length > 1 && frameTimes.at(-1)! > frameTimes[0], animating: renderer.animating, reduced: deviceMotion.matches, popupAnimation: number ? getComputedStyle(number).animationName : null })
}, 100)
