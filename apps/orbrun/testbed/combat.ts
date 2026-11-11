// Development-only combat showcase using the same tracker and presentation as live play.
import { Render2d } from '@orbrun/render-2d'
import { Render25d } from '@orbrun/render-2.5d'
import { Render3d } from '@orbrun/render-3d'
import { makeCamera, type MapRenderer } from '@orbrun/scene'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'
import { CombatFeedback } from '../src/combat-feedback'
import { CombatPopups } from '../src/combat-popups'

const tiles = await loadRoomTiles()
const { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 1 },
  { x: 11, y: 3, tile: 7189, kind: 'monster', height: 0.8, attitude: 'hostile', name: 'goblin', ref: { id: 1, name: 'goblin' } },
  { x: 13, y: 4, tile: 7114, kind: 'monster', height: 1, attitude: 'hostile', name: 'orc', ref: { id: 2, name: 'orc' } },
)
const state = initialState()
Object.assign(state.player, { hp: 30, hp_max: 30, xl: 3, place: 'Dungeon', depth: 1 })
const feedback = new CombatFeedback(state), popups = new CombatPopups()
const view = document.querySelector<HTMLElement>('#dungeon')!
view.append(popups.root)
let canvas: HTMLCanvasElement
let renderer: MapRenderer
let raf = 0
let mode = '2.5d'
let paused = false
let freezeAt = 0
const camera = makeCamera(11, 5)
function fit() {
  Object.assign(canvas.style, { left: '0px', top: '0px', width: view.clientWidth + 'px', height: view.clientHeight + 'px' })
  renderer.resize(view.clientWidth, view.clientHeight, devicePixelRatio)
  renderer.render()
  wake()
}
function choose() {
  renderer?.destroy()
  canvas?.remove()
  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', 'Combat effects preview')
  view.prepend(canvas)
  mode = (document.getElementById('projection') as HTMLSelectElement).value
  renderer = mode === '3d' ? new Render3d() : mode === '2d' ? new Render2d({ cellSize: 45, center: scene.player }) : new Render25d({ center: scene.player, zoom: 1.2 })
  renderer.mount(canvas)
  renderer.setTiles(tiles)
  renderer.setScene(scene)
  renderer.setCamera(camera)
  popups.clear()
  fit()
}
function frame(now: number) {
  raf = 0
  renderer.render(now / 1000)
  const reduced = (document.getElementById('reduced') as HTMLInputElement).checked
  popups.render(paused ? freezeAt : now, renderer, scene, canvas, mode === '3d', reduced)
  if (popups.active || renderer.animating) wake()
}
function wake() { if (!raf) raf = requestAnimationFrame(frame) }
function send(msg: ServerMessage) { reduce(state, msg); feedback.observe(state, msg) }
function play(kind: string) {
  send({ msg: 'player', turn: state.player.turn + 1 })
  const messages: Record<string, string> = {
    hit: 'You slash the goblin!!', exact: 'You slash the goblin for 23!!', miss: 'You miss the goblin.',
    fire: 'The bolt of fire hits the orc!', cold: 'The puff of frost hits the goblin.',
    block: 'You block the goblin\'s attack.', kill: 'You hit the goblin for 12! You kill the goblin!',
    armor: 'You hit the goblin but do no damage.', incomingArmor: 'The goblin hits you but does no damage.',
    dodge: 'The goblin misses you.', enemyBlock: 'The goblin blocks your attack.',
  }
  if (messages[kind]) send({ msg: 'msgs', messages: [{ text: messages[kind] }] })
  if (kind === 'hurt') {
    Object.assign(state.player, { hp: 30 })
    feedback.observe(state, { msg: 'player' })
    feedback.flush(scene)
    send({ msg: 'player', hp: 21 })
  }
  if (kind === 'status') {
    send({ msg: 'player', status: [] }); feedback.flush(scene)
    send({ msg: 'player', status: [{ light: 'Pois', text: 'poisoned' }] })
  }
  if (kind === 'heal') send({ msg: 'player', hp: state.player.hp + 7 })
  if (kind === 'level') send({ msg: 'player', xl: state.player.xl + 1 })
  const now = performance.now()
  popups.add(feedback.flush(scene), now)
  if (paused) freezeAt = now + 180
  wake()
}
feedback.flush(scene)
choose()
new ResizeObserver(fit).observe(view)
document.getElementById('projection')!.addEventListener('change', choose)
document.querySelectorAll<HTMLButtonElement>('button[data-effect]').forEach(button => button.addEventListener('click', () => play(button.dataset.effect!)))
document.getElementById('paused')!.addEventListener('change', e => {
  paused = (e.target as HTMLInputElement).checked
  freezeAt = performance.now()
  if (!paused) popups.clear()
  wake()
})
document.getElementById('reduced')!.addEventListener('change', wake)
