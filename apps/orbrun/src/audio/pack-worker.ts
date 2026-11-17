import { matchSound, readPack, type SoundPack } from './pack'
import type { FreshMessage } from '../message-occurrences'

export type PackRequest = { id: number } & (
  | { kind: 'load'; bytes: ArrayBuffer }
  | { kind: 'match'; messages: FreshMessage[] }
  | { kind: 'asset'; path: string })

let pack: SoundPack | null = null
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<PackRequest>) => void; postMessage(data: unknown, transfer?: Transferable[]): void }
scope.onmessage = ({ data }) => {
  try {
    if (data.kind === 'load') {
      pack = null
      pack = readPack(new Uint8Array(data.bytes))
      scope.postMessage({ id: data.id, value: pack.info })
    } else {
      if (!pack) throw new Error('No sound pack loaded')
      if (data.kind === 'match') {
        if (data.messages.length > 32) throw new Error('Too many sound messages')
        scope.postMessage({ id: data.id, value: data.messages.map(m => matchSound(pack!, m)) })
      } else {
        const file = pack.files[data.path]
        if (!file) throw new Error('Sound file unavailable')
        const bytes = Uint8Array.from(file).buffer
        scope.postMessage({ id: data.id, value: bytes }, [bytes])
      }
    }
  } catch (error) {
    scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'Sound pack failed' })
  }
}
