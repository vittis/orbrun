import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { readPack, matchSound } from '../src/audio/pack'
import { MessageOccurrences } from '../src/message-occurrences'

function archive(init: string, files: Record<string, Uint8Array> = {}) {
  return zipSync({ 'init.txt': strToU8(init), 'hit.wav': new Uint8Array([1]), 'miss.wav': new Uint8Array([2]), ...files })
}

describe('OSP compatibility boundary', () => {
  it('reads only init.txt, preserves rule order and skips invalid/missing assets with diagnostics', () => {
    const pack = readPack(archive('sound ^= [:hit.wav\nsound ^= hit:missing.wav\nsound ^= hit:hit.wav\nsound += hit:miss.wav\ninclude = extra.txt\n: lua()\ndwem_bgm += (Dungeon, 1, "hit.wav")', {
      'extra.txt': strToU8('sound ^= miss:miss.wav'),
    }))
    expect(pack.info).toMatchObject({ rules: 2, sounds: 2, warnings: 2 })
    expect(matchSound(pack, { text: 'You hit.', freshFrom: 0 })).toBe('hit.wav')
    expect(matchSound(pack, { text: 'You miss.', freshFrom: 0 })).toBeNull()
  })

  it('normalizes pack-relative paths, quotes and escaped regex colons', () => {
    const pack = readPack(archive('sound_file_path = "se"\nsound ^= hit\\::"./hit.wav" # comment', { 'se/hit.wav': new Uint8Array([1]) }))
    expect(matchSound(pack, { text: 'hit:', freshFrom: 0 })).toBe('se/hit.wav')
  })

  it('matches newly appended occurrences while retaining anchors and excluding old hits', () => {
    const pack = readPack(archive('sound ^= hit:hit.wav\nsound ^= miss:miss.wav'))
    expect(matchSound(pack, { text: 'You hit. You miss.', freshFrom: 8 })).toBe('miss.wav')
    expect(matchSound(pack, { text: 'You hit. You hit.', freshFrom: 8 })).toBe('hit.wav')
    expect(matchSound(pack, { text: 'You hit.', freshFrom: 8 })).toBeNull()
    const anchored = readPack(archive('sound ^= ^You hit:hit.wav'))
    expect(matchSound(anchored, { text: 'You hit.', freshFrom: 0 })).toBe('hit.wav')
    expect(matchSound(anchored, { text: 'You miss. You hit.', freshFrom: 9 })).toBeNull()
  })

  it('rejects unsafe archives and expansion bombs before extracting entries', () => {
    expect(() => readPack(archive('sound ^= hit:hit.wav', { '../outside.wav': new Uint8Array([1]) }))).toThrow('Unsafe')
    expect(() => readPack(zipSync({ 'sound.wav': new Uint8Array([1]) }))).toThrow('init.txt')
    const bytes = archive('sound ^= hit:hit.wav')
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < bytes.length - 24; i++) {
      if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, 256 * 1024 * 1024, true); break }
    }
    expect(() => readPack(bytes)).toThrow('extraction limits')
  })
})

describe('shared live message occurrences', () => {
  it('suppresses join history and rollback prefixes without collapsing identical attacks or turns', () => {
    const state = initialState(), messages = new MessageOccurrences(state)
    const send = (msg: ServerMessage) => { reduce(state, msg); return messages.observe(state, msg) }
    send({ msg: 'player', hp: 10, hp_max: 10 })
    expect(send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })).toEqual([])
    expect(send({ msg: 'msgs', messages: [{ text: '<red>You hit.</red>', turn: 1 }] })).toMatchObject([{ text: 'You hit.', freshFrom: 0, turn: 1 }])
    expect(send({ msg: 'msgs', rollback: 1, messages: [{ text: 'You hit. You miss.', turn: 1 }] })).toMatchObject([{ freshFrom: 8 }])
    expect(send({ msg: 'msgs', messages: [{ text: 'You hit.', turn: 1 }, { text: 'You hit.', turn: 1 }] })).toHaveLength(2)
    expect(send({ msg: 'msgs', rollback: 2, messages: [{ text: 'You hit. You hit.', turn: 1 }] })).toEqual([])
    send({ msg: 'game_client', version: 'test' })
    send({ msg: 'player', hp: 10, hp_max: 10 })
    expect(send({ msg: 'msgs', messages: [{ text: 'You hit.' }] })).toEqual([])
  })
})
