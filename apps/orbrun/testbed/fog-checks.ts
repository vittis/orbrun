import { Render25d } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell } from '@orbrun/scene'
import { captures, equalPixels, fixtureComplete, fixtureStart, fixtureYield, releaseCanvas } from './fixture'

fixtureStart('fog-checks')
let checks = 0
const failures: unknown[] = []
for (const [width, height, tilt, dpr] of [[900, 600, 50, 1], [390, 600, 25, 2], [900, 600, 85, 1.25]]) {
  const assert = (name: string, pass: boolean) => { checks++; if (!pass) failures.push({ name, width, tilt, dpr }) }
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
  r.render(0); const still = image(), terrain = center()
  r.render(60)
  assert('Still freezes mist and motes and sleeps', equalPixels(still, image()) && !r.animating)
  r.setOptions({ unexploredFog: false }); r.render(0)
  assert('toggle removes atmosphere without altering explored ground', !equalPixels(still, image()) && equalPixels(terrain, center()) && !r.animating)
  r.setOptions({ unexploredFog: true, animate: true }); r.render(0)
  const animated = image()
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
fixtureComplete({ checks, failures })
