import { describe, expect, it, vi } from 'vitest'
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
  it('fades in new terrain, clouds and prisms once, without treating charge/tile variants as spawns', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    scene.cells.get(cellKey(1, 0))!.life = { spawn: { kind: 'cold', style: 'crystal', family: 'DNGN_ICE_THORNS' } }
    const cloud: Billboard = { ...spell(2), kind: 'cloud', life: { spawn: { kind: 'cold', style: 'cloud', family: 'CLOUD_COLD' } } }
    const prism: Billboard = { ...target, x: 3, id: 9, life: { spawn: { kind: 'magic', style: 'summon', family: 'MONS_FULMINANT_PRISM' } } }
    scene.billboards = [cloud, prism]
    fx.observe(scene, 1, true)
    expect(fx.spawns.effects.map(e => e.style)).toEqual(['crystal', 'cloud', 'summon'])
    expect(fx.spawns.entrance(cloud, 1)).toBeGreaterThan(0)
    expect(fx.spawns.entrance(cloud, 1)).toBeLessThan(1)
    expect(fx.spawns.entrance(prism, 1.3)).toBe(1)
    prism.tile++; cloud.tile++
    fx.observe(scene, 1.1, true)
    expect(fx.spawns.effects.every(e => e.born === 1)).toBe(true)
    fx.tick(scene, 1.4)
    expect(fx.spawns.effects).toEqual([])
    expect(fx.bursts).toEqual([])
    expect(fx.hits.active).toBe(false)
  })

  it('keeps expanding explosions at their confirmed cells, even when updates arrive before a draw', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.cells.set(cellKey(1, 1), { ...scene.cells.get(cellKey(1, 0))!, y: 1 })
    const explosion = (x: number, y = 0): Billboard => ({ ...spell(x), y,
      life: { projectile: { kind: 'magic', colour: [255, 70, 50], beam: true, family: 'BOLT_DEFAULT_RED' } } })
    fx.observe(scene, 0, true)
    scene.billboards = [explosion(1), explosion(2)]
    fx.observe(scene, 1, true) // provisional straight path
    scene.billboards.push(explosion(1, 1))
    fx.observe(scene, 1.001, true)
    expect(fx.projectiles(1.02)).toEqual([])
    expect(fx.spawns.effects).toHaveLength(3)
    expect(fx.spawns.effects.every(e => e.kind === 'fire')).toBe(true)
    scene.billboards = [{ ...target, x: 2, id: 7 }]
    fx.observe(scene, 1.002, true)
    for (const time of [1.02, 1.08, 1.12]) {
      expect(fx.spawns.overlays(scene, time).map(b => [b.x, b.y])).toEqual([[1, 0], [2, 0], [1, 1]])
      expect(fx.projectiles(time)).toEqual([])
    }
    fx.tick(scene, 1.4)
    expect(fx.spawns.overlays(scene, 1.4)).toEqual([])
    expect(fx.bursts).toEqual([])
    scene.billboards = [explosion(1), explosion(2)]
    fx.observe(scene, 2, true)
    expect(fx.projectiles(2.02)).toHaveLength(1) // later straight missile remains a missile
  })

  it('keeps bent specialised bolts out of the generic explosion classifier', () => {
    const fx = new DungeonEffects(), scene = world()
    scene.cells.set(cellKey(2, 1), { ...scene.cells.get(cellKey(2, 0))!, y: 1 })
    fx.observe(scene, 0, true)
    scene.billboards = [[1, 0], [2, 0], [2, 1]].map(([x, y]) => ({ ...spell(x), y,
      life: { projectile: { kind: 'electric', colour: [150, 190, 255], beam: true, family: 'BOLT_STRONG_ELEC' } } }))
    fx.observe(scene, 1, true)
    expect(fx.projectiles(1.02).length).toBeGreaterThan(0)
    expect(fx.spawns.effects).toEqual([])
    expect(fx.spawns.overlays(scene, 1.02)).toEqual([])
  })

  it('fades the latest native tile on removal, even after its entrance has expired', () => {
    const fx = new DungeonEffects(), scene = world()
    const cloud: Billboard = { ...spell(1), kind: 'cloud', life: { spawn: { kind: 'cold', style: 'cloud', family: 'CLOUD_COLD' } } }
    fx.observe(scene, 0, true)
    scene.billboards = [cloud]; fx.observe(scene, 1, true)
    fx.tick(scene, 1.5)
    cloud.tile = 12; fx.observe(scene, 2, true)
    scene.billboards = []; fx.observe(scene, 3, true)
    cloud.tile = 99 // the reducer can reuse a mutable billboard after removal
    expect(fx.spawns.departures(3.02)).toMatchObject([{ billboard: { tile: 12, x: 1, y: 0 } }])
    const alpha = fx.spawns.departures(3.02)[0].alpha
    expect(alpha).toBeGreaterThan(0)
    expect(fx.spawns.departures(3.05)[0].alpha).toBeLessThan(alpha)
    fx.observe(scene, 3.06, true) // unrelated updates do not restart the exit
    expect(fx.spawns.departures(3.09)).toEqual([])
    expect(fx.bursts).toEqual([])
  })

  it.each(['initial', 'reveal', 'level', 'remote', 'still'] as const)('does not invent a spawn on %s', reset => {
    const fx = new DungeonEffects(), scene = world(), cell = scene.cells.get(cellKey(1, 0))!
    if (reset === 'reveal') cell.visibility = 'remembered'
    if (reset !== 'initial') fx.observe(scene, 0, true)
    cell.life = { spawn: { kind: 'cold', style: 'crystal', family: 'DNGN_ICE_THORNS' } }
    cell.visibility = 'visible'
    if (reset === 'level') scene.levelKey = 'D:2'
    if (reset === 'remote') scene.playerOnLevel = false
    fx.observe(scene, 1, reset !== 'still')
    expect(fx.spawns.effects).toEqual([])
  })

  it('expires entrance effects on loss of visibility and permits a new spawn after removal', () => {
    const fx = new DungeonEffects(), scene = world(), cell = scene.cells.get(cellKey(1, 0))!
    fx.observe(scene, 0, true)
    cell.life = { spawn: { kind: 'cold', style: 'crystal', family: 'DNGN_ICE_THORNS' } }
    fx.observe(scene, 1, true)
    cell.visibility = 'remembered'; fx.observe(scene, 1.05, true)
    expect(fx.spawns.effects).toEqual([])
    cell.visibility = 'visible'; fx.observe(scene, 1.1, true)
    expect(fx.spawns.effects).toEqual([])
    const life = cell.life
    cell.life = undefined; fx.observe(scene, 1.2, true)
    cell.life = life; fx.observe(scene, 1.3, true)
    expect(fx.spawns.effects).toMatchObject([{ born: 1.3 }])
  })
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
  it.each(['slash', 'stab', 'thrust', 'cleave', 'reap', 'crush', 'lash', 'staff', 'unarmed'] as const)('keeps %s gesture variations on the existing material-spray contact clock', style => {
    const scene = world(), fx = new DungeonEffects()
    scene.billboards = [player, { ...target, id: 7, name: 'jelly' }]
    fx.observe(scene, 0, true)
    let previous: number | undefined
    for (let i = 0; i < 6; i++) {
      const now = 1 + i, contact = now + meleeTiming(style).contact
      scene.turn = i
      fx.tick(scene, now)
      fx.melee(scene, { ...attack, style, fromId: 'player', toId: 'id:7' }, now)
      const stroke = fx.strokes.at(-1)!
      expect(stroke.variant).not.toBe(previous)
      expect(stroke.duration).toBe(meleeTiming(style).duration)
      previous = stroke.variant
      fx.hit(scene, { x: 1, y: 0, actorId: 'id:7', turn: i }, contact)
      fx.spell(scene, { x: 1, y: 0, actorId: 'id:7', turn: i, kind: 'fire' }, contact)
      expect(fx.visibleBursts(contact - 0.001)).toEqual([])
      expect(fx.visibleBursts(contact)).toMatchObject([{ born: contact, duration: 0.65, spray: { kind: 'slime', source: 'melee' } }])
      expect(fx.bursts).toHaveLength(1)
    }
  })

  it('captures attack heading once, independently of mutable actor anchors', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    const movingAttack = { ...attack, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }
    fx.melee(scene, movingAttack, 1)
    movingAttack.to.y = 1
    fx.observe({ ...scene, billboards: [{ ...target, y: 1 }] }, 1.1, true)
    expect(fx.strokes[0].heading).toEqual({ x: 1, y: 0 })
    expect(fx.strokes[0].to).toEqual({ x: 1, y: 0 })
  })

  it('can plant actors or reduce their motion without changing strike timing', () => {
    const scene = world(), fx = new DungeonEffects()
    fx.melee(scene, attack, 1)
    const time = 1 + meleeTiming('slash').contact
    expect(fx.offset(player, time).x).toBeGreaterThan(0)
    expect(fx.offset(player, time, 0)).toEqual({ x: 0, y: 0 })
    expect(fx.offset(player, time, 0.35).x).toBeCloseTo(fx.offset(player, time).x * 0.35)
    expect(fx.strokes[0].born).toBe(1)
  })

  it('interpolates one head along the native path without guessing another impact', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const x of [1, 2, 3]) fx.observe({ ...scene, billboards: [spell(x)] }, 1, true)
    fx.observe(scene, 1.001, true)
    const travel = fx.projectiles(1.016)
    expect(travel).toHaveLength(1)
    expect(travel[0].x).toBeGreaterThan(0)
    expect(travel[0].x).toBeLessThan(1)
    expect(fx.projectiles(1.12)).toMatchObject([{ x: 3, y: 0 }])
    fx.tick(scene, 1.2)
    expect(fx.projectiles(1.2)).toEqual([])
    expect(fx.bursts).toEqual([])
    expect(fx.traces).toEqual([])
  })

  it.each(['visibility', 'level', 'still', 'remote'])('clears hybrid projectile art on %s', reset => {
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

  it('uses the native batch delay once, lands on the recipient, and shares one impact clock', () => {
    const fx = new DungeonEffects(), scene = world()
    const victim = { ...target, id: 7, x: 3 }
    scene.billboards = [victim]; scene.projectileTime = 0
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [victim, spell(1), spell(2), spell(3)] }, 1, true)
    fx.observe({ ...scene, projectileTime: 0.03 }, 1.001, true)
    fx.spell(scene, { x: 3, y: 0, actorId: 'id:7', kind: 'cold', turn: 1 }, 1.002)
    fx.hit(scene, { x: 3, y: 0, actorId: 'id:7', turn: 1 }, 1.002)
    fx.spell(scene, { x: 3, y: 0, kind: 'physical' }, 1.003, 'generic')
    expect(fx.projectiles(1.035)).toMatchObject([{ x: expect.closeTo(1.5), targetId: 'id:7' }])
    expect(fx.visibleBursts(1.069)).toHaveLength(0)
    expect(fx.hits.brightness('id:7', 1.069)).toBe(1)
    expect(fx.projectiles(1.08)).toMatchObject([{ x: 3, targetId: 'id:7', contactBlend: 1 }])
    expect(fx.visibleBursts(1.08)).toMatchObject([{ actorId: 'id:7', kind: 'cold', born: 1.07 }])
    expect(fx.hits.brightness('id:7', 1.08)).toBeGreaterThan(1)
    expect(fx.bursts).toHaveLength(1)
    fx.tick(scene, 1.14)
    expect(fx.projectiles(1.14)).toEqual([])
    fx.tick(scene, 1.24)
    expect(fx.hits.active).toBe(false)
  })

  it('does not relaunch a displayed incoming projectile from its recipient', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    fx.observe({ ...scene, billboards: [spell(1)] }, 1, true)
    expect(fx.projectiles(1.01)).toMatchObject([{ x: 1 }])
    fx.observe({ ...scene, billboards: [spell(0)] }, 1.02, true)
    const travel = fx.projectiles(1.025)
    expect(travel).toHaveLength(1)
    expect(travel[0].x).toBeLessThan(1)
    expect(travel[0].x).toBeGreaterThanOrEqual(0)
  })

  it('keeps separate casts and their native clear boundaries separate', () => {
    const fx = new DungeonEffects(), scene = world()
    fx.observe(scene, 0, true)
    for (const time of [1, 1.01]) {
      fx.observe({ ...scene, billboards: [spell(1), spell(2)] }, time, true)
      fx.observe(scene, time + 0.001, true)
    }
    expect(fx.projectiles(1.02)).toHaveLength(2)
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

  it.each(['slash', 'stab', 'thrust', 'cleave', 'reap', 'crush', 'lash', 'staff', 'unarmed'] as const)('chooses %s variations once per accepted swing without consecutive repeats', style => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const fx = new DungeonEffects(), scene = world(), swing = { ...attack, style, fromId: 'player' }
      fx.observe(scene, 0, true)
      fx.melee(scene, swing, 1)
      expect(fx.strokes[0].variant).toBe(0)
      fx.melee(scene, swing, 1.02)
      expect(random).toHaveBeenCalledTimes(1)
      fx.tick(scene, 1.05); fx.offset(player, 1.05)
      expect(fx.strokes[0].variant).toBe(0)
      expect(random).toHaveBeenCalledTimes(1)
      // Even after the previous stroke expires, preserve the combo's variation.
      fx.tick(scene, 2)
      fx.melee(scene, swing, 2)
      expect(fx.strokes[0].variant).toBe(1)
      random.mockReturnValue(0.999)
      fx.melee(scene, swing, 2.1)
      expect(fx.strokes[1].variant).toBe(2)
      fx.melee(scene, swing, 2.2)
      expect(fx.strokes[2].variant).toBe(1)
      fx.clear()
      fx.melee(scene, swing, 3)
      expect(fx.strokes[0].variant).toBe(2)
    } finally { random.mockRestore() }
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
