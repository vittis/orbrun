import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, meleeTiming, type DeathKind, type MeleeAttack, type SceneCell } from '@orbrun/scene'
import { DungeonEffects } from '../src/effects.js'
import { sampleMeleeSpray } from '../src/melee-spray.js'
import { debrisPalettes, DungeonDeaths } from '../src/death.js'

const materials: [string, DeathKind, string][] = [
  ['orc', 'flesh', 'drop'], ['skeleton', 'bone', 'shard'], ['jelly', 'slime', 'drop'],
  ['stone golem', 'stone', 'chip'], ['phantom', 'spirit', 'wisp'], ['fire elemental', 'fire', 'wisp'],
  ['ice beast', 'ice', 'shard'], ['thorn hunter', 'plant', 'chip'], ['hornet', 'insect', 'drop'],
  ['water elemental', 'water', 'drop'],
]
const attack: MeleeAttack = { from: { x: -1, y: 0 }, to: { x: 0, y: 0 }, toId: 'id:7', style: 'slash', hit: true }
const contact = 1 + meleeTiming(attack.style).contact
function setup(name = 'orc') {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
    x, y, visibility: 'visible', kind: 'floor', occluder: false, floorTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  scene.billboards = [{ id: 7, kind: 'monster', name, x: 0, y: 0, tile: 1, height: 0.8 }]
  const fx = new DungeonEffects()
  fx.observe(scene, 0, true)
  return { scene, fx }
}

describe('subtle directional melee sprays', () => {
  it.each(materials)('gives %s its own body material without a generic contact flash', (name, kind, sprite) => {
    const { scene, fx } = setup(name)
    fx.melee(scene, attack, 1)
    const burst = fx.bursts[0]
    expect(burst.spray?.kind).toBe(kind)
    expect(sampleMeleeSpray(scene, burst, contact - 0.001)).toEqual([])
    const particles = sampleMeleeSpray(scene, burst, contact)
    expect(particles.length).toBeGreaterThanOrEqual(4)
    expect(particles.length).toBeLessThanOrEqual(12)
    expect(particles.every(p => p.sprite === sprite && p.size < 0.04 && !p.ground && p.z > 0.2)).toBe(true)
    expect(particles.every(p => debrisPalettes[kind].includes(p.colour))).toBe(true)
    expect(sampleMeleeSpray(scene, burst, contact + 0.5)).toEqual([])
    const death = new DungeonDeaths()
    death.observe(scene, true)
    death.spawn(scene, { actorId: 'id:7', kind, x: 0, y: 0, height: 0.8, direction: { x: 1, y: 0 } }, contact)
    expect(particles.length).toBeLessThan(death.sample(scene, contact).length / 2)
  })

  it.each([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]])('sprays away from the attacker along (%i, %i)', (dx, dy) => {
    const { scene, fx } = setup()
    fx.melee(scene, { ...attack, from: { x: -dx, y: -dy } }, 1)
    const particles = sampleMeleeSpray(scene, fx.bursts[0], contact + 0.18)
    expect(particles.length).toBeGreaterThan(0)
    expect(particles.every(p => p.x * dx + p.y * dy > 0.1)).toBe(true)
  })

  it('varies repeated hits on the same body while keeping redraws stable and debris detached', () => {
    const { scene, fx } = setup()
    const counts = new Set<number>(), speeds = new Set<number>(), shapes = new Set<string>()
    for (let i = 0; i < 24; i++) {
      const now = 1 + i, time = now + meleeTiming(attack.style).contact + 0.15
      scene.turn = i
      fx.tick(scene, now)
      fx.melee(scene, attack, now)
      const burst = fx.bursts.at(-1)!
      const particles = sampleMeleeSpray(scene, burst, time)
      counts.add(particles.length)
      speeds.add(Math.round(particles.reduce((sum, p) => sum + p.x, 0) / particles.length * 100))
      shapes.add(JSON.stringify(particles.map(p => [p.x, p.y, p.size])))
      expect(sampleMeleeSpray(scene, burst, time)).toEqual(particles)
      burst.x = 1
      expect(sampleMeleeSpray(scene, burst, time, { x: 1, y: 0 })).toEqual(particles)
    }
    expect(counts.size).toBeGreaterThan(3)
    expect(speeds.size).toBeGreaterThan(5)
    expect(shapes.size).toBe(24)
  })

  it('keeps the spray through duplicate reports and brand updates without changing its seed or contact clock', () => {
    const { scene, fx } = setup('skeleton')
    fx.melee(scene, attack, 1)
    const spray = fx.bursts[0].spray
    fx.melee(scene, attack, 1.02)
    fx.spell(scene, { x: 0, y: 0, actorId: 'id:7', kind: 'fire' }, contact)
    fx.spell(scene, { x: 0, y: 0, kind: 'physical' }, contact, 'generic')
    expect(fx.bursts).toHaveLength(1)
    expect(fx.bursts[0]).toMatchObject({ born: contact, duration: 0.5, kind: 'fire', spray: { kind: 'bone' } })
    expect(fx.bursts[0].spray).toBe(spray)
  })

  it('does not spray on misses and clips droplets at hidden cells and walls', () => {
    const { scene, fx } = setup()
    fx.melee(scene, { ...attack, hit: false }, 1)
    expect(fx.bursts).toEqual([])
    fx.melee(scene, attack, 2)
    const burst = fx.bursts[0]
    scene.cells.get(cellKey(1, 0))!.occluder = true
    scene.cells.get(cellKey(0, 1))!.visibility = 'remembered'
    for (const t of [0, 0.15, 0.3, 0.45]) {
      expect(sampleMeleeSpray(scene, burst, burst.born + t).every(p => {
        const cell = scene.cells.get(cellKey(Math.round(p.x), Math.round(p.y)))!
        return cell.visibility === 'visible' && !cell.occluder
      })).toBe(true)
    }
  })

  it.each(['level', 'remote', 'still', 'hidden'] as const)('cleans up melee spray on %s changes', reset => {
    const { scene, fx } = setup()
    fx.melee(scene, attack, 1)
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    if (reset === 'hidden') scene.cells.get(cellKey(0, 0))!.visibility = 'remembered'
    fx.observe(scene, contact + 0.1, reset !== 'still')
    expect(fx.visibleBursts(contact + 0.1)).toEqual([])
  })
})
