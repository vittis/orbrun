import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, livingPose, type Billboard, type Scene } from '@orbrun/scene'
import { DungeonMovement, type MovementOptions } from '../src/movement.js'

const options: MovementOptions = { enabled: true, duration: 0.1, easing: 'ease-out' }
const actor = (x = 0, y = 0, extra: Partial<Billboard> = {}): Billboard => ({ id: 1, x, y, tile: 2, kind: 'monster', height: 1, ...extra })
function scene(...billboards: Billboard[]): Scene {
  const s = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true, billboards }
  for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) s.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  return s
}
function observe(m: DungeonMovement, s: Scene, now: number, opts = options, center = s.player) { m.observe(s, center, now, opts) }

describe('confirmed entity movement', () => {
  it.each((['player', 'monster', 'item', 'cloud', 'doll', 'projectile'] as const).flatMap(kind => [1, 4].map(steps => ({ kind, steps }))))('tweens $kind art over $steps cells and lands exactly without changing the scene', ({ kind, steps }) => {
    const m = new DungeonMovement(), a = actor(0, 0, { kind }), b = actor(steps, steps, { kind })
    observe(m, scene(a), 0); observe(m, scene(b), 1)
    expect(m.position(b, 1)).toEqual({ x: 0, y: 0 })
    expect(m.position(b, 1.05).x).toBeCloseTo(0.875 * steps)
    expect(m.position(b, 1.05).y).toBeCloseTo(0.875 * steps)
    expect(m.moving(b, 1.05)).toBe(true)
    expect(m.position(b, 1.1)).toEqual({ x: steps, y: steps })
    expect(m.moving(b, 1.1)).toBe(false)
    expect(b.x).toBe(steps)
  })

  it.each([['ease-out', 0.875], ['smooth', 0.5], ['linear', 0.5]] as const)('supports %s easing and custom duration', (easing, halfway) => {
    const m = new DungeonMovement(), a = actor(), b = actor(1)
    observe(m, scene(a), 0); observe(m, scene(b), 1, { ...options, duration: 0.2, easing })
    expect(m.position(b, 1.1).x).toBeCloseTo(halfway)
    expect(m.position(b, 1.2).x).toBeCloseTo(1)
  })

  it('retargets a burst from the drawn position, preserves unrelated updates, and never queues travel', () => {
    const m = new DungeonMovement(), a = actor(), b = actor(1), c = actor(2), d = actor(2, 1)
    observe(m, scene(a), 0); observe(m, scene(b), 1)
    const drawn = m.position(b, 1.03)
    observe(m, scene(c), 1.03)
    expect(m.position(c, 1.03)).toEqual(drawn)
    const updated = actor(2, 0, { tile: 99 })
    observe(m, scene(updated), 1.04)
    expect(m.position(updated, 1.05).x).toBeGreaterThan(drawn.x)
    const turn = m.position(updated, 1.06)
    observe(m, scene(d), 1.06)
    expect(m.position(d, 1.06)).toEqual(turn)
    expect(m.position(d, 1.16)).toEqual({ x: 2, y: 1 })
    expect(m.moving(d, 1.16)).toBe(false)
  })

  it('retargets repeated multi-cell moves without skipping ahead to limit visual lag', () => {
    const m = new DungeonMovement(), b = actor(3), c = actor(5)
    observe(m, scene(actor()), 0); observe(m, scene(b), 1)
    const drawn = m.position(b, 1.01)
    observe(m, scene(c), 1.01)
    expect(m.position(c, 1.01)).toEqual(drawn)
    expect(m.position(c, 1.06).x).toBeGreaterThan(drawn.x)
    expect(m.position(c, 1.06).x).toBeLessThan(5)
    expect(m.position(c, 1.11)).toEqual({ x: 5, y: 0 })
  })

  it('uses stable IDs when identical monsters cross and when mutable art changes', () => {
    const m = new DungeonMovement(), a = actor(), b = actor(1, 0, { id: 2 })
    const s = scene(a, b)
    observe(m, s, 0)
    a.x = 1; a.tile = 7; b.x = 0
    observe(m, s, 1)
    expect(m.position(a, 1)).toEqual({ x: 0, y: 0 })
    expect(m.position(b, 1)).toEqual({ x: 1, y: 0 })
  })

  it.each([1, 3])('matches unique anonymous art moving %i cells while reserving stationary copies', steps => {
    const m = new DungeonMovement(), a = actor(0, 0, { id: undefined }), fixed = actor(4, 0, { id: undefined })
    observe(m, scene(a, fixed), 0)
    const b = actor(steps, 0, { id: undefined }), same = { ...fixed }
    observe(m, scene(same, b), 1)
    expect(m.position(b, 1)).toEqual({ x: 0, y: 0 })
    expect(m.position(same, 1)).toEqual({ x: 4, y: 0 })
  })

  it('keeps independent idle phases with crossing identities and conservatively matched anonymous art', () => {
    for (const anonymous of [false, true]) {
      const m = new DungeonMovement(), a = actor(0, 0, { id: anonymous ? undefined : 1 }), b = actor(2, 0, { id: anonymous ? undefined : 2 })
      observe(m, scene(a, b), 0)
      const pose = (board: Billboard) => {
        const sample = m.animation(board, 1)
        return livingPose({ motion: 'fly' }, sample.x, sample.y, sample.time)
      }
      const first = pose(a), second = pose(b)
      const moved = { ...a, x: 1 }, other = { ...b, x: anonymous ? 2 : 0 }
      observe(m, scene(other, moved), 1)
      expect(pose(moved)).toEqual(first)
      expect(pose(other)).toEqual(second)
      expect(first).not.toEqual(second)
      // Turning movement off finishes glides without reseeding idle animation.
      m.finish()
      observe(m, scene({ ...moved, x: -1 }, other), 1, { ...options, enabled: false })
      expect(pose(other)).toEqual(second)
      // Removed actors cannot donate their phase to a later spawn with a reused ID.
      observe(m, scene(), 2)
      const returned = { ...moved, x: 3 }
      observe(m, scene(returned), 3)
      expect(m.animation(returned, 3)).toEqual({ x: 3, y: 0, time: 3 })
      observe(m, { ...scene(returned), levelKey: 'D:2' }, 4)
      expect(m.animation(returned, 4)).toEqual({ x: 3, y: 0, time: 4 })
    }
  })

  it('snaps ambiguous anonymous spawns rather than moving the wrong copies', () => {
    const m = new DungeonMovement()
    observe(m, scene(actor(0, 0, { id: undefined }), actor(2, 0, { id: undefined })), 0)
    const a = actor(1, 0, { id: undefined }), b = actor(3, 0, { id: undefined })
    observe(m, scene(a, b), 1)
    expect(m.position(a, 1)).toEqual({ x: 1, y: 0 })
    expect(m.position(b, 1)).toEqual({ x: 3, y: 0 })
    const single = new DungeonMovement()
    observe(single, scene(actor(0, 0, { id: undefined })), 0)
    const first = actor(-1, 0, { id: undefined }), second = actor(1, 0, { id: undefined })
    observe(single, scene(first, second), 1)
    expect(single.position(first, 1)).toEqual({ x: -1, y: 0 })
    expect(single.position(second, 1)).toEqual({ x: 1, y: 0 })
  })

  it('snaps new identities, level changes and remote level views', () => {
    for (const change of ['identity', 'level', 'remote'] as const) {
      const m = new DungeonMovement()
      observe(m, scene(actor()), 0)
      const b = actor(1, 0, { id: change === 'identity' ? 2 : 1 }), s = scene(b)
      if (change === 'level') s.levelKey = 'D:2'
      if (change === 'remote') s.playerOnLevel = false
      observe(m, s, 1)
      expect(m.position(b, 1)).toEqual({ x: b.x, y: b.y })
    }
  })

  it('discards hidden entities and never animates out of newly hidden source cells', () => {
    const m = new DungeonMovement()
    observe(m, scene(actor()), 0)
    const b = actor(1), s = scene(b)
    s.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    observe(m, s, 1)
    expect(m.position(b, 1).x).toBe(1)
    s.cells.get(cellKey(1, 0))!.visibility = 'unseen'
    observe(m, s, 2)
    const c = actor(2)
    observe(m, scene(c), 3)
    expect(m.position(c, 3).x).toBe(2)
  })

  it('finishes movement immediately for still mode and clears removed entities', () => {
    const m = new DungeonMovement(), b = actor(1)
    observe(m, scene(actor()), 0); observe(m, scene(b), 1)
    m.finish()
    expect(m.position(b, 1).x).toBe(1)
    expect(m.moving(b, 1)).toBe(false)
    observe(m, scene(), 2); observe(m, scene(b), 3)
    expect(m.position(b, 3).x).toBe(1)
    observe(m, scene(actor(2)), 4, { ...options, enabled: false })
    m.clear()
    expect(m.position(b, 4).x).toBe(1)
  })
})

