/** Anonymous connection probe, no account, gameplay or chat.
 * node tools/perf/server-latency.mjs cbrg
 * Control ping may terminate at a proxy; go_lobby exercises WebTiles itself.
 * These host measurements do not measure the Odin's Wi-Fi or game-turn processing.
 */
import WebSocket from 'ws'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const servers = JSON.parse(readFileSync(new URL('../../apps/orbrun/data/servers.json', import.meta.url), 'utf8'))
const server = servers.find((s) => s.id === (process.argv[2] ?? 'cbrg'))
if (!server) throw new Error('Use a bundled server ID')
const socket = new WebSocket(server.ws, ['no-compression'], { handshakeTimeout: 5000 })
let pending = null
let upgradeServer = ''
socket.on('upgrade', (response) => { upgradeServer = response.headers.server ?? '' })
socket.on('message', (data) => {
  const frame = JSON.parse(data.toString())
  for (const m of frame.msgs ?? [frame]) {
    if (m.msg === 'ping') socket.send(JSON.stringify({ msg: 'pong' }))
    if (m.msg === 'go_lobby' && pending?.kind === 'application') pending.done()
  }
})
socket.on('pong', (data) => {
  if (pending?.kind === 'ping' && data.toString() === pending.id) pending.done()
})
const waitFor = (kind, id) => new Promise((resolve, reject) => {
  const start = performance.now()
  const timeout = setTimeout(() => { pending = null; reject(new Error(`${kind} timed out`)) }, 5000)
  pending = { kind, id, done: () => {
    clearTimeout(timeout); pending = null; resolve(performance.now() - start)
  } }
  if (kind === 'ping') socket.ping(id)
  else socket.send(JSON.stringify({ msg: 'go_lobby' }))
})
try {
  await new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
  await sleep(500)
  const rows = { ping: [], application: [] }
  for (let i = 0; i < 8; i++) {
    for (const kind of ['ping', 'application']) {
      rows[kind].push(await waitFor(kind, String(i)))
      await sleep(300)
    }
  }
  const stats = (xs) => {
    const sorted = [...xs].sort((a,b) => a-b)
    return { samplesMs: xs.map(x=>+x.toFixed(1)), p50Ms: +sorted[4].toFixed(1), maxMs: +sorted[7].toFixed(1) }
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), server: server.id, upgradeServer,
    transport: stats(rows.ping), webtilesLobby: stats(rows.application) }, null, 2))
} finally {
  socket.close()
  setTimeout(() => socket.terminate(), 1000).unref()
}
