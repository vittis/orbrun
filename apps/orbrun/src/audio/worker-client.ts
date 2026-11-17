import type { FreshMessage } from '../message-occurrences'
import type { PackInfo } from './pack'
import type { PackRequest } from './pack-worker'

export class PackWorker {
  private worker = new Worker(new URL('./pack-worker.ts', import.meta.url), { type: 'module' })
  private next = 0
  private closed = false
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>()

  constructor() {
    this.worker.onmessage = ({ data }) => {
      const request = this.pending.get(data.id)
      if (!request) return
      clearTimeout(request.timer); this.pending.delete(data.id)
      if (data.error) request.reject(new Error(data.error))
      else request.resolve(data.value)
    }
    this.worker.onerror = event => { event.preventDefault(); this.close(new Error('Sound worker failed')) }
    this.worker.onmessageerror = () => this.close(new Error('Sound worker reply failed'))
  }

  private request<T>(data: Omit<Extract<PackRequest, { kind: 'load' }>, 'id'> | Omit<Extract<PackRequest, { kind: 'match' }>, 'id'> | Omit<Extract<PackRequest, { kind: 'asset' }>, 'id'>, timeout: number): Promise<T> {
    if (this.closed || this.pending.size >= 8) return Promise.reject(new Error('Sound worker unavailable or busy'))
    const id = ++this.next
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error('Sound pack took too long; reload or choose another ZIP')), timeout)
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer })
      this.worker.postMessage({ ...data, id }, data.kind === 'load' ? [data.bytes] : [])
    })
  }

  load(bytes: ArrayBuffer) { return this.request<PackInfo>({ kind: 'load', bytes }, 15_000) }
  match(messages: FreshMessage[]) { return this.request<(string | null)[]>({ kind: 'match', messages }, 1000) }
  asset(path: string) { return this.request<ArrayBuffer>({ kind: 'asset', path }, 2000) }

  close(error = new Error('Sound pack closed')) {
    this.closed = true
    this.worker.terminate()
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
    this.pending.clear()
  }
}