describe('the following camera', () => {
  it.each(['ease-out', 'smooth', 'linear'] as const)('follows multi-cell player moves on the same %s curve', easing => {
    const m = new DungeonMovement(), a = actor(0, 0, { kind: 'player' }), b = actor(4, 2, { kind: 'player' })
    const start = scene(a), next = scene(b)
    next.player = { x: 4, y: 2 }
    const opts = { ...options, easing }
    observe(m, start, 0, opts); observe(m, next, 1, opts)
    expect(m.center(next.player, 1)).toEqual({ x: 0, y: 0 })
    for (const t of [1, 1.025, 1.05, 1.1]) expect(m.center(next.player, t)).toEqual(m.position(b, t))
    expect(m.cameraMoving(1.05)).toBe(true)
    expect(m.center(next.player, 1.1)).toEqual(next.player)
  })

  it('carries player velocity into repeated steps and keeps the camera on that exact curve', () => {
    const m = new DungeonMovement()
    const a = actor(0, 0, { kind: 'player' }), b = actor(1, 0, { kind: 'player' }), c = actor(2, 0, { kind: 'player' })
    const start = scene(a), first = scene(b), second = scene(c)
    first.player = { x: 1, y: 0 }; second.player = { x: 2, y: 0 }
    observe(m, start, 0); observe(m, first, 1)
    const epsilon = 0.000001, at = 1.08
    const before = (m.position(b, at).x - m.position(b, at - epsilon).x) / epsilon
    const drawn = m.position(b, at)
    observe(m, second, at)
    expect(m.position(c, at)).toEqual(drawn)
    const after = (m.position(c, at + epsilon).x - m.position(c, at).x) / epsilon
    expect(after).toBeCloseTo(before, 2)
    for (const t of [at, at + 0.01, at + 0.05, at + 0.1]) expect(m.center(second.player, t)).toEqual(m.position(c, t))
    expect(m.position(c, at + 0.1)).toEqual({ x: 2, y: 0 })
  })

  it('keeps repeated walking moving near the next arrival rather than easing almost to a stop on each tile', () => {
    const m = new DungeonMovement()
    for (let x = 0; x <= 3; x++) {
      const b = actor(x, 0, { kind: 'player' }), s = scene(b)
      s.player = { x, y: 0 }
      observe(m, s, 1 + x * 0.09)
      if (x < 2) continue
      const early = m.position(b, 1 + x * 0.09 + 0.03).x - m.position(b, 1 + x * 0.09 + 0.02).x
      const late = m.position(b, 1 + x * 0.09 + 0.08).x - m.position(b, 1 + x * 0.09 + 0.07).x
      expect(late).toBeGreaterThan(early * 0.7)
      expect(m.center(s.player, 1 + x * 0.09 + 0.08)).toEqual(m.position(b, 1 + x * 0.09 + 0.08))
    }
  })

  it('handles a reversed player step before the first frame without a zero-length curve', () => {
    const m = new DungeonMovement(), a = actor(0, 0, { kind: 'player' }), b = actor(1, 0, { kind: 'player' })
    const start = scene(a), next = scene(b)
    next.player = { x: 1, y: 0 }
    observe(m, start, 0); observe(m, next, 1); observe(m, start, 1)
    expect(m.position(a, 1)).toEqual({ x: 0, y: 0 })
    expect(m.center(start.player, 1)).toEqual({ x: 0, y: 0 })
    expect(m.cameraMoving(1)).toBe(false)
  })

  it('shares the player timeline and preserves it through unrelated scene updates', () => {
    const m = new DungeonMovement(), a = actor(0, 0, { kind: 'player' }), b = actor(1, 0, { kind: 'player' })
    const start = scene(a), next = scene(b)
    next.player = { x: 1, y: 0 }
    observe(m, start, 0); observe(m, next, 1)
    expect(m.center(next.player, 1.04)).toEqual(m.position(b, 1.04))
    observe(m, next, 1.05)
    expect(m.center(next.player, 1.06)).toEqual(m.position(b, 1.06))
    expect(m.cameraMoving(1.1)).toBe(false)
  })

  it('snaps targeting pans and never drifts a fixed view centre', () => {
    const m = new DungeonMovement(), s = scene(actor())
    observe(m, s, 0)
    observe(m, s, 1, options, { x: 1, y: 0 })
    expect(m.center({ x: 1, y: 0 }, 1)).toEqual({ x: 1, y: 0 })
    expect(m.cameraMoving(1)).toBe(false)
    s.player = { x: 1, y: 0 }
    observe(m, s, 2, options, { x: 1, y: 0 })
    expect(m.cameraMoving(2)).toBe(false)
  })
})
