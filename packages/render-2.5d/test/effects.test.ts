import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, meleeTiming, type Billboard, type MeleeAttack, type Scene } from '@orbrun/scene'
import { DungeonEffects } from '../src/effects.js'

function world(): Scene {
  const scene = { ...emptyScene(), levelKey: 'D:1', playerOnLevel: true }
  for (let x = 0; x < 4; x++) scene.cells.set(cellKey(x, 0), {
    x, y: 0, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1,
    flags: { water: false, lava: false, excluded: false, travelTrail: false, newStair: false, cursor: false, outOfRange: false, magicMapped: false },
  })
  return scene
}
const attack: MeleeAttack = { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, style: 'slash', hit: true }
const player: Billboard = { x: 0, y: 0, kind: 'player', tile: 1, height: 1 }
const target: Billboard = { x: 1, y: 0, kind: 'monster', tile: 2, height: 1 }
const spell = (x = 1): Billboard => ({ x, y: 0, kind: 'projectile', tile: 3, height: 1,
  life: { lights: [{ colour: [255, 118, 30], radius: 2.8, power: 0.45, pulse: 'fire', transient: true }] } })

describe('non-projectile spell histories', () => {
  it('keeps confirmed zero-damage casts without projectile/light dependencies, deduplicates and expires', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    expect(fx.spell(scene, { x: 1, y: 0, kind: 'cold' }, 1)).toBe(true)
    expect(fx.spell(scene, { x: 1, y: 0, kind: 'cold' }, 1.02)).toBe(false)
    expect(fx.bursts).toHaveLength(1)
    fx.observe({ ...scene, revision: 1 }, 1.1, true)
    expect(fx.bursts[0].born).toBe(1)
    fx.tick(scene, 2)
    expect(fx.bursts).toHaveLength(0)
    for (let i = 0; i < 100; i++) fx.spell(scene, { x: 1, y: 0, kind: 'cold' }, 2 + i * 0.1)
    expect(fx.bursts.length).toBeLessThanOrEqual(48)
  })

  it('retains flashes created and cleared before a draw without replaying unchanged flashes', () => {
    const fx = new DungeonEffects(), scene = world(), cell = scene.cells.get(cellKey(1, 0))!
    fx.observe(scene, 0, true)
    cell.flash = { r: 80, g: 180, b: 255, a: 100 }
    scene.revision++; fx.observe(scene, 1, true)
    scene.revision++; fx.observe(scene, 1.1, true)
    delete cell.flash
    scene.revision++; fx.observe(scene, 1.101, true)
    expect(fx.bursts).toMatchObject([{ x: 1, y: 0, kind: 'cold', born: 1 }])
    fx.tick(scene, 2)
    expect(fx.bursts).toHaveLength(0)
  })

  it.each(['level', 'remote', 'still', 'visibility'] as const)('clears direct effects for %s', reset => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.spell(scene, { x: 1, y: 0, kind: 'cold' }, 1)
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'visibility') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    fx.observe(scene, 1.1, reset !== 'still')
    expect(fx.bursts).toEqual([])
    if (reset === 'visibility' || reset === 'remote') expect(fx.spell(scene, { x: 1, y: 0, kind: 'cold' }, 1.2)).toBe(false)
  })
})

