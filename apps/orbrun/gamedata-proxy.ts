import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ATLASES } from '@orbrun/gamedata'
import servers from './data/servers.json'

/**
 * The one gamedata proxy, in two shells.
 *
 * WebTiles servers serve their version-specific gamedata (enums.js,
 * tileinfo-*.js, atlases) without CORS headers, so the browser cannot fetch
 * it directly: every shell needs something same-origin in front of it. The
 * route and the rules live here so dev, preview and production cannot drift;
 * `worker/index.ts` (Cloudflare) and `gamedataProxy()` (Vite) are only
 * adapters over `serveGamedata`.
 *
 * URL shape: /gamedata-proxy/<host>/gamedata/<version>/<file>
 * Upstream:  https://<host>/gamedata/<version>/<file>
 */
export const GAMEDATA_PROXY_PREFIX = '/gamedata-proxy/'

/**
 * The morgue proxy, the same shape for the same reason: a game's morgue
 * file or character dump (`game_ended` `dump`), and the `<player>.where` beside
 * them, are plain-text files the server publishes without CORS headers. The exit
 * screen shows a dump in place rather than in a new tab; the home screen reads
 * the `.where` to know whether a save is still waiting (whereis.ts). An
 * account's Morgues reads the directory they are in, as the morgues' names
 * only, one to a line, rather than the server's listing page (morgues.ts), and
 * each file's head with a Range, which is passed on.
 *
 * URL shape: /morgue-proxy/<host>/<path>.txt|.where, /morgue-proxy/<host>/<path>/
 * Upstream:  https://<host>/<path>.txt|.where, https://<host>/<path>/
 */
export const MORGUE_PROXY_PREFIX = '/morgue-proxy/'

/** Only the bundled, reviewed HTTPS server endpoints may use the hosted proxy. */
const ALLOWED_HOSTS = new Set(servers.filter((s) => {
  const url = new URL(s.http)
  return url.protocol === 'https:' && url.host === s.host && !url.username && !url.password
}).map((s) => s.host))

const GAMEDATA_FILES = new Set<string>([
  'enums.js',
  'status-icon-sizes.js',
  ...ATLASES.map((a) => `tileinfo-${a}.js`),
  ...ATLASES.map((a) => `${a}.png`),
])

const ROUTE = /^\/gamedata-proxy\/([^/@]+)\/gamedata\/([0-9a-f]+)\/([A-Za-z0-9_.-]+)$/

/**
 * A morgue path: plain segments, then a `.txt` (a morgue file or a character dump) or a `.where` (what the
 * server says is waiting in a player's save, chardump.cc `whereis_record`) and nothing else. Only the
 * extension is pinned, not the directory: servers keep their morgues under different names (`/morgue/`,
 * `/crawl/morgue/`, `/rawdata/`), and the path comes from the server's own `game_ended` message or from the
 * layouts dgamelaunch-config ships with.
 */
const MORGUE_ROUTE = /^\/morgue-proxy\/([^/@]+)\/((?:[A-Za-z0-9_.~-]+\/)*[A-Za-z0-9_.~-]+\.(?:txt|where))$/
/** A morgue directory: plain segments and a closing `/`, listed as the morgues' names (serveMorgue). */
const MORGUE_DIR_ROUTE = /^\/morgue-proxy\/([^/@]+)\/((?:[A-Za-z0-9_.~-]+\/)+)$/

/**
 * A morgue's name in a listing page: nginx's autoindex, Apache's and
 * fancyindex's alike link each file by its name (or its path), and crawl names
 * a morgue `morgue-<name>-<date>-<time>.txt` (end.cc).
 */
