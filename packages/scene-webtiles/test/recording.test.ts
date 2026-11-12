import { describe, expect, it } from 'vitest'
import { initialState, reduce } from '@orbrun/webtiles'
import { fixtureMessages, fixtureState } from './recording'

describe('cached recording setup', () => {
  it('matches a fresh replay of every recorded message, including Maps and Sets', () => {
    const replayed = initialState()
    for (const message of fixtureMessages()) reduce(replayed, message)
    expect(fixtureState()).toEqual(replayed)
  })

  it('keeps nested message data fresh after a consumer mutates it', () => {
    const expected = fixtureMessages()
    const mutated = fixtureMessages()
    for (const message of mutated) message.msg = 'changed by another test'
    expect(fixtureMessages()).toEqual(expected)
  })

  it('gives every state consumer independent cells, Maps, Sets and player data', () => {
    const expected = fixtureState()
    const mutated = fixtureState()
    const cell = [...mutated.map.cells.values()].find((c) => c.t)!
    cell.t!.bg = -1
    mutated.player.pos.x += 100
    mutated.dirtyCells.clear()
    mutated.map.cells.clear()
    expect(fixtureState()).toEqual(expected)
    expect(mutated.map.cells).not.toBe(expected.map.cells)
    expect(mutated.dirtyCells).not.toBe(expected.dirtyCells)
  })
})
