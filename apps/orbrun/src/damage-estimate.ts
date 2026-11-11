import type { WoundLevel } from '@orbrun/scene'

export interface DamageBand { min: number; max: number }

/** DCSS attack.h/attack_strength_punctuation: <7 '.', <18 '!', <36 '!!', then doubling. */
export function hitDamageBand(punctuation: string): DamageBand {
  const marks = Math.min(12, punctuation.replace(/[^!]/g, '').length)
  if (!marks) return { min: 1, max: 6 }
  if (marks === 1) return { min: 7, max: 17 }
  if (marks === 2) return { min: 18, max: 35 }
  const min = 36 * 2 ** (marks - 3)
  return { min, max: min * 2 - 1 }
}

const healthFractions: Record<WoundLevel, DamageBand> = {
  uninjured: { min: 1, max: 1 },
  lightly_damaged: { min: 0.8, max: 1 },
  moderately_damaged: { min: 0.6, max: 0.8 },
  heavily_damaged: { min: 0.4, max: 0.6 },
  severely_damaged: { min: 0.2, max: 0.4 },
  almost_dead: { min: 0, max: 0.2 },
}
const midpoint = (b: DamageBand) => (b.min + b.max) / 2
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function woundRank(wound: WoundLevel | undefined) {
  return wound ? Object.keys(healthFractions).indexOf(wound) : -1
}

/**
 * A deliberately approximate net-loss estimate. Average species HP is not an
 * individual's maximum HP. Wound intervals refine the message-strength prior
 * only when consistent; contradictory observations never manufacture a zero.
 * Sources: crawl/source/attack.{cc,h}, mon-util.cc mons_get_damage_level.
 */
export function estimateDamage(input: {
  bands: DamageBand[]
  averageHp?: number
  before?: WoundLevel
  after?: WoundLevel
  killed?: boolean
  knownDamage?: number
}): number | null {
  const { bands, before, after, killed } = input
  const known = input.knownDamage ?? 0
  const hp = input.averageHp
  const validHp = typeof hp === 'number' && Number.isFinite(hp) && hp > 0 && hp <= 1_000_000
  const strength = bands.length ? bands.reduce((sum, b) => ({ min: sum.min + b.min, max: sum.max + b.max }), { min: 0, max: 0 }) : null
  let guess = strength ? midpoint(strength) : null
  if (validHp && before && (after || killed)) {
    const start = healthFractions[before]
    const end = killed ? { min: 0, max: 0 } : healthFractions[after!]
    const loss = {
      min: Math.max(0, (start.min - end.max) * hp - known),
      max: Math.max(0, (start.max - end.min) * hp - known),
    }
    if (!strength) {
      if (!killed && woundRank(after) <= woundRank(before)) return null
      guess = midpoint(loss)
    } else {
      const low = Math.max(strength.min, loss.min)
      const high = Math.min(strength.max, loss.max)
      if (low <= high) guess = clamp(guess! * 0.6 + midpoint(loss) * 0.4, low, high)
    }
    // A killing blow's net loss cannot exceed the estimated remaining health.
    // Its attack roll may be much larger (overkill); exact reported rolls stay exact.
    if (killed && guess !== null) guess = Math.min(guess, Math.max(1, midpoint(start) * hp - known))
  }
  return guess !== null && Number.isFinite(guess) && guess > 0 ? Math.max(1, Math.round(guess)) : null
}
