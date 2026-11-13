/** Local server-message fixture exercising real GameScreen renderer swaps and input. */
import '../src/styles.css'
import { GameScreen } from '../src/game'
import { dungeonAnimation } from '../src/effects-motion'
import { Render25d } from '@orbrun/render-2.5d'
import { Render2d } from '@orbrun/render-2d'
import { initialState, reduce, MouseMode, UiState, type ServerMessage } from '@orbrun/webtiles'
import type { GamepadInput } from '../src/gamepad'
import type { MapRenderer, SceneCursor } from '@orbrun/scene'
import { defaultSettings, getSettings, saveSettings, type Settings } from '../src/settings'
import type { Session, SessionEvent } from '../src/session'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'

const tiles = await loadRoomTiles(), { scene } = antechamberScene(tiles)
scene.playerOnLevel = true
scene.player = { x: 11, y: 5 }
scene.billboards.push({ kind: 'player', x: 11, y: 5, tile: 4519, height: 0.7 },
  { kind: 'monster', name: 'goblin', ref: { id: 1, name: 'goblin' }, x: 11, y: 3, tile: 7189, height: 0.5 })
const state = initialState()
state.phase = 'playing'; state.inputMode = MouseMode.COMMAND; state.uiState = UiState.NORMAL
Object.assign(state.player, { received: true, name: 'Map lifecycle', species: 'Formicid', pos: scene.player, hp: 30, hp_max: 30, mp: 6, mp_max: 6, xl: 3, place: 'Dungeon', depth: 1 })
state.map.viewCenter = scene.player; state.map.playerOnLevel = true
const listeners = new Set<(e: SessionEvent) => void>(), sent: unknown[] = []
const session = { state, scene, gamedata: null, loading: false, watching: false, server: { offline: false }, conn: {}, closed: false, diagnostics: [],
  on: (fn: (e: SessionEvent) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  flushScene: () => false, send: (msg: unknown) => sent.push(msg), deviceRc: () => null,
} as unknown as Session
let settings: Settings = { ...defaultSettings, hints: 'off' }, active: MapRenderer, created = 0, destroyed = 0
saveSettings(settings)
let presentation = 'dungeon', cursor: SceneCursor | null = null
let appliedDungeonOptions: Parameters<Render25d['setOptions']>[0] | null = null
const screen = new GameScreen(document.getElementById('app')!, session, {
  gamepad: { kind: 'xbox', isHeld: () => false, virtualRelease() {} } as unknown as GamepadInput,
  settings: () => (settings = getSettings()), onSystem: () => {}, settingsPanel: () => ({ el: document.createElement('div'), rows: [] }),
  renderer: mode => {
    presentation = mode
    appliedDungeonOptions = null
    if (mode === 'flat-map') active = new Render2d()
    else {
      const options = {
        animate: dungeonAnimation(settings, matchMedia('(prefers-reduced-motion: reduce)').matches),
        tilt: settings.depthTilt, zoom: settings.depthZoom,
        movement: settings.depthMovement, movementDuration: settings.depthMovementDuration, movementEasing: settings.depthMovementEasing,
      }
      const dungeon = new Render25d(options)
      appliedDungeonOptions = { ...options }
      const setOptions = dungeon.setOptions.bind(dungeon)
      dungeon.setOptions = options => {
        setOptions(options)
        appliedDungeonOptions = { ...appliedDungeonOptions, ...options }
      }
      active = dungeon
    }
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
  send({ msg: 'ui_state', state: UiState.VIEW_MAP })
  send({ msg: 'cursor', id: 2, loc: { x: 13, y: 7 } })
}
document.getElementById('overview')!.onclick = () => {
  ;(screen as unknown as { mapHold: { begin(now: number): void } }).mapHold.begin(performance.now())
  send({ msg: 'ui_state', state: UiState.NORMAL })
  send({ msg: 'ui-push', type: 'formatted-scroller', title: 'Dungeon overview', text: 'Dungeon:1\nStairs and branches' })
}
document.getElementById('close')!.onclick = () => {
  send({ msg: 'ui-pop' }); send({ msg: 'cursor', id: 2 }); send({ msg: 'cursor', id: 0 })
  send({ msg: 'input_mode', mode: MouseMode.COMMAND }); send({ msg: 'ui_state', state: UiState.NORMAL })
}
document.getElementById('target')!.onclick = () => {
  send({ msg: 'input_mode', mode: MouseMode.TARGET }); send({ msg: 'cursor', id: 0, loc: { x: 11, y: 3 } })
}
document.getElementById('settings')!.onclick = () => { saveSettings({ ...settings, depthTilt: settings.depthTilt === 50 ? 65 : 50, depthZoom: settings.depthZoom === 1 ? 1.2 : 1 }); screen.applySettings() }
document.getElementById('still')!.onclick = () => { saveSettings({ ...settings, depthAnimate: settings.depthAnimate === false ? 'auto' : false }); screen.applySettings() }
const timer = setInterval(() => { document.getElementById('result')!.textContent = JSON.stringify({ presentation, appliedDungeonOptions, renderer: active.constructor.name, cursor, created, destroyed, canvases: document.querySelectorAll('canvas.view').length, tilt: settings.depthTilt, zoom: settings.depthZoom, still: settings.depthAnimate === false, sent: sent.slice(-8) }) }, 100)
window.addEventListener('pagehide', () => { clearInterval(timer); screen.destroy() }, { once: true })
