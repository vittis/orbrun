import { MessageOccurrences, type FreshMessage } from '../message-occurrences'
import { getSettings, type Settings } from '../settings'
import type { Session } from '../session'
import { SoundMixer } from './mixer'
import { type PackInfo } from './pack'
import { downloadOSP, packHash, PackStore, type StoredPack } from './store'
import { PackWorker } from './worker-client'

export interface AudioStatus { busy: boolean; message: string; info?: PackInfo; hash?: string }

/** App-owned assets/mixer; each GameScreen owns only its subscription and playback epoch. */
export class AudioController {
  private settings: Settings
  private worker?: PackWorker
  private generation = 0
  private playback = 0
  private operation?: AbortController
  private loaded?: StoredPack
  private restored = false
  private matching = false
  private messages: { message: FreshMessage; at: number }[] = []
  private listeners = new Set<(status: AudioStatus) => void>()
  private status: AudioStatus = { busy: false, message: 'Download CNC Open Sound Pack or import an OSP ZIP.' }
  private hidden = () => {
    this.resetPlayback()
    if (document.hidden) this.mixer.suspend()
    // Resume only on the next user gesture; never play missed background events.
  }
  private gesture = () => { if (this.settings.audioEnabled && !document.hidden && !this.mixer.running) this.unlock() }
  private changed = () => this.configure(getSettings(), true)

  constructor(private store = new PackStore(), private mixer = new SoundMixer(), private makeWorker = () => new PackWorker()) {
    this.settings = getSettings()
    document.addEventListener('visibilitychange', this.hidden)
    document.addEventListener('pointerdown', this.gesture, true)
    document.addEventListener('keydown', this.gesture, true)
    window.addEventListener('orbrun-settings', this.changed)
    window.addEventListener('pagehide', this.hidden)
    this.configure(this.settings)
  }

  snapshot() { return this.status }
  subscribe(listener: (status: AudioStatus) => void) {
    this.listeners.add(listener); listener(this.status)
    return () => { this.listeners.delete(listener) }
  }
  private publish(status: AudioStatus) { this.status = status; for (const listener of this.listeners) listener(status) }
  private error(error: unknown) {
    this.publish({ ...this.status, busy: false, message: error instanceof Error ? error.message : 'Audio unavailable' })
  }
  private unlock() { void this.mixer.unlock().catch(error => this.error(error)) }

  configure(settings: Settings, gesture = false) {
    const wasEnabled = this.settings.audioEnabled
    this.settings = settings
    this.mixer.configure(settings.masterVolume, settings.effectsVolume, settings.singleSoundChannel)
    if (!settings.audioEnabled) {
      this.resetPlayback(); this.mixer.suspend()
      if (wasEnabled && this.status.busy) this.cancel()
    } else {
      if (gesture && !document.hidden) this.unlock()
      if (!this.restored && !this.status.busy) void this.restore()
    }
  }

  prepare() { if (!this.restored && !this.status.busy) void this.restore() }

  private resetPlayback() { this.playback++; this.messages = []; this.mixer.stop() }
  private cancel() {
    this.generation++
    this.operation?.abort(); this.operation = undefined
    this.worker?.close(); this.worker = undefined
    this.loaded = undefined
    this.resetPlayback(); this.mixer.clear()
    this.publish({ busy: false, message: 'Sound loading cancelled. Download or import a pack to try again.' })
  }

  /** Cache restore does not silently download a large pack. Downloads are explicit UI actions. */
  async restore() {
    this.restored = true
    await this.load(async () => {
      const cached = await this.store.read()
      if (!cached) return undefined
      if (cached.hash !== await packHash(cached.blob)) throw new Error('Cached sound pack is damaged; download or import it again')
      return cached
    }, false)
  }

  async download() {
    await this.load(async signal => {
      const blob = await downloadOSP(signal, bytes => { if (!signal.aborted) this.publish({ busy: true, message: `Downloading OSP… ${(bytes / 1_000_000).toFixed(1)} MB` }) })
      return { blob, source: 'osp', name: 'CNC Open Sound Pack', hash: await packHash(blob) }
    }, true)
  }

  async importZip(file: File) {
    await this.load(async () => ({ blob: file, source: 'file', name: file.name, hash: await packHash(file) }), true)
  }

