import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../worker/index'

afterEach(() => vi.unstubAllGlobals())

describe('online Worker boundaries', () => {
  const env = { ASSETS: { fetch: vi.fn(async () => new Response('app')) } }

  it('rejects an unlisted destination before looking in the edge cache', async () => {
    const match = vi.fn(async () => new Response('stale unsafe entry'))
    vi.stubGlobal('caches', { default: { match } })
    const res = await worker.fetch(new Request('https://client.example/gamedata-proxy/evil.example/gamedata/abc/enums.js'), env)
    expect(res.status).toBe(404)
    expect(match).not.toHaveBeenCalled()
  })

  it('drops query strings from validated immutable asset cache keys', async () => {
    const match = vi.fn(async () => new Response('cached enums'))
    vi.stubGlobal('caches', { default: { match } })
    const path = '/gamedata-proxy/crawl.dcss.io/gamedata/abc/enums.js'
    const res = await worker.fetch(new Request('https://client.example' + path + '?random=123'), env)
    expect(await res.text()).toBe('cached enums')
    expect((match.mock.calls[0] as unknown as [Request])[0].url).toBe('https://client.example' + path)
  })

  it('returns an explicit unavailable response without an engine binding', async () => {
    const res = await worker.fetch(new Request('https://client.example/engine/stable/engine.json'), env)
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('Offline play is unavailable')
  })

  it('serves only the bounded menu asset paths and rejects SPA fallbacks', async () => {
    const fetch = vi.fn(async () => new Response('wasm', { headers: { 'Content-Type': 'application/wasm' } }))
    const assets = { ASSETS: { fetch } }
    const path = '/menu-engine/builds/' + 'a'.repeat(40) + '-' + 'b'.repeat(16) + '/crawl.wasm'
    expect((await worker.fetch(new Request('https://client.example' + path), assets)).status).toBe(200)
    fetch.mockClear()
    for (const path of ['/menu-engine/stable/engine.json', '/menu-engine/saves/Player.cs', '/menu-engine/unknown.js']) {
      expect((await worker.fetch(new Request('https://client.example' + path), assets)).status).toBe(404)
    }
    expect(fetch).not.toHaveBeenCalled()
    expect((await worker.fetch(new Request('https://client.example' + path, { method: 'POST' }), assets)).status).toBe(405)
    fetch.mockResolvedValue(new Response('<html>app', { headers: { 'Content-Type': 'text/html' } }))
    expect((await worker.fetch(new Request('https://client.example' + path), assets)).status).toBe(404)
  })

  it('preserves a validated menu asset on repeat-visit cache revalidation', async () => {
    const request = new Request('https://client.example/menu-engine/manifest.json', { headers: { 'If-None-Match': 'engine-v1' } })
    const fetch = vi.fn(async () => new Response(null, { status: 304, headers: { ETag: 'engine-v1' } }))
    const response = await worker.fetch(request, { ASSETS: { fetch } })
    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('engine-v1')
    expect(fetch).toHaveBeenCalledWith(request)
  })
})
