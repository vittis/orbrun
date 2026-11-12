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
  it('retains every native path tile without interpolation, rotation or guessed endpoint impacts', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const x of [1, 2, 3]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1.001, true)
    expect(fx.projectiles(1.016).map(b => [b.x, b.y, b.rotation])).toEqual([[1, 0, undefined], [2, 0, undefined], [3, 0, undefined]])
    expect(fx.projectiles(1.08)[0].alpha).toBeLessThan(fx.projectiles(1.016)[0].alpha!)
    fx.tick(scene, 1.2)
    expect(fx.projectiles(1.2)).toEqual([])
    expect(fx.bursts).toEqual([])
    expect(fx.traces).toEqual([])
  })

  it.each(['visibility', 'level', 'still', 'remote'])('clears native projectile art on %s', reset => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [spell(1), spell(2)] }, 1, true)
    fx.observe(scene, 1.001, true)
    if (reset === 'visibility') for (const cell of scene.cells.values()) cell.visibility = 'remembered'
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    fx.observe(scene, 1.01, reset !== 'still')
    expect(fx.projectiles(1.016)).toEqual([])
  })

  it('never creates art or impacts for intentionally invisible projectile tiles', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [{ ...spell(), life: { projectile: false } }] }, 1, true)
    fx.observe(scene, 1.001, true)
    expect(fx.projectiles(1.016)).toEqual([])
    expect(fx.bursts).toEqual([])
  })

  it('coalesces different impact types for one recipient and turn, preferring confirmed results', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.billboards = [{ ...target, id: 7 }]
    fx.observe(scene, 0, true)
    fx.spell(scene, { x: 1, y: 0, kind: 'physical' }, 1, 'generic')
    fx.spell(scene, { x: 1, y: 0, kind: 'magic' }, 1.01, 'flash')
    fx.spell(scene, { x: 1, y: 0, actorId: 'id:7', turn: 10, kind: 'cold' }, 1.02)
    fx.spell(scene, { x: 1, y: 0, actorId: 'id:7', turn: 10, kind: 'physical', intensity: 'heavy' }, 1.3)
    expect(fx.bursts).toMatchObject([{ actorId: 'id:7', kind: 'cold', born: 1, intensity: 'heavy', turn: 10 }])
    fx.spell(scene, { x: 1, y: 0, actorId: 'id:7', turn: 11, kind: 'fire' }, 1.31)
    expect(fx.bursts).toHaveLength(2) // a later turn remains a distinct hit
    fx.spell(scene, { x: 2, y: 0, kind: 'cold' }, 1.02)
    expect(fx.bursts).toHaveLength(3) // an actual second victim keeps its own effect
  })

  it('attaches a previous-cell flash to an approaching creature and updates its anchor', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.billboards = [{ ...target, x: 2, id: 7 }]
    fx.observe(scene, 1, true)
    scene.billboards = [{ ...scene.billboards[0], x: 1 }]
    scene.cells.get(cellKey(2, 0))!.flash = { r: 140, g: 200, b: 255, a: 100 }
    scene.revision++; fx.observe(scene, 1.03, true)
    expect(fx.bursts).toMatchObject([{ x: 1, actorId: 'id:7', kind: 'cold' }])
    fx.spell(scene, { x: 1, y: 0, actorId: 'id:7', kind: 'fire', turn: 2 }, 1.03)
    expect(fx.bursts).toHaveLength(1)
    scene.billboards = [{ ...scene.billboards[0], x: 0 }]
    scene.revision++; fx.observe(scene, 1.08, true)
    expect(fx.bursts).toMatchObject([{ x: 0, actorId: 'id:7', kind: 'fire' }])
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
    scene.billboards = [{ ...spell(), kind: 'cloud' }]
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
      scene.billboards = [{ ...spell(), kind: 'cloud' }]
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