  private async load(obtain: (signal: AbortSignal) => Promise<StoredPack | undefined>, persist: boolean) {
    this.cancel()
    this.restored = true
    const generation = this.generation
    const operation = this.operation = new AbortController()
    const current = () => generation === this.generation && !operation.signal.aborted
    const timer = setTimeout(() => { if (current()) { this.cancel(); this.error(new Error('Sound loading timed out; try again')) } }, 120_000)
    this.publish({ busy: true, message: 'Loading sound pack…' })
    try {
      const pack = await obtain(operation.signal)
      if (!current()) return
      if (!pack) { this.publish({ busy: false, message: 'Download CNC Open Sound Pack or import an OSP ZIP.' }); return }
      const worker = this.worker = this.makeWorker()
      const info = await worker.load(await pack.blob.arrayBuffer())
      if (!current()) return
      this.loaded = pack
      let cached = true
      if (persist) {
        try { await this.store.write(pack) } catch { cached = false }
      }
      if (!current()) return
      this.publish({ busy: false, info, hash: pack.hash,
        message: `${info.rules} sound rules ready${info.warnings ? `; ${info.warnings} invalid or missing rules skipped` : ''}.${cached ? '' : ' Cache unavailable; this pack will need loading again next visit.'}` })
    } catch (error) {
      if (current()) { this.worker?.close(); this.worker = undefined; this.error(error) }
    } finally {
      clearTimeout(timer)
      if (current()) this.operation = undefined
    }
  }

  async remove() {
    this.cancel(); this.loaded = undefined; this.restored = true
    const generation = this.generation
    try { await this.store.clear(); if (generation === this.generation) this.publish({ busy: false, message: 'Sound pack removed from this device.' }) }
    catch (error) { if (generation === this.generation) this.error(error) }
  }

  testSound() {
    if (!this.settings.audioEnabled) { this.error(new Error('Enable sound effects first.')); return }
    if (!this.worker || !this.status.info) { this.error(new Error('Load a sound pack first.')); return }
    const epoch = this.playback
    void this.mixer.unlock().then(() => {
      if (epoch === this.playback) this.enqueue([{ text: 'You hit the orc.', freshFrom: 0 }])
    }).catch(error => this.error(error))
  }

  attach(session: Session): () => void {
    this.resetPlayback()
    let live = !session.closed
    const messages = new MessageOccurrences(session.state)
    const unsubscribe = session.on(event => {
      if (event.type === 'closed') { live = false; this.resetPlayback() }
      if (event.type !== 'state') return
      const fresh = messages.observe(session.state, event.msg)
      if (event.msg.msg === 'game_client') { live = true; this.resetPlayback() }
      if (event.msg.msg === 'go_lobby' || event.msg.msg === 'game_ended') { live = false; this.resetPlayback() }
      if (live && fresh.length) this.enqueue(fresh)
    })
    return () => { unsubscribe(); this.resetPlayback() }
  }

  private enqueue(messages: FreshMessage[]) {
    if (!this.settings.audioEnabled || document.hidden || !this.worker || !this.status.info || this.status.busy || !this.mixer.running) return
    const at = performance.now()
    this.messages.push(...messages.slice(-32).filter(m => m.text.length <= 16_384).map(message => ({ message, at })))
    this.messages = this.messages.slice(-32)
    void this.drain()
  }

  private async drain() {
    if (this.matching) return
    this.matching = true
    try {
      while (this.messages.length && this.worker) {
        const worker = this.worker, epoch = this.playback, batch = this.messages.splice(0), pack = this.loaded
        let paths: (string | null)[]
        try { paths = await worker.match(batch.map(b => b.message)) }
        catch (error) {
          if (epoch === this.playback) { this.cancel(); this.error(error) }
          continue
        }
        if (epoch !== this.playback || worker !== this.worker) continue
        paths.forEach((path, i) => {
          if (path) this.mixer.play(`${pack?.hash}:${path}`, () => worker.asset(path), batch[i].at, error => {
            if (epoch === this.playback) this.error(error)
          })
        })
      }
    } finally { this.matching = false }
  }

  destroy() {
    this.cancel(); this.mixer.close(); this.listeners.clear()
    document.removeEventListener('visibilitychange', this.hidden)
    document.removeEventListener('pointerdown', this.gesture, true)
    document.removeEventListener('keydown', this.gesture, true)
    window.removeEventListener('orbrun-settings', this.changed)
    window.removeEventListener('pagehide', this.hidden)
  }
}

let controller: AudioController | undefined
export function audio() { return controller ??= new AudioController() }
