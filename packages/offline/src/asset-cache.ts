/** Optional cache for immutable engine assets, separate from save/account storage. */
export function cachedAssetFetch(name: string): typeof fetch {
  const cache = typeof caches === 'undefined' ? Promise.resolve(null) : caches.open(name).catch(() => null)
  return async (input, init) => {
    const signal = init?.signal
    signal?.throwIfAborted()
    const store = await cache
    const hit = await store?.match(input).catch(() => undefined)
    signal?.throwIfAborted()
    if (hit) return hit
    const response = await fetch(input, { ...init, cache: 'force-cache' })
    if (store && response.status === 200 && response.type !== 'opaque') {
      // Disk writes are best-effort and never delay the first frame.
      void store.put(input, response.clone()).catch(() => {})
    }
    return response
  }
}
