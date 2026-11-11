/** Real Canvas checks: DOM mocks cannot detect raster seams or filtering bleed. */
import { Render25d, fittedScale, project } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { surfaceLightChecks } from './surface-light-checks'

const atlas = document.createElement('canvas')
atlas.width = 128
atlas.height = 32
const ink = atlas.getContext('2d')!
ink.fillStyle = '#fff'
ink.fillRect(0, 0, 32, 32)
ink.fillStyle = '#287cff'
ink.fillRect(40, 4, 16, 26)
ink.strokeStyle = '#00ff00'
// A wide synthetic border survives sub-texel scaling; this checks placement.
ink.lineWidth = 3
ink.strokeRect(65.5, 1.5, 29, 29)
ink.fillStyle = '#ff0000'
ink.fillRect(96, 0, 4, 4)
const source: TileSource = {
  tile: id => ({ atlas: 'test', sx: (id - 1) * 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
  atlas: () => atlas,
  atlasNames: () => ['test'],
}
function cell(x: number, y: number, wall = false): SceneCell {
  return { x, y, kind: wall ? 'wall' : 'floor', visibility: 'visible', occluder: wall, floorTile: 1, wallTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false } }
}

const failures: unknown[] = []
let checks = 0
for (const [viewWidth, viewHeight] of [[512, 384], [390, 600], [1728, 1117]]) for (const dpr of [1, 1.25, 2]) for (const filterScaling of [false, true]) {
  for (const degrees of [35, 50, 65]) for (const zoom of [0.8, 1, 1.4]) for (const wall of [false, true]) {
    const canvas = document.createElement('canvas')
    const r = new Render25d({ tilt: degrees, zoom, animate: false, filterScaling })
    r.mount(canvas)
    r.resize(viewWidth, viewHeight, dpr)
    r.setTiles(source)
    const scene = emptyScene()
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), cell(x, y, wall))
    r.setScene(scene)
    r.render(0)
    const tilt = degrees * Math.PI / 180
    const p = { x: 0, y: 0, width: viewWidth, height: viewHeight, tilt, scale: fittedScale(viewWidth, viewHeight, tilt, zoom) }
    const a = project(p, -1.5, -1.5, wall ? 0.58 : 0)
    const b = project(p, 1.5, 1.5, wall ? 0.58 : 0)
    const x = Math.ceil(a.x * dpr), y = Math.ceil(a.y * dpr)
    const width = Math.floor(b.x * dpr) - x, height = Math.floor(b.y * dpr) - y
    const pixels = canvas.getContext('2d')!.getImageData(x, y, width, height).data
    let badPixels = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255 || pixels[i + 3] !== 255) badPixels++
    }
    checks++
    if (badPixels) failures.push({ kind: 'seam', viewWidth, viewHeight, dpr, filterScaling, degrees, zoom, wall, badPixels, firstPixel: [...pixels.slice(0, 4)] })
    if (viewWidth === 512 && dpr === 1 && !filterScaling && degrees === 50 && zoom === 1 && !wall) document.querySelector('#captures')!.append(canvas)
    r.destroy()
  }

  const canvas = document.createElement('canvas')
  const r = new Render25d({ animate: false, filterScaling })
  r.mount(canvas)
  r.resize(viewWidth, viewHeight, dpr)
  r.setTiles(source)
  const scene = emptyScene()
  for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), cell(x, y))
  scene.billboards = [
    { x: -2, y: 0, kind: 'player', tile: 2, height: 0.7 },
    { x: 0, y: 0, kind: 'monster', tile: 2, height: 0.4 },
    { x: 2, y: 0, kind: 'item', tile: 2, height: 0.28 },
  ]
  r.setScene(scene)
  r.render(0)
  const tilt = 50 * Math.PI / 180
  const p = { x: 0, y: 0, width: viewWidth, height: viewHeight, tilt, scale: fittedScale(viewWidth, viewHeight, tilt) }
  const silhouettes = scene.billboards.map(b => {
    const q = project(p, b.x, b.y + 0.3)
    const x = Math.floor((q.x - p.scale / 2) * dpr), y = Math.floor((q.y - p.scale) * dpr)
    const size = Math.ceil(p.scale * dpr)
    const pixels = canvas.getContext('2d')!.getImageData(x, y, size, size).data
    let left = size, right = -1, top = size, bottom = -1
    for (let sy = 0; sy < size; sy++) for (let sx = 0; sx < size; sx++) {
      const i = (sy * size + sx) * 4
      if (pixels[i + 2] > pixels[i] * 1.6 && pixels[i + 2] > pixels[i + 1] * 1.3) {
        left = Math.min(left, sx); right = Math.max(right, sx); top = Math.min(top, sy); bottom = Math.max(bottom, sy)
      }
    }
    const picked = r.pick((x + (left + right) / 2) / dpr, (y + top + 1) / dpr)
    return { kind: b.kind, width: right - left + 1, height: bottom - top + 1, picked: picked === cellKey(b.x, b.y) }
  })
  checks++
  if (silhouettes.some(s => !s.picked || s.width < 1 || s.height < 1) ||
    Math.max(...silhouettes.map(s => s.width)) - Math.min(...silhouettes.map(s => s.width)) > 1 ||
    Math.max(...silhouettes.map(s => s.height)) - Math.min(...silhouettes.map(s => s.height)) > 1) failures.push({ kind: 'sprite scale/picking', viewWidth, viewHeight, dpr, filterScaling, silhouettes })
  if (viewWidth === 512 && dpr === 1 && !filterScaling) document.querySelector('#captures')!.append(canvas)
  r.destroy()
}
// Visibility and marker checks use real Canvas pixels, including filtered fractional scales.
for (const dpr of [1, 1.25, 2]) for (const filterScaling of [false, true]) for (const degrees of [35, 50, 65]) for (const zoom of [0.8, 1, 1.4]) {
  const canvas = document.createElement('canvas')
  const r = new Render25d({ tilt: degrees, zoom, animate: false, filterScaling })
  r.mount(canvas)
  r.resize(512, 384, dpr)
  r.setTiles(source)
  const scene = emptyScene()
  // Same art on both sides of the LOS boundary, without any distance dimming.
  for (let y = -2; y <= 2; y++) for (let x = -3; x <= 3; x++) {
    const c = cell(x, y)
    if (x < 0) c.visibility = 'remembered'
    scene.cells.set(cellKey(x, y), c)
  }
  const item = scene.cells.get(cellKey(1, 0))!
  item.icons = [3, 4] // green item cursor and a red ground badge on the same cell
  item.cursorTile = 3
  scene.billboards = [{ x: 1, y: 0, kind: 'item', tile: 2, height: 0.28 }]
  r.setScene(scene)
  r.render(0)
  const ctx = canvas.getContext('2d')!
  const tilt = degrees * Math.PI / 180
  const p = { x: 0, y: 0, width: 512, height: 384, tilt, scale: fittedScale(512, 384, tilt, zoom) }
  const sample = (x: number, y: number) => [...ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data]
  const a = project(p, -1, 1), b = project(p, 1, 1), far = project(p, 2, 1)
  const memory = sample(a.x, a.y), visible = sample(b.x, b.y), distant = sample(far.x, far.y)
  checks++
  if (memory[0] > visible[0] * 0.5 || Math.abs(visible[0] - distant[0]) > 1) failures.push({ kind: 'LOS brightness / no player spotlight', dpr, filterScaling, degrees, zoom, memory, visible, distant })
  checks++
  if ([memory, visible, distant].some(pixel => Math.max(...pixel.slice(0, 3)) - Math.min(...pixel.slice(0, 3)) > 1) || memory[0] < visible[0] * 0.35) failures.push({ kind: 'neutral readable memory / no player halo', dpr, filterScaling, degrees, zoom, memory, visible, distant })

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let left = Infinity, top = Infinity, right = -1, bottom = -1, redLeft = Infinity, redTop = Infinity
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const i = (y * canvas.width + x) * 4
    if (pixels[i + 1] > 100 && pixels[i + 1] > pixels[i] * 3 && pixels[i + 1] > pixels[i + 2] * 3) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
    if (pixels[i] > 100 && pixels[i] > pixels[i + 1] * 3 && pixels[i] > pixels[i + 2] * 3) {
      redLeft = Math.min(redLeft, x); redTop = Math.min(redTop, y)
    }
  }
  const q = project(p, 1, 0.3), ground = project(p, 0.5, -0.5)
  const expected = [(q.x - p.scale / 2) * dpr, (q.y - p.scale) * dpr, (q.x + p.scale / 2) * dpr - 1, q.y * dpr - 1]
  const actual = [left, top, right, bottom]
  checks++
  if (actual.some((value, i) => Math.abs(value - expected[i]) > 2) || Math.abs(redLeft - ground.x * dpr) > 2 || Math.abs(redTop - ground.y * dpr) > 2) failures.push({ kind: 'item cursor / independent ground badge', dpr, filterScaling, degrees, zoom, actual, expected, redLeft, redTop, ground })
  // Unknown fog stays neutral and textured, without revealing unseen entities.
  const unknown = cell(-6, 0)
  unknown.visibility = 'unseen'
  scene.cells.set(cellKey(-6, 0), unknown)
  scene.billboards.push({ x: -6, y: 0, kind: 'monster', tile: 2, height: 1 })
  scene.revision++
  r.setScene(scene)
  r.render(0)
  const mist = ctx.getImageData(0, 0, Math.round(90 * dpr), canvas.height).data
  let min = 255, max = 0, neutral = true
  for (let i = 0; i < mist.length; i += 4) {
    min = Math.min(min, mist[i]); max = Math.max(max, mist[i])
    if (Math.abs(mist[i] - mist[i + 2]) > 2) neutral = false
  }
  checks++
  if (!neutral || max - min < 2 || max > 24 || r.pick(5, 192) !== null || r.animating) failures.push({ kind: 'neutral textured unknown fog / hidden entity / still mode', dpr, filterScaling, degrees, zoom, min, max, neutral })
  if (dpr === 1 && !filterScaling && degrees === 50 && zoom === 1) document.querySelector('#captures')!.append(canvas)
  r.destroy()
}
const surfaces = surfaceLightChecks()
checks += surfaces.checks; failures.push(...surfaces.failures)
document.querySelector('#result')!.textContent = JSON.stringify({ checks, passed: checks - failures.length, failures }, null, 2)
