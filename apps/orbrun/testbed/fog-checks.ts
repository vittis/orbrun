import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell } from '@orbrun/scene'
import { captures, equalPixels, fixtureComplete, fixtureStart, fixtureYield, releaseCanvas } from './fixture'
import { fittedScale } from '../../../packages/render-2.5d/src/projection'
import { wallRoof } from '../../../packages/render-2.5d/src/wall-depth'

fixtureStart('fog-checks')
let checks = 0
const failures: unknown[] = []
function metrics(a: Uint8ClampedArray, b?: Uint8ClampedArray) {
  const luminance: number[] = []
  let delta = 0, changed = 0, black = 0
  for (let i = 0; i < a.length; i += 4) {
    const value = (a[i] + a[i + 1] + a[i + 2]) / 3
    luminance.push(value)
    if (value <= 8) black++
    if (b) {
      const difference = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3
      delta += difference; if (difference >= 3) changed++
    }
  }
  luminance.sort((a, b) => a - b)
  return { low: luminance[Math.floor(luminance.length * 0.05)], high: luminance[Math.floor(luminance.length * 0.95)],
    delta: delta / luminance.length, changed: changed / luminance.length, black: black / luminance.length, peak: luminance.at(-1)! }
}
for (const [width, height, tilt, dpr] of [[900, 600, 50, 1], [390, 600, 25, 2], [900, 600, 85, 1.25]]) {
  const assert = (name: string, pass: boolean, detail?: unknown) => { checks++; if (!pass) failures.push({ name, width, tilt, dpr, detail }) }
  const canvas = document.createElement('canvas'), r = new Render25d({ tilt, unexploredFog: true, animate: false })
  r.mount(canvas); r.resize(width, height, dpr)
  const scene = { ...emptyScene(), playerOnLevel: true }
  const cell = (x: number, y: number): SceneCell => ({ x, y, kind: 'floor', occluder: false,
    visibility: 'visible', glyph: '.', flags: { water: false, lava: false } } as SceneCell)
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), cell(x, y))
  r.setScene(scene, 0)
  const ctx = canvas.getContext('2d')!
  const image = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const center = () => ctx.getImageData(Math.floor(width * dpr / 2), Math.floor(height * dpr / 2), 1, 1).data
  const fog = () => ctx.getImageData(0, 0, Math.floor(canvas.width * 0.25), canvas.height).data
  r.render(0); const still = image(), terrain = center()
  const contrast = metrics(fog())
  assert('black void has sparse crisp stars without cloud cover', contrast.black >= 0.99 && contrast.black < 0.99995 && contrast.peak >= 20, contrast)
  r.render(60)
  assert('Still freezes stars and the frontier and sleeps', equalPixels(still, image()) && !r.animating)
  r.setOptions({ unexploredFog: false }); r.render(0)
  assert('toggle removes atmosphere without altering explored ground', !equalPixels(still, image()) && equalPixels(terrain, center()) && !r.animating)
  r.setOptions({ unexploredFog: true, animate: true }); r.render(0)
  const animated = image(), fogStart = fog()
  r.render(1.5)
  const shortMotion = metrics(fog(), fogStart), beforeStep = fog()
  assert('star movement remains minimal over 1.5 seconds', shortMotion.delta > 0 && shortMotion.delta < 0.1 && shortMotion.changed < 0.01, shortMotion)
  r.render(1.5 + 1 / 120)
  const smooth = metrics(fog(), beforeStep)
  assert('motion stays smooth between consecutive frames', smooth.delta < 0.75, smooth)
  r.render(8)
  assert('fog drifts and keeps the visible atmosphere awake', !equalPixels(animated, image()) && r.animating)
  r.setOptions({ unexploredFog: false }); r.render(8)
  assert('switching fog off stops its animation loop immediately', !r.animating)
  r.setOptions({ unexploredFog: true })
  r.setOptions({ animate: false }); r.render(0)
  const beforeHidden = image()
  const hidden = { ...cell(5, 0), visibility: 'unseen' as const, cloud: 8 }
  scene.cells.set(cellKey(5, 0), hidden)
  scene.billboards.push({ kind: 'monster', x: 5, y: 0, tile: 9, height: 1 })
  scene.revision++; r.setScene(scene, 0); r.render(0)
  const q = r.project(5, 0)
  assert('hidden terrain and actors never affect fog or picking', equalPixels(beforeHidden, image()) && r.pick(q.x, q.y) === null)
  const uniform = image(); scene.levelKey = 'Lair:2'; scene.revision++; r.setScene(scene, 0); r.render(0)
  assert('one starfield is retained across branch and level identities', equalPixels(uniform, image()))
  if (captures) {
    const preview = document.createElement('canvas'); preview.width = canvas.width; preview.height = canvas.height
    preview.getContext('2d')!.drawImage(canvas, 0, 0)
    document.querySelector('#captures')!.append(preview)
  }
  // Remote map and fully explored viewports must not gain an ambient loop.
  r.setOptions({ animate: true }); scene.playerOnLevel = false; scene.revision++; r.setScene(scene, 0); r.render(1)
  assert('remote levels stay idle', !r.animating)
  scene.playerOnLevel = true
  for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) scene.cells.set(cellKey(x, y), cell(x, y))
  scene.billboards = []; scene.revision++; r.setScene(scene, 0); r.render(1)
  assert('fully explored viewports sleep', !r.animating)
  r.destroy(); releaseCanvas(canvas)
  await fixtureYield('fog')
}

