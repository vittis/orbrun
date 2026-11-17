import { afterEach, expect, it, vi } from 'vitest'
import { cachedAssetFetch } from '../src/asset-cache'

afterEach(() => vi.unstubAllGlobals())

it('reuses immutable assets across loaders without another network request', async () => {
  const entries = new Map<string, Response>()
  const store = {
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => { entries.set(url, response) }),
  }
  const open = vi.fn(async () => store), network = vi.fn(async () => new Response('wasm data'))
  vi.stubGlobal('caches', { open }); vi.stubGlobal('fetch', network)
  const first = cachedAssetFetch('menu-build-a')
  expect(await (await first('/builds/a/crawl.data')).text()).toBe('wasm data')
  const revisit = cachedAssetFetch('menu-build-a')
  expect(await (await revisit('/builds/a/crawl.data')).text()).toBe('wasm data')
  expect(network).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledWith('menu-build-a')
  const abort = new AbortController(); abort.abort()
  await expect(revisit('/builds/a/crawl.data', { signal: abort.signal })).rejects.toThrow()
})

it('keeps working when browser cache storage is unavailable', async () => {
  vi.stubGlobal('caches', { open: async () => { throw Error('denied') } })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('fallback')))
  expect(await (await cachedAssetFetch('menu-build-a')('/builds/a/crawl.data')).text()).toBe('fallback')
})

it('never saves error responses and tolerates failed cache writes', async () => {
  const put = vi.fn(async () => { throw Error('quota') })
  vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('missing', { status: 404 })).mockResolvedValueOnce(new Response('good')))
  const read = cachedAssetFetch('menu-build-a')
  expect((await read('/builds/a/crawl.data')).status).toBe(404)
  expect(put).not.toHaveBeenCalled()
  expect(await (await read('/builds/a/crawl.data')).text()).toBe('good')
  expect(put).toHaveBeenCalledOnce()
})
