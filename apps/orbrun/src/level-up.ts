import type { GameState, ServerMessage } from '@orbrun/webtiles'
import { h } from './dom'
import './level-up.css'

const DURATION_MS = 3400

/** Receipt-time XL snapshots: the reducer mutates the same player object. */
export class LevelUp {
  readonly root = h('div', { class: 'level-up', 'aria-hidden': 'true' })
  readonly announcement = h('div', { class: 'level-up-announcement', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' })
  private number = h('strong', { class: 'level-up-number' })
  private previous: number
  private born = -Infinity

  constructor(state: GameState) {
    this.previous = state.player.received ? state.player.xl : 0
    this.root.hidden = true
    const shards = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2
      return h('i', { class: 'level-up-shard', style: {
        '--dx': `${Math.cos(angle) * (110 + i % 3 * 24)}px`,
        '--dy': `${Math.sin(angle) * (45 + i % 3 * 12)}px`,
        '--turn': `${i * 31}deg`,
      } })
    })
    this.root.append(h('div', { class: 'level-up-seal' },
      h('div', { class: 'level-up-flare' }), ...shards,
      h('div', { class: 'level-up-copy' },
        h('span', { class: 'level-up-heading' }, 'Level up'),
        h('div', { class: 'level-up-medallion' }, this.number),
        h('span', { class: 'level-up-caption' }, 'Deeper. Stronger.'))))
  }

  observe(state: GameState, msg: ServerMessage, now: number) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.clear()
      this.previous = 0
    } else if (msg.msg === 'player') {
      const next = state.player.xl
      if (state.player.hp <= 0) this.clear()
      else if (state.player.received && this.previous > 0 && Number.isInteger(next) && next > this.previous) {
        this.number.textContent = String(next)
        this.announcement.textContent = `Level up. You are now level ${next}.`
        this.born = now
      }
      this.previous = next
    }
  }

  place(bounds: { left: number; top: number; width: number; height: number }) {
    Object.assign(this.root.style, {
      left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    })
  }

  render(now: number, visible: boolean, still: boolean) {
    const age = now - this.born
    if (age >= DURATION_MS) this.clear()
    this.root.hidden = !this.active || !visible
    this.root.classList.toggle('still', still)
    if (this.active) this.root.style.setProperty('--level-age', `${Math.max(0, age)}ms`)
  }

  get active() { return this.born !== -Infinity }

  clear() {
    this.born = -Infinity
    this.root.hidden = true
    this.announcement.textContent = ''
  }
}
