import { cellKey, type Billboard, type Scene, type MeleeAttack } from '@orbrun/scene'
import { formattedStringToText, type GameState, type ServerMessage, type StatusEntry } from '@orbrun/webtiles'
import { estimateDamage, hitDamageBand, woundRank, type DamageBand } from './damage-estimate'
import { incomingMelee } from './melee-effects'

export type PopupKind = 'hit' | 'miss' | 'block' | 'kill' | 'hurt' | 'heal' | 'status' | 'level'
export type PopupTone = 'physical' | 'fire' | 'cold' | 'poison' | 'acid' | 'electric' | 'magic'
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
  /** A confirmed player melee attempt; kept separate from spell/brand damage. */
  melee?: boolean
  /** A weapon brand's extra sentence, which can recolor the preceding hit. */
  followup?: boolean
  brandOnly?: boolean
  amount?: number
  estimated?: boolean
  band?: DamageBand
  turn?: number
  actorId?: string
  /** A later wound update refines an earlier estimate instead of adding another hit. */
  fromWound?: boolean
}

// Includes Crawl's set_attack_verb variants for weak/strong weapon and unarmed hits.
const attacks = /^(?:hit|slash|slice|stab|pierce|puncture|impale|skewer|spit|stick|perforate|bludgeon|whack|smash|hack|chop|cleave|crush|pummel|thump|sock|punch|kick|headbutt|claw|bite|slap|sting|touch|pound|thrash|lash|shred|mangle|batter|hammer|bash|gore|rip|slam|nick|peck|squeeze|trample|whip|flog|flagellate|rend|tear|scratch|stomp|buffet|lacerate|jab|prick|carve|flay|constrict|smite|strike|burn|freeze|electrocute|drain|blast|dice|fracture|shatter|splatter|open|cut|beat|flatten|eviscerate|tentacle-slap|squash|pulverise|shave)$/i
const bare = (s: string) => s.toLowerCase().replace(/^(?:the |an? |your )/, '').trim()
const plain = (s: string) => formattedStringToText(s).trim()
function toneOf(s: string): PopupTone {
  if (/acid|corro/i.test(s)) return 'acid'
  if (/fire|flame|burn|lava|scorch/i.test(s)) return 'fire'
  if (/cold|frost|freez|ice|icicle/i.test(s)) return 'cold'
  if (/poison|venom/i.test(s)) return 'poison'
  if (/lightning|electr/i.test(s)) return 'electric'
  if (/magic|negative energy|drain|holy/i.test(s)) return 'magic'
  return 'physical'
}

