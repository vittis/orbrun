import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type Billboard, type Scene, type TileSource } from '@orbrun/scene'
import { projectileAppearance, spawnAppearance } from '../../../packages/scene-webtiles/src/living'
import { captures, equalPixels, fixtureComplete, fixtureStart, releaseCanvas } from './fixture'

fixtureStart('spawn-checks')
// Deterministic silhouettes keep the raster oracle independent of public servers.
const atlas = document.createElement('canvas')
atlas.width = 160; atlas.height = 32
const ink = atlas.getContext('2d')!
ink.fillStyle = '#393944'; ink.fillRect(0, 0, 32, 32)
ink.fillStyle = '#b5ecf6'; ink.beginPath(); ink.moveTo(48, 3); ink.lineTo(55, 19); ink.lineTo(48, 29); ink.lineTo(41, 19); ink.fill()
ink.fillStyle = '#ba8add'; ink.beginPath(); ink.moveTo(80, 4); ink.lineTo(90, 16); ink.lineTo(80, 29); ink.lineTo(70, 16); ink.fill()
ink.fillStyle = '#b8d5e4'; for (const [x, y, r] of [[106, 17, 7], [113, 11, 8], [119, 18, 7]]) { ink.beginPath(); ink.arc(x, y, r, 0, Math.PI * 2); ink.fill() }
ink.fillStyle = '#ffb45f'; ink.fillRect(140, 5, 8, 22); ink.fillRect(133, 12, 22, 8)
const tiles: TileSource = { tile: id => ({ atlas: 'test', sx: (id - 1) * 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }), atlas: () => atlas, atlasNames: () => ['test'] }
const world = (): Scene => {
  const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), { x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false } })
  return scene
}
function spawned(name: string) {
  const scene = world()
  if (name.startsWith('Ice Thorns')) {
    const cell = scene.cells.get(cellKey(0, 0))!
    cell.featureTile = 2; cell.stance = name.includes('flat') ? 'decal' : 'upright'; cell.life = { spawn: spawnAppearance('DNGN_ICE_THORNS') }
  } else if (name === 'Flame Wave') {
    for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) scene.billboards.push({ x, y, tile: 5, kind: 'projectile', height: 0.5, life: { projectile: projectileAppearance('BOLT_DEFAULT_RED') } })
  } else {
    const cloud = name === 'Freezing Cloud'
    const b: Billboard = { x: 0, y: 0, id: cloud ? undefined : 7, kind: cloud ? 'cloud' : 'monster', tile: cloud ? 4 : 3, height: 1,
      life: { motion: 'still', spawn: spawnAppearance(cloud ? 'CLOUD_COLD' : 'MONS_FULMINANT_PRISM') } }
    scene.billboards.push(b)
  }
  return scene
}
// Every transition pixel must remain within the native sprite's colour and
// footprint. Scaling, extra bursts and alternate artwork fail this oracle.
function nativeOnly(frame: Uint8ClampedArray, steady: Uint8ClampedArray, empty: Uint8ClampedArray, completeFootprint = true) {
  for (let i = 0; i < frame.length; i += 4) {
    for (let c = 0; c < 3; c++) if (frame[i + c] < Math.min(steady[i + c], empty[i + c]) - 2 || frame[i + c] > Math.max(steady[i + c], empty[i + c]) + 2) return false
    const contrast = Math.max(...[0, 1, 2].map(c => Math.abs(steady[i + c] - empty[i + c])))
    const faded = Math.max(...[0, 1, 2].map(c => Math.abs(frame[i + c] - empty[i + c])))
    if (completeFootprint && contrast > 20 && faded < 3) return false
  }
  return true
}
const checks: { name: string; passed: boolean }[] = []
for (const [width, height, dpr] of [[960, 600, 1], [390, 600, 2]]) for (const name of ['Ice Thorns', 'Ice Thorns (flat)', 'Fulminant Prism', 'Freezing Cloud', 'Flame Wave']) {
  const canvas = document.createElement('canvas'), baseline = document.createElement('canvas'), emptyCanvas = document.createElement('canvas')
  const view = new Render25d({ zoom: 1.6 }), plain = new Render25d({ zoom: 1.6 }), empty = new Render25d({ zoom: 1.6 })
  for (const [r, c] of [[view, canvas], [plain, baseline], [empty, emptyCanvas]] as const) { r.mount(c); r.resize(width, height, dpr); r.setTiles(tiles) }
  const sample = (r: Render25d, c: HTMLCanvasElement, time: number) => { r.render(time); return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data }
  const scene = spawned(name)
  view.setScene(world(), 0); plain.setScene(scene, 0); empty.setScene(world(), 0)
  view.setScene({ ...scene, revision: 1 }, 1)
  const onset = sample(view, canvas, 1.045), steady = sample(plain, baseline, 1.045)
  checks.push({ name: `${name} ${width} entrance visible`, passed: !equalPixels(onset, steady) })
  const background = sample(empty, emptyCanvas, 1.045)
  checks.push({ name: `${name} ${width} native shape and colours`, passed: nativeOnly(onset, steady, background) })
  if (captures) {
    const fig = document.createElement('figure'), label = document.createElement('figcaption'), copy = document.createElement('canvas')
    copy.width = canvas.width; copy.height = canvas.height; copy.getContext('2d')!.drawImage(canvas, 0, 0)
    label.textContent = `${name} · 45ms · ${width} DPR${dpr}`; fig.append(label, copy); document.getElementById('captures')!.append(fig)
  }
  checks.push({ name: `${name} ${width} settled and sleeping`, passed: equalPixels(sample(view, canvas, 1.5), sample(plain, baseline, 1.5)) && !view.animating })
  view.setScene({ ...world(), revision: 2 }, 1.6)
  const leaving = sample(view, canvas, 1.64)
  // Retiring creatures have no badges/shadows, so only constrain their changed
  // pixels here; the entrance oracle above checks the complete native footprint.
  checks.push({ name: `${name} ${width} native exit artwork`, passed: nativeOnly(leaving, sample(plain, baseline, 1.64), sample(empty, emptyCanvas, 1.64), false) })
  checks.push({ name: `${name} ${width} exit visible`, passed: !equalPixels(leaving, sample(empty, emptyCanvas, 1.64)) })
  checks.push({ name: `${name} ${width} exit sleeps`, passed: equalPixels(sample(view, canvas, 1.8), sample(empty, emptyCanvas, 1.8)) && !view.animating })
  view.setOptions({ animate: false }); view.setScene(world(), 2); view.setScene({ ...scene, revision: 2 }, 3)
  checks.push({ name: `${name} ${width} Still`, passed: equalPixels(sample(view, canvas, 3.01), sample(view, canvas, 3.2)) && !view.animating })
  view.setOptions({ animate: true }); view.setScene(world(), 4); view.setScene({ ...scene, revision: 3 }, 5)
  const hidden = world()
  for (const cell of hidden.cells.values()) cell.visibility = 'remembered'
  hidden.billboards = scene.billboards
  view.setScene(hidden, 5.01); plain.setScene(hidden, 5.01)
  checks.push({ name: `${name} ${width} hidden cleanup`, passed: equalPixels(sample(view, canvas, 5.2), sample(plain, baseline, 5.2)) })
  view.destroy(); plain.destroy(); empty.destroy(); releaseCanvas(canvas); releaseCanvas(baseline); releaseCanvas(emptyCanvas)
}
fixtureComplete({ checks: checks.length, failures: checks.filter(c => !c.passed), results: checks })
