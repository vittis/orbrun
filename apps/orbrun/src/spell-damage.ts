import type { DamageType } from '@orbrun/scene'

// Confirmed beam names from Crawl's zap-data.h, mon-explode.cc and spell
// implementations (stable/trunk). Match whole effect names, never creature
// names, selected spells, casting messages or a general "blast" substring.
const beamTypes: readonly [RegExp, DamageType][] = [
  [/^(?:mystic blast|searing ray|lance of force|(?:blast|bolt|beam|barrage|surge) of (?:energy|force|shadow|dispelling energy|devastation)|doom bolt|(?:large |wavering |large wavering )?orb of destruction|(?:explosive blast|surge|arc|blast) of chaos|chaotic barrage|condensed magic|nullifying energy|(?:destabilizing )?rupture|crushing gravity|concentrated momentum|phantom echo|(?:shard of hardened|ray of|wave of devouring) shadow|shadowball|creeping shadows?|shadowy lightning|shadow bullet|fragment of death|ghostly fireball|pyre of ghostly fire|bolt of (?:antimagic|negative energy|light)|blinding ray|blast of cleansing flame|golden flame)$/, 'magic'],
  [/^(?:(?:rebounding )?bolt of (?:fire|magma)|(?:great )?blast of (?:fire|flame|magma)|puff of flame|fireball|fiery explosion|fiery (?:breath|plasma|blast)|flame (?:wave|surge)|searing blast|concussive blast|foxfire|sticky flame|pyre arrow|blazing flames|glob of lava|damnation|explosive embers|burning spray|flurry of pyrophoric scales|scorching wind)$/, 'fire'],
  [/^(?:(?:rebounding )?bolt of cold|puff of frost|(?:great )?(?:icy|frigid) blast|blast of (?:cold|ice)|(?:shard|shards|salvo) of (?:frigid |blighted )?(?:ice|icicles)|(?:icy )?flash freeze|piercing cold|glacial breath|freezing gust|iceblast|ice thorns|hail|seracfall|frost)$/, 'cold'],
  [/^(?:(?:bolt|blast|splash) of poison|poison (?:arrow|gas)|toxic sludge|sting|foul vapour|blast of putrescent gases)$/, 'poison'],
  [/^(?:(?:bolt|glob|ball|splash) of acid|acid spray|caustic explosion)$/, 'acid'],
  [/^(?:(?:bolt|blast|arc|orb) of (?:lightning|electricity)|living lightning|zap|stunning burst|thunderbolt|plasma beam|shock of your passage)$/, 'electric'],
]

// These are damage results, unlike a status being applied or a spell starting.
const directDamage: readonly [RegExp, DamageType][] = [
  [/^(.+?) festers? in the toxic bog[.!]+$/, 'poison'],
  [/^(.+?)(?:'s|') minds? (?:is|are) blasted[.!]+$/, 'magic'],
  [/^Your minds? (?:is|are) blasted[.!]+$/, 'magic'],
  [/^(.+?) is blasted smooth[.!]+$/, 'magic'],
  [/^(.+?) (?:is|are) (?:dispelled|blasted by disruptive energy)[.!]+$/, 'magic'],
]

/** A named damaging effect and an explicit recipient; never a cast or a miss. */
export function spellDamage(sentence: string): { target: string; tone: DamageType } | undefined {
  const hit = /^(?:The|Your) (.+?) (?:weakly )?(?:hits?|pierces?|strikes?|burns?|engulfs?|freezes?|skewers?|pelts?|batters?|drowns?|envelops?|grips?|grasps?) (.+?)[.!]+$/.exec(sentence)
  if (hit) {
    const tone = beamTypes.find(([pattern]) => pattern.test(hit[1]))?.[1]
    const target = hit[2].replace(/(?: but | for | with |, ).*$/, '').trim()
    if (tone && target && target !== 'your lifeless body') {
      // Chaos beams can explicitly report their rolled element in the result.
      const flavour = /(?:chaos|chaotic)/.test(hit[1]) && / with (fire|cold|poison|acid|electricity|negative energy)\b/.exec(sentence)
      const elements: Record<string, DamageType> = { fire: 'fire', cold: 'cold', poison: 'poison', acid: 'acid', electricity: 'electric', 'negative energy': 'magic' }
      return { target, tone: flavour ? elements[flavour[1]] : tone }
    }
  }
  for (const [pattern, tone] of directDamage) {
    const result = pattern.exec(sentence)
    if (result) return { target: result[1] ?? 'you', tone }
  }
}
