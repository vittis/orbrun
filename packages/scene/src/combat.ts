import type { Billboard, HitIntensity } from './index.js'

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

/** A single body-bump clock, independent of weapon type. Times are seconds. */
export function bumpTiming() {
  return { duration: 0.24, contact: 0.055 }
}

/** Anticipation, contact and recovery; the defender moves only after contact. */
export function bumpPose(elapsed: number, bumpSnap = 1) {
  const { duration, contact } = bumpTiming()
  if (elapsed < 0 || elapsed >= duration) return { lunge: 0, recoil: 0 }
  const snap = Number.isFinite(bumpSnap) ? Math.max(0, Math.min(1, bumpSnap)) : 1
  const impact = (elapsed - contact) / (duration - contact)
  const windup = 0.012, hold = 0.08 + snap * 0.12
  const recovery = Math.max(0, (impact - hold) / (1 - hold))
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const lunge = elapsed < windup ? -0.025 * Math.sin(elapsed / windup * Math.PI)
    : elapsed < contact ? (0.18 + snap * 0.04) * smooth((elapsed - windup) / (contact - windup))
      : (0.18 + snap * 0.04) * (1 - smooth(recovery))
  // Visual compression only: input and authoritative movement never pause.
  const rise = 0.22 - snap * 0.19
  const recoil = impact < 0 ? 0 : (0.025 + snap * 0.015) * (impact < rise
    ? 1 - (1 - impact / rise) ** 3
    : impact < rise + hold ? 1 : (1 - (impact - rise - hold) / (1 - rise - hold)) ** 3)
  return { lunge, recoil }
}
