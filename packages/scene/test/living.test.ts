import { describe, expect, it } from 'vitest'
import { cellKey, DungeonLife, emptyScene, lanternAt, lightingFor, livingPose, type SceneCell, type TileLife } from '../src/index.js'

function room() {
  const scene = emptyScene()
  scene.playerOnLevel = true
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) scene.cells.set(cellKey(x, y), {
    x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false },
  } as SceneCell)
  return scene
}
const fire = { colour: [255, 100, 20] as [number, number, number], radius: 3, power: 0.6 }

describe('living dungeon visibility', () => {
  it('offers stronger fluid motion with bounded frame-to-frame changes and respects still states', () => {
    const presentation = { strength: 1.7, smooth: true }
    for (const motion of ['breath', 'plant', 'float', 'ooze', 'cloud', 'serpent', 'undead', 'skitter'] as const) {
      const life = { motion, fleeing: true }
      for (let frame = 0; frame < 600; frame++) {
        const a = livingPose(life, 2, 3, frame / 60, true, presentation)
        const b = livingPose(life, 2, 3, (frame + 1) / 60, true, presentation)
        expect(Math.abs(a.x - b.x)).toBeLessThan(0.006)
        expect(Math.abs(a.sy - b.sy)).toBeLessThan(0.006)
        expect(Math.abs(a.x)).toBeLessThan(0.1)
        expect(Math.abs(a.sy - 1)).toBeLessThan(0.1)
      }
      expect(livingPose(life, 2, 3, 1, false, presentation)).toEqual(livingPose(undefined, 2, 3, 1))
      expect(livingPose({ ...life, held: true }, 2, 3, 1, true, presentation)).toEqual(livingPose(undefined, 2, 3, 1))
    }
  })
  it('keeps stronger overhead breathing continuous and free of sideways stretching', () => {
    const presentation = { strength: 3, smooth: true }
    let low = 1, high = 1
    for (let frame = 0; frame < 300; frame++) {
      const pose = livingPose({ motion: 'breath' }, 0, 0, frame / 60, true, presentation)
      const next = livingPose({ motion: 'breath' }, 0, 0, (frame + 1) / 60, true, presentation)
      expect(pose.sx).toBe(1)
      expect(Math.abs(pose.sy - 1)).toBeLessThanOrEqual(0.0361)
      expect(Math.abs(next.sy - pose.sy)).toBeLessThan(0.0013)
      low = Math.min(low, pose.sy); high = Math.max(high, pose.sy)
    }
    expect(high - low).toBeGreaterThan(0.07)
  })
  it('hovers clearly above the ground without wading or stretching, and freezes when held or motion is off', () => {
    const life: TileLife = { motion: 'fly', flying: true, wading: true }
    const presentation = { strength: 3, smooth: true }
    let low = Infinity, high = -Infinity
    for (let frame = 0; frame < 300; frame++) {
      const pose = livingPose(life, 0, 0, frame / 60, true, presentation)
      const next = livingPose(life, 0, 0, (frame + 1) / 60, true, presentation)
      expect(pose.y).toBeGreaterThan(0)
      expect(pose.sx).toBe(1); expect(pose.sy).toBe(1)
      expect(Math.abs(next.y - pose.y)).toBeLessThan(0.003)
      expect(pose).toEqual(livingPose({ ...life, wading: false }, 0, 0, frame / 60, true, presentation))
      low = Math.min(low, pose.y); high = Math.max(high, pose.y)
    }
    expect(high - low).toBeGreaterThan(0.17)
    const still = livingPose(undefined, 0, 0, 1)
    expect(livingPose(life, 0, 0, 1, false, presentation)).toEqual(still)
    expect(livingPose({ ...life, held: true }, 0, 0, 1, true, presentation)).toEqual(still)
  })
  it('lights walls on their near face but neither memory nor cells behind a wall', () => {
    const s = room()
    s.cells.get(cellKey(0, 0))!.life = { lights: [fire] }
    for (let y = -4; y <= 4; y++) s.cells.get(cellKey(1, y))!.occluder = true
    s.cells.get(cellKey(0, 1))!.visibility = 'remembered'
    const { field } = lightingFor(s)
    expect(field.has(cellKey(1, 0))).toBe(true)
    expect(field.has(cellKey(2, 0))).toBe(false)
    expect(field.has(cellKey(0, 1))).toBe(false)
    expect(lanternAt(s, s.cells.get(cellKey(0, 1))!)).toBe(0)
    s.playerOnLevel = false
    expect(lanternAt(s, s.cells.get(cellKey(0, 0))!)).toBe(0)
  })
  it('accepts elemental cloud, monster and projectile emitters and ignores remembered ones', () => {
    const s = room()
    s.billboards = [{ kind: 'cloud', x: 0, y: 0, tile: 10, height: 1, life: { lights: [fire] } }]
    expect(lightingFor(s).field.get(cellKey(1, 0))?.strength).toBeGreaterThan(0)
    s.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    expect(lightingFor(s).field.size).toBe(0)
  })
  it.each(['breath', 'plant', 'float', 'ooze', 'cloud', 'serpent'] as const)('keeps %s still in memory, reduced motion and held states', motion => {
    const life: TileLife = { motion }
    const still = livingPose(undefined, 1, 1, 1)
    expect(livingPose(life, 1, 1, 1, false)).toEqual(still)
    expect(livingPose({ ...life, held: true }, 1, 1, 1)).toEqual(still)
    expect(livingPose(life, 1, 1, 1)).not.toEqual(livingPose(life, 1, 1, 2))
  })
  it('uses a short afterglow after a spell bolt disappears, then releases it', () => {
    const life = new DungeonLife(), a = room()
    a.billboards = [{ kind: 'projectile', x: 0, y: 0, tile: 10, height: 1, life: { lights: [{ ...fire, transient: true }] } }]
    life.observe(a, 1)
    life.observe(room(), 2)
    expect(life.emitters(2)).toHaveLength(1)
    expect(life.emitters(2.2)[0].power).toBeLessThan(fire.power)
    expect(life.emitters(2.4)).toEqual([])
    expect(life.emitters(3)).toEqual([])
  })
  it('makes one bounded impact ripple per observed wound decline and clears on teardown', () => {
    const life = new DungeonLife(), a = room(), b = room()
    a.billboards = [{ kind: 'monster', x: 1, y: 0, tile: 10, height: 1, damage: 'uninjured', ref: { id: 1 } }]
    b.billboards = [{ ...a.billboards[0], damage: 'heavily_damaged' }]
    life.observe(a, 1); life.observe(b, 2); life.observe(b, 2.1)
    expect(life.ripples).toHaveLength(1)
    life.tick(4)
    expect(life.ripples).toEqual([])
    life.clear()
    expect(life.emitters(4)).toEqual([])
  })
  it('does not infer an arrival impact from batched auto-explore or travel steps', () => {
    const life = new DungeonLife(), scene = room()
    life.observe(scene, 1)
    scene.player = { x: 4, y: 3 }; scene.revision++
    life.observe(scene, 2)
    expect(life.ripples).toEqual([])
    // Water footsteps still have their own cue, even after batched movement.
    scene.cells.get(cellKey(-3, 1))!.flags.water = true
    scene.player = { x: -3, y: 1 }; scene.revision++
    life.observe(scene, 3)
    expect(life.ripples).toMatchObject([{ x: -3, y: 1, kind: 'water' }])
  })
  it('discards afterglows and ripples on a level change at identical coordinates', () => {
    const life = new DungeonLife(), a = room(), b = room()
    a.levelKey = 'D:1'; b.levelKey = 'D:2'
    a.billboards = [{ kind: 'projectile', x: 0, y: 0, tile: 10, height: 1, life: { lights: [{ ...fire, transient: true }] } }]
    life.observe(a, 1); life.ripple(0, 0, 1, 1); life.observe(b, 1.1)
    expect(life.emitters(1.1)).toEqual([])
    expect(life.ripples).toEqual([])
  })
  it('follows revised mutable scenes and coalesces the wound ring with its reported hit', () => {
    const life = new DungeonLife(), scene = room()
    scene.billboards = [{ kind: 'monster', x: 1, y: 0, tile: 10, height: 1, damage: 'uninjured', ref: { id: 1 } }]
    life.observe(scene, 1)
    scene.billboards[0].damage = 'moderately_damaged'; scene.revision++
    life.observe(scene, 2); life.ripple(1, 0, 2.05, 1)
    expect(life.ripples).toHaveLength(1)
    expect(life.ripples[0].strength).toBe(1)
  })
  it('does not let a fading beam emit after its source leaves LOS', () => {
    const s = room()
    s.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    expect(lightingFor(s, [{ ...fire, x: 0, y: 0 }]).field.size).toBe(0)
  })
})
