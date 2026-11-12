import { Render25d, fittedScale, project } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'
import { TileCache } from '../../../packages/render-2.5d/src/tiles'

/** Sample real intermediate pixels, including alpha-masked art and reversals. */
export function visibilityChecks(source: TileSource) {
  let checks = 0
  const failures: unknown[] = []
  for (const dpr of [1, 1.25, 2]) for (const filterScaling of [false, true]) for (const kind of ['floor', 'wall', 'sprite']) {
    const canvas = document.createElement('canvas')
    const r = new Render25d({ animate: true, filterScaling })
    r.mount(canvas); r.resize(640, 480, dpr); r.setTiles(source)
    const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) scene.cells.set(cellKey(x, y), {
      x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1, wallTile: 1,
      flags: { water: false, lava: false },
    } as SceneCell)
    const cell = scene.cells.get(cellKey(0, 0))!
    if (kind === 'wall') {
      for (const y of [-1, 0]) {
        const c = scene.cells.get(cellKey(0, y))!; c.occluder = true; c.kind = 'wall'
      }
    }
    if (kind === 'sprite') scene.billboards = [{ kind: 'monster', x: 0, y: 0, tile: 2, height: 1, life: { motion: 'still' } }]
    const p = { x: 0, y: 0, width: 640, height: 480, tilt: 50 * Math.PI / 180, scale: fittedScale(640, 480, 50 * Math.PI / 180) }
    const q = project(p, 0, 0, kind === 'wall' ? 0.58 : 0)
    if (kind === 'sprite') q.y = project(p, 0, 0.3).y - p.scale * 0.5
    const sample = () => [...canvas.getContext('2d')!.getImageData(Math.floor(q.x * dpr), Math.floor(q.y * dpr), 1, 1).data]
    const channel = kind === 'sprite' ? 2 : 0
    const assert = (name: string, passed: boolean, detail: unknown) => {
      checks++; if (!passed) failures.push({ name, dpr, filterScaling, kind, detail })
    }
    r.setScene(scene, 0); r.render(0)
    const bright = sample()[channel]
    cell.visibility = 'remembered'; scene.revision++; r.setScene(scene, 1)
    const dimming: number[] = []
    for (let i = 0; i <= 14; i++) { r.render(1 + i / 60); dimming.push(sample()[channel]) }
    assert('LOS dims smoothly from its previous brightness', Math.abs(dimming[0] - bright) <= 1 && dimming.at(-1)! < bright * 0.5 && new Set(dimming).size > 10 && dimming.every((v, i) => !i || v <= dimming[i - 1] + 1), { bright, dimming })
    cell.visibility = 'visible'; scene.revision++; r.setScene(scene, 2)
    const reveal: number[] = []
    for (let i = 0; i <= 14; i++) { r.render(2 + i / 60); reveal.push(sample()[channel]) }
    assert('LOS brightens smoothly and settles', Math.abs(reveal[0] - dimming.at(-1)!) <= 1 && reveal.at(-1) === bright && new Set(reveal).size > 10 && reveal.every((v, i) => !i || v >= reveal[i - 1] - 1) && !r.animating, { reveal, animating: r.animating })
    cell.visibility = 'remembered'; scene.revision++; r.setScene(scene, 3); r.render(3.08)
    const before = sample()[channel]
    cell.visibility = 'visible'; scene.revision++; r.setScene(scene, 3.08); r.render(3.08)
    assert('LOS reversal has no brightness jump', Math.abs(sample()[channel] - before) <= 1, { before, after: sample() })
    r.setOptions({ animate: false }); r.render(3.08)
    assert('Still mode immediately settles the brightness', sample()[channel] === bright && !r.animating, { bright, sample: sample() })
    cell.visibility = 'unseen'; scene.revision++; r.setScene(scene, 4); r.render(4)
    assert('unseen tiles cannot be picked during a fade', r.pick(q.x, q.y) !== cellKey(0, 0), {})
    r.destroy()
  }

  // A still-visible torch must fade off a departing LOS receiver rather than
  // disappearing before that receiver begins its brightness transition.
  for (const dpr of [1, 2]) {
    const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
    const ink = atlas.getContext('2d')!; ink.fillStyle = '#404040'; ink.fillRect(0, 0, 32, 32)
    const source: TileSource = { tile: () => ({ atlas: 'grey', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }), atlas: () => atlas, atlasNames: () => ['grey'] }
    const canvas = document.createElement('canvas'), r = new Render25d()
    r.mount(canvas); r.resize(640, 480, dpr); r.setTiles(source)
    const scene = { ...emptyScene(), playerOnLevel: true }
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), {
      x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1, flags: { water: false, lava: false },
    } as SceneCell)
    scene.cells.get(cellKey(-1, 0))!.life = { lights: [{ colour: [255, 140, 60], radius: 4.2, power: 1 }] }
    const cell = scene.cells.get(cellKey(0, 0))!
    const sample = () => canvas.getContext('2d')!.getImageData(320 * dpr, 240 * dpr, 1, 1).data[0]
    r.setScene(scene, 0); r.render(0); const bright = sample()
    cell.visibility = 'remembered'; scene.revision++; r.setScene(scene, 1)
    r.render(1); const start = sample()
    r.render(1.11); const middle = sample()
    r.render(1.23); const end = sample()
    checks++
    if (bright <= 64 || Math.abs(start - bright) > 1 || middle >= start || middle <= end || end > 30) failures.push({ name: 'torch exposure fades with LOS', dpr, bright, start, middle, end })
    cell.visibility = 'visible'; scene.revision++; r.setScene(scene, 2)
    r.render(2); const revealStart = sample()
    r.render(2.11); const revealMiddle = sample()
    r.render(2.23); const revealEnd = sample()
    checks++
    if (Math.abs(revealStart - end) > 1 || revealMiddle <= revealStart || revealMiddle >= revealEnd || Math.abs(revealEnd - bright) > 1) failures.push({ name: 'torch exposure returns smoothly with LOS', dpr, revealStart, revealMiddle, revealEnd })
    r.destroy()
  }

  // Tinting must retain partial alpha and leave the tile cache bounded over
  // many fade frames. A flash is applied after darkness, as on static tiles.
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 32
  const ink = atlas.getContext('2d')!; ink.fillStyle = 'rgba(200,160,120,0.5)'; ink.fillRect(8, 8, 16, 16)
  const cache = new TileCache()
  cache.source = { tile: () => ({ atlas: 'alpha', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }), atlas: () => atlas, atlasNames: () => ['alpha'] }
  const out = document.createElement('canvas'); out.width = out.height = 32
  const ctx = out.getContext('2d')!
  let alphaPreserved = true, transparent = true
  for (let i = 1; i < 100; i++) {
    ctx.clearRect(0, 0, 32, 32)
    cache.drawPlane(ctx, [{ tile: 1 }], { x: 0, y: 0, width: 32, height: 32 }, 1, i / 100, { r: 255, g: 0, b: 0, a: 128 })
    const pixel = ctx.getImageData(16, 16, 1, 1).data
    alphaPreserved &&= pixel[3] === 128 && pixel[0] >= 127
    transparent &&= ctx.getImageData(0, 0, 1, 1).data[3] === 0
  }
  const entries = (cache as unknown as { entries: Map<string, unknown> }).entries.size
  checks++
  if (!alphaPreserved || !transparent || entries > 2) failures.push({ name: 'continuous shading preserves alpha, flash ordering and cache bounds', alphaPreserved, transparent, entries })
  cache.clear()
  // Breathing can use an enlarged cached raster. The LOS tint must cover its
  // full surface while preserving alpha and the same atlas-space footprint.
  out.width = out.height = 96
  let enlargedAlpha = true
  for (const rasterScale of [2, 4]) for (let i = 1; i < 20; i++) {
    ctx.clearRect(0, 0, 96, 96)
    cache.draw(ctx, [{ tile: 1 }], 32, 32, 32, 1, i / 20, undefined, undefined, undefined, rasterScale)
    const pixel = ctx.getImageData(48, 48, 1, 1).data
    enlargedAlpha &&= pixel[3] === 128 && Math.abs(pixel[0] - 200 * (1 - i / 20)) <= 3 && ctx.getImageData(0, 0, 1, 1).data[3] === 0
  }
  checks++
  if (!enlargedAlpha) failures.push({ name: 'LOS fade preserves enlarged breathing rasters' })
  cache.clear()
  return { checks, failures }
}
