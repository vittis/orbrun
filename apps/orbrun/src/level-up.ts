import { formattedStringToText, type GameMessage, type GameState, type ServerMessage } from '@orbrun/webtiles'
import { h } from './dom'
import './level-up.css'

const DURATION_MS = 1800
const WIDTH = 240, HEIGHT = 106
// mpr.h MSGCH_INTRINSIC_GAIN; the native announcement precedes attribute_increase.
const LEVEL_GAIN_CHANNEL = 11

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
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    const width = Math.round(WIDTH * dpr), height = Math.round(HEIGHT * dpr)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.frame = ''
    }
    Object.assign(this.canvas.style, {
      left: `${anchor.x}px`, top: `${anchor.y}px`,
      width: `${WIDTH}px`, height: `${HEIGHT}px`,
    })
  }

  render(now: number, visible: boolean, still: boolean) {
    const age = now - this.born
    if (age >= DURATION_MS) this.clear()
    this.root.hidden = !this.active || !visible
    this.root.classList.toggle('still', still)
    if (!this.active || !visible) return
    const tick = still ? 0 : Math.floor(Math.max(0, age) / 33)
    const frame = `${this.announced}:${still}:${tick}`
    if (frame === this.frame) return
    this.frame = frame
    this.paint(still ? 450 : tick * 33, still)
  }

  private paint(age: number, still: boolean) {
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    const dpr = this.canvas.width / WIDTH
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.globalAlpha = still ? 1 : Math.min(1, 0.45 + age / 120) * Math.min(1, (DURATION_MS - age) / 450)
    // A small, feathered backing belongs to the label, never to the screen edges.
    ctx.save()
    ctx.translate(120, 78)
    ctx.scale(1, 31 / 70)
    const mist = ctx.createRadialGradient(0, 0, 0, 0, 0, 70)
    mist.addColorStop(0, '#180d09da')
    mist.addColorStop(1, 'transparent')
    ctx.fillStyle = mist
    ctx.fillRect(-70, -70, 140, 140)
    ctx.restore()
    if (!still) {
      const colours = ['#e7ad73', '#bf6a48', '#f0d4a3', '#aa4c34']
      const t = age / 1000
      for (let i = 0; i < 20; i++) {
        const angle = i * 2.399963, seed = (i * 37 % 23) / 23
        const x = 120 + Math.cos(angle) * (21 + seed * 36) + Math.sin(t * 3 + i) * 4
        const y = 110 - (t * 39 + i * 11 % 49)
        ctx.save()
        ctx.globalAlpha *= (0.5 + seed * 0.4) * Math.min(1, age / 120) * Math.max(0, 1 - age / 1500)
        ctx.fillStyle = colours[i % colours.length]
        ctx.strokeStyle = ctx.fillStyle
        ctx.shadowColor = ctx.fillStyle
        ctx.shadowBlur = i % 4 === 0 ? 4 : 1.5
        ctx.beginPath()
        ctx.arc(x, y, (i % 6 === 0 ? 1.5 : 0.95) + seed * 0.25, 0, Math.PI * 2)
        ctx.fill()
        if (i % 3 === 0) {
          ctx.globalAlpha *= 0.5
          ctx.lineWidth = 0.75
          ctx.beginPath()
          ctx.moveTo(x, y + 1)
          ctx.lineTo(x - Math.cos(angle) * 2, y + 6)
          ctx.stroke()
        }
        ctx.restore()
      }
    }
    const text = (value: string, y: number, size: number, colour: string, weight: number, tracking = 0) => {
      ctx.save()
      ctx.font = `${weight} ${size}px Arial, sans-serif`
      ctx.letterSpacing = `${tracking}px`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = colour
      ctx.shadowColor = '#080605'
      ctx.shadowBlur = 5
      ctx.shadowOffsetY = 1
      ctx.fillText(value, 120, y)
      ctx.restore()
    }
    text('LEVEL UP', 68, 10, '#d7c6aa', 600, 2.1)
    text(String(this.announced), 94, 26, '#e5d6b8', 500)
    const line = ctx.createLinearGradient(100, 0, 140, 0)
    line.addColorStop(0, 'transparent')
    line.addColorStop(0.5, '#a7724a90')
    line.addColorStop(1, 'transparent')
    ctx.fillStyle = line
    ctx.fillRect(100, 102, 40, 0.7)
    ctx.globalAlpha = 1
  }

  get active() { return this.born !== -Infinity }

  clear() {
    this.born = -Infinity
    this.root.hidden = true
    this.announcement.textContent = ''
  }
}