/** Parse reported damage exactly, retaining strength bounds for an explicit estimate later. */
export function combatText(text: string): CombatPopup[] {
  const out: CombatPopup[] = []
  for (const sentence of plain(text).split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim()
    let m: RegExpExecArray | null
    if ((m = /^You (?:kill|destroy|slay|annihilate|obliterate|banish|finish off) (.+?)[.!]+$/.exec(s))) {
      out.push({ kind: 'kill', text: 'SLAIN', target: m[1], heavy: true })
    } else if (/^(?!You\b).+? you(?: with .+?)? but (?:do|does) no damage[.!]+$/.test(s)) {
      // There is no HP delta for a zero-damage incoming hit. Keep the server's explicit result.
      out.push({ kind: 'hurt', text: '0', amount: 0, player: true, tone: toneOf(s) })
    } else if ((m = /^You(?: (?:barely|closely|completely))? miss (.+?)(?: with .+)?[.!]+$/.exec(s))) {
      out.push({ kind: 'miss', text: 'MISS', target: m[1], melee: true })
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
      m = /^You (?:clumsily )?([\w-]+) (.+?)(?:[.!]+)$/.exec(s)
      let target: string | undefined
      let melee = false
      if (m && attacks.test(m[1])) {
        target = m[2]
        melee = !/^(?:smite|burn|freeze|electrocute|drain|blast)$/i.test(m[1])
      }
      else if ((m = /^(?:The|Your) .+? (?:hits?|pierces?|strikes?|burns?|engulfs?|freezes?|skewers?) (.+?)[.!]+$/.exec(s))) target = m[1]
      if (!target || /^you(?:\b|$)/i.test(target)) continue // HP deltas already report incoming damage.
      const number = / for (\d+)(?: damage)?(?=[.!]|$)/.exec(s)
      const noDamage = /but (?:do|does) no damage/.test(s)
      // Native strong-hit descriptions follow the name ("like a sieve", "into
      // ribbons", "mercilessly"); they must not become part of target matching.
      target = target.replace(/(?: with | using | for | but |, | like | into | mercilessly| balefully|'s weak point).*$/, '').trim()
      const damage = noDamage ? 0 : number ? Number(number[1]) : null
      const followup = /^(?:You (?:burn|freeze|electrocute)|The (?:bolt|arrow|slug|stone|sling bullet) (?:burns|freezes|electrocutes))\b/.test(s)
      const punctuation = /[.!]+$/.exec(s)?.[0] ?? '.'
      out.push({ kind: 'hit', text: damage === null ? 'HIT' : String(damage), amount: damage ?? undefined, band: damage === null ? hitDamageBand(punctuation) : undefined, target, tone: toneOf(s), heavy: damage !== null ? damage >= 18 : /!!/.test(s), followup, brandOnly: followup, melee })
    }
  }
  return out
}

const statusRules: [RegExp, string, PopupTone][] = [
  [/pois|poison/i, 'POISONED', 'poison'], [/conf/i, 'CONFUSED', 'magic'],
  [/paral/i, 'PARALYSED', 'magic'], [/slow/i, 'SLOWED', 'cold'],
  [/haste|fast/i, 'HASTED', 'magic'], [/berserk/i, 'BERSERK', 'fire'],
  [/corro/i, 'CORRODED', 'acid'], [/petr/i, 'PETRIFYING', 'physical'],
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
  private incoming: ReturnType<typeof incomingMelee> = []
  private melee: MeleeAttack[] = []
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
    return { hp: p.hp, max: p.hp_max, xl: p.xl, place: p.place + ':' + p.depth, turn: p.turn, statuses: statuses(p.status) }
  }

  observe(state: GameState, msg: ServerMessage) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.resets++
      this.pending = []
      this.incoming = []; this.melee = []
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
        this.incoming = []; this.melee = []
        this.scene = null
        this.presented = false
      }
      this.previous = next
      this.ready = next.max > 0
    }
    if (msg.msg === 'msgs') {
      const lines = state.messages.lines.map(l => plain(l.text))
      if (this.ready && this.presented && !this.history && Array.isArray(msg.messages)) {
        const incoming = msg.messages as { text?: string; turn?: number }[]
        // Crawl replaces the last line to append another sentence. Read only its suffix.
        const rollback = Math.min(this.lines.length, Math.max(0, Number(msg.rollback) || 0))
        const removed = rollback ? this.lines.slice(-rollback).join(' ') : ''
        const texts = incoming.map(l => plain(String(l?.text ?? '')))
        const combined = texts.join(' ')
        const skip = removed && combined.startsWith(removed) ? removed.length : 0
        let offset = 0
        for (let i = 0; i < texts.length; i++) {
          const fresh = texts[i].slice(Math.max(0, skip - offset)).trim()
          offset += texts[i].length + 1
          const turn = incoming[i]?.turn ?? state.player.turn
          this.incoming.push(...incomingMelee(fresh))
          for (const parsed of combatText(fresh)) {
            const event = { ...parsed, turn }
            const hit = event.followup && event.text === 'HIT' ? [...this.pending].reverse().find(p => p.kind === 'hit' && !p.followup && p.turn === turn && bare(p.target ?? '') === bare(event.target ?? '')) : undefined
            if (hit) { hit.tone = event.tone; hit.followup = true }
            else this.pending.push(event)
          }
        }
      }
      if (Array.isArray(msg.messages)) this.history = false
      this.lines = lines
    }
    this.pending = this.pending.slice(-32)
    this.incoming = this.incoming.slice(-12)
  }

  takeMelee(): MeleeAttack[] { return this.melee.splice(0) }

  flush(scene: Scene): CombatPopup[] {
    const pending = this.pending.splice(0)
    const incoming = this.incoming.splice(0)
    const old = this.scene
    this.scene = scene
    this.presented = scene.playerOnLevel && scene.cells.size > 0
    if (!scene.playerOnLevel) { this.melee = []; return [] }
    if (!pending.length && !incoming.length && old === scene) return []
    const before = actorsIn(old), after = actorsIn(scene)
    const candidates = new Map([...before, ...after])
    for (const attempt of incoming) {
      const attackers = [...candidates.values()].filter(b => bare(plain(b.name ?? '')) === bare(attempt.attacker)
        && Math.max(Math.abs(b.x - scene.player.x), Math.abs(b.y - scene.player.y)) === 1)
        .sort((a, b) => Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const source = attackers[0]
      if (source) this.melee.push({ from: { x: source.x, y: source.y }, to: { ...scene.player }, style: attempt.style, hit: attempt.hit })
    }
    this.melee = this.melee.slice(-12)
    const used = new Set<string>()
    const lastHit = new Map<string, Billboard>()
    const killedNames = new Set(pending.filter(p => p.kind === 'kill').map(p => bare(p.target ?? '')))
    const changed = (b: Billboard) => {
      const id = actorKey(b), was = before.get(id), now = after.get(id)
      return was && now ? Math.max(0, woundRank(now.damage) - woundRank(was.damage)) : 0
    }
    const resolved: CombatPopup[] = pending.flatMap(event => {
      if (event.player) return [event]
      const wanted = bare(event.target ?? '')
      const deathEvidence = (b: Billboard) => killedNames.has(wanted) && before.has(actorKey(b)) && !after.has(actorKey(b)) ? 1 : 0
      const matches = [...candidates.values()].filter(b => {
        const ref = b.ref as { name?: string; plural?: string } | undefined
        return [b.name, ref?.name, ref?.plural].some(n => n && bare(plain(n)) === wanted)
      }).sort((a, b) => Number(used.has(actorKey(a))) - Number(used.has(actorKey(b)))
        || (event.kind === 'hit' || event.kind === 'kill' ? deathEvidence(b) - deathEvidence(a) : 0)
        || (event.kind === 'hit' || event.kind === 'kill' ? changed(b) - changed(a) : 0)
        || Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const b = event.kind === 'kill' ? lastHit.get(wanted) ?? matches[0] : matches[0]
      if (!b) return []
      const id = actorKey(b)
      used.add(id)
      if (event.kind === 'hit') lastHit.set(wanted, b)
      return [{ ...event, actorId: id, x: b.x, y: b.y, height: Math.min(0.9, b.height) }]
    })
    // Wound flags arrive independently of attack messages (often in another
    // render frame or player turn). They refine reported hits below, but cannot
    // establish another hit: doing so creates duplicate numbers for one attack.
    const groups = new Map<string, CombatPopup[]>()
    for (const event of resolved) if (event.kind === 'hit' && event.actorId && !event.fromWound) {
      const list = groups.get(event.actorId) ?? []
      list.push(event)
      groups.set(event.actorId, list)
    }
    const replacements = new Map<CombatPopup, CombatPopup>(), removed = new Set<CombatPopup>()
    for (const [id, hits] of groups) {
      const unknown = hits.filter(p => p.amount === undefined)
      if (!unknown.length) continue
      const was = before.get(id), now = after.get(id)
      const compatible = !was || !now || sameForm(was, now)
      const amount = estimateDamage({
        bands: unknown.flatMap(p => p.band ? [p.band] : []),
        averageHp: averageHp(was ?? now),
        before: compatible ? was?.damage : undefined,
        after: compatible ? now?.damage : undefined,
        killed: resolved.some(p => p.kind === 'kill' && p.actorId === id),
        knownDamage: hits.reduce((sum, p) => sum + (p.amount ?? 0), 0),
      })
      if (amount === null) continue
      // One estimate per target/turn, even for quick blades, cleave or several hits.
      const turns = new Map<number | undefined, CombatPopup[]>()
      for (const event of unknown) {
        const list = turns.get(event.turn) ?? []
        list.push(event)
        turns.set(event.turn, list)
      }
      const weight = (list: CombatPopup[]) => list.reduce((sum, p) => sum + (p.band ? (p.band.min + p.band.max) / 2 : 1), 0)
      let budget = Math.max(amount, turns.size), remainingWeight = weight(unknown), left = turns.size
      for (const list of turns.values()) {
        const part = left === 1 ? budget : Math.max(1, Math.min(budget - left + 1, Math.round(budget * weight(list) / remainingWeight)))
        const first = list[0], last = list[list.length - 1]
        replacements.set(first, { ...first, text: '≈' + part, amount: part, estimated: true, brandOnly: list.every(p => p.brandOnly), tone: last.tone ?? first.tone, heavy: part >= 18 })
        for (const extra of list.slice(1)) removed.add(extra)
        budget -= part; remainingWeight -= weight(list); left--
      }
    }
    return resolved.filter(p => !removed.has(p)).map(p => replacements.get(p) ?? p)
  }
}

function actorKey(b: Billboard) {
  const id = b.id ?? (b.ref as { id?: number } | undefined)?.id
  return id === undefined ? `cell:${b.x},${b.y}:${bare(b.name ?? '')}` : 'id:' + id
}
function actorsIn(scene: Scene | null) {
  const result = new Map<string, Billboard>()
  if (scene) for (const b of scene.billboards) {
    if (b.kind === 'monster' && !b.scenery && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible') result.set(actorKey(b), b)
  }
  return result
}
function averageHp(b: Billboard | undefined): number | undefined {
  return (b?.ref as { typedata?: { avghp?: number } } | undefined)?.typedata?.avghp
}
function sameForm(a: Billboard, b: Billboard) {
  return bare(a.name ?? '') === bare(b.name ?? '') && averageHp(a) === averageHp(b)
}
