// Safe Phase 0 probes: mock IO only; no credentials or network requests.
import fs from 'node:fs/promises'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
async function moduleUrl(path) {
  const src = await fs.readFile(root + path, 'utf8')
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64')
}
const gdUrl = await moduleUrl('packages/gamedata/src/index.ts')
const { loadGamedata } = await import(gdUrl)
globalThis.phase0SecurityProbe = 0
await loadGamedata({ base: '/fixture', version: 'abc', skipImages: true, io: {
  fetchText: async () => 'globalThis.phase0SecurityProbe += 1; define(function() { return {}; });',
  loadImage: async () => { throw Error('unexpected image load') }
}})
console.log('Gamedata global mutation executions:', globalThis.phase0SecurityProbe)
delete globalThis.phase0SecurityProbe
let proxy = await fs.readFile(root + 'apps/orbrun/gamedata-proxy.ts', 'utf8')
proxy = proxy.replace("'@orbrun/gamedata'", JSON.stringify(gdUrl))
const proxyJs = ts.transpileModule(proxy, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { gamedataUpstream, morgueUpstream, serveGamedata } = await import('data:text/javascript;base64,' + Buffer.from(proxyJs).toString('base64'))
for (const host of ['localhost', '127.0.0.1', '10.0.0.1', '169.254.169.254', '2130706433']) {
  console.log(host, gamedataUpstream(`/gamedata-proxy/${host}/gamedata/abc/enums.js`), morgueUpstream(`/morgue-proxy/${host}/private/file.txt`))
}
await serveGamedata('/gamedata-proxy/127.0.0.1/gamedata/abc/enums.js', async (url, init) => {
  console.log('Mock fetch invoked:', url, 'options:', init ?? null)
  return new Response('fixture')
})
const { RemoteConnection } = await import(await moduleUrl('packages/webtiles/src/connection.ts'))
let socket
class FakeSocket {
  constructor() { socket = this; this.readyState = 1 }
  send() {}
  close() {}
}
new RemoteConnection({url:'wss://fixture.invalid/socket', gamedataBase:'/fixture', WebSocket:FakeSocket})
try { socket.onmessage({data:'{"msgs":[null]}'}) } catch(e) { console.log('Null batch item throws:', e.name, e.message) }
