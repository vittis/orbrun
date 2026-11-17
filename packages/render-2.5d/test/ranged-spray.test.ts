import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type Billboard, type DeathKind, type SceneCell } from '@orbrun/scene'
import { DungeonEffects } from '../src/effects.js'
import { sampleHitSpray } from '../src/hit-spray.js'
import { debrisPalettes } from '../src/death.js'
import { elementalPalettes } from '../src/elemental-spray.js'

function setup(name = 'orc') {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1', turn: 1, projectileTime: 0, player: { x: -2, y: 0 } }
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) scene.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, floorTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  const target: Billboard = { id: 7, kind: 'monster', name, x: 0, y: 0, tile: 1, height: 0.8 }
  scene.billboards = [target]
  const fx = new DungeonEffects()
  fx.observe(scene, 0, true)
  return { scene, fx, target }
}
const hit = { x: 0, y: 0, actorId: 'id:7', turn: 1 }
const shot = (x: number, y: number, angle: number): Billboard => ({ x, y, kind: 'projectile', tile: 9, height: 1,
  life: { projectile: { kind: 'magic', family: 'dart', angle, colour: [180, 180, 240], beam: false } } })

describe('material-specific ranged hit splatters', () => {
  it('uses the incoming hit element even without a separate spell report', () => {
    const { scene, fx } = setup()
    fx.hit(scene, { ...hit, tone: 'fire', intensity: 'heavy' }, 1)
    expect(fx.bursts).toHaveLength(1)
    const particles = sampleHitSpray(scene, fx.bursts[0], 1.1)
    expect(particles.some(p => elementalPalettes.fire.includes(p.colour))).toBe(true)
    expect(particles.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
  })

  it.each<[string, DeathKind]>([
    ['orc', 'flesh'], ['skeleton', 'bone'], ['jelly', 'slime'], ['stone golem', 'stone'],
    ['phantom', 'spirit'], ['fire elemental', 'fire'], ['ice beast', 'ice'],
    ['thorn hunter', 'plant'], ['hornet', 'insect'], ['water elemental', 'water'],
  ])('sheds %s body material on confirmed damage, independently of spell colour', (name, kind) => {
    const { scene, fx } = setup(name)
    fx.hit(scene, hit, 1)
    fx.spell(scene, { ...hit, kind: 'cold', intensity: 'solid' }, 1)
    expect(fx.bursts).toHaveLength(1)
    const burst = fx.bursts[0]
    expect(burst.spray).toMatchObject({ kind, source: 'ranged' })
    const particles = sampleHitSpray(scene, burst, 1.1)
    expect(particles.length).toBeGreaterThanOrEqual(8)
    expect(particles.length).toBeLessThanOrEqual(48)
    expect(particles.some(p => debrisPalettes[kind].includes(p.colour))).toBe(true)
    expect(particles.some(p => elementalPalettes.cold.includes(p.colour) && p.sprite === 'shard')).toBe(true)
    expect(particles.every(p => p.size < 0.12 && p.minPixels! >= 5 && p.minPixels! <= 11 && p.sprite !== 'burst')).toBe(true)
    expect(sampleHitSpray(scene, burst, 1.7)).toEqual([])
  })

  it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]])('uses projectile travel (%i, %i) and waits for contact', (dx, dy) => {
    const { scene, fx, target } = setup()
    const angle = Math.atan2(dy, dx)
    scene.billboards = [target, shot(-dx, -dy, angle), shot(0, 0, angle)]
    fx.observe(scene, 1, true)
    scene.billboards = [target]; scene.projectileTime = 0.03
    fx.observe(scene, 1.001, true)
    fx.hit(scene, hit, 1.002)
    fx.spell(scene, { ...hit, kind: 'magic' }, 1.003)
    const burst = fx.bursts[0]
    expect(burst.born).toBeCloseTo(1.07)
    expect(fx.visibleBursts(1.069)).toEqual([])
    expect(sampleHitSpray(scene, burst, 1.069)).toEqual([])
    const particles = sampleHitSpray(scene, burst, 1.25)
    expect(particles.length).toBeGreaterThan(0)
    const travel = particles.map(p => (p.x * dx + p.y * dy) / Math.hypot(dx, dy))
    expect(travel.filter(d => d > 0).length / travel.length).toBeGreaterThan(0.6)
    expect(Math.min(...travel)).toBeLessThan(-0.05)
    expect(travel.reduce((sum, d) => sum + d, 0) / travel.length).toBeGreaterThan(0.15)
    const sideways = particles.map(p => (p.y * dx - p.x * dy) / Math.hypot(dx, dy))
    expect(Math.min(...sideways)).toBeLessThan(-0.05)
    expect(Math.max(...sideways)).toBeGreaterThan(0.05)
    expect(particles.some(p => p.minPixels === 5 && p.alpha < 1)).toBe(true)
  })

  it('varies repeated hits on one target and coalesces duplicate and flash reports without reseeding', () => {
    const { scene, fx } = setup()
    const counts = new Set<number>(), paths = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const now = 1 + i
      scene.turn = i
      const effect = { ...hit, turn: i }
      fx.tick(scene, now)
      fx.spell(scene, { ...effect, kind: 'magic' }, now, 'flash')
      expect(fx.hit(scene, effect, now)).toBe(true)
      const burst = fx.bursts.at(-1)!, spray = burst.spray
      expect(fx.hit(scene, effect, now + 0.01)).toBe(false)
      fx.spell(scene, { ...effect, kind: 'fire', intensity: 'solid' }, now + 0.02)
      fx.spell(scene, { ...effect, kind: 'physical' }, now + 0.02, 'generic')
      expect(fx.bursts).toHaveLength(1)
      expect(burst.spray).toBe(spray)
      const particles = sampleHitSpray(scene, burst, now + 0.15)
      expect(sampleHitSpray(scene, burst, now + 0.15)).toEqual(particles)
      counts.add(particles.length); paths.add(JSON.stringify(particles))
      burst.x = 1
      expect(sampleHitSpray(scene, burst, now + 0.15, { x: 1, y: 0 })).toEqual(particles)
    }
    expect(counts.size).toBeGreaterThan(3)
    expect(paths.size).toBe(24)
  })

  it('uses the native incoming direction for player hits instead of inventing an attacker', () => {
    const { scene, fx } = setup()
    const player: Billboard = { kind: 'player', x: -2, y: 0, tile: 1, height: 1 }
    scene.billboards = [player, shot(-1, 0, Math.PI), shot(-2, 0, Math.PI)]
    fx.observe(scene, 1, true)
    scene.billboards = [player]; fx.observe(scene, 1.001, true)
    fx.hit(scene, { x: -2, y: 0, actorId: 'player' }, 1.002)
    expect(fx.bursts[0].spray?.direction).toEqual({ x: -1, y: 0 })
    const particles = sampleHitSpray(scene, fx.bursts[0], 1.25)
    expect(particles.filter(p => p.x < -2).length / particles.length).toBeGreaterThan(0.6)
    expect(particles.some(p => p.x > -2)).toBe(true)
  })

  it('adopts a later native path without reseeding or firing before its arrival', () => {
    const { scene, fx, target } = setup()
    fx.hit(scene, hit, 1)
    const burst = fx.bursts[0], spray = burst.spray
    expect(spray?.direction).toEqual({ x: 1, y: 0 })
    scene.billboards = [target, shot(1, 0, Math.PI), shot(0, 0, Math.PI)]
    fx.observe(scene, 1.01, true)
    fx.spell(scene, { ...hit, kind: 'magic' }, 1.012)
    fx.tick(scene, 1.02)
    expect(burst.spray).toBe(spray)
    expect(burst.spray?.direction).toEqual({ x: -1, y: 0 })
    expect(burst.born).toBeCloseTo(1.08)
    expect(sampleHitSpray(scene, burst, 1.079)).toEqual([])
    const particles = sampleHitSpray(scene, burst, 1.25)
    expect(particles.filter(p => p.x < 0).length / particles.length).toBeGreaterThan(0.6)
    expect(particles.some(p => p.x > 0)).toBe(true)
  })

  it('does not shed body material for unconfirmed projectile overlays, zero-damage casts, or utility spells', () => {
    const { scene, fx, target } = setup('skeleton')
    scene.billboards = [target, shot(-1, 0, 0), shot(0, 0, 0)]
    fx.observe(scene, 1, true)
    expect(fx.bursts).toEqual([])
    for (const kind of ['cold', 'heal', 'buff', 'debuff', 'teleport'] as const) {
      fx.spell(scene, { ...hit, kind, turn: scene.turn++ }, 1.01)
    }
    expect(fx.bursts.every(b => b.spray === undefined)).toBe(true)
  })

  it.each(['level', 'remote', 'still', 'hidden'] as const)('clears ranged splatters on %s changes', reset => {
    const { scene, fx } = setup()
    fx.hit(scene, hit, 1)
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'hidden') scene.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    fx.observe(scene, 1.1, reset !== 'still')
    expect(fx.visibleBursts(1.1)).toEqual([])
  })
})
