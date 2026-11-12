import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImpactArt } from '../src/impact-draw.js'
import type { Context2d } from '../src/tiles.js'

afterEach(() => vi.unstubAllGlobals())
function harness() {
  const canvases: { area: number }[] = []
  vi.stubGlobal('OffscreenCanvas', class {
    area = 0
    constructor() { canvases.push(this) }
    getContext() { return { globalAlpha: 1, fillStyle: '', translate() {}, fillRect: (_x: number, _y: number, w: number, h: number) => { this.area += w * h } } }
  })
  const ctx = { save() {}, restore() {}, drawImage: vi.fn(), imageSmoothingEnabled: true, globalAlpha: 1 } as unknown as Context2d
  const art = new ImpactArt()
  const draw = (strength: number) => art.draw(ctx, 'physical', 0.3, 3, strength, 100, 100, 32, 2)
  return { art, ctx, canvases, draw }
}

describe('cached impact frames', () => {
  it('reuses frames and preserves different debris densities for light, solid and heavy hits', () => {
    const { canvases, draw } = harness()
    draw(0.35); draw(0.35)
    expect(canvases).toHaveLength(1)
    draw(0.65); draw(1)
    expect(canvases).toHaveLength(3)
    expect(canvases[1].area).toBeGreaterThan(canvases[0].area)
    expect(canvases[2].area).toBeGreaterThan(canvases[1].area)
  })
  it('invalidates cached frames on clear and never creates frames outside their lifetime', () => {
    const { art, ctx, canvases, draw } = harness()
    draw(0.65); art.clear(); draw(0.65)
    expect(canvases).toHaveLength(2)
    for (const age of [-1, 1, 2]) art.draw(ctx, 'fire', age, 0, 1, 0, 0, 32, 2)
    expect(canvases).toHaveLength(2)
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  })
})
