import type { DamageType, SpellEffect } from '@orbrun/scene'

// Confirmed beam names from Crawl's zap-data.h, mon-explode.cc and spell
// implementations (stable/trunk). Match whole effect names, never creature
// names, selected spells, casting messages or a general "blast" substring.
const beamTypes: readonly [RegExp, DamageType][] = [
  [/^(?:mystic blast|lance of force|(?:blast|bolt|beam|barrage|surge) of (?:energy|force|shadow|dispelling energy|devastation)|doom bolt|(?:large |wavering |large wavering )?orb of destruction|(?:explosive blast|surge|arc|blast) of chaos|chaotic barrage|condensed magic|nullifying energy|(?:destabilizing )?rupture|crushing gravity|concentrated momentum|phantom echo|(?:shard of hardened|ray of|wave of devouring) shadow|shadowball|creeping shadows?|shadowy lightning|shadow bullet|fragment of death|ghostly fireball|pyre of ghostly fire|bolt of (?:antimagic|negative energy|light)|blinding ray|blast of cleansing flame|golden flame|magic dart|glimmering dart|shooting star|gout of destruction|magical storm|unstable reaction|blood arrow|bolt of flesh|bomblet|fortress blast|seething chaos|umbral torchlight|vile air|drain life)$/, 'magic'],
  [/^(?:(?:rebounding )?bolt of (?:fire|magma)|(?:great )?blast of (?:fire|flame|magma)|puff of flame|fireball|fiery explosion|fiery (?:breath|plasma|blast)|flame (?:wave|surge)|searing ray|searing blast|concussive blast|foxfire|sticky flame|pyre arrow|blazing flames|glob of lava|damnation|explosive embers|burning spray|flurry of pyrophoric scales|scorching wind|detonation|ball of steam|fiery phlogiston)$/, 'fire'],
  [/^(?:(?:rebounding )?bolt of cold|puff of frost|(?:great )?(?:icy|frigid) blast|blast of (?:cold|ice)|(?:shard|shards|salvo) of (?:frigid |blighted )?(?:ice|icicles)|(?:icy )?flash freeze|piercing cold|glacial breath|freezing gust|iceblast|ice thorns|hail|seracfall|frost|freeze|refrigeration|frigid brine)$/, 'cold'],
  [/^(?:(?:bolt|blast|splash) of poison|poison (?:arrow|gas)|toxic sludge|sting|foul vapour|blast of putrescent gases|noxious sulphur)$/, 'poison'],
  [/^(?:(?:bolt|glob|ball|splash) of acid|acid spray|caustic explosion)$/, 'acid'],
  [/^(?:(?:bolt|blast|arc|orb) of (?:lightning|electricity)|living lightning|zap|stunning burst|thunderbolt|plasma beam|shock of your passage|flickering plasma)$/, 'electric'],
  [/^(?:blast of (?:sand|wind|rock|rubble|(?:rock|jade|bone|petrified|metal|iron|silver|crystal|stone|toenail|salt crystal|platinum|glass|orange crystal|obsidian|diamond|sapphire) (?:fragments|shards))|burst of rock shards|spray of (?:metal|wooden) splinters|stone arrow|iron shot|crystal spear|crystallising shot|mass of rock|rocky spike|falling rubble|pebble|slug dart|harpoon shot|kinetic grapnel|volley of (?:spikes|thorns)|jagged bones|flashing steel|shred|shockwave|sonic wave|beckoning whirlwind|seismic shockwave|cutting wind|ball of mud|(?:torrent of|grasping) water|whirling bolas|glob of mercury|swarm of vampire bats|rain of gore|dizzying spores|explosion of spores|klown pie|blast)$/, 'physical'],
]

/** Visual identity only: Searing Ray deliberately uses flame despite its untyped damage. */
export function namedEffect(name: string): { tone: DamageType; kind: SpellEffect['kind'] } | undefined {
  const tone = beamTypes.find(([pattern]) => pattern.test(name))?.[1]
  if (!tone) return
  const kind = /^(?:blast of wind|beckoning whirlwind|cutting wind|sonic wave)$/.test(name) ? 'air'
    : /^(?:blast of (?:sand|rock|rubble|.+ (?:fragments|shards))|burst of rock shards|stone arrow|crystal spear|crystallising shot|mass of rock|rocky spike|falling rubble|pebble|seismic shockwave)$/.test(name) ? 'earth'
    : /^(?:ghostly fireball|pyre of ghostly fire|fragment of death|bolt of negative energy|vile air|drain life)$/.test(name) ? 'drain'
    : /^(?:blast of cleansing flame|golden flame)$/.test(name) ? 'holy' : tone
  return { tone, kind }
}

/** Semantic overrides precede broad tile keywords (ghostly fire is not fire).
 * Default-colour tiles are ambiguous and deliberately have no element here. */
export function nativeEffectTone(name: string): Exclude<DamageType, 'physical'> | undefined {
  if (!/^(?:BOLT|CLOUD)_/.test(name)) return
  if (/GHOSTLY|SHADOW|UMBRAL|HOLY|CLEANSING|QUINTESSENCE|CONTAM|IRRADIATE/.test(name)) return 'magic'
  if (/FIERY_PLASMA|SCORCH|SIROCCO|SEARING|FIRE|FLAME|MAGMA|LAVA|IGNITE|HELLFIRE|DAMNATION|STEAM/.test(name) && !/FROSTFIRE/.test(name)) return 'fire'
  if (/ACID/.test(name)) return 'acid'
  if (/POISON|STING|VENOM|MEPHITIC|MIASMA/.test(name)) return 'poison'
  if (/COLD|FROST|ICE|ICICLE|FREEZ/.test(name)) return 'cold'
  if (/ELEC|LIGHTNING|ZAP|PLASMA|STORM/.test(name)) return 'electric'
  if (/MAGIC|MYSTIC|CHAOS|FORCE|WARP|TLOC|MUTAGEN/.test(name)) return 'magic'
}
