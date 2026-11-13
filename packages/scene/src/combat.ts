import type { Billboard, HitIntensity, MeleeAttack } from './index.js'

/** Match motion to an actor even when a server omits a numeric monster ID. */
export function combatActorId(b: Billboard) {
  if (b.kind === 'player') return 'player'
  const id = b.id ?? (b.ref as { id?: number } | undefined)?.id
  const name = (b.name ?? '').toLowerCase().replace(/^(?:the |an? |your )/, '').trim()
  return id === undefined ? `cell:${b.x},${b.y}:${name}` : 'id:' + id
}

/** Qualitative message strength only; punctuation never supplies an HP amount. */
export function hitIntensity(damage: number | undefined, punctuation = '.'): HitIntensity {
  if (damage !== undefined) return damage >= 18 ? 'heavy' : damage >= 7 ? 'solid' : 'light'
  return punctuation.includes('!!') ? 'heavy' : punctuation.includes('!') ? 'solid' : 'light'
}

export const impactStrength = (intensity: HitIntensity = 'light') => intensity === 'heavy' ? 1 : intensity === 'solid' ? 0.6 : 0.3

/** Seconds on the renderer clock. All melee feedback shares this contact point. */
export function meleeTiming(style: MeleeAttack['style']) {
  const duration = style === 'crush' || style === 'cleave' ? 0.4 : style === 'reap' ? 0.44 : style === 'stab' || style === 'unarmed' ? 0.26 : style === 'lash' ? 0.36 : 0.32
  return { duration, contact: duration * 0.42 }
}

/** Anticipation, contact and recovery; the defender moves only after contact. */
export function meleePose(style: MeleeAttack['style'], elapsed: number, bumpSnap = 1) {
  const { duration, contact } = meleeTiming(style)
  const age = elapsed / duration, impact = (elapsed - contact) / (duration - contact)
  const lunge = age < 0 || age >= 1 ? 0 : age < 0.16 ? -0.025 * Math.sin(age / 0.16 * Math.PI)
    : elapsed < contact ? 0.15 * ((age - 0.16) / (0.42 - 0.16)) ** 2 : 0.15 * (1 - impact) ** 2
  // A fast kick, brief compression, then a clean settle. This is visual pose
  // only: never pause input, the renderer clock, or confirmed server movement.
  const snap = Number.isFinite(bumpSnap) ? Math.max(0, Math.min(1, bumpSnap)) : 1
  const rise = 0.25 - snap * 0.19, hold = snap * 0.1
  const recoil = impact < 0 || impact >= 1 ? 0 : 0.16 * (impact < rise
    ? 1 - (1 - impact / rise) ** 3
    : impact < rise + hold ? 1 : (1 - (impact - rise - hold) / (1 - rise - hold)) ** 3)
  return { lunge, recoil }
}
