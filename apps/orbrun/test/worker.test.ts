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
})
