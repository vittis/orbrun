import { afterEach, expect, it, vi } from 'vitest'
import { cellKey, emptyScene } from '@orbrun/scene'
import { DungeonLighting } from '../src/lighting'

function context() {
  return new Proxy({ createRadialGradient: vi.fn(() => ({ addColorStop() {} })) } as Record<string, unknown>, {
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

it('reuses a pulsing light until its receiving silhouette changes and isolates submitted sprite samples', () => {
  vi.stubGlobal('OffscreenCanvas', Canvas)
  const scene = emptyScene(), lighting = new DungeonLighting(), ctx = context()
  const projection = { x: 0, y: 0, width: 200, height: 120, scale: 30, tilt: Math.PI / 4 }
  for (const x of [0, 1]) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false },
  })
  const source = { x: 0, y: 0, radius: 2, colour: [80, 180, 240] as [number, number, number], power: 0.65, pulse: 'slow' as const }
  const rect = { x: 90, y: 50, width: 20, height: 20 }
  const mask = new Canvas(36, 36) as unknown as OffscreenCanvas
  lighting.build(scene, projection, [source], 1, true)
  lighting.draw(ctx, rect)
  const field = vi.mocked(ctx.drawImage).mock.calls[0][0] as OffscreenCanvas
  const fieldInk = field.getContext('2d')!
  const stamp = vi.mocked(fieldInk.drawImage).mock.calls[0][0] as OffscreenCanvas
  const gradient = stamp.getContext('2d')!.createRadialGradient
  const power = fieldInk.globalAlpha
  lighting.draw(ctx, rect, mask)
  lighting.draw(ctx, rect, mask)
  const samples = vi.mocked(ctx.drawImage).mock.calls
  expect(samples[1][0]).not.toBe(samples[2][0])

  lighting.build(scene, projection, [source], 2, true)
  expect(gradient).toHaveBeenCalledTimes(1)
  expect(fieldInk.globalAlpha).not.toBe(power)
  lighting.draw(ctx, rect, mask)
  expect(samples[3][0]).toBe(samples[1][0])

  // A fading receiver can stop accepting light between scene updates.
  lighting.build(scene, projection, [source], 3, true, undefined, undefined, c => c.x === 0)
  expect(gradient).toHaveBeenCalledTimes(2)
})
