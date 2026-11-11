import { cellKey, type Billboard, type Scene } from '@orbrun/scene'
import { formattedStringToText, type GameState, type ServerMessage, type StatusEntry } from '@orbrun/webtiles'

export type PopupKind = 'hit' | 'miss' | 'block' | 'kill' | 'hurt' | 'heal' | 'status' | 'level'
export type PopupTone = 'physical' | 'fire' | 'cold' | 'poison' | 'magic'
export interface CombatPopup {
  text: string
  kind: PopupKind
  tone?: PopupTone
  target?: string
  x?: number
  y?: number
  height?: number
  player?: boolean
  heavy?: boolean
  /** A weapon brand's extra sentence, which can recolor the preceding hit. */
  followup?: boolean
}

const attacks = /^(?:hit|slash|slice|stab|pierce|impale|skewer|bludgeon|whack|smash|hack|chop|cleave|crush|pummel|thump|punch|kick|headbutt|claw|bite|slap|sting|touch|pound|thrash|lash|shred|mangle|batter|hammer|bash|gore|rip|slam|nick|peck|squeeze|trample|whip|rend|tear|scratch|stomp|buffet|lacerate|jab|prick|carve|flay|constrict|smite|strike|burn|freeze|electrocute|drain|blast)$/i
const bare = (s: string) => s.toLowerCase().replace(/^(?:the |an? |your )/, '').trim()
const plain = (s: string) => formattedStringToText(s).trim()
function toneOf(s: string): PopupTone {
  if (/fire|flame|burn|lava|scorch/i.test(s)) return 'fire'
  if (/cold|frost|freez|ice|icicle/i.test(s)) return 'cold'
  if (/poison|acid|venom/i.test(s)) return 'poison'
  if (/magic|lightning|electric|negative energy|drain|holy/i.test(s)) return 'magic'
  return 'physical'
}

/** Only explicit combat sentences; never infer a damage number from wound pips. */
export function combatText(text: string): CombatPopup[] {
  const out: CombatPopup[] = []
  for (const sentence of plain(text).split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim()
    let m: RegExpExecArray | null
    if ((m = /^You (?:kill|destroy|slay|annihilate|obliterate|banish|finish off) (.+?)[.!]+$/.exec(s))) {
      out.push({ kind: 'kill', text: 'SLAIN', target: m[1], heavy: true })
    } else if ((m = /^You(?: (?:barely|closely|completely))? miss (.+?)(?: with .+)?[.!]+$/.exec(s))) {
      out.push({ kind: 'miss', text: 'MISS', target: m[1] })
    } else if (/^(?!You\b).+? (?:(?:barely|closely|completely) )?(?:misses|fails to hit) you[.!]+$/.test(s)) {
      out.push({ kind: 'miss', text: 'DODGED', player: true })
    } else if (/^You (?:block|reflect) .+[.!]+$/.test(s)) {
      out.push({ kind: 'block', text: 'BLOCKED', player: true })
    } else if ((m = /^(.+?) blocks your .+[.!]+$/.exec(s))) {
      out.push({ kind: 'block', text: 'BLOCKED', target: m[1] })
    } else if ((m = /^(?:The|Your) .+? misses (.+?)[.!]+$/.exec(s))) {
      out.push({ kind: 'miss', text: bare(m[1]) === 'you' ? 'DODGED' : 'MISS', target: m[1], player: bare(m[1]) === 'you' })
    } else {
      // Debug/patched servers append "for N"; ordinary WebTiles sends only punctuation.
      m = /^You ([\w-]+) (.+?)(?:[.!]+)$/.exec(s)
      let target: string | undefined
      if (m && attacks.test(m[1])) target = m[2]
      else if ((m = /^(?:The|Your) .+? (?:hits|pierces|strikes|burns|engulfs|freezes) (.+?)[.!]+$/.exec(s))) target = m[1]
      if (!target || /^you(?:\b|$)/i.test(target)) continue // HP deltas already report incoming damage.
      const number = / for (\d+)(?: damage)?(?=[.!]|$)/.exec(s)
      const noDamage = /but (?:do|does) no damage/.test(s)
      target = target.replace(/(?: with | using | for | but |, ).*$/, '').trim()
      const damage = noDamage ? 0 : number ? Number(number[1]) : null
      const followup = /^(?:You (?:burn|freeze|electrocute)|The (?:bolt|arrow|slug|stone|sling bullet) (?:burns|freezes|electrocutes))\b/.test(s)
      out.push({ kind: 'hit', text: damage === null ? 'HIT' : String(damage), target, tone: toneOf(s), heavy: damage !== null ? damage >= 18 : /!!/.test(s), followup })
    }
  }
  return out
}

const statusRules: [RegExp, string, PopupTone][] = [
  [/pois|poison/i, 'POISONED', 'poison'], [/conf/i, 'CONFUSED', 'magic'],
  [/paral/i, 'PARALYSED', 'magic'], [/slow/i, 'SLOWED', 'cold'],
  [/haste|fast/i, 'HASTED', 'magic'], [/berserk/i, 'BERSERK', 'fire'],
  [/corro/i, 'CORRODED', 'poison'], [/petr/i, 'PETRIFYING', 'physical'],
  [/invis/i, 'INVISIBLE', 'magic'], [/silence|silenced/i, 'SILENCED', 'magic'],
  [/held|net|web/i, 'HELD', 'physical'],
]
function statuses(entries: StatusEntry[]) {
  const result = new Map<string, PopupTone>()
  for (const entry of entries) {
    const rule = statusRules.find(([re]) => re.test(entry.light || entry.text || ''))
    if (rule) result.set(rule[1], rule[2])
  }
  return result
}

