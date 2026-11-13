import type { DamageType, SpellEffect } from '@orbrun/scene'
import { namedEffect } from '@orbrun/scene-webtiles'

// These are damage results, unlike a status being applied or a spell starting.
const directDamage: readonly [RegExp, DamageType][] = [
  [/^(.+?) festers? in the toxic bog[.!]+$/, 'poison'],
  [/^(.+?)(?:'s|') minds? (?:is|are) blasted[.!]+$/, 'magic'],
  [/^Your minds? (?:is|are) blasted[.!]+$/, 'magic'],
  [/^(.+?) is blasted smooth[.!]+$/, 'magic'],
  [/^(.+?) (?:is|are) (?:dispelled|blasted by disruptive energy)[.!]+$/, 'magic'],
]

/** A named damaging effect and an explicit recipient; never a cast or a miss. */
export function spellDamage(sentence: string): { target: string; tone: DamageType; kind?: SpellEffect['kind'] } | undefined {
  const hit = /^(?:The|Your) (.+?) (?:weakly )?(?:hits?|pierces?|strikes?|burns?|engulfs?|freezes?|skewers?|pelts?|batters?|drowns?|envelops?|grips?|grasps?) (.+?)[.!]+$/.exec(sentence)
  if (hit) {
    const effect = namedEffect(hit[1])
    const tone = effect?.tone
    const target = hit[2].replace(/(?: but | for | with |, ).*$/, '').trim()
    if (tone && target && target !== 'your lifeless body') {
      // Chaos beams can explicitly report their rolled element in the result.
      const flavour = /(?:chaos|chaotic)/.test(hit[1]) && / with (fire|cold|poison|acid|electricity|negative energy)\b/.exec(sentence)
      const elements: Record<string, DamageType> = { fire: 'fire', cold: 'cold', poison: 'poison', acid: 'acid', electricity: 'electric', 'negative energy': 'magic' }
      return { target, tone: flavour ? elements[flavour[1]] : tone, kind: flavour ? elements[flavour[1]] : effect!.kind }
    }
  }
  for (const [pattern, tone] of directDamage) {
    const result = pattern.exec(sentence)
    if (result) return { target: result[1] ?? 'you', tone }
  }
}
