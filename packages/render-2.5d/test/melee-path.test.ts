import { describe, expect, it } from 'vitest'
import type { MeleeAttack } from '@orbrun/scene'
import { meleeFrame, meleePath } from '../src/melee-path.js'
import { groundDepth } from '../src/projection.js'

const styles: MeleeAttack['style'][] = ['slash', 'stab', 'thrust', 'cleave', 'reap', 'crush', 'lash', 'staff', 'unarmed']
const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

describe('anchored melee paths', () => {
  it.each(styles)('%s starts at the attacker and meets the defender for every heading, reach and tilt', style => {
    for (const [x, y] of directions) for (const reach of [1, 2]) for (const tilt of [30, 45, 60]) {
      const dx = x * reach, dy = y * reach * groundDepth(tilt * Math.PI / 180)
      const { path } = meleePath(style, dx, dy, true)
      expect(Math.hypot(path(0).x, path(0).y)).toBeLessThan(0.45)
      expect(path(1)).toEqual({ x: dx, y: dy })
      const before = path(1 - 0.0001), after = path(1 + 0.0001)
      // Position and velocity both continue through contact; no reversal or pop.
      expect(after.x - dx).toBeCloseTo(dx - before.x, 6)
      expect(after.y - dy).toBeCloseTo(dy - before.y, 6)
    }
  })

  it('uses the same guard for every family, even as the target moves', () => {
    for (const [x, y] of directions) {
      const frame = meleeFrame(x, y), guard = frame(0.14, 0)
      for (const style of styles) for (const hit of [true, false]) {
        expect(meleePath(style, x, y, hit, frame).path(0)).toEqual(guard)
        expect(meleePath(style, x + 0.25, y - 0.15, hit, frame).path(0)).toEqual(guard)
      }
    }
  })

  it('rotates planar swings in one frame without direction-dependent angle corrections', () => {
    for (const style of styles.filter(s => s !== 'crush')) {
      const east = meleePath(style, 1, 0, true).path
      const north = meleePath(style, 0, -1, true).path
      for (const time of [0, 0.1, 0.3, 0.6, 1, 1.1]) {
        const a = east(time), b = north(time)
        expect(b.x).toBeCloseTo(a.y)
        expect(b.y).toBeCloseTo(-a.x)
      }
    }
  })

  it('keeps every overhead blow descending throughout the striking phase in every direction', () => {
    for (const [x, y] of directions) for (const reach of [1, 2]) {
      const { path } = meleePath('crush', x * reach, y * reach * groundDepth(Math.PI / 4), true)
      for (let i = 60; i <= 120; i++) expect(path(i / 100).y).toBeGreaterThan(path((i - 1) / 100).y)
    }
  })

  it.each(styles)('%s has a bounded path and misses stop short of contact', style => {
    for (const [x, y] of directions) for (const hit of [false, true]) {
      const { path } = meleePath(style, x, y, hit)
      for (let i = 0; i <= 125; i++) {
        const p = path(i / 100)
        expect([p.x, p.y].every(Number.isFinite)).toBe(true)
        expect(Math.hypot(p.x, p.y)).toBeLessThan(3)
        if (!hit && i >= 85) expect(Math.hypot(p.x - x, p.y - y), `${style} heading ${x},${y} at ${i}%`).toBeGreaterThan(0.17)
      }
    }
  })
})
