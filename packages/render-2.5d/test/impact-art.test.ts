import { describe, expect, it } from 'vitest'
import { IMPACT_PALETTES, paintImpact, paintImpactResidue, type ImpactKind } from '../src/impact-art.js'
import type { Context2d } from '../src/tiles.js'

interface PixelRun { x: number; y: number; width: number; height: number; colour: string; alpha: number }
function frame(kind: ImpactKind, age: number, residue = false, strength = 0.6) {
  const runs: PixelRun[] = []
  const ctx = { fillStyle: '', globalAlpha: 1,
    fillRect(x: number, y: number, width: number, height: number) { runs.push({ x, y, width, height, colour: this.fillStyle, alpha: this.globalAlpha }) },
  } as unknown as Context2d
  if (residue) paintImpactResidue(ctx, kind, age, 3)
  else paintImpact(ctx, kind, age, 3, strength)
  return runs
}
const area = (runs: PixelRun[]) => runs.reduce((sum, r) => sum + r.width * r.height, 0)
const kinds = Object.keys(IMPACT_PALETTES) as ImpactKind[]

describe('shared shaded pixel impact art', () => {
  it.each(kinds)('%s has immediate opaque contact art, distinct motion and whole-texel expiry', kind => {
    expect(area(frame(kind, 0))).toBeGreaterThan(10)
    for (const age of [0, 0.15, 0.4, 0.7, 0.95]) {
      const runs = frame(kind, age)
      expect(runs.every(r => [r.x, r.y, r.width, r.height].every(Number.isInteger)
        && r.width > 0 && r.height === 1 && r.alpha === 1 && Math.abs(r.x) < 32 && Math.abs(r.y) < 32)).toBe(true)
    }
    for (const age of [-1, 1, 2]) expect(frame(kind, age)).toEqual([])
  })
  it('uses different silhouettes and debris, rather than recolouring one ring', () => {
    const shape = (kind: ImpactKind) => JSON.stringify(frame(kind, 0.4).map(({ x, y, width }) => [x, y, width]))
    expect(new Set(['physical', 'earth', 'sand', 'fire', 'cold', 'electric', 'poison', 'air', 'drain', 'heal', 'teleport'].map(k => shape(k as ImpactKind))).size).toBe(11)
    expect(area(frame('physical', 0.3, false, 1))).toBeGreaterThan(area(frame('physical', 0.3, false, 0.25)))
  })
  it('keeps wind, ricochets and armor flecks distinct and moving through the burst', () => {
    for (const kind of ['miss', 'block', 'no-damage'] as const) {
      expect(area(frame(kind, 0.15))).toBeGreaterThan(65)
      expect(area(frame(kind, 0.4))).toBeGreaterThan(65)
      expect(area(frame(kind, 0.15))).toBeLessThan(area(frame('physical', 0.15)))
      expect(frame(kind, 0.15)).not.toEqual(frame(kind === 'miss' ? 'no-damage' : 'miss', 0.15))
      expect(frame(kind, 0.4)).not.toEqual(frame(kind, 0.65))
    }
  })
  it('dissolves shaded floor remnants and removes them completely', () => {
    for (const kind of kinds) {
      if (kind === 'miss' || kind === 'block' || kind === 'no-damage') { expect(frame(kind, 0, true)).toEqual([]); continue }
      expect(area(frame(kind, 0, true))).toBeGreaterThan(0)
      expect(area(frame(kind, 0.9, true))).toBeLessThan(area(frame(kind, 0, true)))
      expect(frame(kind, 1, true)).toEqual([])
    }
  })
})
