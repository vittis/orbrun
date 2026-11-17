// Development-only combat showcase using the same tracker and presentation as live play.
import { Render2d } from '@orbrun/render-2d'
import { Render25d } from '@orbrun/render-2.5d'
import { bumpTiming, type MapRenderer } from '@orbrun/scene'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { antechamberScene } from '../src/room/scene'
import { loadRoomTiles } from '../src/room/tiles'
import { CombatFeedback } from '../src/combat-feedback'
import { presentCombat } from '../src/combat-presentation'
import { ALL_SETTING_ROWS } from '../src/settings-rows'
import { defaultSettings } from '../src/settings'

for (const [id, key] of [
  ['bump-strength', 'meleeBumpStrength'], ['bump-speed', 'meleeBumpSpeed'], ['bump-snap', 'meleeBumpSnap'],
  ['hit-gore', 'hitGore'], ['death-gore', 'deathGore'], ['hit-outward', 'hitSprayOutward'], ['death-outward', 'deathSprayOutward'], ['vfx-variation', 'combatVfxVariation'],
] as const) {
  const row = ALL_SETTING_ROWS.find(row => row.key === key)!
  const select = document.getElementById(id) as HTMLSelectElement
  for (const value of row.values) select.add(new Option(row.fmt(value), String(value), false, value === defaultSettings[key]))
}

