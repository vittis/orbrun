import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import bundledServers from '../data/servers.json'
import { GAMEDATA_PROXY_PREFIX, MORGUE_PROXY_PREFIX, gamedataUpstream, morgueUpstream, serveGamedata, serveMorgue, gamedataProxy, PROXY_LIMITS } from '../gamedata-proxy'

const SHA = 'acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8'
const OK = `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/enums.js`

describe('gamedata proxy route', () => {
  it('maps a proxy path to the server’s own gamedata URL', () => {
    expect(gamedataUpstream(OK)).toBe(`https://crawl.dcss.io/gamedata/${SHA}/enums.js`)
  })

  it('takes the files the loader asks for, on a host with a port', () => {
    const files = ['enums.js', 'status-icon-sizes.js', 'tileinfo-main.js', 'tileinfo-icons.js', 'player.png', 'icons.png']
    for (const f of files) {
      const p = `${GAMEDATA_PROXY_PREFIX}underhound.eu:8080/gamedata/${SHA}/${f}`
      expect(gamedataUpstream(p), f).toBe(`https://underhound.eu:8080/gamedata/${SHA}/${f}`)
    }
  })

  it('refuses anything that is not a version’s gamedata file', () => {
    const bad = [
      '/',
      '/index.html',
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/`,
      // not a hex version
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/trunk/enums.js`,
      // not a file the loader asks for: the proxy is not a general one
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/morgue.txt`,
      `${GAMEDATA_PROXY_PREFIX}example.com/gamedata/${SHA}/secrets.js`,
      // no escaping the gamedata directory, no userinfo in the host
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/../../enums.js`,
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/socket`,
      `${GAMEDATA_PROXY_PREFIX}user@crawl.dcss.io/gamedata/${SHA}/enums.js`,
    ]
    for (const p of bad) expect(gamedataUpstream(p), p).toBeNull()
  })
})

describe('serveGamedata', () => {
  it('serves upstream JavaScript with CORS and an immutable cache', async () => {
    const res = await serveGamedata(OK, async () => new Response('define(function(){return {}})', { status: 200 }))
    expect(res?.status).toBe(200)
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res?.headers.get('Content-Type')).toContain('text/javascript')
    expect(res?.headers.get('Cache-Control')).toContain('immutable')
    expect(await res?.text()).toContain('define')
  })

  it('serves atlases as images', async () => {
    const png = `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/main.png`
    const res = await serveGamedata(png, async () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }))
    expect(res?.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns null for a path that is not the proxy’s, so the caller can serve the app', async () => {
    expect(await serveGamedata('/index.html', async () => new Response('<!doctype html>'))).toBeNull()
  })

  /**
   * The bug this proxy exists to prevent: when the app shell answers a
   * gamedata path with HTML, the loader evals HTML and throws
   * `Unexpected token '<'`. A failure must arrive as a status, never as a
   * 200 body.
   */
  it('passes an upstream failure through as a status, not as a body', async () => {
    const missing = await serveGamedata(OK, async () => new Response('<html>404</html>', { status: 404 }))
    expect(missing?.status).toBe(404)
    expect(missing?.headers.get('Content-Type')).toContain('text/plain')

    const down = await serveGamedata(OK, async () => {
      throw new Error('connect ECONNREFUSED')
    })
    expect(down?.status).toBe(502)
  })
})

/** a morgue directory as CDI lists it (nginx fancyindex): the parent, and each game's morgue beside its .lst */
const LISTING = [
  '<title>Index of /crawl/morgue/orbrun/</title>',
  '<table id="list"><tbody><tr><td class="link"><a href="../">Parent directory/</a></td><td class="size">-</td></tr>',
  ...['20260914-190808', '20260915-155745'].flatMap((t) => [`morgue-orbrun-${t}.lst`, `morgue-orbrun-${t}.txt`].map((f) => `<tr><td class="link"><a href="${f}" title="${f}">${f}</a></td><td class="size">4.5 KiB</td></tr>`)),
  '<tr><td class="link"><a href="orbrun.where" title="orbrun.where">orbrun.where</a></td></tr></tbody></table>',
].join('\n')

describe('morgue proxy route', () => {
  it('maps a proxy path to the server’s own morgue file, wherever the server keeps it', () => {
    expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/morgue-orbrun-20260910-120000.txt`)).toBe('https://crawl.dcss.io/crawl/morgue/orbrun/morgue-orbrun-20260910-120000.txt')
    expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}crawl.akrasiac.org:8443/rawdata/orbrun/orbrun.txt`)).toBe('https://crawl.akrasiac.org:8443/rawdata/orbrun/orbrun.txt')
    expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}underhound.eu:8080/morgue/orbrun/crash-orbrun-1.txt`)).toBe('https://underhound.eu:8080/morgue/orbrun/crash-orbrun-1.txt')
    // and the `.where` beside them, which the home screen reads to know whether a save is still waiting
    expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/orbrun.where`)).toBe('https://crawl.dcss.io/crawl/morgue/orbrun/orbrun.where')
  })

  it('maps a morgue directory to the server’s own, for the names of the morgues in it', () => {
    expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/`)).toBe('https://crawl.dcss.io/crawl/morgue/orbrun/')
  })

  it('refuses anything that is not a text file or a directory on a plain path', () => {
    const bad = [
      '/',
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/../`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/orbrun/morgue.html`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/orbrun/orbrun.wherever`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/orbrun/../../secrets.txt`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/orbrun/a.txt?x=1`,
      `${MORGUE_PROXY_PREFIX}user@crawl.dcss.io/morgue/orbrun/a.txt`,
      `${MORGUE_PROXY_PREFIX}crawl.dcss.io/gamedata/abc/enums.js`,
      `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/morgue/orbrun/a.txt`,
    ]
    for (const p of bad) expect(morgueUpstream(p), p).toBeNull()
  })

  it('gives a `.where` a cache short enough to catch a death in another browser', async () => {
    const res = await serveMorgue(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/orbrun.where`, async () => new Response('name=orbrun:status=saved', { status: 200 }))
    expect(res!.headers.get('Cache-Control')).toBe('public, max-age=15')
    expect(await res!.text()).toBe('name=orbrun:status=saved')
  })

  it('serves the file as text with CORS and a short cache, and a failure as a status', async () => {
    const ok = `${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/orbrun.txt`
    const res = await serveMorgue(ok, async () => new Response('Dungeon Crawl Stone Soup version 0.34', { status: 200 }))
    expect(res?.status).toBe(200)
    expect(res?.headers.get('Content-Type')).toContain('text/plain')
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(res?.headers.get('Cache-Control')).not.toContain('immutable')
    expect(await res?.text()).toContain('Dungeon Crawl')
    const missing = await serveMorgue(ok, async () => new Response('<html>404</html>', { status: 404 }))
    expect(missing?.status).toBe(404)
    expect(await serveMorgue('/index.html', async () => new Response(''))).toBeNull()
  })

  it('lists a morgue directory as the names of the morgues in it, whatever page the server lists it on', async () => {
    const dir = `${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/`
    // CDI's own listing (fancyindex): the morgues, not their .lst files, the .where or the parent directory
    const cdi = await serveMorgue(dir, async () => new Response(LISTING, { status: 200 }))
    expect((await cdi!.text()).split('\n')).toEqual(['morgue-orbrun-20260914-190808.txt', 'morgue-orbrun-20260915-155745.txt'])
    expect(cdi!.headers.get('Content-Type')).toContain('text/plain')
    // nginx's plain autoindex, which links each file by its name with its date beside it
    const autoindex = '<html><head><title>Index of /morgue/orbrun/</title></head><body><pre><a href="../">../</a>\n<a href="morgue-orbrun-20261001-101010.txt">morgue-orbrun-20261001-101010.txt</a>  01-Oct-2026 10:10  4321\n<a href="orbrun.where">orbrun.where</a></pre></body></html>'
    expect(await (await serveMorgue(dir, async () => new Response(autoindex)))!.text()).toBe('morgue-orbrun-20261001-101010.txt')
    // an empty directory is a listing too: no morgues yet
    const empty = await serveMorgue(dir, async () => new Response('<title>Index of /morgue/orbrun/</title>'))
    expect([empty!.status, await empty!.text()]).toEqual([200, ''])
  })

  it('lists nothing for a page that is no listing: a server that answers every address with its home page', async () => {
    const res = await serveMorgue(`${MORGUE_PROXY_PREFIX}crawl.roguelikes.gg/morgue/orbrun/`, async () => new Response('<html><title>Dungeon Crawl Stone Soup</title><a href="/scores/">Scores</a></html>'))
    expect(res!.status).toBe(404)
  })

  it('passes a Range on, so a list reads only the head of each morgue, which it may keep for good', async () => {
    const file = `${MORGUE_PROXY_PREFIX}crawl.dcss.io/crawl/morgue/orbrun/morgue-orbrun-20260915-155745.txt`
    let asked: RequestInit | undefined
    const res = await serveMorgue(file, async (_u, init) => {
      asked = init
      return new Response('Dungeon Crawl', { status: 206, headers: { 'Content-Range': 'bytes 0-12/10633' } })
    }, 'bytes=0-2047')
    expect(new Headers(asked?.headers).get('Range')).toBe('bytes=0-2047')
    expect(res!.status).toBe(206)
    expect(res!.headers.get('Content-Range')).toBe('bytes 0-12/10633')
    // a morgue never changes once written; a character dump does, with every save
    expect(res!.headers.get('Cache-Control')).toContain('immutable')
    // a Range that is not a plain one is not passed on
    await serveMorgue(file, async (_u, init) => ((asked = init), new Response('x')), 'bytes=0-1,5-9')
    expect(new Headers(asked?.headers).has('Range')).toBe(false)
  })
})


afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('hosted proxy trust boundary', () => {
  it('accepts the exact HTTPS host and port of every bundled official server', () => {
    for (const server of bundledServers) {
      expect(gamedataUpstream(`${GAMEDATA_PROXY_PREFIX}${server.host}/gamedata/${SHA}/enums.js`)).toBe(`${server.http}/gamedata/${SHA}/enums.js`)
      expect(morgueUpstream(`${MORGUE_PROXY_PREFIX}${server.host}/morgue/player/player.txt`)).toBe(`${server.http}/morgue/player/player.txt`)
    }
  })

  it.each(['localhost', '127.0.0.1', '10.0.0.1', '169.254.169.254', '2130706433', '[::1]', 'example.com', 'crawl.dcss.io.evil.test', 'crawl.dcss.io:8080', 'crawl.dcss.io.', 'crawl.dcss.io@evil.test', 'crawl%2edcss.io'])('refuses destination %s without fetching', async (host) => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await serveGamedata(`${GAMEDATA_PROXY_PREFIX}${host}/gamedata/${SHA}/enums.js`, fetcher)).toBeNull()
    expect(await serveMorgue(`${MORGUE_PROXY_PREFIX}${host}/morgue/player/player.txt`, fetcher)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects redirects instead of fetching their destination', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }))
    const res = await serveGamedata(OK, fetcher)
    expect(res?.status).toBe(502)
    expect(await res?.text()).toBe('upstream redirect refused')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual', signal: expect.any(AbortSignal) })
  })

  it('applies the same redirect policy to morgue fetches', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 307, headers: { Location: 'https://crawl.dcss.io/elsewhere.txt' } }))
    expect((await serveMorgue(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/player/player.txt`, fetcher))?.status).toBe(502)
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual')
  })

  it('limits declared and streamed response sizes and cancels the upstream body', async () => {
    const cancel = vi.fn()
    const declared = await serveGamedata(OK, async () => new Response(new ReadableStream({ cancel }), { headers: { 'Content-Length': String(PROXY_LIMITS.scriptBytes + 1) } }))
    expect(declared?.status).toBe(502)
    expect(cancel).toHaveBeenCalledOnce()
    const streamedCancel = vi.fn()
    const streamed = await serveGamedata(OK, async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(PROXY_LIMITS.scriptBytes + 1)) },
      cancel: streamedCancel,
    })))
    expect(streamed?.status).toBe(502)
    expect(streamedCancel).toHaveBeenCalledOnce()
    // The exceeded limit releases shared accounting so a subsequent small request succeeds.
    expect((await serveGamedata(OK, async () => new Response('ok')))?.status).toBe(200)
  })

  it('turns a failed body read into an explicit proxy error', async () => {
    const res = await serveGamedata(OK, async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('upstream failed')) },
    })))
    expect(res?.status).toBe(502)
    expect(res?.headers.get('Cache-Control')).toBe('no-store')
  })

  it('has a total deadline for stalled headers and body, aborts and releases slots', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const pending = serveGamedata(OK, async (_url, init) => {
      signal = init?.signal as AbortSignal
      return new Promise<Response>(() => {})
    })
    await vi.advanceTimersByTimeAsync(PROXY_LIMITS.timeoutMs)
    expect((await pending)?.status).toBe(504)
    expect(signal?.aborted).toBe(true)
    const cancel = vi.fn()
    const bodyPending = serveGamedata(OK, async () => new Response(new ReadableStream({ cancel })))
    await vi.advanceTimersByTimeAsync(PROXY_LIMITS.timeoutMs)
    expect((await bodyPending)?.status).toBe(504)
    expect(cancel).toHaveBeenCalledOnce()
    expect((await serveGamedata(OK, async () => new Response('ok')))?.status).toBe(200)
  })

  it('caps concurrent upstream requests before fetching more', async () => {
    const releases: ((r: Response) => void)[] = []
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((resolve) => releases.push(resolve)))
    const pending = Array.from({ length: PROXY_LIMITS.concurrent }, () => serveGamedata(OK, fetcher))
    expect((await serveGamedata(OK, fetcher))?.status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(PROXY_LIMITS.concurrent)
    for (const release of releases) release(new Response('ok'))
    expect((await Promise.all(pending)).every((r) => r?.status === 200)).toBe(true)
  })

  it('bounds aggregate in-flight body buffers and releases them after completion', async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
    const png = `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${SHA}/main.png`
    const pending = Array.from({ length: 2 }, () => serveGamedata(png, async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.push(controller)
        controller.enqueue(new Uint8Array(PROXY_LIMITS.imageBytes))
      },
    }))))
    // Both streams retain one 8 MiB chunk while waiting for EOF.
    await vi.waitFor(() => expect(controllers).toHaveLength(2))
    await Promise.resolve()
    await Promise.resolve()
    expect((await serveGamedata(OK, async () => new Response('one more byte')))?.status).toBe(503)
    for (const controller of controllers) controller.close()
    expect((await Promise.all(pending)).every((r) => r?.status === 200)).toBe(true)
    expect((await serveGamedata(OK, async () => new Response('ok')))?.status).toBe(200)
  })

  it('does not forward invalid, reversed, unsafe, or oversized byte ranges', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('ok'))
    for (const range of ['bytes=10-1', 'bytes=0-9007199254740992', `bytes=0-${PROXY_LIMITS.morgueBytes}`, 'bytes=0-1,5-9']) {
      await serveMorgue(`${MORGUE_PROXY_PREFIX}crawl.dcss.io/morgue/player/player.txt`, fetcher, range)
      expect(new Headers(fetcher.mock.lastCall?.[1]?.headers).has('Range')).toBe(false)
    }
  })
})

describe('Vite proxy middleware', () => {
  function middleware() {
    let handler!: (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>
    const plugin = gamedataProxy()
    ;(plugin.configureServer as Function)({ middlewares: { use(fn: typeof handler) { handler = fn } } })
    return async (url: string, method = 'GET') => {
      const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() }
      const next = vi.fn()
      await handler({ url, method, headers: {} } as IncomingMessage, res as unknown as ServerResponse, next)
      return { res, next }
    }
  }

  it('returns 404 for refused proxy routes and 405 for mutation methods, without app-shell fallback', async () => {
    const run = middleware()
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const refused = await run('/gamedata-proxy/localhost/gamedata/abc/enums.js')
    expect(refused.res.statusCode).toBe(404)
    expect(refused.next).not.toHaveBeenCalled()
    expect((await run(OK, 'POST')).res.statusCode).toBe(405)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('evicts old cache entries once the entry bound is reached', async () => {
    const run = middleware()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('fixture'))
    vi.stubGlobal('fetch', fetcher)
    const url = (i: number) => `${GAMEDATA_PROXY_PREFIX}crawl.dcss.io/gamedata/${i.toString(16)}/enums.js`
    await run(url(0))
    await run(url(0))
    expect(fetcher).toHaveBeenCalledTimes(1)
    for (let i = 1; i <= PROXY_LIMITS.cacheEntries; i++) await run(url(i))
    await run(url(0))
    expect(fetcher).toHaveBeenCalledTimes(PROXY_LIMITS.cacheEntries + 2)
  })
})
