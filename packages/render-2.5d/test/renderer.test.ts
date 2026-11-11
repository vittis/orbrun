import { describe, expect, it, vi } from 'vitest'
import { cellKey, emptyScene, makeCamera, type SceneCell } from '@orbrun/scene'
import { Render25d, fittedScale, project, unproject } from '../src/index.js'
import { lightField } from '../src/lighting.js'
import { drawTile } from '../src/tiles.js'

function cell(x: number, y: number, extra: Partial<SceneCell> = {}): SceneCell {
  return { x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false }, ...extra }
}
function sceneOf(...cells: SceneCell[]) {
  return { ...emptyScene(), cells: new Map(cells.map(c => [cellKey(c.x, c.y), c])), playerOnLevel: true }
}
function renderer() {
  const gradient = { addColorStop: vi.fn() }
  const ctx = new Proxy({ createRadialGradient: () => gradient } as Record<string, unknown>, {
    get(target, key: string) { return target[key] ??= vi.fn() },
  })
  const r = new Render25d()
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement
  r.mount(canvas)
  r.resize(900, 700, 2)
  return { r, canvas, ctx }
}

describe('the north-up projection', () => {
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
  it('lights nearby visible ground, stops at walls, and leaves memory cold', () => {
    const scene = sceneOf(cell(0, 0), cell(1, 0), cell(2, 0, { kind: 'wall', occluder: true }), cell(3, 0), cell(0, 1, { visibility: 'remembered' }))
    const field = lightField(scene)
    expect(field.get(cellKey(0, 0))!.strength).toBeGreaterThan(field.get(cellKey(1, 0))!.strength)
    expect(field.has(cellKey(2, 0))).toBe(true)
    expect(field.has(cellKey(3, 0))).toBe(false)
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