const tiles = await loadRoomTiles()
const { scene } = antechamberScene(tiles)
scene.player = { x: 11, y: 5 }
scene.playerOnLevel = true
scene.billboards.push(
  { x: 11, y: 5, tile: 4519, kind: 'player', height: 1 },
  { x: 11, y: 4, tile: 7189, kind: 'monster', height: 0.8, attitude: 'hostile', name: 'goblin', ref: { id: 1, name: 'goblin' } },
  { x: 12, y: 4, tile: 7114, kind: 'monster', height: 1, attitude: 'friendly', name: 'orc', ref: { id: 2, name: 'orc' } },
)
const state = initialState()
Object.assign(state.player, { hp: 30, hp_max: 30, xl: 3, place: 'Dungeon', depth: 1 })
const feedback = new CombatFeedback(state)
const view = document.querySelector<HTMLElement>('#dungeon')!
let canvas: HTMLCanvasElement
let renderer: MapRenderer
let raf = 0
let mode = '2.5d'
let paused = false
let freezeAt = 0
let attackAt = 0
let attackDuration = 320
let lastEffect = ''
const frozenTime = () => attackAt + ((lastEffect === 'kill' || lastEffect === 'searingDeath')
  ? Number((document.getElementById('death-age') as HTMLSelectElement).value)
  : Number((document.getElementById('effect-age') as HTMLInputElement).value) / 100 * attackDuration)
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
  renderer = mode === '2d' ? new Render2d({ cellSize: 45, center: scene.player, living: true }) : new Render25d({ center: scene.player, zoom: 1.2 })
  renderer.mount(canvas)
  renderer.setTiles(tiles)
  renderer.setScene(scene)
  fit()
}
function frame(now: number) {
  raf = 0
  const time = paused ? freezeAt : now
  renderer.render(time / 1000)
  if (!paused && renderer.animating) wake()
}
function wake() { if (!raf) raf = requestAnimationFrame(frame) }
function send(msg: ServerMessage) { reduce(state, msg); feedback.observe(state, msg) }
function play(kind: string) {
  if (paused) {
    if (renderer instanceof Render25d) {
      renderer.setOptions({ animate: false })
      renderer.setOptions({ animate: !(document.getElementById('reduced') as HTMLInputElement).checked })
    }
  }
  restoreVictim()
  send({ msg: 'player', turn: state.player.turn + 1 })
  const messages: Record<string, string> = {
    light: 'You slash the goblin.', solid: 'You slash the goblin!', hit: 'You slash the goblin!!', dart: 'The magic dart hits the goblin!', miss: 'You miss the goblin.',
    fire: 'The bolt of fire hits the orc!', cold: 'The puff of frost hits the goblin.',
    prism: 'The blast of energy engulfs the goblin!!', mystic: 'The mystic blast hits the goblin!',
    searing: 'The searing ray hits the goblin!', searingDeath: 'The searing ray hits the goblin! You kill the goblin!', hail: 'The hail pelts the goblin!',
    kill: 'You hit the goblin for 12! You kill the goblin!',
    armor: 'You hit the goblin but do no damage.', incomingArmor: 'The goblin hits you but does no damage.',
    incoming: 'The goblin hits you with a +0 club!', dodge: 'The goblin misses you.',
    ally: 'Your orc hits the goblin!',
    exchange: 'You slash the goblin! The goblin hits you! Your orc hits the goblin! The goblin hits your orc!',
  }
  const element = (document.getElementById('hit-element') as HTMLSelectElement).value
  state.player.inv[0] = { slot: 0, name: element === 'venom' ? 'a +2 dagger of venom' : 'a +2 dagger' }
  state.player.weapon_index = 0
  const elementalHits: Record<string, string> = {
    physical: 'You hit the goblin!', venom: 'You hit the goblin!', fire: 'You hit the goblin! You burn the goblin.',
    cold: 'You hit the goblin! You freeze the goblin.', poison: 'The bolt of poison hits the goblin!',
    acid: 'The bolt of acid hits the goblin!', electric: 'You hit the goblin! You electrocute the goblin.',
    magic: 'The magic dart hits the goblin!',
  }
  if (kind === 'kill') messages.kill = elementalHits[element] + ' You kill the goblin!'
  else if (element !== 'physical' && ['light', 'solid', 'hit'].includes(kind)) messages[kind] = elementalHits[element]
  if (kind === 'hurt' || kind === 'incoming') {
    Object.assign(state.player, { hp: 30 })
    feedback.observe(state, { msg: 'player' })
    feedback.flush(scene)
    send({ msg: 'player', hp: 21 })
  }
  if (messages[kind]) send({ msg: 'msgs', messages: [{ text: messages[kind].replaceAll('goblin', victim.name!) }] })
  if (kind === 'kill' || kind === 'searingDeath') { scene.billboards = scene.billboards.filter(b => b !== victim); scene.revision++ }
  if (kind === 'status') {
    send({ msg: 'player', status: [] }); feedback.flush(scene)
    send({ msg: 'player', status: [{ light: 'Pois', text: 'poisoned' }] })
  }
  if (kind === 'heal') send({ msg: 'player', hp: state.player.hp + 7 })
  const now = performance.now()
  const speed = Number((document.getElementById('bump-speed') as HTMLSelectElement).value)
  const reduced = (document.getElementById('reduced') as HTMLInputElement).checked
  if (renderer instanceof Render25d) {
    if (kind === 'kill' || kind === 'searingDeath') renderer.setOptions({ animate: false })
    renderer.setOptions({ animate: !reduced,
      meleeBumpStrength: Number((document.getElementById('bump-strength') as HTMLSelectElement).value),
      meleeBumpSnap: Number((document.getElementById('bump-snap') as HTMLSelectElement).value),
      hitGore: Number((document.getElementById('hit-gore') as HTMLSelectElement).value),
      deathGore: Number((document.getElementById('death-gore') as HTMLSelectElement).value),
      hitSprayOutward: Number((document.getElementById('hit-outward') as HTMLSelectElement).value),
      deathSprayOutward: Number((document.getElementById('death-outward') as HTMLSelectElement).value),
      combatVfxVariation: Number((document.getElementById('vfx-variation') as HTMLSelectElement).value) })
  }
  const events = feedback.flush(scene)
  renderer.setScene(scene, now / 1000)
  presentCombat(renderer, scene, events, feedback.takeSpells(), state.player.inv[0].name, now, !reduced, speed)
  attackAt = now
  attackDuration = bumpTiming(speed).duration * 1000
  lastEffect = kind
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
  wake()
})
document.getElementById('effect-age')!.addEventListener('input', () => {
  if (paused) { freezeAt = frozenTime(); wake() }
})
document.getElementById('death-age')!.addEventListener('change', () => {
  if (paused && (lastEffect === 'kill' || lastEffect === 'searingDeath')) play(lastEffect)
})
document.getElementById('reduced')!.addEventListener('change', () => {
  if (renderer instanceof Render25d) renderer.setOptions({ animate: !(document.getElementById('reduced') as HTMLInputElement).checked })
  wake()
})
