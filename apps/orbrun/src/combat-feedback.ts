import { combatActorId as actorKey, hitIntensity, impactStrength, cellKey, type DeathEffect, type Billboard, type Scene, type SpellEffect, type HitIntensity, type DamageType } from '@orbrun/scene'
import { formattedStringToText, type GameState, type ServerMessage } from '@orbrun/webtiles'
import { deathFor } from './death-effects'
import { spellText, spellStatuses, type SpellCue } from './spell-effects'

/** Confirmed combat evidence consumed by renderer effects, never display text. */
export interface CombatEvent {
  kind: 'hit' | 'miss' | 'block' | 'kill' | 'hurt'
  tone?: DamageType
  target?: string
  x?: number
  y?: number
  player?: boolean
  /** A confirmed melee attempt; kept separate from spell/brand damage. */
  melee?: boolean
  /** Message source, matched to a visible, in-range actor for presentation. */
  sourceName?: string
  source?: { x: number; y: number; actorId: string }
  reaching?: boolean
  /** Explicit natural follow-up, such as a minotaur's headbutt. */
  auxiliary?: boolean
  /** A weapon brand's extra sentence, which can recolor the preceding hit. */
  followup?: boolean
  brandOnly?: boolean
  amount?: number
  intensity?: HitIntensity
  turn?: number
  actorId?: string
  death?: DeathEffect
}

// Includes Crawl's set_attack_verb variants for weak/strong weapon and unarmed hits.
const attacks = /^(?:hit|slash|slice|stab|pierce|puncture|impale|skewer|spit|stick|perforate|bludgeon|whack|smash|hack|chop|cleave|crush|pummel|thump|sock|punch|kick|headbutt|claw|bite|slap|sting|touch|pound|thrash|lash|shred|mangle|batter|hammer|bash|gore|rip|slam|nick|peck|squeeze|trample|whip|flog|flagellate|rend|tear|scratch|stomp|buffet|lacerate|jab|prick|carve|flay|constrict|smite|strike|burn|freeze|electrocute|drain|blast|dice|fracture|shatter|splatter|open|cut|beat|flatten|eviscerate|tentacle-slap|squash|pulverise|shave)$/i
const bare = (s: string) => s.toLowerCase().replace(/^(?:the |an? |your )/, '').trim()
const plain = (s: string) => formattedStringToText(s).trim()
function toneOf(s: string): DamageType {
  if (/acid|corro/i.test(s)) return 'acid'
  if (/fire|flame|burn|lava|scorch/i.test(s)) return 'fire'
  if (/cold|frost|freez|ice|icicle/i.test(s)) return 'cold'
  if (/poison|venom/i.test(s)) return 'poison'
  if (/lightning|electr/i.test(s)) return 'electric'
  if (/magic|negative energy|drain|holy/i.test(s)) return 'magic'
  return 'physical'
}

// HP is also spent on spells/abilities (notably Djinni casting), and previews
// can change it too. Only explicit incoming results establish a player hit.
const incomingStrike = /^(?!You\b).+? (?:hits?|bites?|claws?|pecks?|stings?|kicks?|headbutts?|gores?|tramples?|mauls?|constricts?|crushes?|tentacle-slaps?|tail-slaps?|pummels?|bashes?|punches?|slaps?|touches?|strikes?|pierces?|skewers?|engulfs?|burns?|scorches?|freezes?|chills?|electrocutes?|smites?|blasts?|lashes?) you(?:[.!]+| (?:with|for|but) .+[.!]+)$/
// Physical attack grammar only. Spell/projectile subjects may match, but cannot
// produce a bump unless they match a visible creature within melee reach.
const creatureStrike = /^(?!You\b)(.+?) (hits?|bites?|claws?|pecks?|stings?|kicks?|headbutts?|gores?|tramples?|mauls?|crushes?|tentacle-slaps?|tail-slaps?|pummels?|bashes?|punches?|slaps?|touches?|strikes?|pierces?|skewers?|lashes?|(?:barely |closely |completely )?miss(?:es)?) (.+?)[.!]+$/
const incomingSpell = /^You are (?:smitten|burned|burnt|scorched|frozen|electrocuted|blasted|engulfed in .+|struck by .+|blasted with .+)[.!]+$|^Pain shoots through your body[.!]+$|^Your mind is blasted[.!]+$/

