import type { Billboard, SceneCell, TileLife, TileLight, LifeMotion, ProjectileAppearance } from '@orbrun/scene'
import type { Gamedata, FlagWord } from '@orbrun/gamedata'
import type { GameState, MapCell } from '@orbrun/webtiles'

/** Name-based semantics follow the connected server's tile tables, including variants.
 * Inspired by super-dungeon-crawl's alive.js/light.js; no fixed tile numbers. */
export function tileLight(name: string): TileLight | undefined {
  if (/_GONE|_EXPIRED|_INACTIVE|DRY_FOUNTAIN|PETRIFIED|_CLOSED|BOLT_DEFAULT_BLACK/.test(name)) return
  const light = (colour: TileLight['colour'], radius: number, power: number, pulse: TileLight['pulse'] = 'slow'): TileLight => ({ colour, radius, power, pulse, transient: /^BOLT_|EXPLOSION|ZAP_/.test(name) || undefined })
  if (/TORCH|BRAZIER|CANDLE/.test(name)) return light([255, 158, 64], 4.2, 0.7, 'fire')
  if (/LAVA|MAGMA/.test(name)) return light([255, 78, 12], 3, 0.4)
  if (/FIRE|FLAME|IGNITE|SEARING|HELLFIRE|DAMNATION/.test(name)) return light([255, 118, 30], 2.8, 0.45, 'fire')
  if (/ELEC|LIGHTNING|PLASMA|BOLT_.*(?:ZAP|STORM|ARC)|BALL_LIGHTNING/.test(name)) return light([150, 190, 255], 3, 0.6, 'electric')
  if (/CLOUD_.*(?:COLD|FREEZ)|BOLT_.*(?:FROST|ICE|ICICLE)|ICE_BEAST|ICE_STATUE|ICE_ELEMENTAL|FROZEN_RAMPART/.test(name)) return light([140, 215, 255], 2.4, 0.3)
  if (/CLOUD_.*(?:POISON|MEPHITIC|ACID)|BOLT_.*(?:POISON|STING|ACID|VENOM)|TOXIC_BOG/.test(name)) return light([110, 255, 70], 2.2, 0.24)
  if (/HOLY|HALO|SANCTUARY|ANGEL|DAEVA/.test(name)) return light([255, 236, 190], 2.6, 0.34)
  if (/ALTAR/.test(name)) return light([255, 226, 170], 2.5, 0.25)
  if (/PORTAL|TRANSPORTER|TELEPORT|CONDUIT|GATEWAY|ORB|DISJUNCTION|WISP|GLOWING|SHINING|CLOUD_.*(?:MAGIC|CHAOS|TLOC|MUTAGEN)|BOLT_.*(?:MAGIC|MYSTIC|CHAOS|CRYSTAL|FORCE|WARP)/.test(name)) return light([185, 100, 255], 2.8, 0.34)
  if (/BOLT_.*(?:SHADOW|DRAIN|GLOOM|NEGATIVE)|UMBRA/.test(name)) return light([140, 60, 200], 2.2, 0.25)
  if (/FOUNTAIN/.test(name)) return light([90, 150, 255], 2.4, 0.25)
  const bolt = /^BOLT_DEFAULT_(BLUE|GREEN|CYAN|RED|MAGENTA|YELLOW|WHITE)/.exec(name)
  if (bolt) return light(({ BLUE: [80,110,255], GREEN: [90,255,90], CYAN: [80,240,255], RED: [255,70,50], MAGENTA: [255,80,255], YELLOW: [255,230,90], WHITE: [255,255,255] } as Record<string, TileLight['colour']>)[bolt[1]], 2.6, 0.55)
}

export function tileMotion(name: string): LifeMotion | undefined {
  if (/_GONE|_EXPIRED|_INACTIVE|DRY_FOUNTAIN|PETRIFIED/.test(name)) return
  if (/CLOUD/.test(name)) return 'cloud'
  if (/LAVA/.test(name)) return 'lava'
  if (/WATER|WAVE|SHORE/.test(name)) return 'water'
  if (/TORCH|FIRE|FLAME|BRAZIER/.test(name)) return 'flame'
  if (/TREE|MANGROVE|BUSH|PLANT/.test(name)) return 'plant'
  if (/GRASS|MOSS/.test(name)) return 'grass'
  if (/CRYSTAL|ICE_WALL|FROZEN/.test(name)) return 'crystal'
  if (/PORTAL|TRANSPORTER|TELEPORT|CONDUIT|GATEWAY/.test(name)) return 'portal'
  if (/ALTAR/.test(name)) return 'altar'
  if (/FOUNTAIN/.test(name)) return 'fountain'
  if (/BOG|MUD/.test(name)) return 'bog'
  if (/STAIRS_DOWN|HATCH_DOWN/.test(name)) return 'down'
  if (/STAIRS_UP|HATCH_UP|EXIT_DUNGEON/.test(name)) return 'up'
  if (/GOLD/.test(name)) return 'gold'
  if (/GEM/.test(name)) return 'gem'
  if (/POTION/.test(name)) return 'potion'
  if (/SCROLL|BOOK/.test(name)) return 'paper'
}

