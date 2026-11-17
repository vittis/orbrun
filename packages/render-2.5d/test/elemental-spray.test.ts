import { describe, expect, it } from 'vitest'
import { cellKey, emptyScene, type SceneCell } from '@orbrun/scene'
import { sampleElementalSpray, elementalPalettes } from '../src/elemental-spray'
import { DungeonDeaths, debrisPalettes } from '../src/death'
import { sampleHitSpray } from '../src/hit-spray'
import type { SpellBurst } from '../src/effects'

function room() {
  const scene = { ...emptyScene(), playerOnLevel: true, levelKey: 'D:1' }
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) scene.cells.set(cellKey(x, y), {
    x, y, kind: 'floor', visibility: 'visible', occluder: false, floorTile: 1, flags: { water: false, lava: false },
  } as SceneCell)
  return scene
}
const origin = { x: 0, y: 0 }, direction = { x: 1, y: 0 }
const elements = ['electric', 'fire', 'cold', 'poison', 'acid', 'magic'] as const

describe('distinct elemental signatures', () => {
  it('uses forked airborne lightning instead of ice shards, with deterministic local rerouting', () => {
    const scene = room()
    const sample = (t: number) => sampleElementalSpray(scene, origin, direction, 1, 'electric', 'heavy', 7, t, false, 1, 1, 0.25)
    const early = sample(0.05), later = sample(0.14)
    expect(early.length).toBeGreaterThanOrEqual(10)
    expect(early.every(p => ['lightning', 'lightningFork'].includes(p.sprite) && !p.ground && p.minPixels! >= 10)).toBe(true)
    expect(early.some(p => p.minPixels! >= 14)).toBe(true)
    expect(later.map(p => [p.sprite, p.angle, p.alpha])).not.toEqual(early.map(p => [p.sprite, p.angle, p.alpha]))
    expect(sample(0.14)).toEqual(later)
    expect(sample(0.31)).toEqual([])
  })

  it('gives every element a different silhouette mix and keeps poison vapour distinct from acid streaks', () => {
    const scene = room(), silhouettes = new Set<string>()
    for (const kind of elements) {
      const particles = sampleElementalSpray(scene, origin, direction, 1, kind, 'solid', 7, 0.12, false, 1, 1, 0.25)
      expect(particles.length).toBeGreaterThanOrEqual(10)
      expect(particles.every(p => p.minPixels! >= 8 && elementalPalettes[kind].includes(p.colour))).toBe(true)
      silhouettes.add([...new Set(particles.map(p => p.sprite))].sort().join(','))
      if (kind === 'poison') expect(particles.map(p => p.sprite)).toEqual(expect.arrayContaining(['bubble', 'wisp']))
      if (kind === 'acid') expect(particles.every(p => p.sprite === 'spit' && p.stretch > 1.5)).toBe(true)
    }
    expect(silhouettes.size).toBe(elements.length)
  })

  it.each(elements)('reserves %s particles and floor splatter inside the maximum hit/death budgets', kind => {
    const scene = room()
    const burst: SpellBurst = { ...origin, kind, intensity: 'heavy', born: 0, requested: 0, duration: 0.3, source: 'confirmed',
      spray: { kind: 'flesh', source: 'ranged', height: 1, seed: 7, direction } }
    const hit = sampleHitSpray(scene, burst, 0.1, undefined, 2, 1, 1)
    expect(hit.length).toBeLessThanOrEqual(96)
    expect(hit.filter(p => elementalPalettes[kind].includes(p.colour)).length).toBeGreaterThanOrEqual(20)
    expect(hit.some(p => debrisPalettes.flesh.includes(p.colour))).toBe(true)
    const deaths = new DungeonDeaths()
    deaths.observe(scene, true)
    deaths.spawn(scene, { ...origin, actorId: 'id:7', kind: 'flesh', height: 1, direction, tone: kind, intensity: 'heavy' }, 0)
    const death = deaths.sample(scene, 0.15, 2, 1, 1)
    expect(death.length).toBeLessThanOrEqual(192)
    expect(death.filter(p => elementalPalettes[kind].includes(p.colour)).length).toBeGreaterThanOrEqual(20)
    expect(death.some(p => p.ground && p.sprite === 'splat' && p.size > 0.15)).toBe(true)
    expect(deaths.sample(scene, 4)).toEqual([])
  })

  it('clips the larger signatures at hidden cells and walls, including across thin occluders', () => {
    const scene = room()
    scene.cells.get(cellKey(1, 0))!.occluder = true
    scene.cells.get(cellKey(-1, 0))!.visibility = 'remembered'
    for (const kind of elements) {
      const particles = sampleElementalSpray(scene, origin, direction, 1, kind, 'heavy', 7, 0.2, true, 2, 1, 1)
      expect(particles.every(p => {
        const cell = scene.cells.get(cellKey(Math.round(p.x), Math.round(p.y)))!
        return cell.visibility === 'visible' && !cell.occluder && p.x < 1.5
      })).toBe(true)
    }
  })
})
