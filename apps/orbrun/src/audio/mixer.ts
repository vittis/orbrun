const MAX_PCM = 32 * 1024 * 1024
const MAX_VOICES = 8
const MAX_AGE = 700

/** One browser context, bounded PCM cache and voices; no game/render scheduling. */
export class SoundMixer {
  private context?: AudioContext
  private master?: GainNode
  private effects?: GainNode
  private voices = new Set<AudioBufferSourceNode>()
  private buffers = new Map<string, AudioBuffer>()
  private decoding = new Map<string, Promise<AudioBuffer>>()
  private bytes = 0
  private generation = 0
  private queue: Promise<void> = Promise.resolve()
  private queued = 0
  private masterVolume = 0.7
  private effectsVolume = 1
  private single = true
  private suspended = false

  constructor(private createContext = () => new AudioContext()) {}

  get running() { return this.context?.state === 'running' && !this.suspended }

  /** Must be invoked directly from a user gesture, before awaiting anything. */
  unlock(): Promise<void> {
    this.suspended = false
    try {
      if (!this.context) {
        this.context = this.createContext()
        this.master = this.context.createGain()
        this.effects = this.context.createGain()
        this.effects.connect(this.master); this.master.connect(this.context.destination)
        this.configure(this.masterVolume, this.effectsVolume, this.single)
      }
      return this.context.resume()
    } catch (error) { return Promise.reject(error) }
  }

  configure(master: number, effects: number, single: boolean) {
    this.masterVolume = master; this.effectsVolume = effects; this.single = single
    if (this.master && this.effects && this.context) {
      this.master.gain.setValueAtTime(master, this.context.currentTime)
      this.effects.gain.setValueAtTime(effects, this.context.currentTime)
    }
    if (!master || !effects) this.stop()
  }

  private async buffer(key: string, load: () => Promise<ArrayBuffer>): Promise<AudioBuffer> {
    const cached = this.buffers.get(key)
    if (cached) { this.buffers.delete(key); this.buffers.set(key, cached); return cached }
    const pending = this.decoding.get(key)
    if (pending) return pending
    const generation = this.generation
    const task = (async () => {
      const bytes = await load()
      const buffer = await this.context!.decodeAudioData(bytes)
      const size = buffer.length * buffer.numberOfChannels * 4
      if (size > MAX_PCM || buffer.duration > 60) throw new Error('Sound exceeds decoded audio limits')
      if (generation === this.generation) {
        while (this.bytes + size > MAX_PCM && this.buffers.size) {
          const oldest = this.buffers.keys().next().value!
          const value = this.buffers.get(oldest)!
          this.bytes -= value.length * value.numberOfChannels * 4; this.buffers.delete(oldest)
        }
        this.buffers.set(key, buffer); this.bytes += size
      }
      return buffer
    })()
    this.decoding.set(key, task)
    try { return await task } finally { if (this.decoding.get(key) === task) this.decoding.delete(key) }
  }

  play(key: string, load: () => Promise<ArrayBuffer>, receivedAt: number, report: (error: unknown) => void = () => {}): Promise<void> {
    if (!this.running || !this.masterVolume || !this.effectsVolume || this.queued >= 16) return Promise.resolve()
    const generation = this.generation
    this.queued++
    this.queue = this.queue.then(async () => {
      if (generation !== this.generation || performance.now() - receivedAt > MAX_AGE) return
      const buffer = await this.buffer(key, load)
      if (generation !== this.generation || !this.running || performance.now() - receivedAt > MAX_AGE) return
      if (this.single) this.stopVoices()
      else if (this.voices.size >= MAX_VOICES) this.endVoice(this.voices.values().next().value!)
      const source = this.context!.createBufferSource()
      source.buffer = buffer
      source.connect(this.effects!)
      this.voices.add(source)
      source.onended = () => { this.voices.delete(source); source.disconnect() }
      source.start()
    }).catch(report).finally(() => { this.queued-- })
    return this.queue
  }

  private endVoice(source: AudioBufferSourceNode) {
    source.onended = null
    try { source.stop() } catch { /* Already ended. */ }
    source.disconnect(); this.voices.delete(source)
  }
  private stopVoices() { for (const source of this.voices) this.endVoice(source) }
  stop() { this.generation++; this.stopVoices() }
  clear() { this.stop(); this.buffers.clear(); this.bytes = 0 }
  suspend() {
    this.suspended = true; this.stop()
    void this.context?.suspend().catch(() => {})
  }
  close() { this.clear(); void this.context?.close().catch(() => {}) }
}
