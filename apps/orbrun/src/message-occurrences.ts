import { formattedStringToText, type GameState, type ServerMessage } from '@orbrun/webtiles'

/** A received line with the already-present prefix marked, preserving regex anchor context. */
export interface FreshMessage {
  text: string
  freshFrom: number
  turn?: number
  channel?: number
}

const plain = (text: string) => formattedStringToText(text).trim()

/** Tracks message occurrences, not text/turn identities: identical attacks can be distinct. */
export class MessageOccurrences {
  private lines: string[]
  private history: boolean

  constructor(state: GameState) {
    this.lines = state.messages.lines.map(l => plain(l.text))
    this.history = state.player.hp_max <= 0
  }

  observe(state: GameState, msg: ServerMessage): FreshMessage[] {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.lines = []
      this.history = true
      return []
    }
    if (msg.msg !== 'msgs') return []
    const out: FreshMessage[] = []
    if (Array.isArray(msg.messages)) {
      if (!this.history && state.player.hp_max > 0) {
        const incoming = msg.messages as { text?: unknown; turn?: number; channel?: number }[]
        const rollback = Math.min(this.lines.length, Math.max(0, Number(msg.rollback) || 0))
        const removed = rollback ? this.lines.slice(-rollback).join(' ') : ''
        const texts = incoming.map(l => plain(String(l?.text ?? '')))
        const combined = texts.join(' ')
        const skip = removed && combined.startsWith(removed) ? removed.length : 0
        let offset = 0
        for (let i = 0; i < texts.length; i++) {
          const text = texts[i], freshFrom = Math.max(0, skip - offset)
          offset += text.length + 1
          if (text.slice(freshFrom).trim()) out.push({ text, freshFrom, turn: incoming[i]?.turn ?? state.player.turn, channel: incoming[i]?.channel })
        }
      }
      this.history = false
    }
    this.lines = state.messages.lines.map(l => plain(l.text))
    return out
  }
}
