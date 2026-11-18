import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadGamedata } from '@orbrun/gamedata'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { emptyScene } from '@orbrun/scene'
import { buildScene } from '@orbrun/scene-webtiles'
import { CombatFeedback } from '../src/combat-feedback'
import { readReplay, ReplayClock, ReplayPlaylist, type ReplayClip } from '../src/menu-replay'
import { verifyMenuReplays } from '../menu-replay-assets'
import manifest from '../data/menu-replays.json'
import { curate } from '../../../tools/record/curate-menu.mjs'

const version = 'a'.repeat(40)
const clip = (id: number): ReplayClip => ({ format: 1, version, initial: [{ msg: 'map', cells: [{ x: id }] }, { msg: 'player', pos: { x: id, y: 0 } }],
  frames: [{ after: 100, messages: [{ msg: 'player', pos: { x: id + 1, y: 0 } }] }, { after: 200, messages: [{ msg: 'msgs', messages: [] }] }] })
afterEach(() => vi.useRealTimers())

it('preserves ordered batches, remaining pause time and fresh state across loops', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const recording = clip(0), source = structuredClone(recording), seen: unknown[] = []
  const reset = (messages: ServerMessage[]) => { seen.push(['reset', structuredClone(messages)]); (messages[0].cells as object[]).length = 0 }
  const clock = new ReplayClock(recording, reset, messages => seen.push(['frame', messages]), vi.fn(), vi.fn())
  clock.setActive(true)
  await vi.advanceTimersByTimeAsync(40)
  clock.setActive(false)
  await vi.advanceTimersByTimeAsync(10000)
  expect(seen).toHaveLength(1)
  clock.setActive(true)
  await vi.advanceTimersByTimeAsync(59); expect(seen).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1); expect(seen[1]).toEqual(['frame', source.frames[0].messages])
  await vi.advanceTimersByTimeAsync(200); expect(seen[2]).toEqual(['frame', source.frames[1].messages])
  await vi.advanceTimersByTimeAsync(1600); expect(seen[3]).toEqual(['reset', source.initial])
  await vi.advanceTimersByTimeAsync(1900); expect(seen[6]).toEqual(['reset', source.initial])
  expect(recording).toEqual(source)
  clock.destroy(); await vi.advanceTimersByTimeAsync(10000); expect(seen).toHaveLength(7)
})

it('shuffles every clip once per round without repeating across round boundaries', () => {
  const random = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(.999)
  const playlist = new ReplayPlaylist(3, random)
  const seen = Array.from({ length: 9 }, () => playlist.next())
  expect(seen.slice(0, 3)).toEqual([1, 2, 0])
  for (let i = 0; i < seen.length; i += 3) expect([...seen.slice(i, i + 3)].sort()).toEqual([0, 1, 2])
  expect(seen.every((id, i) => !i || id !== seen[i - 1])).toBe(true)
})

it('stops on a failed frame and rejects executable or mismatched recording content', async () => {
  vi.useFakeTimers()
  const failed = vi.fn(), apply = vi.fn(() => { throw Error('broken') })
  const clock = new ReplayClock(clip(0), () => {}, apply, vi.fn(), failed)
  clock.setActive(true); await vi.advanceTimersByTimeAsync(5000)
  expect(apply).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledOnce()
  for (const bad of [null, { ...clip(0), version: 'wrong' }, { ...clip(0), frames: [] },
    { ...clip(0), initial: [{ msg: 'game_client', content: '<script>' }] },
    { ...clip(0), frames: [{ after: -1, messages: [] }] }]) expect(() => readReplay(bad, version)).toThrow()
})

it('curates state-only clips with complete preceding deltas and bounded idle gaps', () => {
  const records = [
    { t: 0, m: { msg: 'game_client', version, content: '<script>' } },
    { t: 1, m: { msg: 'map', cells: [] } }, { t: 2, m: { msg: 'player', name: 'watched' } },
    { t: 3, m: { msg: 'chat', text: 'private' } }, { t: 1000, m: { msg: 'player', hp: 20 } },
    { t: 1001, m: { msg: 'msgs', messages: [{ text: 'You hit the orc.' }] } },
    { t: 5000, m: { msg: 'map', cells: [{ x: 1, y: 2 }] } },
  ]
  const result = curate(records, 500, 5000)
  expect(result.initial).toEqual([{ msg: 'map', cells: [] }, { msg: 'player', name: 'Adventurer' }])
  expect(result.frames).toEqual([{ after: 500, messages: [records[4].m, records[5].m] }, { after: 900, messages: [records[6].m] }])
  expect(() => curate(records, 0, 5000)).toThrow('Missing initial state')
})

it('bundles matching artwork and moving/combat sequences that replay identically twice', async () => {
  verifyMenuReplays()
  const root = new URL('../public/menu/', import.meta.url)
  const versions = await Promise.all([...new Set(manifest.clips.map(clip => clip.version))].map(version =>
    loadGamedata({ base: 'fixture://menu', version, skipImages: true,
      io: { fetchText: async url => readFileSync(new URL(url.replace('fixture://menu/', ''), root), 'utf8'), loadImage: async () => { throw Error('unexpected images') } } })))
  try {
    expect(manifest.clips.length).toBeGreaterThan(0)
    for (const entry of manifest.clips) {
      const data = versions.find(data => data.version === entry.version)!
      const recording = readReplay(JSON.parse(readFileSync(new URL(entry.file, root), 'utf8')), entry.version)
      const original = structuredClone(recording)
      const run = () => {
        const state = initialState(); reduce(state, { msg: 'game_started' })
        for (const message of structuredClone(recording.initial)) reduce(state, message)
        let scene = buildScene(state, data)
        expect(scene.playerOnLevel, entry.title).toBe(true)
        const feedback = new CombatFeedback(state), positions = new Set<string>()
        let events = 0, now = 0
        for (const frame of structuredClone(recording.frames)) {
          for (const m of frame.messages) { reduce(state, m); feedback.observe(state, m) }
          scene = buildScene(state, data, { previous: scene, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
          state.dirtyCells.clear(); state.mapCleared = false
          now += frame.after; events += feedback.flush(scene, now).length
          feedback.takeSpells()
          positions.add(JSON.stringify(state.player.pos))
          expect(scene.playerOnLevel, entry.title).toBe(true)
        }
        expect(events, entry.title).toBeGreaterThan(0)
        // The Djinni holds position throughout the fight against Jeremiah.
        if (entry.title === 'Stand against Jeremiah') expect(positions.size).toBe(1)
        else expect(positions.size, entry.title).toBeGreaterThan(2)
        return state
      }
      expect(run()).toEqual(run())
      expect(recording).toEqual(original)
    }
  } finally { for (const data of versions) data.dispose() }
}, 20000)