/** Consumes protocol updates individually, so fast actions between frames aren't lost. */
export class CombatFeedback {
  resets = 0
  private pending: CombatPopup[] = []
  private previous: ReturnType<CombatFeedback['snapshot']>
  private lines: string[]
  private ready: boolean
  private history: boolean
  private presented = false
  private scene: Scene | null = null

  constructor(state: GameState) {
    this.previous = this.snapshot(state)
    this.lines = state.messages.lines.map(l => plain(l.text))
    this.ready = state.player.hp_max > 0
    this.history = !this.ready
  }

  private snapshot(state: GameState) {
    const p = state.player
    return { hp: p.hp, max: p.hp_max, xl: p.xl, place: p.place + ':' + p.depth, statuses: statuses(p.status) }
  }

  observe(state: GameState, msg: ServerMessage) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.resets++
      this.pending = []
      this.scene = null
      this.presented = false
      this.ready = false
      this.history = true
      this.lines = []
      this.previous = this.snapshot(state)
      return
    }
    if (msg.msg === 'player') {
      const next = this.snapshot(state), prev = this.previous
      if (this.ready && this.presented && next.place === prev.place) {
        // Max-HP changes (berserk, forms, draining, levelling) aren't damage/healing.
        if (next.max === prev.max && next.hp !== prev.hp) {
          const change = next.hp - prev.hp
          if (change < 0 || change >= 3) this.pending.push({ kind: change < 0 ? 'hurt' : 'heal', text: change < 0 ? String(change) : '+' + change + ' HP', player: true, heavy: -change >= next.max * 0.2 })
        }
        if (next.xl > prev.xl) this.pending.push({ kind: 'level', text: 'LEVEL ' + next.xl, player: true, heavy: true })
        for (const [text, tone] of next.statuses) if (!prev.statuses.has(text)) this.pending.push({ kind: 'status', text, tone, player: true })
        if (prev.statuses.has('POISONED') && !next.statuses.has('POISONED')) this.pending.push({ kind: 'heal', text: 'POISON CLEARED', player: true })
      } else if (this.ready && next.place !== prev.place) {
        this.resets++
        this.pending = []
        this.scene = null
        this.presented = false
      }
      this.previous = next
      this.ready = next.max > 0
    }
    if (msg.msg === 'msgs') {
      const lines = state.messages.lines.map(l => plain(l.text))
      if (this.ready && this.presented && !this.history && Array.isArray(msg.messages)) {
        const incoming = msg.messages as { text?: string }[]
        // Crawl replaces the last line to append another sentence. Read only its suffix.
        const rollback = Math.min(this.lines.length, Math.max(0, Number(msg.rollback) || 0))
        const removed = rollback ? this.lines.slice(-rollback).join(' ') : ''
        let fresh = incoming.map(l => plain(String(l?.text ?? ''))).join(' ')
        if (removed && fresh.startsWith(removed)) fresh = fresh.slice(removed.length).trim()
        else if (removed === fresh) fresh = ''
        for (const event of combatText(fresh)) {
          const hit = event.followup && event.text === 'HIT' ? [...this.pending].reverse().find(p => p.kind === 'hit' && !p.followup && bare(p.target ?? '') === bare(event.target ?? '')) : undefined
          if (hit) { hit.tone = event.tone; hit.followup = true }
          else this.pending.push(event)
        }
      }
      if (Array.isArray(msg.messages)) this.history = false
      this.lines = lines
    }
    this.pending = this.pending.slice(-32)
  }

  flush(scene: Scene): CombatPopup[] {
    const pending = this.pending.splice(0)
    const old = this.scene
    this.scene = scene
    this.presented = scene.playerOnLevel && scene.cells.size > 0
    if (!scene.playerOnLevel || !pending.length) return []
    const candidates = new Map<string, Billboard>()
    for (const view of [old, scene]) if (view) for (const b of view.billboards) {
      if (b.kind !== 'monster' || b.scenery || view.cells.get(cellKey(b.x, b.y))?.visibility !== 'visible') continue
      const id = (b.ref as { id?: number } | undefined)?.id
      candidates.set(id === undefined ? b.x + ',' + b.y : 'id:' + id, b)
    }
    const used = new Set<Billboard>()
    const lastHit = new Map<string, Billboard>()
    return pending.flatMap(event => {
      if (event.player) return [event]
      const wanted = bare(event.target ?? '')
      const matches = [...candidates.values()].filter(b => {
        const ref = b.ref as { name?: string; plural?: string } | undefined
        return [b.name, ref?.name, ref?.plural].some(n => n && bare(plain(n)) === wanted)
      }).sort((a, b) => Number(used.has(a)) - Number(used.has(b)) || Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const b = event.kind === 'kill' ? lastHit.get(wanted) ?? matches[0] : matches[0]
      if (!b) return [] // Never put a hit on an unrelated creature or an unseen square.
      used.add(b)
      if (event.kind === 'hit') lastHit.set(wanted, b)
      return [{ ...event, x: b.x, y: b.y, height: Math.min(0.9, b.height) }]
    })
  }
}
