/** Local server-message fixture exercising real GameScreen renderer swaps and input. */
import '../src/styles.css'
import { GameScreen } from '../src/game'
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { initialState, reduce, MouseMode, UiState, type ServerMessage } from '@orbrun/webtiles'
import type { GamepadInput } from '../src/gamepad'
import type { MapRenderer, SceneCursor } from '@orbrun/scene'
import { defaultSettings } from '../src/servers'
import type { Session, SessionEvent } from '../src/session'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'

const tiles = await loadRoomTiles(), { scene } = antechamberScene(tiles)
scene.playerOnLevel = true
scene.player = { x: 11, y: 5 }
scene.billboards.push({ kind: 'player', x: 11, y: 5, tile: 4519, height: 0.7 },
  { kind: 'monster', name: 'goblin', ref: { id: 1 }, x: 11, y: 3, tile: 7189, height: 0.5 })
const state = initialState()
state.phase = 'playing'; state.inputMode = MouseMode.COMMAND; state.uiState = UiState.NORMAL
Object.assign(state.player, { received: true, name: 'Map lifecycle', species: 'Formicid', pos: scene.player, hp: 30, hp_max: 30, mp: 6, mp_max: 6, xl: 3, place: 'Dungeon', depth: 1 })
state.map.viewCenter = scene.player; state.map.playerOnLevel = true
const listeners = new Set<(e: SessionEvent) => void>(), sent: unknown[] = []
const session = { state, scene, gamedata: null, loading: false, watching: false, server: { offline: false }, conn: {}, closed: false, diagnostics: [],
  on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  flushScene: () => false, send: (msg: unknown) => sent.push(msg), deviceRc: () => null,
} as unknown as Session
let settings = { ...defaultSettings, hints: 'off' as const }, active: MapRenderer, created = 0, destroyed = 0
let flat = false, cursor: SceneCursor | null = null
const screen = new GameScreen(document.getElementById('app')!, session, {
  gamepad: { kind: 'xbox', isHeld: () => false, virtualRelease() {} } as unknown as GamepadInput,
  settings: () => settings, onSystem: () => {}, settingsPanel: () => ({ el: document.createElement('div'), rows: [] }),
  renderer: () => {
    active = flat ? new Render2d() : new Render25d({ animate: true })
    active.setTiles(tiles); created++
    const destroy = active.destroy.bind(active), setCursor = active.setCursor.bind(active)
    active.destroy = () => { destroyed++; destroy() }
    active.setCursor = c => { cursor = c; setCursor(c) }
    return active
  },
})
;(screen as unknown as { hideLoading(): void }).hideLoading()
const send = (msg: ServerMessage) => { reduce(state, msg); for (const fn of listeners) fn({ type: 'state', msg }) }
document.getElementById('map')!.onclick = () => {
  flat = true
  send({ msg: 'ui_state', state: UiState.VIEW_MAP })
  send({ msg: 'cursor', id: 2, loc: { x: 13, y: 7 } })
}
document.getElementById('overview')!.onclick = () => {
  ;(screen as unknown as { mapHold: { begin(now: number): void } }).mapHold.begin(performance.now())
  send({ msg: 'ui_state', state: UiState.NORMAL })
  send({ msg: 'ui-push', type: 'formatted-scroller', title: 'Dungeon overview', text: 'Dungeon:1\nStairs and branches' })
}
document.getElementById('close')!.onclick = () => {
  flat = false
  send({ msg: 'ui-pop' }); send({ msg: 'cursor', id: 2 }); send({ msg: 'cursor', id: 0 })
  send({ msg: 'input_mode', mode: MouseMode.COMMAND }); send({ msg: 'ui_state', state: UiState.NORMAL })
}
document.getElementById('target')!.onclick = () => {
  send({ msg: 'input_mode', mode: MouseMode.TARGET }); send({ msg: 'cursor', id: 0, loc: { x: 11, y: 3 } })
}
document.getElementById('settings')!.onclick = () => { settings = { ...settings, depthTilt: settings.depthTilt === 50 ? 65 : 50, depthZoom: settings.depthZoom === 1 ? 1.2 : 1 }; screen.applySettings() }
document.getElementById('still')!.onclick = () => { settings = { ...settings, depthAnimate: settings.depthAnimate === false ? 'auto' : false }; screen.applySettings() }
const timer = setInterval(() => { document.getElementById('result')!.textContent = JSON.stringify({ renderer: active.constructor.name, cursor, created, destroyed, canvases: document.querySelectorAll('canvas.view').length, tilt: settings.depthTilt, zoom: settings.depthZoom, still: settings.depthAnimate === false, sent: sent.slice(-8) }) }, 100)
window.addEventListener('pagehide', () => { clearInterval(timer); screen.destroy() }, { once: true })
