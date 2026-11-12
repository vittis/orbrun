import { hitIntensity, type MeleeAttack, type Scene, type DamageType, type HitIntensity } from '@orbrun/scene'
import type { CombatPopup } from './combat-feedback'

/** Inventory names include enchantments and brands; match the weapon noun. */
export function meleeStyle(weapon: string | undefined): MeleeAttack['style'] | null {
  if (!weapon) return 'unarmed'
  if (/\b(?:bow|longbow|shortbow|crossbow|arbalest|sling|hand cannon|triple crossbow)\b/i.test(weapon)) return null
  if (/\b(?:spear|trident|halberd|glaive|bardiche|scythe|lance|rapier|dagger|quick blade)\b/i.test(weapon)) return 'thrust'
  if (/\b(?:axe|battleaxe|executioner)\b/i.test(weapon)) return 'cleave'
  if (/\b(?:mace|flail|club|hammer|morningstar|eveningstar|whip|scourge|staff|quarterstaff)\b/i.test(weapon)) return 'crush'
  return 'slash'
}

/** Popups are optional; the same confirmed feedback drives melee in all 2.5D games. */
export function meleeFor(event: CombatPopup, scene: Scene, weapon: string | undefined): MeleeAttack | null {
  if (!event.melee || event.brandOnly || event.player || event.x === undefined || event.y === undefined) return null
  const style = meleeStyle(weapon)
  if (!style) return null
  const distance = Math.max(Math.abs(event.x - scene.player.x), Math.abs(event.y - scene.player.y))
  const reaching = /\b(?:spear|trident|halberd|glaive|bardiche|scythe|lance)\b/i.test(weapon ?? '')
  if (distance < 1 || distance > (reaching ? 2 : 1)) return null
  return { from: { ...scene.player }, to: { x: event.x, y: event.y }, style, hit: event.kind === 'hit' && event.amount !== 0, fromId: 'player', toId: event.actorId, tone: event.tone, intensity: event.intensity }
}

/** Only explicit physical contact verbs; spell/ranged prose never creates a lunge. */
export function incomingMelee(text: string): { attacker: string; style: MeleeAttack['style']; hit: boolean; tone: DamageType; intensity: HitIntensity }[] {
  const attempts: ReturnType<typeof incomingMelee> = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const m = /^(?:The|Your) (.+?) (?:(?:barely|closely|completely) )?(hits|bites|claws|pecks|stings|kicks|punches|tramples|headbutts|gores|tentacle-slaps|misses) you(?: with (.+?))?(?: but (?:does|do) no damage)?(?: for \d+(?: damage)?)?[.!]+$/.exec(sentence.trim())
    if (!m) continue
    const weapon = m[3]?.replace(/(?: but | for ).*$/, '')
    if (weapon && /\b(?:arrow|bolt|stone|dart|javelin|boomerang|sling bullet)\b/i.test(weapon)) continue
    const style = weapon ? meleeStyle(weapon) : 'unarmed'
    if (!style) continue
    const reported = / for (\d+)(?: damage)?[.!]/.exec(sentence)
    const hit = m[2] !== 'misses' && !/no damage/.test(sentence) && reported?.[1] !== '0'
    const intensity = hitIntensity(reported ? Number(reported[1]) : undefined, /[.!]+$/.exec(sentence)?.[0])
    attempts.push({ attacker: m[1], style, hit, tone: 'physical', intensity })
  }
  return attempts
}
