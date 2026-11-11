import { describe, expect, it } from 'vitest'
import { estimateDamage, hitDamageBand } from '../src/damage-estimate'

describe('public-server damage estimates', () => {
  it('uses the actual punctuation thresholds, including the doubling strong-hit bands', () => {
    expect(['.', '!', '!!', '!!!', '!!!!'].map(hitDamageBand)).toEqual([
      { min: 1, max: 6 }, { min: 7, max: 17 }, { min: 18, max: 35 }, { min: 36, max: 71 }, { min: 72, max: 143 },
    ])
  })
  it('produces a deterministic positive prior without HP data', () => {
    expect(estimateDamage({ bands: [hitDamageBand('.')] })).toBe(4)
    expect(estimateDamage({ bands: [hitDamageBand('!')] })).toBe(12)
    expect(estimateDamage({ bands: [hitDamageBand('!!')] })).toBe(27)
  })
  it('uses a compatible wound transition to refine the estimate', () => {
    // Average 100 HP: full -> 60-80% implies a loss of 20-40, intersected with 18-35.
    const estimate = estimateDamage({ bands: [hitDamageBand('!!')], averageHp: 100, before: 'uninjured', after: 'moderately_damaged' })!
    expect(estimate).toBeGreaterThanOrEqual(20)
    expect(estimate).toBeLessThanOrEqual(35)
    expect(estimateDamage({ bands: [hitDamageBand('.')], averageHp: 20, before: 'uninjured', after: 'lightly_damaged' })).toBe(3)
  })
  it('never calls an unchanged wound category zero damage', () => {
    const amount = estimateDamage({ bands: [hitDamageBand('!')], averageHp: 100, before: 'moderately_damaged', after: 'moderately_damaged' })!
    expect(amount).toBeGreaterThanOrEqual(7)
    expect(amount).toBeLessThanOrEqual(17)
  })
  it('falls back to attack strength when average HP conflicts with an observation', () => {
    expect(estimateDamage({ bands: [hitDamageBand('!!')], averageHp: 10, before: 'uninjured', after: 'lightly_damaged' })).toBe(27)
    for (const averageHp of [undefined, NaN, Infinity, -5, 0, 1e10]) expect(estimateDamage({ bands: [hitDamageBand('!')], averageHp, before: 'uninjured', after: 'lightly_damaged' })).toBe(12)
  })
  it('caps estimated kill net loss to remaining average health, avoiding absurd overkill', () => {
    expect(estimateDamage({ bands: [hitDamageBand('!!!')], averageHp: 10, before: 'almost_dead', killed: true })).toBe(1)
    expect(estimateDamage({ bands: [hitDamageBand('!!!')], averageHp: 10, before: 'uninjured', killed: true })).toBe(10)
  })
  it('can infer a wound decline without an attack line, but never a heal or unchanged band', () => {
    expect(estimateDamage({ bands: [], averageHp: 50, before: 'lightly_damaged', after: 'heavily_damaged' })).toBe(20)
    expect(estimateDamage({ bands: [], averageHp: 50, before: 'lightly_damaged', after: 'lightly_damaged' })).toBeNull()
    expect(estimateDamage({ bands: [], averageHp: 50, before: 'heavily_damaged', after: 'lightly_damaged' })).toBeNull()
    expect(estimateDamage({ bands: [] })).toBeNull()
  })
  it('subtracts exact reported damage when estimating the rest of a combined update', () => {
    expect(estimateDamage({ bands: [hitDamageBand('!')], averageHp: 100, before: 'uninjured', after: 'moderately_damaged', knownDamage: 20 })).toBe(11)
  })
})
