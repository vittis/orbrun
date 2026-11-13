import { formattedStringToText, type GameMessage, type GameState, type ServerMessage } from '@orbrun/webtiles'
import { h } from './dom'
import './level-up.css'

const DURATION_MS = 3000
const WIDTH = 120, HEIGHT = 60
// mpr.h MSGCH_INTRINSIC_GAIN; the native announcement precedes attribute_increase.
const LEVEL_GAIN_CHANNEL = 11
const GLYPHS: Record<string, string[]> = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
}

/** Presentation only: native messages can confirm XL before the player delta arrives. */
export class LevelUp {
  readonly root = h('div', { class: 'level-up', 'aria-hidden': 'true' })
  readonly announcement = h('div', { class: 'level-up-announcement', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' })
  private canvas = h('canvas', { class: 'level-up-art', width: WIDTH, height: HEIGHT })
  private previous: number
  private announced: number
  private history: boolean
  private born = -Infinity
  private frame = ''

  constructor(state: GameState) {
    this.previous = state.player.received ? state.player.xl : 0
    this.announced = this.previous
    this.history = !state.player.received
    this.root.hidden = true
    this.root.append(this.canvas)
  }

  observe(state: GameState, msg: ServerMessage, now: number) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.clear()
      this.previous = this.announced = 0
      this.history = true
    } else if (msg.msg === 'player') {
      const next = state.player.xl
      if (state.player.hp <= 0) this.clear()
      else if (this.previous > 0 && next > this.previous) this.gain(next, now)
      // A loaded character establishes a baseline; draining permits a later regain.
      if (this.previous <= 0 || next < this.previous) this.announced = next
      this.previous = next
    } else if (msg.msg === 'msgs' && Array.isArray(msg.messages)) {
      if (!this.history && this.previous > 0 && state.player.hp > 0) {
        for (const line of msg.messages as GameMessage[]) {
          if (line?.channel !== LEVEL_GAIN_CHANNEL || typeof line.text !== 'string') continue
          const match = /(?:^|[.!]\s+)You have reached level (\d+)!/.exec(formattedStringToText(line.text))
          if (match) this.gain(Number(match[1]), now)
        }
      }
      // The first message batch on connection is replayed history, including old gains.
      this.history = false
    }
  }

  private gain(level: number, now: number) {
    if (!Number.isInteger(level) || level <= this.announced || level > 27) return
    this.announced = level
    this.root.dataset.level = String(level)
    this.announcement.textContent = `Level up. You are now level ${level}.`
    this.born = now
    this.frame = ''
  }

  /** The anchor is the rendered sprite's head, relative to the dungeon canvas. */
  place(bounds: { left: number; top: number; width: number; height: number }, anchor: { x: number; y: number }) {
    Object.assign(this.root.style, {
      left: `${bounds.left}px`, top: `${bounds.top}px`,
      width: `${bounds.width}px`, height: `${bounds.height}px`,
    })
    const scale = bounds.width < WIDTH * 2 ? 1 : 2
    Object.assign(this.canvas.style, {
      left: `${Math.round(anchor.x)}px`, top: `${Math.round(anchor.y)}px`,
      width: `${WIDTH * scale}px`, height: `${HEIGHT * scale}px`,
    })
  }

  render(now: number, visible: boolean, still: boolean) {
    const age = now - this.born
    if (age >= DURATION_MS) this.clear()
    this.root.hidden = !this.active || !visible
    this.root.classList.toggle('still', still)
    if (!this.active || !visible) return
    const tick = still ? 0 : Math.floor(Math.max(0, age) / 50)
    const frame = `${this.announced}:${still}:${tick}`
    if (frame === this.frame) return
    this.frame = frame
    this.paint(still ? 450 : tick * 50, still)
  }

  private paint(age: number, still: boolean) {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.globalAlpha = still || age < 2400 ? 1 : Math.ceil((DURATION_MS - age) / 150) / 4
    const rect = (x: number, y: number, w: number, h: number, colour: string) => {
      ctx.fillStyle = colour
      ctx.fillRect(Math.round(x), Math.round(y), w, h)
    }
    // Uneven dried-blood silhouette, broken crust, and short hanging drips.
    rect(10, 12, 99, 34, '#160e0c')
    rect(6, 18, 107, 20, '#160e0c')
    rect(12, 11, 94, 3, '#8e2423')
    rect(8, 17, 103, 22, '#50191a')
    rect(14, 14, 90, 29, '#361416')
    for (let i = 0; i < 20; i++) {
      const x = 9 + (i * 29 % 101), y = 12 + (i * 17 % 32)
      rect(x, y, 2 + i % 4, 1 + i % 3, i % 3 ? '#71201e' : '#a33128')
    }
    for (let i = 0; i < 7; i++) {
      const x = 17 + i * 13
      rect(x, 41, 3, 3 + i * 7 % 9, '#52181a')
      rect(x + 1, 43, 1, 2 + i * 7 % 9, '#9a2925')
    }
    // Loose blood pixels and bone chips fly out on a stepped, bounded burst.
    for (let i = 0; i < 28; i++) {
      const angle = i * 2.39996, t = still ? 0.38 : Math.min(1.4, age / 650)
      const travel = (still ? 13 : 8 + t * 28) + i % 5 * 2
      const x = 60 + Math.cos(angle) * travel * 1.6
      const y = 28 + Math.sin(angle) * travel * 0.65 + (still ? 0 : t * t * 12)
      if (!still && age > 1100 + i % 4 * 100) continue
      const size = i % 5 === 0 ? 3 : 2
      rect(x - 1, y - 1, size + 2, size + 2, '#180c0c')
      rect(x, y, size, size, i % 5 === 0 ? '#bba77a' : i % 2 ? '#a83028' : '#681c20')
      if (i % 5 === 0) rect(x, y, 1, 1, '#eddbb2')
    }
    const text = (value: string, y: number, size: number, colour: string) => {
      const start = Math.round((WIDTH - (value.length * 6 - 1) * size) / 2)
      for (let i = 0; i < value.length; i++) GLYPHS[value[i]]?.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') {
          rect(start + (i * 6 + gx) * size + 1, y + gy * size + 2, size + 1, size, '#160b0b')
        }
      })
      for (let i = 0; i < value.length; i++) GLYPHS[value[i]]?.forEach((row, gy) => {
        for (let gx = 0; gx < row.length; gx++) if (row[gx] === '1') {
          rect(start + (i * 6 + gx) * size, y + gy * size, size, size, gy < 3 ? colour : '#c4a36b')
        }
      })
    }
    const kick = !still && age < 200 ? [0, -1, 1, 0][Math.floor(age / 50)] : 0
    text('LEVEL UP', 16 + kick, 2, '#f5dfaa')
    text(String(this.announced), 32, 2, '#f1c36e')
    ctx.globalAlpha = 1
  }

  get active() { return this.born !== -Infinity }

  clear() {
    this.born = -Infinity
    this.root.hidden = true
    this.announcement.textContent = ''
  }
}