describe('bounded dungeon combat presentation', () => {
  it('retains sub-frame non-glowing projectile art and creates dust impact/residue once', () => {
    const fx = new DungeonEffects(), scene = world()
    const sand = { ...spell(), life: { projectile: { kind: 'sand' as const, colour: [216, 181, 116] as [number, number, number], beam: false } } }
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [sand] }, 1, true)
    expect(fx.projectiles(1)).toMatchObject([{ tile: sand.tile, x: 1 }])
    fx.observe({ ...scene, billboards: [] }, 1.001, true)
    expect(fx.projectiles(1.008)).toHaveLength(1)
    expect(fx.projectiles(1.008)[0].x).toBe(1)
    expect(fx.traces).toHaveLength(0)
    fx.tick(scene, 1.09)
    expect(fx.traces).toMatchObject([{ born: 1.02, appearance: { kind: 'sand' }, source: { power: 0 } }])
    fx.observe({ ...scene, billboards: [] }, 1.1, true)
    expect(fx.traces).toHaveLength(1)
    expect(fx.traces[0].born).toBeCloseTo(1.02)
    fx.tick(scene, 1.2)
    expect(fx.projectiles(1.2)).toHaveLength(0)
    expect(fx.traces).toHaveLength(1)
    fx.tick(scene, 3)
    expect(fx.traces).toHaveLength(0)
  })

  it('clears traveling projectiles on lost visibility, level changes, Still and remote maps', () => {
    for (const reset of ['visibility', 'level', 'still', 'remote']) {
      const fx = new DungeonEffects(), scene = world()
      fx.observe(scene, 0, true)
      fx.observe({ ...scene, billboards: [spell()] }, 1, true)
      fx.observe(scene, 1.001, true)
      if (reset === 'visibility') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
      if (reset === 'level') scene.levelKey = 'D:2'
      if (reset === 'remote') scene.playerOnLevel = false
      fx.observe(scene, 1.01, reset !== 'still')
      expect(fx.projectiles(1.008)).toHaveLength(0)
      expect(fx.traces).toHaveLength(0)
    }
  })

  it('joins a synchronous path into one moving sprite and one endpoint impact', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const x of [1, 2, 3]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1, true)
    for (const [time, x] of [[1 + 0.5 / 240, 0.5], [1 + 1.5 / 240, 1.5], [1 + 2.5 / 240, 2.5], [1 + 2.96 / 240, 2.96]]) {
      const shots = fx.projectiles(time)
      expect(shots).toHaveLength(1)
      expect(shots[0].x).toBeCloseTo(x)
      fx.tick(scene, time)
      expect(fx.traces).toHaveLength(0)
    }
    fx.tick(scene, 1.075)
    expect(fx.projectiles(1.075)).toEqual([])
    expect(fx.traces).toMatchObject([{ source: { x: 3, y: 0 } }])
    expect(fx.bursts).toMatchObject([{ x: 3, y: 0, impact: true }])
    fx.tick(scene, 1.2)
    expect(fx.traces).toHaveLength(1)
  })

  it('never launches an incoming shot backwards from its target', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [spell(1)] }, 1, true)
    // With no known shooter, wait at the confirmed sample instead of choosing
    // the nearby player (who is actually the target) as the launch point.
    expect(fx.projectiles(1)).toMatchObject([{ x: 1 }])
    fx.observe({ ...scene, billboards: [spell(0)] }, 1.001, true)
    fx.observe(scene, 1.002, true)
    expect(fx.projectiles(1.001 + 0.5 / 240)[0].x).toBeCloseTo(0.5)
    fx.tick(scene, 1.042)
    expect(fx.bursts).toMatchObject([{ x: 0, y: 0, impact: true }])
  })

  it('never pulls an already displayed missile back to an inferred shooter', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [spell(1)] }, 1, true)
    expect(fx.projectiles(1.01)[0].x).toBe(1)
    fx.observe({ ...scene, billboards: [spell(2)] }, 1.02, true)
    expect(fx.projectiles(1.02)[0].x).toBeGreaterThanOrEqual(1)
    expect(fx.projectiles(1.02 + 0.5 / 240)[0].x).toBeCloseTo(1.5)
  })

  it('keeps consecutive short shots from becoming a return flight', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const x of [1, 2]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1, true)
    fx.observe({ ...scene, billboards: [spell(1)] }, 1.001, true)
    expect(fx.projectiles(1 + 0.5 / 240)).toHaveLength(2)
    expect(fx.projectiles(1 + 1.5 / 240)[0].x).toBeCloseTo(1.5)
  })

  it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]])('flies correctly in direction %s,%s, even with cells supplied in reverse order', (dx, dy) => {
    const fx = new DungeonEffects(), scene = world(), cell = scene.cells.get(cellKey(0, 0))!
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), { ...cell, x, y })
    const shot = (n: number): Billboard => ({ ...spell(), x: dx * n, y: dy * n, life: { projectile: {
      kind: 'metal', colour: [190, 200, 210], beam: false, family: 'MI_ARROW', angle: Math.atan2(dy, dx),
    } } })
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [shot(2), shot(1)] }, 1, true)
    fx.observe(scene, 1, true)
    const halfway = fx.projectiles(1 + Math.hypot(dx, dy) / 480)
    expect(halfway).toHaveLength(1)
    expect(halfway[0].x).toBeCloseTo(dx * 0.5)
    expect(halfway[0].y).toBeCloseTo(dy * 0.5)
    expect(halfway[0].rotation).toBeCloseTo(0)
    fx.tick(scene, 1.08)
    expect(fx.projectiles(1.08)).toEqual([])
    expect(fx.bursts).toMatchObject([{ x: dx * 2, y: dy * 2 }])
  })

  it('rotates directional artwork to the complete origin/destination angle', () => {
    const fx = new DungeonEffects(), scene = world(), cell = scene.cells.get(cellKey(0, 0))!
    for (let x = 0; x <= 3; x++) scene.cells.set(cellKey(x, 1), { ...cell, x, y: 1 })
    const shot = (x: number, y: number): Billboard => ({ ...spell(x), y, life: { projectile: {
      kind: 'stone', colour: [184, 168, 137], beam: false, family: 'BOLT_STONE_ARROW', angle: -Math.PI / 2,
    } } })
    fx.observe(scene, 0, true)
    for (const b of [shot(1, 0), shot(2, 1), shot(3, 1)]) fx.observe({ ...scene, billboards: [b] }, 1, true)
    const b = fx.projectiles(1.01)[0]
    expect(b.rotation).toBeCloseTo(Math.atan2(1, 3) + Math.PI / 2)
  })

  it('creates the arrival VFX for a wall endpoint too', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.cells.get(cellKey(3, 0))!.occluder = true
    fx.observe(scene, 0, true)
    for (const x of [1, 2, 3]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1, true)
    fx.tick(scene, 1.075)
    expect(fx.bursts).toMatchObject([{ x: 3, y: 0, impact: true }])
  })

  it('keeps separate launches separate, including repeated shots of the same art', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const x of [1, 2, 3]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1, true)
    fx.observe({ ...scene, billboards: [spell(1)] }, 1.01, true)
    expect(fx.projectiles(1.012)).toHaveLength(2)
    fx.observe(scene, 1.02, true)
    fx.tick(scene, 1.3)
    expect(fx.traces.map(t => t.source.x).sort()).toEqual([1, 3])
  })

  it('does not restart a stationary overlay on unrelated updates', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    const shot = { ...scene, billboards: [spell()] }
    fx.observe(shot, 1, true)
    fx.observe(shot, 1.01, true)
    expect(fx.projectiles(1.025)[0].x).toBe(1)
    expect(fx.projectiles(1.1)).toMatchObject([{ x: 1 }])
    expect(fx.traces).toEqual([])
  })

  it('never creates visible effects for intentionally invisible projectile tiles', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [{ ...spell(), life: { projectile: false } }] }, 1, true)
    fx.observe(scene, 1.001, true)
    expect(fx.projectiles(1.008)).toHaveLength(0)
    expect(fx.traces).toHaveLength(0)
  })
  it('lunges and recoils without changing confirmed cells, settles, and ignores miss recoil', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.melee(scene, attack, 1)
    expect(fx.offset(player, 1.1).x).toBeGreaterThan(0)
    expect(fx.offset(target, 1.2).x).toBeGreaterThan(0)
    expect(player.x).toBe(0); expect(target.x).toBe(1)
    expect(fx.offset({ ...player, life: { held: true } }, 1.1).x).toBe(0)
    fx.tick(scene, 2)
    expect(fx.strokes).toHaveLength(0)
    expect(fx.offset(player, 2)).toEqual({ x: 0, y: 0 })
    fx.melee(scene, { ...attack, hit: false }, 2)
    expect(fx.offset(target, 2.1)).toEqual({ x: 0, y: 0 })
    expect(fx.offset(player, 2.1).x).toBeGreaterThan(0)
  })

  it('keeps recoil after contact and assigns the lunge to the incoming attacker by ID', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    const enemy = { ...target, id: 7 }, receiver = { ...player }
    fx.melee(scene, { ...attack, from: attack.to, to: attack.from, fromId: 'id:7', toId: 'player' }, 1)
    const contact = 1 + meleeTiming('slash').contact
    expect(fx.offset(receiver, contact - 0.001)).toEqual({ x: 0, y: 0 })
    expect(fx.offset(enemy, contact).x).toBeLessThan(-0.1)
    expect(fx.offset(receiver, contact + 0.04).x).toBeLessThan(0)
    // A different actor standing at the attacker's cell must not lunge.
    expect(fx.offset({ ...enemy, id: 8 }, contact)).toEqual({ x: 0, y: 0 })
    expect(fx.offset(enemy, 1.5)).toEqual({ x: 0, y: 0 })
  })

  it('deduplicates rapid reports, caps history and motion, and refuses hidden targets', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.melee(scene, attack, 1); fx.melee(scene, attack, 1.03)
    expect(fx.strokes).toHaveLength(1)
    for (let i = 0; i < 100; i++) fx.melee(scene, attack, 2 + i * 0.1)
    expect(fx.strokes.length).toBeLessThanOrEqual(12)
    expect(Math.hypot(...Object.values(fx.offset(player, 11.96)))).toBeLessThanOrEqual(0.18)
    scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
    fx.tick(scene, 12)
    expect(fx.strokes).toHaveLength(0)
    expect(fx.melee(scene, attack, 12)).toBe(false)
  })

  it('leaves one trace when a confirmed spell disappears, with no refresh on unrelated updates', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.billboards = [spell()]
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, revision: 1 }, 0.1, true)
    expect(fx.traces).toHaveLength(0)
    fx.observe({ ...scene, billboards: [], revision: 2 }, 0.2, true)
    expect(fx.traces).toHaveLength(1)
    fx.observe({ ...scene, billboards: [], revision: 3 }, 1, true)
    expect(fx.traces[0].born).toBe(0.2)
    fx.tick(scene, 3.1)
    expect(fx.traces).toHaveLength(0)
  })

  it('clears histories across levels, still mode, remote maps, and loss of visibility', () => {
    for (const reset of ['level', 'still', 'remote', 'visibility']) {
      const fx = new DungeonEffects(), scene = world()
      scene.billboards = [spell()]
      fx.observe(scene, 0, true)
      fx.observe({ ...scene, billboards: [] }, 0.1, true)
      fx.melee(scene, attack, 0.1)
      if (reset === 'level') scene.levelKey = 'D:2'
      if (reset === 'remote') scene.playerOnLevel = false
      if (reset === 'visibility') scene.cells.get(cellKey(1, 0))!.visibility = 'remembered'
      fx.observe({ ...scene, billboards: [] }, 0.15, reset !== 'still')
      expect(fx.strokes).toHaveLength(0)
      expect(fx.traces).toHaveLength(0)
    }
  })
})
