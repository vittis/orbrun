import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, makeCamera, type SceneCell } from '@orbrun/scene'
import { Render25d, fittedScale, project, unproject } from '../src/index.js'
import { lightField } from '../src/lighting.js'
import { drawTile } from '../src/tiles.js'
import { planeRect } from '../src/projection.js'

function cell(x: number, y: number, extra: Partial<SceneCell> = {}): SceneCell {
  return { x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false }, ...extra }
}
function sceneOf(...cells: SceneCell[]) {
  return { ...emptyScene(), cells: new Map(cells.map(c => [cellKey(c.x, c.y), c])), playerOnLevel: true }
}
function renderer() {
  const gradient = { addColorStop: vi.fn() }
  const ctx = new Proxy({ createRadialGradient: () => gradient, createLinearGradient: () => gradient } as Record<string, unknown>, {
    get(target, key: string) { return target[key] ??= vi.fn() },
  })
  const r = new Render25d()
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  r.mount(canvas)
  r.resize(900, 700, 2)
  return { r, canvas, ctx }
}

describe('the north-up projection', () => {
  it.each([1, 1.25, 2])('shares exact device-pixel boundaries at DPR %s', dpr => {
    for (const degrees of [35, 50, 65]) for (const zoom of [0.8, 1, 1.4]) {
      const tilt = degrees * Math.PI / 180
      const p = { x: -13, y: 27, width: 903, height: 701, tilt, scale: fittedScale(903, 701, tilt, zoom) }
      for (let x = -20; x < -5; x++) for (let y = 19; y < 35; y++) {
        for (const z of [0, 0.18, 0.58]) {
          const a = planeRect(p, x, y, z, dpr)
          const east = planeRect(p, x + 1, y, z, dpr)
          const south = planeRect(p, x, y + 1, z, dpr)
          expect(a.x + a.width).toBeCloseTo(east.x, 10)
          expect(a.y + a.height).toBeCloseTo(south.y, 10)
          expect(a.x * dpr).toBeCloseTo(Math.round(a.x * dpr), 10)
          expect(a.y * dpr).toBeCloseTo(Math.round(a.y * dpr), 10)
        }
      }
    }
  })

  it.each([35, 50, 65])('round-trips ground coordinates at %s degrees on desktop and phone', degrees => {
    for (const [width, height] of [[1280, 800], [390, 600]]) {
      const tilt = degrees * Math.PI / 180
      const p = { x: -13, y: 27, width, height, tilt, scale: fittedScale(width, height, tilt) }
      for (const [x, y] of [[-20, 19], [-13, 27], [-5, 35]]) {
        const screen = project(p, x, y)
        const world = unproject(p, screen.x, screen.y)
        expect(world.x).toBeCloseTo(x)
        expect(world.y).toBeCloseTo(y)
        expect(screen.x).toBeGreaterThanOrEqual(0)
        expect(screen.x).toBeLessThanOrEqual(width)
        expect(screen.y).toBeGreaterThanOrEqual(0)
        expect(screen.y).toBeLessThanOrEqual(height)
      }
      expect(project(p, -13, 27, 1).y).toBeLessThan(project(p, -13, 27).y)
    }
  })
})