// Independent white/blue art makes the exploration feather observable on both
// flat ground and raised wall faces, without relying on a hand-authored image.
const atlas = document.createElement('canvas'); atlas.width = 64; atlas.height = 32
const ink = atlas.getContext('2d')!; ink.fillStyle = '#fff'; ink.fillRect(0, 0, 32, 32)
ink.fillStyle = '#147aff'; ink.fillRect(32, 0, 32, 32)
for (const tilt of [25, 50, 85]) for (const dpr of [1, 2]) for (const wall of [false, true]) {
  const canvas = document.createElement('canvas'), r = new Render25d({ tilt, unexploredFog: true, animate: false })
  const scene = { ...emptyScene(), playerOnLevel: true }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
    x, y, kind: wall && x === 2 && y === 0 ? 'wall' : 'floor', visibility: 'visible', occluder: wall && x === 2 && y === 0,
    floorTile: 1, wallTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  r.mount(canvas); r.resize(640, 480, dpr)
  r.setTiles({ tile: id => ({ atlas: 'art', sx: id === 2 ? 32 : 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }), atlas: () => atlas, atlasNames: () => ['art'] })
  r.setScene(scene, 0); r.render(0)
  const scale = fittedScale(640, 480, tilt * Math.PI / 180)
  const p = { x: 0, y: 0, width: 640, height: 480, tilt: tilt * Math.PI / 180, scale }
  const ctx = canvas.getContext('2d')!, edgeX = r.project(2.5, 0).x
  const roof = wallRoof(scene, p, scene.cells.get(cellKey(2, 0))!, dpr)
  const sampleY = wall ? (roof.y + roof.height + r.project(2, 0.5).y) / 2 : r.project(2, 0).y
  const pixel = (x: number, y: number) => ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data
  const profile = () => Array.from({ length: Math.ceil(scale) + 1 }, (_, i) => pixel(edgeX - scale * 0.8 + i, sampleY)[0])
  const assert = (name: string, pass: boolean, detail?: unknown) => { checks++; if (!pass) failures.push({ name, tilt, dpr, wall, detail }) }
  const ramp = profile(), darkest = Math.min(...ramp), brightest = Math.max(...ramp)
  const jump = Math.max(...ramp.slice(1).map((v, i) => Math.abs(v - ramp[i])))
  assert('frontier fades continuously to black on ground and raised faces', brightest > 45 && darkest < brightest * 0.1 && jump < brightest * 0.3 && new Set(ramp).size >= 6, { ramp, jump })
  const inset = 0.3, mid = pixel(r.project(2.5 - inset, 0).x, r.project(0, 1.5).y)[0]
  const corner = pixel(r.project(2.5 - inset, 0).x, r.project(0, 2.5 - inset).y)[0]
  assert('the shared feather rounds outer corners instead of outlining squares', corner < mid * 0.85, { corner, mid })
  r.setOptions({ animate: true }); r.render(0)
  const before = profile(); r.render(3)
  const after = profile()
  assert('the feather moves gently without changing explored interior', before.some((v, i) => Math.abs(v - after[i]) >= 1) && Math.abs(before[0] - after[0]) <= 1, { before, after })
  r.setOptions({ animate: false })
  scene.billboards = [{ x: 2, y: 1, kind: 'monster', tile: 2, height: 1, life: { motion: 'still' } }]
  scene.revision++; r.setScene(scene, 0); r.render(0)
  const actor = r.project(2, 1.3), actorX = actor.x + scale * 0.35, actorY = actor.y - scale * 0.45
  const fogActor = pixel(actorX, actorY)
  r.setOptions({ unexploredFog: false }); r.render(0)
  assert('confirmed actors stay clear of the boundary veil', fogActor[2] > fogActor[0] * 2 && equalPixels(fogActor, pixel(actorX, actorY)), { fogActor: [...fogActor], plainActor: [...pixel(actorX, actorY)] })
  r.setOptions({ unexploredFog: true })
  scene.billboards = []; scene.revision++; r.setScene(scene, 0); r.render(0)
  const oldEdge = pixel(r.project(2.4, 0).x, r.project(0, 0).y)[0]
  scene.cells.set(cellKey(3, 0), { ...scene.cells.get(cellKey(1, 0))!, x: 3 })
  scene.revision++; r.setScene(scene, 0); r.render(0)
  const revealed = pixel(r.project(2.4, 0).x, r.project(0, 0).y)[0]
  r.resize(800, 600, dpr); r.render(0)
  const resized = pixel(r.project(2.4, 0).x, r.project(0, 0).y)[0]
  assert('exploration and resize update the feather with the geometry', revealed > oldEdge * 1.5 && resized > 80, { oldEdge, revealed, resized })
  r.destroy(); releaseCanvas(canvas)
  await fixtureYield('fog-boundary')
}
fixtureComplete({ checks, failures })
