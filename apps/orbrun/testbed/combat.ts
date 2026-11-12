// Development-only combat showcase using the same tracker and presentation as live play.
import { Render2d } from '@orbrun/render-2d'
import { Render25d } from '@orbrun/render-2.5d'
import { Render3d } from '@orbrun/render-3d'
import { makeCamera, meleeTiming, type MapRenderer } from '@orbrun/scene'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'
import { CombatFeedback } from '../src/combat-feedback'
import { CombatPopups } from '../src/combat-popups'
import { presentCombat } from '../src/combat-presentation'
import { meleeStyle } from '../src/melee-effects'

const tiles = await loadRoomTiles()
const { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 1 },
  { x: 11, y: 4, tile: 7189, kind: 'monster', height: 0.8, attitude: 'hostile', name: 'goblin', ref: { id: 1, name: 'goblin' } },
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
let attackAt = 0
let attackDuration = 320
const frozenTime = () => attackAt + Number((document.getElementById('effect-age') as HTMLInputElement).value) / 100 * attackDuration
const camera = makeCamera(11, 5)
const victim = scene.billboards.find(b => b.kind === 'monster' && b.name === 'goblin')!
function restoreVictim() {
  if (!scene.billboards.includes(victim)) scene.billboards.push(victim)
  victim.name = (document.getElementById('death-kind') as HTMLSelectElement).value
  victim.ref = { id: 1, name: victim.name }
  scene.revision++
  feedback.flush({ ...scene, billboards: [...scene.billboards] })
  renderer.setScene(scene)
}
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
  const time = paused ? freezeAt : now
  renderer.render(time / 1000)
  const reduced = (document.getElementById('reduced') as HTMLInputElement).checked
  popups.render(time, renderer, scene, canvas, mode === '3d', reduced)
  if (!paused && (popups.active || renderer.animating)) wake()
}
function wake() { if (!raf) raf = requestAnimationFrame(frame) }
function send(msg: ServerMessage) { reduce(state, msg); feedback.observe(state, msg) }
function play(kind: string) {
  if (paused) {
    popups.clear()
    if (renderer instanceof Render25d) {
      renderer.setOptions({ animate: false })
      renderer.setOptions({ animate: !(document.getElementById('reduced') as HTMLInputElement).checked })
    }
  }
  restoreVictim()
  send({ msg: 'player', turn: state.player.turn + 1 })
  const messages: Record<string, string> = {
    light: 'You slash the goblin.', solid: 'You slash the goblin!', hit: 'You slash the goblin!!', dart: 'The magic dart hits the goblin!', exact: 'You slash the goblin for 23!!', miss: 'You miss the goblin.',
    fire: 'The bolt of fire hits the orc!', cold: 'The puff of frost hits the goblin.',
    block: 'You block the goblin\'s attack.', kill: 'You hit the goblin for 12! You kill the goblin!',
    armor: 'You hit the goblin but do no damage.', incomingArmor: 'The goblin hits you but does no damage.',
    incoming: 'The goblin hits you with a +0 club!', dodge: 'The goblin misses you.', enemyBlock: 'The goblin blocks your attack.',
  }
  if (kind === 'hurt' || kind === 'incoming') {
    Object.assign(state.player, { hp: 30 })
    feedback.observe(state, { msg: 'player' })
    feedback.flush(scene)
    send({ msg: 'player', hp: 21 })
  }
  if (messages[kind]) send({ msg: 'msgs', messages: [{ text: messages[kind].replaceAll('goblin', victim.name!) }] })
  if (kind === 'kill') { scene.billboards = scene.billboards.filter(b => b !== victim); scene.revision++ }
  if (kind === 'status') {
    send({ msg: 'player', status: [] }); feedback.flush(scene)
    send({ msg: 'player', status: [{ light: 'Pois', text: 'poisoned' }] })
  }
  if (kind === 'heal') send({ msg: 'player', hp: state.player.hp + 7 })
  if (kind === 'level') send({ msg: 'player', xl: state.player.xl + 1 })
  const now = performance.now()
  const reduced = (document.getElementById('reduced') as HTMLInputElement).checked
  if (renderer instanceof Render25d) renderer.setOptions({ animate: !reduced })
  if (renderer instanceof Render3d) renderer.setOptions({ motion: !reduced })
  const events = feedback.flush(scene)
  renderer.setScene(scene, now / 1000)
  const weapon = (document.getElementById('weapon') as HTMLSelectElement).value || undefined
  const timed = presentCombat(renderer, scene, events, feedback.takeMelee(), feedback.takeSpells(), weapon, now, mode !== '2d' && !reduced)
  popups.add(timed, now)
  attackAt = now
  attackDuration = meleeTiming(kind === 'incoming' ? 'crush' : meleeStyle(weapon) ?? 'slash').duration * 1000
  if (paused) freezeAt = frozenTime()
  wake()
}
feedback.flush(scene)
choose()
new ResizeObserver(fit).observe(view)
document.getElementById('projection')!.addEventListener('change', choose)
document.getElementById('death-kind')!.addEventListener('change', () => { restoreVictim(); wake() })
document.querySelectorAll<HTMLButtonElement>('button[data-effect]').forEach(button => button.addEventListener('click', () => play(button.dataset.effect!)))
document.getElementById('paused')!.addEventListener('change', e => {
  paused = (e.target as HTMLInputElement).checked
  freezeAt = performance.now()
  if (!paused) popups.clear()
  wake()
})
document.getElementById('effect-age')!.addEventListener('input', () => {
  if (paused) { freezeAt = frozenTime(); wake() }
})
document.getElementById('reduced')!.addEventListener('change', () => {
  if (renderer instanceof Render25d) renderer.setOptions({ animate: !(document.getElementById('reduced') as HTMLInputElement).checked })
  if (renderer instanceof Render3d) renderer.setOptions({ motion: !(document.getElementById('reduced') as HTMLInputElement).checked })
  wake()
})