const LISTED_MORGUE = /href="(?:[^"]*\/)?(morgue-[^"/?#]+-\d{8}-\d{6}\.txt)"/g

/** A morgue file proper, which never changes once written; a character dump (`<name>.txt`) is rewritten on every save. */
const FIXED_MORGUE = /\/morgue-[^/]+-\d{8}-\d{6}\.txt$/

function validHost(host: string): boolean {
  return ALLOWED_HOSTS.has(host)
}

/** The upstream URL a morgue proxy path names, or null if it is not one of ours. */
export function morgueUpstream(pathname: string): string | null {
  if (pathname.length > 2048) return null
  const m = MORGUE_ROUTE.exec(pathname) ?? MORGUE_DIR_ROUTE.exec(pathname)
  if (!m) return null
  const [, host, path] = m
  if (!validHost(host)) return null
  if (path.split('/').some((seg) => seg === '.' || seg === '..')) return null
  return `https://${host}/${path}`
}

/** The upstream URL a proxy path names, or null if it is not one of ours. */
export function gamedataUpstream(pathname: string): string | null {
  if (pathname.length > 2048) return null
  const m = ROUTE.exec(pathname)
  if (!m) return null
  const [, host, version, file] = m
  if (!validHost(host)) return null
  if (!GAMEDATA_FILES.has(file)) return null
  return `https://${host}/gamedata/${version}/${file}`
}

function contentType(file: string): string {
  return file.endsWith('.png') ? 'image/png' : 'text/javascript; charset=utf-8'
}

function corsHeaders(file: string): Record<string, string> {
  return {
    'Content-Type': contentType(file),
    'X-Content-Type-Options': 'nosniff',
    // Canvas rendering needs the atlases to be cross-origin clean; the app may also be
    // served from a different origin than the proxy in other shells.
    'Access-Control-Allow-Origin': '*',
    // versioned paths: a version's gamedata never changes
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
}

// Limits leave room for current atlases (~5 MB combined) and long morgues,
// while bounding each request and the temporary buffers shared by an isolate.
export const PROXY_LIMITS = {
  timeoutMs: 15_000,
  scriptBytes: 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  morgueBytes: 2 * 1024 * 1024,
  concurrent: 16,
  bufferedBytes: 16 * 1024 * 1024,
  cacheEntries: 64,
  cacheBytes: 32 * 1024 * 1024,
} as const
let activeRequests = 0
let bufferedBytes = 0

function proxyError(status: number, message: string): Response {
  return new Response(message, { status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  } })
}

/** Shared Node/Worker fetch policy. No caller-controlled headers or redirect targets escape it. */
async function boundedFetch(upstream: string, limit: number, fetchImpl: typeof fetch, headers?: HeadersInit): Promise<Response> {
  if (activeRequests >= PROXY_LIMITS.concurrent) return proxyError(503, 'proxy busy')
  activeRequests++
  const abort = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let retained = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      abort.abort()
      resolve(proxyError(504, 'upstream timed out'))
    }, PROXY_LIMITS.timeoutMs)
  })
  const read = async (): Promise<Response> => {
    const r = await fetchImpl(upstream, { headers, redirect: 'manual', signal: abort.signal })
    // Never follow redirects, even to another allowlisted host: the original
    // request's path/host policy must also describe the response we return.
    if (r.status >= 300 && r.status < 400 || r.redirected || r.type === 'opaqueredirect') {
      void r.body?.cancel().catch(() => {})
      return proxyError(502, 'upstream redirect refused')
    }
    if (!r.ok) {
      void r.body?.cancel().catch(() => {})
      return proxyError(r.status === 404 ? 404 : 502, `upstream ${r.status}`)
    }
    if (abort.signal.aborted) {
      void r.body?.cancel().catch(() => {})
      return proxyError(504, 'upstream timed out')
    }
    if (Number(r.headers.get('Content-Length')) > limit) {
      void r.body?.cancel().catch(() => {})
      return proxyError(502, 'upstream response too large')
    }
    const chunks: Uint8Array[] = []
    let length = 0
    reader = r.body?.getReader()
    while (reader) {
      const { done, value } = await reader.read()
      if (abort.signal.aborted) return proxyError(504, 'upstream timed out')
      if (done) break
      if (length + value.byteLength > limit) return proxyError(502, 'upstream response too large')
      if (bufferedBytes + value.byteLength > PROXY_LIMITS.bufferedBytes) return proxyError(503, 'proxy busy')
      chunks.push(value)
      length += value.byteLength
      retained += value.byteLength
      bufferedBytes += value.byteLength
    }
    const body = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new Response(body, { status: r.status, headers: r.headers })
  }
  try {
    return await Promise.race([read(), deadline])
  } catch {
    return proxyError(abort.signal.aborted ? 504 : 502, abort.signal.aborted ? 'upstream timed out' : 'upstream unreachable')
  } finally {
    clearTimeout(timer)
    abort.abort()
    // Cancellation is best effort after a terminal response; a broken upstream
    // cancellation must not retain the concurrency slot or mask the actual error.
    void reader?.cancel().catch(() => {})
    bufferedBytes -= retained
    activeRequests--
  }
}

/**
 * Serve one gamedata file, or null when the path is not a proxy path (the
 * caller then falls through to whatever else it serves).
 *
 * An upstream failure is passed through as a status, never as a body that
 * could be mistaken for JavaScript: a 200 with an HTML body is what makes
 * the loader throw `Unexpected token '<'`.
 */
