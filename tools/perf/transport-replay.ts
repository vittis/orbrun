/** Offline comparison against trusted repository code; no server source is executed.
 * Run: node_modules/.bin/vite-node tools/perf/transport-replay.ts
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runInThisContext } from 'node:vm'
import ts from 'typescript'
import { RemoteConnection } from '../../packages/webtiles/src/connection'

const source = execFileSync('git', ['show', 'b65fc15:packages/webtiles/src/connection.ts'], { encoding: 'utf8' })
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const exports: { RemoteConnection?: typeof RemoteConnection } = {}
runInThisContext(`(function(exports) { ${compiled}\n})`)(exports)
const Original = exports.RemoteConnection!
const frames = readFileSync(new URL('../../packages/webtiles/test/fixtures/cdi-0.34-watch.ndjson', import.meta.url), 'utf8')
  .trim().split('\n').map((line) => JSON.stringify(JSON.parse(line).m))
class Socket {
  static last: Socket
  binaryType = ''
  readyState = 1
  bufferedAmount = 0
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose = null
  onerror = null
  constructor() { Socket.last = this }
  send(_data: string) {}
  close() {}
}
function measure(Connection: typeof RemoteConnection) {
  const conn = new Connection({ url: 'wss://fixture.invalid', gamedataBase: '', WebSocket: Socket })
  const socket = Socket.last
  socket.onopen?.({})
  let received = 0
  conn.onMessage(() => { received++ })
  // The app's performance observer is present in both original and fork.
  conn.onTraffic = () => {}
  const start = performance.now()
  for (let repeat = 0; repeat < 100; repeat++) for (const data of frames) socket.onmessage?.({ data })
  const elapsed = performance.now() - start
  return { msPerReplay: elapsed / 100, received }
}
measure(Original); measure(RemoteConnection)
const original = [], current = []
for (let i = 0; i < 7; i++) {
  if (i % 2) { current.push(measure(RemoteConnection)); original.push(measure(Original)) }
  else { original.push(measure(Original)); current.push(measure(RemoteConnection)) }
}
const median = (rows: ReturnType<typeof measure>[]) => rows.map((r) => r.msPerReplay).sort((a,b) => a-b)[3]
console.log(JSON.stringify({
  frames: frames.length, bytes: frames.reduce((n,s) => n + Buffer.byteLength(s), 0),
  sameMessages: original[0].received === current[0].received,
  upstreamMs: median(original), clientMs: median(current),
}, null, 2))
