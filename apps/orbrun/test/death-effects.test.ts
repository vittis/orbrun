import { describe, expect, it } from 'vitest'
import type { Billboard, DeathKind } from '@orbrun/scene'
import { deathFor } from '../src/death-effects'

const enemy = (name: string): Billboard => ({ kind: 'monster', id: 1, name, x: 0, y: 0, tile: 1, height: 0.8 })
const from = { x: -1, y: 0 }

describe('enemy death materials', () => {
  it.each<[string, DeathKind]>([
    ['orc warrior', 'flesh'], ['ancient lich', 'bone'], ['spectral skeleton', 'bone'],
    ['azure jelly', 'slime'], ['stone golem', 'stone'], ['phantom', 'spirit'],
    ['fire elemental', 'fire'], ['ice beast', 'ice'], ['thorn hunter', 'plant'],
    ['hornet', 'insect'], ['water elemental', 'water'], ['zombie', 'flesh'],
    ['elephant', 'flesh'], ['giant frog', 'flesh'], ['shadow dragon', 'flesh'], ['worker ant', 'insect'],
  ])('matches %s to %s debris', (name, kind) => {
    expect(deathFor(enemy(name), from)).toMatchObject({ kind, actorId: 'id:1', direction: { x: 1, y: 0 } })
  })
  it('keeps skittering mammals fleshy', () => {
    expect(deathFor({ ...enemy('rat'), life: { motion: 'skitter' } }, from).kind).toBe('flesh')
  })
})