export async function serveGamedata(pathname: string, fetchImpl: typeof fetch = fetch): Promise<Response | null> {
  const upstream = gamedataUpstream(pathname)
  if (!upstream) return null
  const file = pathname.slice(pathname.lastIndexOf('/') + 1)
  const r = await boundedFetch(upstream, file.endsWith('.png') ? PROXY_LIMITS.imageBytes : PROXY_LIMITS.scriptBytes, fetchImpl)
  if (!r.ok) return r
  const body = await r.arrayBuffer()
  return new Response(body, { status: 200, headers: corsHeaders(file) })
}

/**
 * Serve one morgue file as text, or a morgue directory as the names of the
 * morgues in it, or null when the path is not a morgue proxy path. A
 * character dump is rewritten on every save, so nothing but a morgue proper
 * is immutable: a short cache is all the rest gets, and a `.where` barely any
 * — it is how the home screen learns that a save died in another browser.
 * `range` (a request's `Range: bytes=a-b`) is passed on, so a list of games
 * reads each morgue's head and no more.
 */
export async function serveMorgue(pathname: string, fetchImpl: typeof fetch = fetch, range?: string | null): Promise<Response | null> {
  const upstream = morgueUpstream(pathname)
  if (!upstream) return null
  const dir = pathname.endsWith('/')
  const match = range?.match(/^bytes=(\d+)-(\d+)$/)
  const start = Number(match?.[1])
  const end = Number(match?.[2])
  const validRange = !dir && match && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && end - start < PROXY_LIMITS.morgueBytes
  const r = await boundedFetch(upstream, PROXY_LIMITS.morgueBytes, fetchImpl, validRange ? { Range: range! } : undefined)
  if (!r.ok) return r
  const body = await r.text()
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': dir ? 'public, max-age=60' : FIXED_MORGUE.test(pathname) ? 'public, max-age=31536000, immutable' : pathname.endsWith('.where') ? 'public, max-age=15' : 'public, max-age=300',
  }
  if (dir) {
    // a page that is no listing (a server that answers every address with its home page) lists nothing
    const names = [...new Set([...body.matchAll(LISTED_MORGUE)].map((m) => decodeURIComponentSafe(m[1])))]
    if (!names.length && !/<title>\s*Index of /i.test(body)) return new Response('not a morgue listing', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    return new Response(names.join('\n'), { status: 200, headers })
  }
  const partial = r.status === 206 ? r.headers.get('Content-Range') : null
  if (partial) headers['Content-Range'] = partial
  return new Response(body, { status: partial ? 206 : 200, headers })
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * Dev/preview middleware: the same proxies, in front of Vite's own serving.
 * Fetched gamedata is kept in memory so a reload is instant; a morgue is
 * fetched each time, as a dump changes with every save.
 */
export function gamedataProxy(): Plugin {
  const cache = new Map<string, { type: string; body: Buffer }>()
  let cacheBytes = 0
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = (req.url || '').split('?')[0]
    const proxy = pathname.startsWith(MORGUE_PROXY_PREFIX) || pathname.startsWith(GAMEDATA_PROXY_PREFIX)
    if (!proxy) return next()
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.setHeader('Allow', 'GET, HEAD')
      res.end('method not allowed')
      return
    }
    const reject = () => {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('proxy path not allowed')
    }
    if (pathname.startsWith(MORGUE_PROXY_PREFIX)) {
      const r = await serveMorgue(pathname, fetch, req.headers.range)
      if (!r) return reject()
      res.statusCode = r.status
      r.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(Buffer.from(await r.arrayBuffer()))
      return
    }
    if (!pathname.startsWith(GAMEDATA_PROXY_PREFIX)) return next()
    if (!gamedataUpstream(pathname)) return reject()
    const hit = cache.get(pathname)
    if (hit) {
      cache.delete(pathname)
      cache.set(pathname, hit)
      res.setHeader('Content-Type', hit.type)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.end(hit.body)
      return
    }
    const r = await serveGamedata(pathname)
    if (!r) return reject()
    const body = Buffer.from(await r.arrayBuffer())
    res.statusCode = r.status
    r.headers.forEach((v, k) => res.setHeader(k, v))
    if (r.ok && body.byteLength <= PROXY_LIMITS.cacheBytes) {
      const previous = cache.get(pathname)
      if (previous) {
        cacheBytes -= previous.body.byteLength
        cache.delete(pathname)
      }
      while (cache.size >= PROXY_LIMITS.cacheEntries || cacheBytes + body.byteLength > PROXY_LIMITS.cacheBytes) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cacheBytes -= cache.get(oldest)!.body.byteLength
        cache.delete(oldest)
      }
      cache.set(pathname, { type: r.headers.get('Content-Type') || 'text/javascript', body })
      cacheBytes += body.byteLength
    }
    res.end(body)
  }
  return {
    name: 'orbrun-gamedata-proxy',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}
