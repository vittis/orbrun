import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene } from '@orbrun/scene'
import { initialState, reduce } from '@orbrun/webtiles'
import { CombatFeedback } from '../src/combat-feedback'
import { presentCombat } from '../src/combat-presentation'
import { loadRoomTiles } from '../src/room/tiles'
import { antechamberScene } from '../src/room/scene'
import { captures, equalPixels, fixtureComplete, fixtureStart, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('deflection-checks')
const tiles = await loadRoomTiles(), room = antechamberScene(tiles).scene
const floor = [...room.cells.values()].find(c => !c.occluder && c.kind === 'floor')!
const checks: { name: string; passed: boolean }[] = []
const check = (name: string, passed: boolean) => checks.push({ name, passed })
for (const [width, height, dpr] of [[960, 720, 1], [390, 600, 2]]) {
  const scene = emptyScene(); scene.playerOnLevel = true; scene.levelKey = 'D:1'
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) scene.cells.set(cellKey(x, y), {
    x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: floor.floorTile,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  scene.billboards = [
    { x: 0, y: 0, kind: 'player', tile: 4519, height: 1, life: { motion: 'still' } },
    { x: 1, y: 0, kind: 'monster', tile: 7189, height: 0.8, life: { motion: 'still' }, id: 1, name: 'goblin' },
    { x: -1, y: 0, kind: 'monster', tile: 7114, height: 1, life: { motion: 'still' }, id: 2, name: 'orc' },
  ]
  const canvas = document.createElement('canvas'), renderer = new Render25d({ animate: true, zoom: 2, center: scene.player })
  renderer.mount(canvas); renderer.resize(width, height, dpr); renderer.setTiles(tiles); renderer.setScene(scene, 0)
  const frame = (time: number) => { renderer.render(time); return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data }
  const before = frame(2)
  const state = initialState(); state.player.hp_max = 30
  const feedback = new CombatFeedback(state); feedback.flush(scene)
  const message = { msg: 'msgs', messages: [{ text: "You block the goblin's attack. The orc misses you. The goblin hits you! The orc hits you but does no damage." }] }
  reduce(state, message); feedback.observe(state, message)
  presentCombat(renderer, scene, feedback.flush(scene), feedback.takeSpells(), undefined, 3000, true)
  const contact = frame(3.16)
  const changed = (r: number, g: number, b: number) => {
    let count = 0
    for (let i = 0; i < contact.length; i += 4) if (contact[i] === r && contact[i + 1] === g && contact[i + 2] === b
      && (before[i] !== r || before[i + 1] !== g || before[i + 2] !== b)) count++
    return count
  }
  const prefix = `${width} DPR${dpr}`
  // Independent colour oracles: all three semantic symbols must survive in
  // the same real renderer frame, alongside red body-material particles.
  check(`${prefix} shield`, changed(239, 207, 135) > 3)
  check(`${prefix} dodge`, changed(194, 228, 237) > 3)
  check(`${prefix} armor`, changed(195, 208, 214) > 3)
  let blood = 0
  for (let i = 0; i < contact.length; i += 4) if (contact[i] > 70 && contact[i] > contact[i + 1] * 1.8 && contact[i] > contact[i + 2] * 1.4
    && (contact[i] !== before[i] || contact[i + 1] !== before[i + 1] || contact[i + 2] !== before[i + 2])) blood++
  check(`${prefix} simultaneous blood`, blood > 3)
  if (captures) { const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height; copy.getContext('2d')!.drawImage(canvas, 0, 0); document.getElementById('captures')!.append(copy) }
  check(`${prefix} smooth motion`, !equalPixels(contact, frame(3.3)))
  check(`${prefix} popups outlive contact`, !equalPixels(before, frame(3.5)))
  check(`${prefix} expired`, equalPixels(before, frame(4)))
  check(`${prefix} scheduler sleeps`, !renderer.animating)
  renderer.deflect({ x: 0, y: 0, actorId: 'player', outcome: 'block' }, 5)
  renderer.setOptions({ animate: false })
  check(`${prefix} Still clears`, equalPixels(before, frame(5.2)) && !renderer.animating)
  renderer.setOptions({ animate: true })
  renderer.deflect({ x: 0, y: 0, actorId: 'player', outcome: 'miss' }, 6)
  scene.billboards = scene.billboards.filter(b => b.kind !== 'player'); scene.revision++
  renderer.setScene(scene, 6.1); frame(7)
  check(`${prefix} recipient removal`, !renderer.animating)
  renderer.destroy(); releaseCanvas(canvas); await fixtureYield(prefix)
}
fixtureComplete({ checks: checks.length, failures: checks.filter(c => !c.passed), results: checks })
