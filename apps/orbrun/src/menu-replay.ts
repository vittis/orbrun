import type { ServerMessage } from '@orbrun/webtiles'

export interface ReplayClip {
  format: 1
  version: string
  initial: ServerMessage[]
  frames: { after: number; messages: ServerMessage[] }[]
}

/** Bundled recordings contain state, never client commands or executable WebTiles HTML. */
export const REPLAY_MESSAGES = new Set(['map', 'player', 'msgs'])

export function readReplay(value: unknown, version: string): ReplayClip {
  const clip = value as ReplayClip
  const messages = (items: unknown): items is ServerMessage[] => Array.isArray(items)
    && items.length <= 10000 && items.every(m => m && REPLAY_MESSAGES.has(m.msg))
  if (!clip || clip.format !== 1 || clip.version !== version || !messages(clip.initial)
    || !clip.initial.some(m => m.msg === 'map') || !clip.initial.some(m => m.msg === 'player')
    || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 3000
    || !clip.frames.every(f => f && Number.isFinite(f.after) && f.after >= 16 && f.after <= 2000 && messages(f.messages))) {
    throw new Error('Invalid menu recording')
  }
  return clip
}

/** One recorded batch at a time. Pauses retain their remaining delay; no catch-up bursts. */
export class ReplayClock {
  private clip = 0
  private frame = 0
  private active = false
  private destroyed = false
  private remaining = 0
  private due = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private clips: ReplayClip[], private reset: (messages: ServerMessage[]) => void,
    private apply: (messages: ServerMessage[]) => void, private failed: () => void) {
    if (!clips.length) throw new Error('Empty menu playlist')
    this.begin()
  }

  private begin() {
    this.frame = 0
    // The reducer may mutate nested message data. Every loop starts with fresh messages.
    this.reset(structuredClone(this.clips[this.clip].initial))
    this.remaining = this.clips[this.clip].frames[0].after
  }

  private schedule() {
    this.due = performance.now() + this.remaining
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.active || this.destroyed) return
      try {
        const frames = this.clips[this.clip].frames
        if (this.frame === frames.length) {
          this.clip = (this.clip + 1) % this.clips.length
          this.begin()
        } else {
          this.apply(structuredClone(frames[this.frame++].messages))
          this.remaining = frames[this.frame]?.after ?? 1600
        }
        this.schedule()
      } catch { this.destroy(); this.failed() }
    }, this.remaining)
  }

  setActive(active: boolean) {
    if (this.destroyed || this.active === active) return
    this.active = active
    if (active) this.schedule()
    else {
      this.remaining = Math.max(0, this.due - performance.now())
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  destroy() { this.destroyed = true; this.active = false; clearTimeout(this.timer) }
}
