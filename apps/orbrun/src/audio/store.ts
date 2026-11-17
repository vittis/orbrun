import { MAX_PACK_BYTES, OSP_URL } from './pack'

export interface StoredPack { hash: string; name: string; source: 'osp' | 'file'; blob: Blob }

/** One selected archive per device, with content identity rather than URL-only identity. */
export class PackStore {
  private mutations: Promise<unknown> = Promise.resolve()
  private async database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('orbrun.audio', 1)
      let finished = false
      const fail = (error: unknown) => { finished = true; clearTimeout(timer); reject(error) }
      const timer = setTimeout(() => fail(new Error('Audio cache unavailable')), 3000)
      request.onupgradeneeded = () => request.result.createObjectStore('packs')
      request.onsuccess = () => { clearTimeout(timer); if (finished) request.result.close(); else { finished = true; resolve(request.result) } }
      request.onerror = () => fail(request.error)
      request.onblocked = () => fail(new Error('Audio cache is blocked by another tab'))
    })
  }

  private async transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.database()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('packs', mode)
      const request = run(tx.objectStore('packs'))
      const timer = setTimeout(() => tx.abort(), 5000)
      tx.oncomplete = () => { clearTimeout(timer); db.close(); resolve(request.result) }
      tx.onabort = tx.onerror = () => { clearTimeout(timer); db.close(); reject(tx.error ?? new Error('Audio cache failed')) }
    })
  }

  async read(): Promise<StoredPack | undefined> { return this.transaction('readonly', store => store.get('selected')) }
  async write(pack: StoredPack) {
    const write = this.mutations.catch(() => {}).then(() => this.transaction('readwrite', store => store.put(pack, 'selected')))
    this.mutations = write; await write
  }
  async clear() {
    const clear = this.mutations.catch(() => {}).then(() => this.transaction('readwrite', store => store.delete('selected')))
    this.mutations = clear; await clear
  }
}

export async function packHash(blob: Blob): Promise<string> {
  if (!blob.size || blob.size > MAX_PACK_BYTES) throw new Error('Choose a ZIP smaller than 64 MB')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
}

/** No proxy, credentials or redirects; enforce limits even without Content-Length. */
export async function downloadOSP(signal: AbortSignal, progress: (bytes: number) => void): Promise<Blob> {
  const response = await fetch(OSP_URL, { signal, credentials: 'omit', redirect: 'error', cache: 'no-cache' })
  if (!response.ok || !response.body) throw new Error(`OSP download failed (${response.status})`)
  if (Number(response.headers.get('content-length')) > MAX_PACK_BYTES) {
    await response.body.cancel()
    throw new Error('Sound pack exceeds 64 MB')
  }
  const reader = response.body.getReader()
  const chunks: ArrayBuffer[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_PACK_BYTES) throw new Error('Sound pack exceeds 64 MB')
      chunks.push(Uint8Array.from(value).buffer)
      progress(total)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return new Blob(chunks, { type: 'application/zip' })
}
