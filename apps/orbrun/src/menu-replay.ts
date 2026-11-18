import type { ServerMessage } from '@orbrun/webtiles'

export interface ReplayClip {
  format: 1
  version: string
  initial: ServerMessage[]
  frames: { after: number; projectileTimeMs?: number; messages: ServerMessage[] }[]
}

export const REPLAY_END_HOLD_MS = 1600

/** Bundled recordings contain state, never client commands or executable WebTiles HTML. */
export const REPLAY_MESSAGES = new Set(['map', 'player', 'msgs'])

export function readReplay(value: unknown, version: string): ReplayClip {
  const clip = value as ReplayClip
  const messages = (items: unknown): items is ServerMessage[] => Array.isArray(items)
    && items.length <= 10000 && items.every(m => m && REPLAY_MESSAGES.has(m.msg))
  if (!clip || clip.format !== 1 || clip.version !== version || !messages(clip.initial)
    || !clip.initial.some(m => m.msg === 'map') || !clip.initial.some(m => m.msg === 'player')
    || !Array.isArray(clip.frames) || !clip.frames.length || clip.frames.length > 3000
    || !clip.frames.every(f => f && Number.isFinite(f.after) && f.after >= 0 && f.after <= 2000
      && (f.projectileTimeMs === undefined || Number.isFinite(f.projectileTimeMs) && f.projectileTimeMs >= 0) && messages(f.messages))) {
    throw new Error('Invalid menu recording')
  }
  return clip
}

/** Each shuffle visits the entire manifest, even when recordings are loaded on demand. */
export class ReplayPlaylist {
  private order: number[] = []
  private last = -1

  constructor(private count: number, private random = Math.random) {
    if (!count) throw new Error('Empty menu playlist')
  }

  next(afterManualChoice?: number) {
    if (afterManualChoice !== undefined) {
      this.last = afterManualChoice
      this.order = []
    }
    if (!this.order.length) {
      this.order = Array.from({ length: this.count }, (_, i) => i)
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1))
        ;[this.order[i], this.order[j]] = [this.order[j], this.order[i]]
      }
      // Every clip gets a turn; a new shuffle cannot repeat the last one immediately.
      if (this.order.length > 1 && this.order[0] === this.last) {
        const j = 1 + Math.floor(this.random() * (this.order.length - 1))
        ;[this.order[0], this.order[j]] = [this.order[j], this.order[0]]
      }
    }
    this.last = this.order.shift()!
    return this.last
  }
}

/** One recorded batch at a time. Pauses retain their remaining delay; no catch-up bursts. */
export class ReplayClock {
  private frame = 0
  private active = false
  private destroyed = false
  private remaining = 0
  private due = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private clip: ReplayClip, private reset: (messages: ServerMessage[]) => void,
    private apply: (messages: ServerMessage[], projectileTimeMs?: number) => void, private finished: () => void, private failed: (error: unknown) => void) {
    this.begin()
  }

  private begin() {
    this.frame = 0
    // The reducer may mutate nested message data. Every loop starts with fresh messages.
    this.reset(structuredClone(this.clip.initial))
    this.remaining = this.clip.frames[0].after
  }

  private schedule(from = performance.now()) {
    this.due = from + this.remaining
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.active || this.destroyed) return
      try {
        const frames = this.clip.frames
        if (this.frame === frames.length) {
          this.finished()
          if (this.destroyed) return
          this.begin()
          this.schedule()
        } else {
          // Processing a map consumes part of the interval to the next one.
          // After a stalled tab, resume here instead of rushing through turns.
          const now = performance.now()
          const start = now - this.due > 1000 / 30 ? now : this.due
          // Same-timestamp maps can describe multiple confirmed projectile
          // positions. Publish each before yielding to the next paint.
          do {
            const frame = frames[this.frame++]
            this.apply(structuredClone(frame.messages), frame.projectileTimeMs)
          } while (frames[this.frame]?.after === 0)
          this.remaining = frames[this.frame]?.after ?? REPLAY_END_HOLD_MS
          this.schedule(start)
        }
      } catch (error) { this.destroy(); this.failed(error) }
    }, Math.max(0, this.due - performance.now()))
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
