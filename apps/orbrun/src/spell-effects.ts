import type { SpellEffect } from '@orbrun/scene'
import { formattedStringToText, type StatusEntry } from '@orbrun/webtiles'

export interface SpellCue { kind: SpellEffect['kind']; target?: string; player?: boolean; intensity?: SpellEffect['intensity'] }

// Crawl's confirmed result sentences. Never use cast prompts, selected spells,
// keypresses or MP expenditure: those also occur for cancelled/failed casts.
const targeted: [RegExp, SpellEffect['kind']][] = [
  [/^The (?:confined |open )?air twists around(?: weakly| violently)? and strikes (.+?)[.!]+$/, 'air'],
  [/^Flames lash (.+?)[.!]+$/, 'fire'],
  [/^(.+?) seems to burn from within[.!]+$/, 'fire'],
  [/^You (?:draw life force from|drain|vampirically drain) (.+?)[.!]+$/, 'drain'],
  [/^(.+?) (?:is|are) drained[.!]+$/, 'drain'],
  [/^You smite (.+?)[.!]+$/, 'holy'],
  [/^(.+?) (?:convulses|writhes in agony)[.!]+$/, 'drain'],
  [/^(.+?) (?:is|are) struck by an? (?:arc of lightning|electric surge)[.!]+$/, 'electric'],
  [/^The electricity discharges through (.+?)[.!]+$/, 'electric'],
  [/^(.+?) (?:is|are) blasted with magical radiation[.!]+$/, 'magic'],
  [/^(.+?) shatters[.!]+$/, 'earth'],
  [/^(.+?) (?:is|are) (?:dispelled|blasted by disruptive energy)[.!]+$/, 'magic'],
  [/^(.+?) (?:is|are) (?:confused|mesmerised|paralysed|petrified|blinded|dazzled|bewildered|seared|slowed)[.!]+$/, 'debuff'],
  [/^(.+?) (?:looks? drowsy|falls? asleep|seems? to slow down|stops? moving altogether|suddenly stops? moving|begins? to turn to stone|appears? confused|looks? frightened)[.!]+$/, 'debuff'],
  [/^(.+?) (?:resists?|struggles? to resist)(?: with .+)?[.!]+$/, 'magic'],
  [/^Poisonous fumes billow around (.+?)[.!]+$/, 'poison'],
  [/^You (?:heal|restore|revitalise) (.+?)[.!]+$/, 'heal'],
  [/^You (?:beckon|attract) (.+?)[.!]+$/, 'teleport'],
]
const personal: [RegExp, SpellEffect['kind']][] = [
  [/^You (?:begin to radiate toxic energy|spew toxic sludge)[.!]+$/, 'poison'],
  [/^You (?:erupt in a fountain of uncontrolled magic|erupt in a blast of force)[.!]+$/, 'magic'],
  [/^The (?:heat is drained from your surroundings|walls around you are covered in ice)[.!]+$/, 'cold'],
  [/^You (?:discharge a tremendous surge of electricity|begin accumulating electric charge)[.!]+$|^Electricity surges outward[.!]+$/, 'electric'],
  [/^You (?:feel (?:quick|yourself speed up|protected|more buoyant)|fade into invisibility)[.!]+$/, 'buff'],
  [/^You (?:blink|teleport)[.!]+$|^Your surroundings (?:suddenly seem different|flicker for a moment)[.!]+$/, 'teleport'],
  [/^You (?:feel better|are healed)[.!]+$/, 'heal'],
  [/^The dungeon shakes[.!]+$/, 'earth'],
  [/^A film of ice covers your body[.!]+$/, 'cold'],
  [/^You (?:summon|conjure|call forth|create|animate|raise) .+[.!]+$/, 'magic'],
  [/^You emit a dazzling flash of light[.!]+$/, 'magic'],
  [/^You radiate an aura of cold[.!]+$/, 'cold'],
  [/^You are frozen[.!]+$|^(?:The|Your) .+? (?:freezes|chills) you[.!]+$/, 'cold'],
  [/^You are (?:burned|burnt|scorched)[.!]+$|^(?:The|Your) .+? (?:burns|scorches) you[.!]+$/, 'fire'],
  [/^(?:Something|The .+?) smites you[.!]+$/, 'holy'],
  [/^Pain shoots through your body[.!]+$|^You feel your life force draining away[.!]+$/, 'drain'],
  [/^Your mind is blasted[.!]+$/, 'magic'],
]

/** Coordinates are resolved against visible actors by CombatFeedback. */
export function spellText(text: string): SpellCue[] {
  const cues: SpellCue[] = []
  for (const sentence of formattedStringToText(text).trim().split(/(?<=[.!?])\s+/)) {
    let found = false
    for (const [re, kind] of targeted) {
      const m = re.exec(sentence)
      if (!m) continue
      const target = m[1].replace(/(?: but | for | with |, ).*$/, '').trim()
      cues.push({ kind, target, player: /^(?:you|yourself)$/i.test(target) })
      found = true
      break
    }
    if (found) continue
    const rule = personal.find(([re]) => re.test(sentence))
    if (rule) cues.push({ kind: rule[1], player: true })
  }
  return cues
}

const statusEffects = [
  [/pois|poison/i, 'poisoned', 'debuff'], [/conf/i, 'confused', 'debuff'],
  [/paral/i, 'paralysed', 'debuff'], [/slow/i, 'slowed', 'debuff'],
  [/haste|fast/i, 'hasted', 'buff'], [/berserk/i, 'berserk', 'buff'],
  [/corro/i, 'corroded', 'debuff'], [/petr/i, 'petrifying', 'debuff'],
  [/invis/i, 'invisible', 'buff'], [/silence|silenced/i, 'silenced', 'buff'],
  [/held|net|web/i, 'held', 'debuff'],
] as const

/** Stable status identities avoid retriggering effects as countdowns/strength change. */
export function spellStatuses(entries: StatusEntry[]): Map<string, SpellEffect['kind']> {
  const result = new Map<string, SpellEffect['kind']>()
  for (const entry of entries) {
    const text = entry.light || entry.text || ''
    const matched = statusEffects.find(([re]) => re.test(text))
    if (matched) { result.set(matched[1], matched[2]); continue }
    const kind: SpellEffect['kind'] | undefined = /icy armour|ozocubu|rampart/i.test(text) ? 'cold'
      : /toxic radiance|toxic bog/i.test(text) ? 'poison'
      : /charge|discharge|coupling/i.test(text) ? 'electric'
      : /swiftness|swift|flight|flying|repel|resist|shroud|regenerat|regen|death.s door|death channel|infusion|song|heroism|finesse|might|brilliance|agility|divine|vitali[sz]|wereblood/i.test(text) ? 'buff'
      : /\bform\b|necromutation|lich|transmut|transform/i.test(text) ? 'magic' : undefined
    if (kind) result.set(text, kind)
  }
  return result
}
