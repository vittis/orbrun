import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type Atmosphere, type SceneCell } from '@orbrun/scene'
import { captures, equalPixels, fixtureComplete, fixtureStart, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('fog-checks')
let checks = 0
const failures: unknown[] = []
function metrics(a: Uint8ClampedArray, b?: Uint8ClampedArray) {
  const luminance: number[] = []
  let delta = 0, changed = 0
  for (let i = 0; i < a.length; i += 4) {
    luminance.push((a[i] + a[i + 1] + a[i + 2]) / 3)
    if (b) {
      const difference = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3
      delta += difference; if (difference >= 3) changed++
    }
  }
  luminance.sort((a, b) => a - b)
  return { low: luminance[Math.floor(luminance.length * 0.05)], high: luminance[Math.floor(luminance.length * 0.95)],
    delta: delta / luminance.length, changed: changed / luminance.length }
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
  assert('cloud folds remain perceptible in normal darkness', contrast.high >= 45 && contrast.high - contrast.low >= 20, contrast)
  r.render(60)
  assert('Still freezes mist and motes and sleeps', equalPixels(still, image()) && !r.animating)
  r.setOptions({ unexploredFog: false }); r.render(0)
  assert('toggle removes atmosphere without altering explored ground', !equalPixels(still, image()) && equalPixels(terrain, center()) && !r.animating)
  r.setOptions({ unexploredFog: true, animate: true }); r.render(0)
  const animated = image(), fogStart = fog()
  r.render(1.5)
  const shortMotion = metrics(fog(), fogStart), beforeStep = fog()
  assert('clouds visibly roll within 1.5 seconds', shortMotion.delta >= 1 && shortMotion.changed >= 0.15, shortMotion)
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

// Theme changes reuse the renderer and its fog buffers, as real branch changes do.
const canvas = document.createElement('canvas'), r = new Render25d({ unexploredFog: true, animate: false })
r.mount(canvas); r.resize(640, 480, 1)
const scene = { ...emptyScene(), playerOnLevel: true }
scene.cells.set(cellKey(0, 0), { x: 0, y: 0, kind: 'floor', visibility: 'visible', occluder: false, flags: { water: false, lava: false } } as SceneCell)
const themes: Atmosphere[] = ['stone', 'earth', 'verdant', 'marsh', 'sea', 'frost', 'embers', 'spectral', 'arcane', 'chaos', 'holy']
const fingerprints = new Set<string>()
for (const atmosphere of themes) {
  scene.atmosphere = atmosphere; scene.revision++; r.setScene(scene, 0); r.render(0)
  const ctx = canvas.getContext('2d')!, first = ctx.getImageData(0, 0, 160, 480).data
  const rgb = [0, 0, 0]
  for (let i = 0; i < first.length; i += 4) for (let c = 0; c < 3; c++) rgb[c] += first[i + c]
  const fingerprint = rgb.map(v => Math.round(v / (160 * 480))).join(',')
  const unique = !fingerprints.has(fingerprint); fingerprints.add(fingerprint)
  r.render(50)
  const frozen = ctx.getImageData(0, 0, 160, 480).data
  checks++
  if (!unique || !equalPixels(first, frozen) || r.animating) failures.push({ name: 'distinct branch mood freezes in Still', atmosphere, rgb: fingerprint })
  r.setOptions({ animate: true }); r.render(0)
  const start = ctx.getImageData(0, 0, 160, 480).data
  r.render(1.5)
  const motion = metrics(ctx.getImageData(0, 0, 160, 480).data, start)
  checks++
  if (motion.delta < 1 || !r.animating) failures.push({ name: 'branch fog has perceptible motion', atmosphere, motion })
  r.setOptions({ animate: false })
}
r.destroy(); releaseCanvas(canvas)
fixtureComplete({ checks, failures })
