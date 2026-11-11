/** Offline benchmark: only the pinned repository fixture is executed as the upstream reference.
 * Run: node_modules/.bin/vite-node tools/perf/scene-replay.ts
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { loadGamedata, type Enums } from '../../packages/gamedata/src/index'
import { parseEnums } from '../../packages/gamedata/src/parse'
import { initialState, reduce, type ServerMessage } from '../../packages/webtiles/src/index'
import { buildScene } from '../../packages/scene-webtiles/src/index'
import type { Scene } from '../../packages/scene/src/index'

const version = 'acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8'
const root = new URL(`../../packages/scene-webtiles/test/fixtures/gamedata/${version}/`, import.meta.url)
const read = (name: string) => readFileSync(new URL(name, root), 'utf8')
const enumSource = read('enums.js')
const messages = readFileSync(new URL('../../packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => JSON.parse(line).m as ServerMessage)
function upstream(): Enums {
  let result: Enums
  runInNewContext(enumSource, { define: (factory: () => Enums) => { result = factory() } }, { timeout: 1000 })
  return result!
}
const gd = await loadGamedata({
  base: 'fixture://benchmark', version, skipImages: true,
  io: { fetchText: async (url) => read(url.split('/').at(-1)!), loadImage: async () => { throw new Error('no images') } },
})

function measure(makeEnums: () => Enums) {
  const enums = makeEnums()
  const final = initialState()
  for (const msg of structuredClone(messages)) reduce(final, msg)
  const words = [...final.map.cells.values()].map((c) => c.t).filter((t) => t !== undefined)
  let checksum = 0
  const start = performance.now()
  for (let repeat = 0; repeat < 200; repeat++) for (const t of words) {
    checksum += enums.prepare_fg_flags(t.fg ?? 0).value + enums.prepare_bg_flags(t.bg ?? 0).value
  }
  const flagsMs = performance.now() - start
  const oldFg = gd.enums.prepare_fg_flags, oldBg = gd.enums.prepare_bg_flags
  const next = makeEnums()
  gd.enums.prepare_fg_flags = next.prepare_fg_flags
  gd.enums.prepare_bg_flags = next.prepare_bg_flags
  const copy = structuredClone(messages)
  const state = initialState()
  let scene: Scene | undefined
  const begin = performance.now()
  for (const msg of copy) {
    reduce(state, msg)
    scene = buildScene(state, gd, { previous: scene, dirty: { cells: state.dirtyCells, mapCleared: state.mapCleared } })
    state.dirtyCells.clear()
    state.mapCleared = false
  }
  const replayMs = performance.now() - begin
  gd.enums.prepare_fg_flags = oldFg
  gd.enums.prepare_bg_flags = oldBg
  return { flagsMs, replayMs, checksum, cells: words.length }
}

// Alternate order and discard warm-up to reduce JIT/order bias. Timings are
// descriptive measurements, never flaky pass/fail assertions.
measure(upstream); measure(() => parseEnums(enumSource))
const reference = [], client = []
for (let i = 0; i < 7; i++) {
  if (i % 2) { client.push(measure(() => parseEnums(enumSource))); reference.push(measure(upstream)) }
  else { reference.push(measure(upstream)); client.push(measure(() => parseEnums(enumSource))) }
}
const median = (rows: ReturnType<typeof measure>[], key: 'flagsMs' | 'replayMs') => rows.map((r) => r[key]).sort((a,b) => a-b)[3]
console.log(JSON.stringify({
  cells: client[0].cells, messages: messages.length, sameChecksum: reference[0].checksum === client[0].checksum,
  upstream: { flagsMs: median(reference, 'flagsMs'), replayMs: median(reference, 'replayMs') },
  client: { flagsMs: median(client, 'flagsMs'), replayMs: median(client, 'replayMs') },
}, null, 2))
