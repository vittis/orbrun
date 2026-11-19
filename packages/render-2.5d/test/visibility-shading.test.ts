import { afterEach, expect, it, vi } from 'vitest'
import { VisibilityShading } from '../src/visibility-shading.js'
import { MEMORY_DARKNESS } from '../src/visibility.js'
import { TileCache, type Context2d } from '../src/tiles.js'

class Canvas {
  pixels: Uint8ClampedArray | undefined
  uploads = 0
  buffers = 0
  constructor(public width: number, public height: number) {}
  getContext() {
    return new Proxy({
      createImageData: (width: number, height: number) => { this.buffers++; return { data: new Uint8ClampedArray(width * height * 4), width, height } },
      putImageData: (image: ImageData) => { this.uploads++; this.pixels = image.data.slice() },
    }, { get: (target, key: string) => key in target ? target[key as keyof typeof target] : vi.fn() })
  }
}
afterEach(() => vi.unstubAllGlobals())

it('reuses fading buffers without overwriting settled masks or the other exposure channel', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const shading = new VisibilityShading()
  const settled = [0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS]
  const stable = shading.mask(settled)!
  const canvas = stable.canvas as unknown as Canvas
  const original = canvas.pixels!.slice()
  const field = (value: number) => [0, 0, value, 0, value, value, 0, 0, value]
  const darkness = shading.mask(field(0.1)), exposure = shading.mask(field(0.1), true)
  expect(exposure).not.toBe(darkness)
  for (let i = 1; i < 25; i++) {
    expect(shading.mask(field(i / 100))).toBe(darkness)
    expect(shading.mask(field(i / 100), true)).toBe(exposure)
  }
  expect(shading.mask([...settled])).toBe(stable)
  expect(canvas.pixels).toEqual(original)
  shading.clear()
  expect(shading.mask(field(0.1))).not.toBe(darkness)
  expect(shading.mask(settled)).not.toBe(stable)
})

it('uploads many changing masks once per frame and reuses an unchanged atlas', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const shading = new VisibilityShading()
  const fields = Array.from({ length: 32 }, (_, i) => [0, 0, 0, 0, 0.1 + i / 1000, 0, 0, 0, 0])
  shading.prepare(fields, true)
  const first = shading.mask(fields[0])!, exposure = shading.mask(fields[0], true)!
  const canvas = first.canvas as unknown as Canvas
  const masks = fields.flatMap(field => [shading.mask(field)!, shading.mask(field, true)!])
  expect(masks.every(mask => mask.canvas === first.canvas)).toBe(true)
  expect(new Set(masks.map(mask => `${mask.x},${mask.y}`)).size).toBe(64)
  expect(canvas.uploads).toBe(1)
  const alpha = (mask: typeof first) => canvas.pixels![((mask.y + Math.floor(mask.height / 2)) * canvas.width + mask.x + Math.floor(mask.width / 2)) * 4 + 3]
  expect(alpha(first)).toBe(Math.round(255 * 0.1))
  expect(alpha(exposure)).toBe(Math.round(255 * (1 - 0.1 / MEMORY_DARKNESS)))
  shading.prepare(fields.map(field => [...field]), true)
  expect(canvas.uploads).toBe(1)
  const moved = fields.map(field => field.map(value => value ? value + 0.001 : 0))
  shading.prepare(moved, true)
  expect(shading.mask(moved[0])!.canvas).toBe(first.canvas)
  expect(canvas.uploads).toBe(2)
  expect(canvas.buffers).toBe(1)
})

it.each(['scalar', 'field'] as const)('keeps submitted %s fades separate within a frame and reuses them in later frames', kind => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const tiles = new TileCache(), atlas = new Canvas(32, 32)
  tiles.source = {
    tile: () => ({ atlas: 'test', sx: 0, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
    atlas: () => atlas as unknown as OffscreenCanvas, atlasNames: () => ['test'],
  }
  const drawImage = vi.fn(), ctx = { drawImage } as unknown as Context2d
  const field = (value: number) => kind === 'scalar' ? value : [0, 0, 0, 0, value, value, 0, 0, 0]
  const draw = (value: number) => tiles.drawPlane(ctx, [{ tile: 1 }], { x: 0, y: 0, width: 32, height: 32 }, 1, field(value))
  tiles.beginFrame()
  draw(0.1); draw(0.2); draw(0.1)
  const first = drawImage.mock.calls[0][0], second = drawImage.mock.calls[1][0]
  expect(second).not.toBe(first)
  expect(drawImage.mock.calls[2][0]).toBe(first)
  tiles.beginFrame()
  draw(0.3); draw(0.4)
  expect(drawImage.mock.calls[3][0]).toBe(first)
  expect(drawImage.mock.calls[4][0]).toBe(second)
  tiles.clear(); tiles.beginFrame(); draw(0.1)
  expect(drawImage.mock.calls[5][0]).not.toBe(first)
})

it('continues matching visibility into atlas gutters on both sides of a shared tile edge', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const shading = new VisibilityShading()
  const left = [0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS, 0, 0, MEMORY_DARKNESS]
  const right = [0, MEMORY_DARKNESS, MEMORY_DARKNESS, 0, MEMORY_DARKNESS, MEMORY_DARKNESS, 0, MEMORY_DARKNESS, MEMORY_DARKNESS]
  shading.prepare([left, right], false)
  const a = shading.mask(left)!, b = shading.mask(right)!, canvas = a.canvas as unknown as Canvas
  const pixel = (x: number, y: number) => canvas.pixels![(y * canvas.width + x) * 4 + 3]
  const y = a.y + Math.floor(a.height / 2), by = b.y + Math.floor(b.height / 2)
  const edgeA = (pixel(a.x + a.width - 1, y) + pixel(a.x + a.width, y)) / 2
  const edgeB = (pixel(b.x - 1, by) + pixel(b.x, by)) / 2
  expect(edgeA).toBe(edgeB)
  expect(edgeA / 255).toBeCloseTo(MEMORY_DARKNESS / 2, 2)
})


it('preserves padded sprite sizes when uniform and spatial fades share the frame pool', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const tiles = new TileCache(), atlas = new Canvas(32, 64)
  tiles.source = {
    tile: id => ({ atlas: 'test', sx: 0, sy: 0, w: 32, h: id === 2 ? 64 : 32, ox: 0, oy: id === 2 ? -32 : 0, cell: 32 }),
    atlas: () => atlas as unknown as OffscreenCanvas, atlasNames: () => ['test'],
  }
  const drawImage = vi.fn(), ctx = { drawImage } as unknown as Context2d
  const floor = () => tiles.drawPlane(ctx, [{ tile: 1 }], { x: 0, y: 0, width: 32, height: 32 }, 1, [0, 0, 0, 0, 0.2, 0, 0, 0, 0])
  const actor = (tile: number, scale = 1) => tiles.draw(ctx, [{ tile }], 0, 0, 32, 1, 0.2, undefined, undefined, undefined, scale)
  tiles.beginFrame(); floor(); actor(1); actor(2); actor(2, 2)
  const images = drawImage.mock.calls.map(([image]) => image as Canvas)
  expect(images.map(image => image.width)).toEqual([32, 36, 96, 192])
  expect(drawImage.mock.calls.map(([, x, , width]) => [x, width])).toEqual([[0, 32], [-2, 36], [-32, 96], [-32, 96]])
  tiles.beginFrame(); actor(2, 2); actor(2); floor(); actor(1)
  expect(drawImage.mock.calls.slice(4).map(([image]) => image)).toEqual([images[3], images[2], images[0], images[1]])
})
