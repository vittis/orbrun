import { combatActorId as actorKey, hitIntensity, impactStrength, cellKey, type DeathEffect, type Billboard, type Scene, type MeleeAttack, type SpellEffect, type HitIntensity, type DamageType } from '@orbrun/scene'
import { formattedStringToText, type GameState, type ServerMessage, type StatusEntry } from '@orbrun/webtiles'
import { deathFor } from './death-effects'
import { incomingMelee } from './melee-effects'
import { spellText, spellStatuses, type SpellCue } from './spell-effects'

export type PopupKind = 'hit' | 'miss' | 'block' | 'kill' | 'hurt' | 'heal' | 'status' | 'level'
export type PopupTone = DamageType
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
  intensity?: HitIntensity
  /** Presentation delay in milliseconds, measured from the confirmed attack. */
  delay?: number
  turn?: number
  actorId?: string
  death?: DeathEffect
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

/** Only reported damage becomes a number; unknown amounts retain qualitative strength. */
export function combatText(text: string): CombatPopup[] {
  const out: CombatPopup[] = []
  for (const sentence of plain(text).split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim()
    let m: RegExpExecArray | null
    if ((m = /^You (?:kill|destroy|slay|annihilate|obliterate|banish|finish off|blow up) (.+?)[.!]+$/.exec(s))) {
      out.push({ kind: 'kill', text: 'SLAIN', target: m[1], heavy: true })
    } else if ((m = /^(.+?) (?:dies|is killed|is destroyed|crumbles (?:to|into) dust|is blown up)[.!]+$/.exec(s))) {
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
      out.push({ kind: 'hit', text: damage === null ? 'HIT' : String(damage), amount: damage ?? undefined, intensity: hitIntensity(damage ?? undefined, punctuation), target, tone: toneOf(s), heavy: damage !== null ? damage >= 18 : /!!/.test(s), followup, brandOnly: followup, melee })
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
  private cues: SpellCue[] = []
  private spells: SpellEffect[] = []
  private previous: ReturnType<CombatFeedback['snapshot']>
  private lines: string[]
  private ready: boolean
  private history: boolean
  private presented = false
  private scene: Scene | null = null
  private levelKey: string | undefined
  /** Kill messages can follow the map removal across rendered frames. */
  private recentActors = new Map<string, { actor: Billboard; at: number }>()

  constructor(state: GameState) {
    this.previous = this.snapshot(state)
    this.lines = state.messages.lines.map(l => plain(l.text))
    this.ready = state.player.hp_max > 0
    this.history = !this.ready
  }

  private snapshot(state: GameState) {
    const p = state.player
    return { hp: p.hp, max: p.hp_max, xl: p.xl, place: p.place + ':' + p.depth, turn: p.turn, statuses: statuses(p.status), spells: spellStatuses(p.status) }
  }

  observe(state: GameState, msg: ServerMessage) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.resets++
      this.pending = []
      this.incoming = []; this.melee = []; this.cues = []; this.spells = []
      this.scene = null
      this.recentActors.clear()
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
          if (change < 0 || change >= 3) this.pending.push({ kind: change < 0 ? 'hurt' : 'heal', text: change < 0 ? String(change) : '+' + change + ' HP', player: true, amount: Math.abs(change), intensity: hitIntensity(Math.abs(change)), heavy: -change >= next.max * 0.2 })
        }
        if (next.xl > prev.xl) this.pending.push({ kind: 'level', text: 'LEVEL ' + next.xl, player: true, heavy: true })
        for (const [text, tone] of next.statuses) if (!prev.statuses.has(text)) this.pending.push({ kind: 'status', text, tone, player: true })
        for (const [text, kind] of next.spells) if (!prev.spells.has(text)) this.cues.push({ kind, player: true })
        if (prev.statuses.has('POISONED') && !next.statuses.has('POISONED')) this.pending.push({ kind: 'heal', text: 'POISON CLEARED', player: true })
      } else if (this.ready && next.place !== prev.place) {
        this.resets++
        this.pending = []
        this.incoming = []; this.melee = []; this.cues = []; this.spells = []
        this.scene = null
        this.recentActors.clear()
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
          this.cues.push(...spellText(fresh))
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
    this.cues = this.cues.slice(-48)
  }

  takeSpells(): SpellEffect[] { return this.spells.splice(0) }

  takeMelee(): MeleeAttack[] { return this.melee.splice(0) }

  flush(scene: Scene, now = performance.now()): CombatPopup[] {
    const pending = this.pending.splice(0)
    const incoming = this.incoming.splice(0)
    const cues = this.cues.splice(0)
    const old = this.scene
    const sameLevel = old?.playerOnLevel && this.levelKey === scene.levelKey
    this.scene = scene
    this.levelKey = scene.levelKey
    this.presented = scene.playerOnLevel && scene.cells.size > 0
    if (!scene.playerOnLevel) { this.melee = []; this.spells = []; this.recentActors.clear(); return [] }
    if (!sameLevel) this.recentActors.clear()
    if (!pending.length && !incoming.length && !cues.length && old === scene) return []
    const before = actorsIn(sameLevel ? old : null), after = actorsIn(scene)
    const candidates = new Map([...before, ...after])
    for (const [id, seen] of this.recentActors) if (now - seen.at > 2000) this.recentActors.delete(id)
    for (const [id, actor] of candidates) this.recentActors.set(id, { actor, at: now })
    while (this.recentActors.size > 256) this.recentActors.delete(this.recentActors.keys().next().value!)
    // This short memory is used only with an explicit death sentence. Walking,
    // blinking, expired foxfires and leaving sight never establish a kill.
    const deathCandidates = new Map([...this.recentActors].flatMap(([id, { actor }]) =>
      scene.cells.get(cellKey(actor.x, actor.y))?.visibility === 'visible' ? [[id, actor] as const] : []))
    for (const [id, actor] of candidates) deathCandidates.set(id, actor)
    for (const attempt of incoming) {
      const attackers = [...candidates.values()].filter(b => bare(plain(b.name ?? '')) === bare(attempt.attacker)
        && Math.max(Math.abs(b.x - scene.player.x), Math.abs(b.y - scene.player.y)) === 1)
        .sort((a, b) => Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const source = attackers[0]
      if (source) this.melee.push({ from: { x: source.x, y: source.y }, to: { ...scene.player }, fromId: actorKey(source), toId: 'player', style: attempt.style, hit: attempt.hit, tone: attempt.tone, intensity: attempt.intensity })
    }
    this.melee = this.melee.slice(-12)
    const used = new Set<string>()
    const slain = new Set<string>()
    const lastHit = new Map<string, Billboard>()
    const killedNames = new Set(pending.filter(p => p.kind === 'kill').map(p => bare(p.target ?? '')))
    const changed = (b: Billboard) => {
      const id = actorKey(b), was = before.get(id), now = after.get(id)
      return was && now ? Math.max(0, woundRank(now.damage) - woundRank(was.damage)) : 0
    }
    const resolved: CombatPopup[] = pending.flatMap(event => {
      if (event.player) return [event]
      const wanted = bare(event.target ?? '')
      const deathEvidence = (b: Billboard) => killedNames.has(wanted) && deathCandidates.has(actorKey(b)) && !after.has(actorKey(b)) ? 1 : 0
      const pool = event.kind === 'kill' || event.kind === 'hit' && killedNames.has(wanted) ? deathCandidates : candidates
      const matches = [...pool.values()].filter(b => {
        if (event.kind === 'kill' && slain.has(actorKey(b))) return false
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
      if (event.kind === 'kill') { slain.add(id); lastHit.delete(wanted); this.recentActors.delete(id) }
      return [{ ...event, actorId: id, x: b.x, y: b.y, height: Math.min(0.9, b.height),
        ...(event.kind === 'kill' ? { death: deathFor(b, scene.player) } : {}) }]
    })
    // Resolve direct spell results even when they produce no damage popup.
    // Previous visible actors preserve a killing blow's position; never pick a
    // hidden actor or a targeting cursor as evidence of a successful cast.
    const cueUsed = new Set<string>()
    for (const cue of cues) {
      const wanted = bare(cue.target ?? '')
      const matches = [...candidates.values()].filter(b => {
        const ref = b.ref as { name?: string; plural?: string } | undefined
        return [b.name, ref?.name, ref?.plural].some(n => n && bare(plain(n)) === wanted)
      }).sort((a, b) => Number(cueUsed.has(actorKey(a))) - Number(cueUsed.has(actorKey(b)))
        || changed(b) - changed(a)
        || Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const placed = resolved.find(p => bare(p.target ?? '') === wanted && p.x !== undefined && p.y !== undefined)
      const position = cue.player ? scene.player : placed ?? matches[0]
      if (placed?.actorId) cueUsed.add(placed.actorId)
      else if (matches[0]) cueUsed.add(actorKey(matches[0]))
      if (position && position.x !== undefined && position.y !== undefined) this.spells.push({ x: position.x, y: position.y, kind: cue.kind,
        actorId: cue.player ? 'player' : placed?.actorId ?? (matches[0] ? actorKey(matches[0]) : undefined), turn: placed?.turn })
    }
    for (const event of resolved) {
      let kind: SpellEffect['kind'] | undefined
      if (event.kind === 'heal') kind = 'heal'
      else if (event.kind === 'status') kind = /HASTED|BERSERK|INVISIBLE|SILENCED/.test(event.text) ? 'buff' : 'debuff'
      else if (event.kind === 'hit' && (event.amount !== 0 || !event.melee && event.tone !== 'physical')) {
        // A frost/flame brand is already presented by the weapon gesture.
        const brandedMelee = resolved.some(p => p.melee && p.actorId === event.actorId && p.turn === event.turn)
        if (!brandedMelee) kind = event.tone ?? 'physical'
      }
      const position = event.player ? scene.player : event.x === undefined || event.y === undefined ? undefined : { x: event.x, y: event.y }
      // Prefer a specific direct result (draining, holy, air...) over the
      // generic tone attached to the same damage sentence.
      if (kind && position) {
        const existing = event.kind === 'hit' ? this.spells.find(s => s.x === position.x && s.y === position.y) : undefined
        if (!existing) this.spells.push({ ...position, kind, intensity: event.intensity, actorId: event.player ? 'player' : event.actorId, turn: event.turn })
        else if (impactStrength(event.intensity) > impactStrength(existing.intensity)) existing.intensity = event.intensity
      }
    }
    this.spells = this.spells.slice(-48)
    // Wounds help resolve identity above, but never establish an HP amount.
    return resolved
  }
}

function actorsIn(scene: Scene | null) {
  const result = new Map<string, Billboard>()
  if (scene) for (const b of scene.billboards) {
    if (b.kind === 'monster' && !b.scenery && scene.cells.get(cellKey(b.x, b.y))?.visibility === 'visible') result.set(actorKey(b), b)
  }
  return result
}
function woundRank(wound: Billboard['damage']) {
  return wound ? ['uninjured', 'lightly_damaged', 'moderately_damaged', 'heavily_damaged', 'severely_damaged', 'almost_dead'].indexOf(wound) : -1
}