/** Parse confirmed outcomes for effect strength and actor matching. */
export function combatText(text: string): CombatEvent[] {
  const out: CombatEvent[] = []
  for (const sentence of plain(text).split(/(?<=[.!?])\s+/)) {
    const s = sentence.trim()
    let m: RegExpExecArray | null
    // Shield blocks confirm a melee attempt even though no damage was dealt.
    if ((m = /^(.+?) blocks? (your|.+?'s|.+?') attack[.!]+$/.exec(s))) {
      const player = m[1] === 'You'
      const sourceName = m[2].replace(/(?:'s|')$/, '')
      out.push({ kind: 'block', melee: true, tone: 'physical',
        ...(player ? { player: true } : { target: m[1] }),
        ...(sourceName === 'your' ? {} : { sourceName }) })
      continue
    }
    // Projectile blocks confirm shield contact, but never a melee lunge.
    if ((m = /^(.+?) blocks? (?:an? |the |your )?(?:arrow|bolt(?: of [\w -]+)?|puff of [\w -]+|sling bullet|stone|javelin|boomerang|large rock|iron shot|crystal spear|orb of [\w -]+)[.!]+$/.exec(s))) {
      out.push({ kind: 'block', tone: 'physical', ...(m[1] === 'You' ? { player: true } : { target: m[1] }) })
      continue
    }
    const strike = creatureStrike.exec(s)
    if (strike && !/^(?:The|Your) (?:(?:bolt|puff)(?: of .+)?|arrow|slug|stone|sling bullet|magic dart|ice thorns)$/.test(strike[1])) {
      const target = strike[3].replace(/(?: from afar| with | using | for | but |, | like | into ).*$/, '').trim()
      const player = target === 'you'
      const miss = /miss/.test(strike[2])
      const number = / for (\d+)(?: damage)?(?=[.!]|$)/.exec(s)
      const amount = /\bno damage\b/.test(s) ? 0 : number ? Number(number[1]) : undefined
      out.push({ kind: miss ? 'miss' : player ? 'hurt' : 'hit', ...(player ? { player: true } : { target }),
        sourceName: strike[1], reaching: /\bfrom afar\b/.test(s), amount, tone: toneOf(s),
        intensity: hitIntensity(amount, /[.!]+$/.exec(s)?.[0]) })
      continue
    }
    if (incomingStrike.test(s) || incomingSpell.test(s)) {
      const number = / for (\d+)(?: damage)?(?=[.!]|$)/.exec(s)
      const amount = number ? Number(number[1]) : undefined
      if (amount !== 0 && !/\bno damage\b/.test(s)) {
        out.push({ kind: 'hurt', player: true, amount, tone: toneOf(s), intensity: hitIntensity(amount, /[.!]+$/.exec(s)?.[0]) })
      }
      continue
    }
    if ((m = /^You (?:kill|destroy|slay|annihilate|obliterate|banish|finish off|blow up) (.+?)[.!]+$/.exec(s))) {
      out.push({ kind: 'kill', target: m[1] })
    } else if ((m = /^(.+?) (?:dies|is killed|is destroyed|crumbles (?:to|into) dust|is blown up)[.!]+$/.exec(s))) {
      out.push({ kind: 'kill', target: m[1] })
    } else if ((m = /^You(?: (?:barely|closely|completely))? miss (.+?)(?: with .+)?[.!]+$/.exec(s))) {
      out.push({ kind: 'miss', target: m[1], melee: true })
    } else {
      // Debug/patched servers append "for N"; ordinary WebTiles sends only punctuation.
      m = /^You (?:clumsily )?([\w-]+) (.+?)(?:[.!]+)$/.exec(s)
      let target: string | undefined
      let melee = false
      let auxiliary = false
      if (m && attacks.test(m[1])) {
        target = m[2]
        melee = !/^(?:smite|burn|freeze|electrocute|drain|blast)$/i.test(m[1])
        auxiliary = /^(?:headbutt|kick|bite|peck|tail-slap|constrict|squeeze)$/i.test(m[1])
      }
      else if ((m = /^(?:The|Your) .+? (?:hits?|pierces?|strikes?|burns?|engulfs?|freezes?|skewers?) (.+?)[.!]+$/.exec(s))) target = m[1]
      else if (!/\b(?:resists?|no damage)\b/i.test(s)) {
        // Direct spells such as Flame Wave, Airstrike and draining have their
        // own result sentences rather than the usual "You hit" wording.
        target = spellText(s).find(cue => cue.target && !cue.player
          && !['heal', 'buff', 'debuff', 'teleport', 'poison'].includes(cue.kind))?.target
      }
      if (!target || /^you(?:\b|$)/i.test(target)) continue
      const number = / for (\d+)(?: damage)?(?=[.!]|$)/.exec(s)
      const noDamage = /but (?:do|does) no damage/.test(s)
      // Native strong-hit descriptions follow the name ("like a sieve", "into
      // ribbons", "mercilessly"); they must not become part of target matching.
      target = target.replace(/(?: with | using | for | but |, | like | into | mercilessly| balefully|'s weak point).*$/, '').trim()
      const damage = noDamage ? 0 : number ? Number(number[1]) : null
      const followup = /^(?:You (?:burn|freeze|electrocute)|The (?:bolt|arrow|slug|stone|sling bullet) (?:burns|freezes|electrocutes))\b/.test(s)
      const punctuation = /[.!]+$/.exec(s)?.[0] ?? '.'
      out.push({ kind: 'hit', amount: damage ?? undefined, intensity: hitIntensity(damage ?? undefined, punctuation), target, tone: toneOf(s), followup, brandOnly: followup, melee, ...(auxiliary ? { auxiliary: true } : {}) })
    }
  }
  return out
}

/** Consumes protocol updates individually, so fast actions between frames aren't lost. */
export class CombatFeedback {
  private pending: CombatEvent[] = []
  private cues: SpellCue[] = []
  private spells: SpellEffect[] = []
  private previous: ReturnType<CombatFeedback['snapshot']>
  private lines: string[]
  private ready: boolean
  private history: boolean
  private presented = false
  private scene: Scene | null = null
  private levelKey: string | undefined
  /** Share same-name attempts across actors, even when packets straddle frames. */
  private meleeAttempts = new Map<string, { turn?: number; count: number }>()
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
    return { hp: p.hp, max: p.hp_max, place: p.place + ':' + p.depth, spells: spellStatuses(p.status) }
  }

  observe(state: GameState, msg: ServerMessage) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') {
      this.pending = []
      this.cues = []; this.spells = []
      this.scene = null
      this.recentActors.clear()
      this.meleeAttempts.clear()
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
          if (change >= 3) this.cues.push({ kind: 'heal', player: true, intensity: hitIntensity(change) })
        }
        for (const [status, kind] of next.spells) if (!prev.spells.has(status)) this.cues.push({ kind, player: true })
        if (prev.spells.has('poisoned') && !next.spells.has('poisoned')) this.cues.push({ kind: 'heal', player: true })
      } else if (this.ready && next.place !== prev.place) {
        this.pending = []
        this.cues = []; this.spells = []
        this.scene = null
        this.recentActors.clear()
        this.meleeAttempts.clear()
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
          this.cues.push(...spellText(fresh))
          for (const parsed of combatText(fresh)) {
            const event = { ...parsed, turn }
            const hit = event.followup && event.amount === undefined ? [...this.pending].reverse().find(p => p.kind === 'hit' && !p.sourceName && !p.followup && p.turn === turn && bare(p.target ?? '') === bare(event.target ?? '')) : undefined
            if (hit) { hit.tone = event.tone; hit.followup = true }
            else this.pending.push(event)
          }
        }
      }
      if (Array.isArray(msg.messages)) this.history = false
      this.lines = lines
    }
    this.pending = this.pending.slice(-32)
    this.cues = this.cues.slice(-48)
  }

  takeSpells(): SpellEffect[] { return this.spells.splice(0) }


  flush(scene: Scene, now = performance.now()): CombatEvent[] {
    const pending = this.pending.splice(0)
    const cues = this.cues.splice(0)
    const old = this.scene
    const sameLevel = old?.playerOnLevel && this.levelKey === scene.levelKey
    this.scene = scene
    this.levelKey = scene.levelKey
    this.presented = scene.playerOnLevel && scene.cells.size > 0
    if (!scene.playerOnLevel) { this.spells = []; this.recentActors.clear(); this.meleeAttempts.clear(); return [] }
    if (!sameLevel) { this.recentActors.clear(); this.meleeAttempts.clear() }
    if (!pending.length && !cues.length && old === scene) return []
    const before = actorsIn(sameLevel ? old : null), after = actorsIn(scene)
    for (const id of this.meleeAttempts.keys()) if (!after.has(id)) this.meleeAttempts.delete(id)
    const candidates = new Map([...before, ...after])
    for (const [id, seen] of this.recentActors) if (now - seen.at > 2000) this.recentActors.delete(id)
    for (const [id, actor] of candidates) this.recentActors.set(id, { actor, at: now })
    while (this.recentActors.size > 256) this.recentActors.delete(this.recentActors.keys().next().value!)
    // This short memory is used only with an explicit death sentence. Walking,
    // blinking, expired foxfires and leaving sight never establish a kill.
    const deathCandidates = new Map([...this.recentActors].flatMap(([id, { actor }]) =>
      scene.cells.get(cellKey(actor.x, actor.y))?.visibility === 'visible' ? [[id, actor] as const] : []))
    for (const [id, actor] of candidates) deathCandidates.set(id, actor)
    const used = new Set<string>()
    const slain = new Set<string>()
    const lastHit = new Map<string, Billboard>()
    const lastMelee = new Map<string, { actor: Billboard; turn?: number }>()
    const killedNames = new Set(pending.filter(p => p.kind === 'kill').map(p => bare(p.target ?? '')))
    const changed = (b: Billboard) => {
      const id = actorKey(b), was = before.get(id), now = after.get(id)
      return was && now ? Math.max(0, woundRank(now.damage) - woundRank(was.damage)) : 0
    }
    const named = (b: Billboard, name: string) => {
      const ref = b.ref as { name?: string; plural?: string } | undefined
      return (!/^your /i.test(name) || b.attitude === 'friendly')
        && [b.name, ref?.name, ref?.plural].some(n => n && bare(plain(n)) === bare(name))
    }
    const meleePair = (event: CombatEvent) => {
      if (!event.sourceName) return undefined
      const sources = [...after.values()].filter(b => named(b, event.sourceName!))
      const targets = event.player ? [undefined] : [...candidates.values()].filter(b => named(b, event.target ?? ''))
      const pairs = sources.flatMap(source => targets.flatMap(target => {
        const position = target ?? scene.player
        const distance = Math.max(Math.abs(source.x - position.x), Math.abs(source.y - position.y))
        return distance >= 1 && distance <= (event.reaching ? 2 : 1)
          ? [{ source, target }] : []
      }))
      // Keep the recipient unambiguous. Native messages omit attacker IDs, so
      // allocate each reported attempt to the least-used matching source this
      // turn rather than suppressing every same-name creature. This is visual
      // attribution only: never multiply the message's damage or effects.
      if (!pairs.length || pairs.some(p => p.target !== pairs[0].target)) return undefined
      const count = (source: Billboard) => {
        const prior = this.meleeAttempts.get(actorKey(source))
        return prior && prior.turn === event.turn ? prior.count : 0
      }
      pairs.sort((a, b) => count(a.source) - count(b.source) || actorKey(a.source).localeCompare(actorKey(b.source)))
      const pair = pairs[0]
      this.meleeAttempts.set(actorKey(pair.source), { turn: event.turn, count: count(pair.source) + 1 })
      while (this.meleeAttempts.size > 256) this.meleeAttempts.delete(this.meleeAttempts.keys().next().value!)
      return pair
    }
    const resolved: CombatEvent[] = pending.flatMap(event => {
      const pair = meleePair(event)
      if (pair) event = { ...event, melee: true, source: { x: pair.source.x, y: pair.source.y, actorId: actorKey(pair.source) } }
      if (event.player) return [event]
      const wanted = bare(event.target ?? '')
      const deathEvidence = (b: Billboard) => killedNames.has(wanted) && deathCandidates.has(actorKey(b)) && !after.has(actorKey(b)) ? 1 : 0
      const pool = event.kind === 'kill' || event.kind === 'hit' && killedNames.has(wanted) ? deathCandidates : candidates
      const matches = [...pool.values()].filter(b => {
        if (event.kind === 'kill' && slain.has(actorKey(b))) return false
        return named(b, event.target ?? '')
      }).sort((a, b) => Number(used.has(actorKey(a))) - Number(used.has(actorKey(b)))
        || (event.kind === 'hit' || event.kind === 'kill' ? deathEvidence(b) - deathEvidence(a) : 0)
        || (event.kind === 'hit' || event.kind === 'kill' ? changed(b) - changed(a) : 0)
        || Math.hypot(a.x - scene.player.x, a.y - scene.player.y) - Math.hypot(b.x - scene.player.x, b.y - scene.player.y))
      const previous = lastMelee.get(wanted)
      const followupTarget = (event.auxiliary || event.followup) && previous?.turn === event.turn ? previous?.actor : undefined
      const b = event.kind === 'kill' ? lastHit.get(wanted) ?? matches[0] : pair?.target ?? followupTarget ?? matches[0]
      if (!b) return []
      const id = actorKey(b)
      used.add(id)
      if (event.melee && !event.sourceName && !event.auxiliary) lastMelee.set(wanted, { actor: b, turn: event.turn })
      if (event.kind === 'hit') lastHit.set(wanted, b)
      if (event.kind === 'kill') { slain.add(id); lastHit.delete(wanted); this.recentActors.delete(id) }
      return [{ ...event, actorId: id, x: b.x, y: b.y,
        ...(event.kind === 'kill' ? { death: deathFor(b, scene.player) } : {}) }]
    })
    // Resolve direct spell results even when they report no damage.
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
      if (position && position.x !== undefined && position.y !== undefined) this.spells.push({ x: position.x, y: position.y, kind: cue.kind, intensity: cue.intensity,
        actorId: cue.player ? 'player' : placed?.actorId ?? (matches[0] ? actorKey(matches[0]) : undefined), turn: placed?.turn })
    }
    for (const event of resolved) {
      let kind: SpellEffect['kind'] | undefined
      if (event.kind === 'hit' && (event.amount !== 0 || !event.melee && event.tone !== 'physical')) {
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