describe('picking and visibility', () => {
  it.each([1, 1.25, 2])('picks the rendered ground on both sides of snapped edges at DPR %s', dpr => {
    const { r } = renderer()
    const cells = [-1, 0, 1].flatMap(y => [-1, 0, 1].map(x => cell(x, y)))
    r.resize(903, 701, dpr)
    r.setScene(sceneOf(...cells))
    r.render(0)
    const tilt = 50 * Math.PI / 180
    const p = { x: 0, y: 0, width: 903, height: 701, tilt, scale: fittedScale(903, 701, tilt) }
    for (const cell of cells) {
      const rect = planeRect(p, cell.x, cell.y, 0, dpr)
      for (const x of [rect.x + 0.001, rect.x + rect.width - 0.001]) {
        for (const y of [rect.y + 0.001, rect.y + rect.height - 0.001]) expect(r.pick(x, y)).toBe(cellKey(cell.x, cell.y))
      }
    }
  })

  it('uses the original atlas scale for the player, weak monsters and ordinary items', () => {
    const { r, ctx } = renderer()
    const scene = sceneOf(cell(-1, 0), cell(0, 0), cell(1, 0))
    scene.billboards = [
      { x: -1, y: 0, kind: 'player', tile: 2, height: 0.7 },
      { x: 0, y: 0, kind: 'monster', tile: 2, height: 0.4 },
      { x: 1, y: 0, kind: 'item', tile: 2, height: 0.28 },
    ]
    const sizes: string[] = []
    vi.mocked(ctx.fillText).mockImplementation(() => { sizes.push(String(ctx.font)) })
    r.setOptions({ animate: false })
    r.setScene(scene)
    r.render(0)
    expect(sizes).toHaveLength(6) // three terrain glyphs, then three upright sprites
    expect(new Set(sizes.slice(3)).size).toBe(1)
    // Items own their upright footprint too, instead of picking the floor behind their heads.
    expect(r.pick(500, 325)).toBe(cellKey(1, 0))
  })

  it('picks in CSS pixels regardless of DPR or first-person heading', () => {
    const { r, canvas } = renderer()
    r.setScene(sceneOf(cell(0, 0), cell(1, 0)))
    r.setCamera(makeCamera(30, 40, 5))
    r.render(0)
    expect(canvas.width).toBe(1800)
    expect(r.pick(450, 350)).toBe(cellKey(0, 0))
    expect(r.pick(500, 350)).toBe(cellKey(1, 0))
    expect(r.pick(-1, 20)).toBeNull()
    expect(r.pick(900, 20)).toBeNull()
  })

  it('a raised wall owns its roof, including the strip above its ground cell', () => {
    const { r } = renderer()
    r.setScene(sceneOf(cell(0, 0, { kind: 'wall', occluder: true })))
    r.render(0)
    // At this size a tile is ~44px: y=320 lies above its ground footprint.
    expect(r.pick(450, 320)).toBe(cellKey(0, 0))
  })

  it('never shows or picks unseen cells, entities or their effects', () => {
    const { r } = renderer()
    const scene = sceneOf(cell(0, 0, { visibility: 'unseen', cloud: 8 }))
    scene.billboards.push({ x: 0, y: 0, kind: 'monster', tile: 9, height: 1 })
    r.setScene(scene)
    r.render(0)
    expect(r.pick(450, 350)).toBeNull()
    expect(r.animating).toBe(false)
  })

  it('stops animation in still mode and releases scene state on destroy', () => {
    const { r } = renderer()
    r.setScene(sceneOf(cell(0, 0, { cloud: 8 })))
    r.render(0)
    expect(r.animating).toBe(true)
    r.setOptions({ animate: false })
    expect(r.animating).toBe(false)
    r.destroy()
    expect(r.pick(450, 350)).toBeNull()
    r.render(1)
  })

  it('an offscreen animation does not keep the render loop awake', () => {
    const { r } = renderer()
    r.setScene(sceneOf(cell(0, 0), cell(100, 100, { cloud: 8 })))
    r.render(0)
    expect(r.animating).toBe(false)
  })

  it('accepts a revised mutable scene and draws a cloud supplied as both terrain and billboard only once', () => {
    const { r, ctx } = renderer()
    const scene = sceneOf(cell(0, 0))
    r.setScene(scene)
    r.render(0)
    expect(r.animating).toBe(false)
    scene.cells.get(cellKey(0, 0))!.cloud = 8
    scene.billboards.push({ x: 0, y: 0, kind: 'cloud', tile: 8, height: 1 })
    scene.revision++
    r.setScene(scene)
    vi.mocked(ctx.fillText).mockClear()
    r.render(0)
    // One terrain glyph and one fallback cloud glyph, not two copies of the cloud.
    expect(ctx.fillText).toHaveBeenCalledTimes(2)
    expect(r.animating).toBe(true)
  })
})

describe('environmental lighting', () => {
  it('the player never emits a light pool or lights ordinary dungeon cells', () => {
    const scene = sceneOf(cell(0, 0), cell(1, 0), cell(2, 0))
    expect(lightField(scene).size).toBe(0)
    scene.player = { x: 1, y: 0 }
    expect(lightField(scene).size).toBe(0)
  })

  it.each([
    ['visible', 'blue', 2],
    ['visible', 'dry_fountain', 0],
    ['remembered', 'blue', 0],
    ['unseen', 'blue', 0],
  ] as const)('animates %s %s fountains only when water is in sight', (visibility, kind, strokes) => {
    const { r, ctx } = renderer()
    r.setScene(sceneOf(cell(0, 0, { visibility, featureTile: 2, stance: 'upright', feature: { type: 'fountain', kind } })))
    r.render(2)
    expect(ctx.stroke).toHaveBeenCalledTimes(strokes)
    r.setOptions({ animate: false })
    expect(r.animating).toBe(false)
  })

  it('lights nearby visible ground, stops at walls, and leaves memory cold', () => {
    const scene = sceneOf(cell(0, 0), cell(1, 0), cell(1, 1, { kind: 'wall', occluder: true }), cell(1, 2), cell(0, 1, { visibility: 'remembered' }))
    scene.cells.get(cellKey(0, 0))!.flags.lava = true
    const field = lightField(scene)
    expect(field.get(cellKey(0, 0))!.strength).toBeGreaterThan(field.get(cellKey(1, 0))!.strength)
    expect(field.has(cellKey(1, 1))).toBe(true)
    expect(field.has(cellKey(1, 2))).toBe(false)
    expect(field.has(cellKey(0, 1))).toBe(false)
  })

  it('remembered lava and a player on another level emit no light', () => {
    const lava = cell(0, 0, { visibility: 'remembered' })
    lava.flags.lava = true
    const scene = sceneOf(lava, cell(1, 0))
    scene.playerOnLevel = false
    expect(lightField(scene).size).toBe(0)
  })
})

describe('atlas composition', () => {
  it('preserves offsets, doll clipping, and top-pinned status badges', () => {
    const image = {} as TexImageSource
    const source = { tile: () => ({ atlas: 'a', sx: 10, sy: 20, w: 20, h: 24, ox: 3, oy: 8, cell: 32 }), atlas: () => image, atlasNames: () => ['a'] }
    const drawImage = vi.fn()
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D
    drawTile(ctx, source, { tile: 1, ox: 2, oy: 1, ymax: 20 }, 100, 200, 64)
    expect(drawImage).toHaveBeenLastCalledWith(image, 10, 20, 20, 12, 110, 218, 40, 24)
    drawTile(ctx, source, { tile: 1, at: 'top' }, 100, 200, 32)
    expect(drawImage).toHaveBeenLastCalledWith(image, 10, 20, 20, 24, 103, 200, 20, 24)
  })
})
