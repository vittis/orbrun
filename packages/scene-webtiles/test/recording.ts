import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initialState, reduce, type GameState, type ServerMessage } from '@orbrun/webtiles'
import { loadGamedata, type Gamedata } from '@orbrun/gamedata'

const gdRoot = fileURLToPath(new URL('./fixtures/gamedata/', import.meta.url))
const recording = new URL('../../webtiles/test/fixtures/cdi-0.34-watch.ndjson', import.meta.url)
let messages: ServerMessage[] | undefined
let state: GameState | undefined
let gamedata: Promise<Gamedata> | undefined

/** Parse once per isolated test file; reducers may mutate nested input values. */
export function fixtureMessages(): ServerMessage[] {
  messages ??= readFileSync(recording, 'utf8').trim().split('\n').map((line) => JSON.parse(line).m)
  return structuredClone(messages)
}

/** Tests needing only the final position get independent Maps, Sets and cells. */
export function fixtureState(): GameState {
  if (!state) {
    state = initialState()
    for (const message of fixtureMessages()) reduce(state, message)
  }
  return structuredClone(state)
}

/** Shared read-only tile tables within one file, including Gamedata's lookup caches. */
export function fixtureGamedata(): Promise<Gamedata> {
  return gamedata ??= loadGamedata({
    base: 'fixture://recording',
    version: readdirSync(gdRoot)[0],
    skipImages: true,
    io: {
      async fetchText(url) { return readFileSync(join(gdRoot, url.split('/').slice(-2).join('/')), 'utf8') },
      async loadImage() { throw new Error('no images in tests') },
    },
  })
}
