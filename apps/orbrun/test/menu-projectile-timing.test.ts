// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as gamedata from '@orbrun/gamedata'
import { Render25d } from '@orbrun/render-2.5d'
import manifest from '../data/menu-replays.json'
import { loadMenuDemo } from '../src/menu-demo'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('delivers the five-cell Snake Pit shot at its recorded cadence between canvas paints', async () => {
  const root = join(import.meta.dirname, '../public/menu')
  const entry = manifest.clips.find(e => e.title.startsWith('Crossfire in the Snake Pit'))!
  const data = await gamedata.loadGamedata({ base: 'fixture://menu', version: entry.version, skipImages: true,
    io: { fetchText: async url => readFileSync(join(root, url.replace('fixture://menu/', '')), 'utf8'),
      loadImage: async () => { throw Error('unexpected atlas') } } })
  vi.spyOn(gamedata, 'loadGamedata').mockResolvedValue(data)
  vi.stubGlobal('fetch', async () => new Response(readFileSync(join(root, entry.file), 'utf8')))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.spyOn(Render25d.prototype, 'mount').mockImplementation(() => {})
  const scenes = vi.spyOn(Render25d.prototype, 'setScene')
  const demo = await loadMenuDemo(document.createElement('canvas'), new AbortController().signal, entry,
    { progress() {}, finished() {}, failed(error) { throw error } })
  try {
    demo.setActive(true)
    await vi.advanceTimersByTimeAsync(2000)
    const overlays = scenes.mock.calls.flatMap(([scene, time]) => scene.turn === 32
      ? scene.billboards.filter(b => b.kind === 'projectile' && b.y === -1)
        .map(b => ({ x: b.x, ms: Math.round(time! * 1000) })) : [])
    const shot = overlays.filter((p, i) => overlays.findIndex(other => other.x === p.x) === i)
    expect(shot.map(p => p.x)).toEqual([1, 2, 3, 4, 5])
    // Elapsed milliseconds from the first slug overlay in the Crawl capture.
    expect(shot.map(p => p.ms - shot[0].ms)).toEqual([0, 17, 35, 53, 71])
  } finally { demo.destroy() }
})