/** Projectile presentation is independent of emission: sand/rocks must not glow. */
export function projectileAppearance(name: string): ProjectileAppearance | false {
  if (/_GONE|_EXPIRED|_INACTIVE|BOLT_DEFAULT_BLACK/.test(name)) return false
  const appearance = (kind: ProjectileAppearance['kind'], colour: ProjectileAppearance['colour'], beam = false): ProjectileAppearance => ({ kind, colour, beam })
  if (/SANDBLAST|DUST|FRAG/.test(name)) return appearance('sand', [216, 181, 116])
  if (/STONE|ROCK|BOULDER/.test(name)) return appearance('stone', [184, 168, 137])
  if (/IRON|METAL|STEEL|SILVER|SLUG/.test(name)) return appearance('metal', [190, 200, 210])
  if (/AIR|WIND/.test(name)) return appearance('air', [196, 215, 222], true)
  if (/ACID/.test(name)) return appearance('acid', [177, 234, 89])
  if (/POISON|STING|VENOM|MEPHITIC/.test(name)) return appearance('poison', [110, 220, 85])
  if (/COLD|FROST|ICE|ICICLE|FREEZ/.test(name)) return appearance('cold', [140, 215, 255], /^BOLT_(?:FROST|COLD|ICE_BOLT)/.test(name))
  if (/ELEC|LIGHTNING|ZAP|PLASMA/.test(name)) return appearance('electric', [150, 190, 255], true)
  if (/FIRE|FLAME|MAGMA|IGNITE|SEARING|HELLFIRE|DAMNATION/.test(name)) return appearance('fire', [255, 118, 30], true)
  // Every server overlay gets a quiet fallback, including newly added bolts and
  // physical MI_* missiles. Never infer an attack from a selected spell or key.
  const glow = tileLight(name)
  return appearance('magic', glow?.colour ?? [194, 177, 218], /^BOLT_DEFAULT_|^BOLT_(?:DRAIN|SHADOW|NEGATIVE|FORCE_BOLT)/.test(name))
}

export function creatureLife(name: string, flags: FlagWord, b: Billboard): TileLife {
  const n = name.toUpperCase().replace(/ /g, '_')
  let motion: LifeMotion = /PLANT|TREE|BUSH|FUNGUS|OKLOB|LOTUS/.test(n) ? 'plant'
    : /STATUE|GOLEM|TURRET|GARGOYLE|BLOCK_OF_ICE|SALT|DEBRIS/.test(n) ? 'still'
    : /GHOST|WRAITH|SPECTRAL|PHANTOM/.test(n) ? 'float'
    : /ZOMBIE|SKELETON|MUMMY|GHOUL|LICH|WIGHT/.test(n) ? 'undead'
    : /JELLY|OOZE|SLIME|BLOB/.test(n) ? 'ooze'
    : /VORTEX|ELEMENTAL|TWISTER|BALL_LIGHTNING/.test(n) ? 'swirl'
    : /SNAKE|ADDER|VIPER|EEL|TENTACLE|NAGA/.test(n) ? 'serpent'
    : /SPIDER|BEE|ANT\b|BEETLE|ROACH|RAT\b|SCORPION/.test(n) ? 'skitter' : 'breath'
  const held = !!(flags.PARALYSED || flags.PETRIFIED || flags.NET || flags.WEB)
  let rate = flags.STAB ? 0.48 : flags.FLEEING ? 2.2 : b.attitude === 'friendly' ? 0.85 : b.attitude !== 'hostile' || flags.MAY_STAB ? 0.65 : 1.25
  let amplitude = flags.STAB ? 1.7 : b.threat === 'nasty' ? 1.3 : 1
  if (b.height >= 0.7) { rate *= 0.75; amplitude *= 1.3 }
  if (b.damage && b.damage !== 'uninjured') { rate *= 0.8; amplitude *= 0.8 }
  if (held) motion = 'still'
  const glow = tileLight('MONS_' + n)
  return { motion, held, rate, amplitude, flying: !!flags.FLYING, weary: !!b.damage && b.damage !== 'uninjured', fleeing: !!flags.FLEEING, lights: glow ? [glow] : undefined }
}

export function decorateLiving(cell: SceneCell, billboards: Billboard[], mc: MapCell, gd: Gamedata, state: GameState) {
  const t = mc.t
  const name = gd.dngn.baseName(gd.bg(t?.bg).value) ?? ''
  const light = tileLight(name)
  const lights = light ? [light] : []
  if (t?.halo || t?.sanctuary) lights.push({ colour: [255, 236, 190], radius: 2.2, power: 0.18, pulse: 'slow' })
  if (t?.orb_glow || t?.disjunct || t?.quad_glow) lights.push({ colour: [220, 100, 255], radius: 2.4, power: 0.25, pulse: 'slow' })
  cell.life = { motion: cell.flags.lava ? 'lava' : cell.flags.water ? 'water' : tileMotion(name), lights }
  for (const b of billboards) {
    const tileName = gd.main.baseName(b.tile) ?? gd.player.baseName(b.tile) ?? ''
    if (b.kind === 'monster') {
      b.life = creatureLife(b.name ?? tileName, gd.fg(t?.fg), b)
      b.life.wading = cell.flags.water
    }
    else {
      const glow = tileLight(tileName)
      b.life = { motion: b.kind === 'cloud' ? 'cloud' : b.kind === 'player' ? 'breath' : tileMotion(tileName), lights: glow ? [glow] : undefined,
        projectile: b.kind === 'projectile' ? projectileAppearance(tileName) : undefined }
    }
    if (b.kind === 'player') {
      const hp = state.player.hp / Math.max(1, state.player.hp_max)
      const status = state.player.status.map(s => s.light || s.text || '').join(' ')
      b.life = {
        ...b.life, motion: 'breath', rate: 0.8 + (1 - hp) * 1.2,
        amplitude: hp < 0.5 ? 0.8 : 1.1, wading: cell.flags.water,
        held: /paral|petrified|held|net|web/i.test(status),
      }
      if (/haste|fast|berserk/i.test(status)) b.life.rate! *= 1.6
      if (/slow/i.test(status)) b.life.rate! *= 0.6
    }
  }
}
