/**
 * The Web Worker one engine runs in. The page posts `start` once, then
 * control messages and keys; the worker posts the engine's output and its
 * exit. The engine blocks in a JSPI suspension while it waits for the player,
 * so an idle game costs this thread nothing.
 */
import { startEngine, type EngineFile, type EngineFactory, type RunningEngine } from './engine.js'
import { cachedAssetFetch } from './asset-cache.js'

export type ToWorker =
  | { type: 'start'; base: string; saveDir: string; args: string[]; files?: Record<string, string>; persistent?: boolean; assetCache?: string }
  | { type: 'control'; json: string }
  | { type: 'keys'; text: string }

export type FromWorker =
  | { type: 'output'; text: string }
  | { type: 'exit'; code: number }
  | { type: 'error'; message: string }
  | { type: 'idle'; sequence: number }

// the worker's global, typed to the two members used (the app compiles against DOM, not WebWorker)
const scope = self as unknown as {
  postMessage(m: FromWorker): void
  onmessage: ((e: { data: ToWorker }) => void) | null
}

let engine: RunningEngine | null = null
const early: ToWorker[] = []
let sequence = 0

scope.onmessage = (e) => {
  const m = e.data
  if (m.type === 'start') {
    void start(m)
    return
  }
  if (!engine) early.push(m)
  else deliver(m)
}

function deliver(m: Exclude<ToWorker, { type: 'start' }>) {
  sequence++
  if (m.type === 'control') engine!.control(m.json)
  else engine!.keys(m.text)
}

async function start(m: Extract<ToWorker, { type: 'start' }>) {
  const url = (file: string) => new URL(file, m.base).href
  const read = m.assetCache ? cachedAssetFetch(m.assetCache) : fetch
  try {
    engine = await startEngine({
      source: {
        factory: async () => ((await import(/* @vite-ignore */ url('crawl.js'))) as { default: EngineFactory }).default,
        compile: m.assetCache ? async () => {
          const res = await read(url('crawl.wasm'))
          if (!res.ok) throw new Error(`crawl.wasm: HTTP ${res.status}`)
          return typeof WebAssembly.compileStreaming === 'function'
            ? WebAssembly.compileStreaming(res) : WebAssembly.compile(await res.arrayBuffer())
        } : undefined,
        read: async (file: EngineFile) => {
          const res = await read(url(file))
          if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
          return res.arrayBuffer()
        },
      },
      saveDir: m.saveDir,
      persistent: m.persistent,
      args: m.args,
      files: m.files,
      onOutput: (text) => scope.postMessage({ type: 'output', text }),
      onIdle: () => scope.postMessage({ type: 'idle', sequence }),
      onExit: (code) => scope.postMessage({ type: 'exit', code }),
      onLog: (line) => console.debug('[engine]', line),
    })
  } catch (err) {
    scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  for (const q of early.splice(0)) {
    if (q.type !== 'start') deliver(q)
  }
}
