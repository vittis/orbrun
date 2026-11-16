import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadGamedata } from '@orbrun/gamedata'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { emptyScene } from '@orbrun/scene'
import { buildScene } from '@orbrun/scene-webtiles'
import { CombatFeedback } from '../src/combat-feedback'
import { readReplay, ReplayClock, type ReplayClip } from '../src/menu-replay'
import { verifyMenuReplays } from '../menu-replay-assets'
import manifest from '../data/menu-replays.json'
import { curate } from '../../../tools/record/curate-menu.mjs'

const version = 'a'.repeat(40)
const clip = (id: number): ReplayClip => ({ format: 1, version, initial: [{ msg: 'map', cells: [{ x: id }] }, { msg: 'player', pos: { x: id, y: 0 } }],
  frames: [{ after: 100, messages: [{ msg: 'player', pos: { x: id + 1, y: 0 } }] }, { after: 200, messages: [{ msg: 'msgs', messages: [] }] }] })
afterEach(() => vi.useRealTimers())

it('preserves ordered batches, remaining pause time and fresh state across clip changes and loops', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const clips = [clip(0), clip(10)], source = structuredClone(clips), seen: unknown[] = []
  const reset = (messages: ServerMessage[]) => { seen.push(['reset', structuredClone(messages)]); (messages[0].cells as object[]).length = 0 }
  const clock = new ReplayClock(clips, reset, messages => seen.push(['frame', messages]), vi.fn())
  clock.setActive(true)
  await vi.advanceTimersByTimeAsync(40)
  clock.setActive(false)
  await vi.advanceTimersByTimeAsync(10000)
  expect(seen).toHaveLength(1)
  clock.setActive(true)
  await vi.advanceTimersByTimeAsync(59); expect(seen).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1); expect(seen[1]).toEqual(['frame', source[0].frames[0].messages])
  await vi.advanceTimersByTimeAsync(200); expect(seen[2]).toEqual(['frame', source[0].frames[1].messages])
  await vi.advanceTimersByTimeAsync(1600); expect(seen[3]).toEqual(['reset', source[1].initial])
  await vi.advanceTimersByTimeAsync(1900); expect(seen[6]).toEqual(['reset', source[0].initial])
  expect(clips).toEqual(source)
  clock.destroy(); await vi.advanceTimersByTimeAsync(10000); expect(seen).toHaveLength(7)
})

it('stops on a failed frame and rejects executable or mismatched recording content', async () => {
  vi.useFakeTimers()
  const failed = vi.fn(), apply = vi.fn(() => { throw Error('broken') })
  const clock = new ReplayClock([clip(0)], () => {}, apply, failed)
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

it('bundles matching artwork and three genuine moving/combat sequences that replay identically twice', async () => {
  verifyMenuReplays()
  const root = new URL('../public/menu/', import.meta.url)
  const data = await loadGamedata({ base: 'fixture://menu', version: manifest.version, skipImages: true,
    io: { fetchText: async url => readFileSync(new URL(url.replace('fixture://menu/', ''), root), 'utf8'), loadImage: async () => { throw Error('unexpected images') } } })
  try {
    expect(manifest.clips).toHaveLength(3)
    for (const entry of manifest.clips) {
      const recording = readReplay(JSON.parse(readFileSync(new URL(entry.file, root), 'utf8')), manifest.version)
      const original = structuredClone(recording)
      const run = () => {
        const state = initialState(); reduce(state, { msg: 'game_started' })
        for (const message of structuredClone(recording.initial)) reduce(state, message)
        let scene = buildScene(state, data)
        expect(scene.playerOnLevel).toBe(true)
        const feedback = new CombatFeedback(state), positions = new Set<string>()
        let events = 0, now = 0
        for (const frame of structuredClone(recording.frames)) {
          for (const m of frame.messages) { reduce(state, m); feedback.observe(state, m) }
          scene = buildScene(state, data, { previous: scene, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
          state.dirtyCells.clear(); state.mapCleared = false
          now += frame.after; events += feedback.flush(scene, now).length
          feedback.takeSpells()
          positions.add(JSON.stringify(state.player.pos))
          expect(scene.playerOnLevel).toBe(true)
        }
        expect(events).toBeGreaterThan(0)
        expect(positions.size).toBeGreaterThan(2)
        return state
      }
      expect(run()).toEqual(run())
      expect(recording).toEqual(original)
    }
  } finally { data.dispose() }
}, 20000)
