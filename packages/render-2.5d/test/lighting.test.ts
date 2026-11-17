import { afterEach, expect, it, vi } from 'vitest'
import { cellKey, emptyScene } from '@orbrun/scene'
import { DungeonLighting } from '../src/lighting'

function context() {
  return new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>, {
    get(target, key: string) { return target[key] ??= vi.fn() },
  }) as unknown as CanvasRenderingContext2D
}
class Canvas {
  private ctx = context()
  constructor(public width: number, public height: number) {}
  getContext() { return this.ctx }
}
afterEach(() => vi.unstubAllGlobals())

it('culls unlit samples while preserving displaced sprite lighting and clearing old light bounds', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (const x of [0, 10]) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false },
  })
  const lighting = new DungeonLighting(), ctx = context()
  const projection = { x: 0, y: 0, width: 1000, height: 600, scale: 40, tilt: Math.PI / 4 }
  const source = { x: 0, y: 0, radius: 1, power: 1, colour: [255, 128, 0] as [number, number, number] }
  const near = { x: 490, y: 290, width: 20, height: 20 }, far = { ...near, x: 890 }
  const mask = new Canvas(32, 32) as unknown as OffscreenCanvas
  lighting.build(scene, projection, [source], 1, true)
  lighting.draw(ctx, near, mask, far)
  expect(ctx.drawImage).not.toHaveBeenCalled()
  lighting.draw(ctx, far, mask, near) // A moving sprite samples light at its source footprint.
  expect(ctx.drawImage).toHaveBeenCalledOnce()
  vi.mocked(ctx.drawImage).mockClear()
  lighting.build(scene, projection, [{ ...source, x: 10 }], 2, true)
  lighting.draw(ctx, near, mask)
  expect(ctx.drawImage).not.toHaveBeenCalled()
  lighting.draw(ctx, far, mask)
  expect(ctx.drawImage).toHaveBeenCalledOnce()
  vi.mocked(ctx.drawImage).mockClear()
  lighting.build(scene, projection, [], 3, true)
  lighting.draw(ctx, far, mask)
  expect(ctx.drawImage).not.toHaveBeenCalled()
  lighting.clear()
  lighting.build(scene, projection, [source], 4, false)
  lighting.draw(ctx, near, mask)
  expect(ctx.drawImage).toHaveBeenCalledOnce()
})
