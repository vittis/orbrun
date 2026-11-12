import { cm, Keys, MouseMode, MSGCH, type ClientMessage } from '@orbrun/webtiles'
import { dirFromDelta, type Dir8 } from '@orbrun/scene'
import type { Session } from './session'
import { AUTOFIGHT, hasInteractionChoice, type Action, type CommandCategory, type KeyOrText, type RelDir } from './bindings'
import type { Context, Mode } from './context'
import type { FocusOp } from './focus'

/** DCSS movement keys by absolute compass direction. */
const MOVE_KEYS = ['k', 'u', 'l', 'n', 'j', 'b', 'h', 'y'] as const

/** How long a first press of a dangerous action stays armed for its confirming second press. */
const CONFIRM_WINDOW_MS = 2000

/** How long after an `x` went out the targeting mode that follows may still be its look mode. */
export const LOOK_WINDOW_MS = 1500

/** The last compass step sent, used only for teaching feedback. */
export interface LastStep { dir: Dir8; t: number }

export interface RunnerHooks {
  context(): Context
  /** Last confirmed movement heading, for the contextual adjacent-door action. */
  facing?(): Dir8
  /** Update the interaction heading without moving the player or changing the view. */
  direction?(dir: Dir8): void
  ui(op: string, arg?: number, category?: CommandCategory, section?: string): void
  osk(op: string, dir?: Dir8): void
  menu(op: string): void
  focus(op: FocusOp): void
  status(text: string): void
  /** the "confirm dangerous actions" setting: stairs need a second press while hostiles are in view */
  confirmDangerous(): boolean
  now(): number
  /** Keys that leave the level map for another screen went out: keep the map drawn till it is up (map-hold.ts). */
  keepMap?(): void
}

/**
 * Executes actions and owns the only path to `Connection.send` for game
 * input. Compass movement, sequencing with verification, and prompts.
 */
export class Runner {
  private session: Session
  private hooks: RunnerHooks
  private sequence: { steps: (() => Promise<boolean>)[]; abort: () => void } | null = null
  /** Last manual step, used by movement teaching feedback. */
  lastStep: LastStep | null = null
  /** a dangerous action awaiting its confirming second press */
  private armed: { what: string; t: number } | null = null
  /** look mode: `x` went out (`pending`), the server opened its targeting (`active`) */
  private look: { state: 'idle' | 'pending' | 'active'; t: number } = { state: 'idle', t: 0 }

  constructor(session: Session, hooks: RunnerHooks) {
    this.session = session
    this.hooks = hooks
  }

  send(msg: ClientMessage) {
    if (this.session.watching) return
    if (this.hooks.context().mode === 'command' && isLookAround(msg)) this.look = { state: 'pending', t: this.hooks.now() }
    this.session.send(msg)
  }

  /**
   * Whether the targeting up now is the look mode `x` opened. The server
   * reports targeting alone (MOUSE_MODE_TARGET, which aims share); this
   * pairs the `x` that went out with the targeting that follows it, and
   * forgets it when that targeting ends, or when none follows within
   * LOOK_WINDOW_MS (the key was refused, a --more-- came instead). A
   * --more-- or a popup over the look (the description `v` opened; crawl
   * ends the look itself after that, `describe_target` sets `force_cancel`)
   * keeps it, so a look resumed after a --more-- still describes on A rather
   * than travelling. Called once a frame with the mode the server reports.
   */
  examining(mode: Mode): boolean {
    const l = this.look
    if (mode === 'targeting') {
      if (l.state === 'pending') l.state = 'active'
    } else if (l.state === 'active') {
      if (mode !== 'more' && mode !== 'popup') l.state = 'idle'
    } else if (l.state === 'pending' && this.hooks.now() - l.t > LOOK_WINDOW_MS) l.state = 'idle'
    return l.state === 'active' && mode === 'targeting'
  }

  /**
   * Send a key sequence. A step marked `await: 'prompt'` is held until the
   * server leaves command mode for it (the travel prompt, a menu, a popup);
   * if a --more-- shows instead, or nothing changes, the rest is dropped so
   * a refused `G` never leaks its `>` into the dungeon.
   */
  sendKeys(seq: KeyOrText[]) {
    const one = (s: KeyOrText) => this.send('key' in s ? cm.key(s.key) : cm.input(s.text))
    // `opened`: the wait for step i is over, so it goes out even if the mouse mode never left command (a prompt-channel line)
    const from = (i: number, opened = false) => {
      for (; i < seq.length; i++, opened = false) {
        const s = seq[i]
        if (s.await && i > 0 && !opened && this.session.state.inputMode === MouseMode.COMMAND) {
          this.awaitPrompt(() => from(i, true))
          return
        }
        one(s)
      }
    }
    this.abortSequence()
    from(0)
  }

  /**
   * Run `then` once the server has opened something for input, or give up.
   * "Opened" is a mouse mode other than command, a menu, a popup, a text
   * field, or a new line on the prompt channel: `z` asks "Cast which spell?"
   * as an MSGCH_PROMPT message with the mouse mode unchanged (spl-cast.cc
   * `cast_a_spell`, `get_ch`), so the mode alone would never say it is up.
   */
  private awaitPrompt(then: () => void) {
    let done = false
    const rev0 = this.session.state.rev?.messages
    const finish = () => {
      done = true
      unsub()
      clearTimeout(timer)
      this.sequence = null
    }
    const timer = setTimeout(() => {
      if (done) return
      finish()
      this.hooks.status('Aborted: no prompt')
    }, 1500)
    const check = () => {
      if (done) return
      const st = this.session.state
      if (st.messages.more) {
        finish()
        this.hooks.status('Aborted: --more--')
        return
      }
      const lines = st.messages.lines ?? []
      const prompted = st.rev?.messages !== rev0 && lines.length > 0 && lines[lines.length - 1].channel === MSGCH.PROMPT
      if (st.inputMode !== MouseMode.COMMAND || st.menus.length || st.ui.length || st.textInput || prompted) {
        finish()
        then()
      }
    }
    const unsub = this.session.on((e) => {
      if (e.type === 'state') check()
    })
    this.sequence = { steps: [], abort: finish }
    check()
  }

  /** Send compass movement directly; rendering never transforms gameplay input. */
  step(dir: RelDir, opts: { run?: boolean; attack?: boolean } = {}) {
    const { mode } = this.hooks.context()
    if (!['command', 'targeting', 'levelmap', 'prompt'].includes(mode) || this.session.watching) return
    if (mode === 'command') {
      this.lastStep = { dir, t: this.hooks.now() }
      this.hooks.direction?.(dir)
    }
    this.send(dirMessage(dir, opts))
  }

  /** Let the server decide whether a cell click moves, attacks, targets, or describes. */
  clickCell(x: number, y: number, button: number) {
    if (!this.session.watching && button === 1 && this.hooks.context().mode === 'command') {
      const p = this.session.scene.player
      const dx = x - p.x, dy = y - p.y
      const dir = dirFromDelta(dx, dy)
      if (Math.max(Math.abs(dx), Math.abs(dy)) === 1 && dir !== null) this.hooks.direction?.(dir)
    }
    this.send(cm.clickCell(x, y, button))
  }

  /**
   * The level map's cursor moved `dx, dy` cells. WebTiles' map takes no click
   * (local tiles' moves the cursor to the clicked cell, viewmap.cc), so the
   * cursor walks there with the map's own one-cell keys, diagonals first,
   * which keeps every cell on the way inside the box the two ends span.
   */
  mapCursorBy(dx: number, dy: number) {
    if (this.hooks.context().mode !== 'levelmap') return
    while (dx || dy) {
      const sx = Math.sign(dx)
      const sy = Math.sign(dy)
      this.send(dirMessage(dirFromDelta(sx, sy)!, {}))
      dx -= sx
      dy -= sy
    }
  }

  execute(a: Action) {
    switch (a.kind) {
      case 'keys':
        if (a.keepsMap) this.hooks.keepMap?.()
        this.sendKeys(a.seq)
        break
      case 'step':
        this.step(a.dir, { run: a.run, attack: a.attack })
        break
      case 'contextual':
        this.contextual(a.alt)
        break
      case 'fight':
        this.fight()
        break
      case 'examine':
        this.examine()
        break
      case 'fire':
        this.fire()
        break
      case 'menu':
        this.hooks.menu(a.op)
        break
      case 'cursor':
        // targeting: compass directions in targeting and the level map
        this.step(a.dir as RelDir)
        break
      case 'prompt':
        this.send(cm.input(a.hotkey))
        break
      case 'focus':
        this.hooks.focus(a.op)
        break
      case 'ui':
        this.hooks.ui(a.op, a.arg, a.category, a.section)
        break
      case 'osk':
        this.hooks.osk(a.op, a.dir)
        break
      case 'hold':
        // tables hand the tap or hold half to resolve(); executing the pair itself means the tap
        this.execute(a.tap)
        break
    }
  }

  /** RT always uses Crawl's autofight, including its HP cutoff and target selection. */
  fight() {
    if (this.hooks.context().mode !== 'command') return
    this.sendKeys(AUTOFIGHT.kind === 'keys' ? AUTOFIGHT.seq : [])
  }

  /**
   * LT: fire. `f` in command mode, and `f` again inside the aim it opens,
   * where it is CMD_TARGET_SELECT as `.` and Enter are (cmd-keys.h): one
   * key either side of the server's round trip, which is what lets LT be
   * tapped as fast as `f` is spammed on a keyboard, however late the aim
   * arrives. The d-pad walks the cursor along compass directions.
   * Examine mode is not an aim: nothing is sent there.
   */
  fire() {
    const ctx = this.hooks.context()
    if (ctx.mode === 'targeting') {
      if (!ctx.examining) this.send(cm.input('f'))
      return
    }
    if (ctx.mode !== 'command') return
    this.send(cm.input('f'))
  }

  /**
   * R3: examine. `x` in command mode, and inside the look it opens the same
   * button describes the cell under the cursor (`v`, CMD_TARGET_DESCRIBE)
   * rather than travelling there, which is what Enter would do.
   */
  examine() {
    const ctx = this.hooks.context()
    if (ctx.mode === 'targeting') {
      if (ctx.examining) this.send(cm.input('v'))
      return
    }
    if (ctx.mode !== 'command') return
    this.send(cm.input('x'))
  }

  /**
   * A acts underfoot, then on a door ahead. When a usable feature and items
   * share the tile, ask instead of choosing. An explicit alt selects the
   * feature (false) or the items (true) from that chooser.
   */
  contextual(alt?: boolean) {
    const ctx = this.hooks.context()
    if (ctx.mode !== 'command') return
    if (alt === undefined && hasInteractionChoice(ctx)) {
      this.hooks.ui('interact')
      return
    }
    // Explicit pickup from the interaction chooser.
    if (alt) {
      if (ctx.under.kind === 'feature' && ctx.under.items) this.send(cm.input(','))
      return
    }
    const a = ctx.ahead
    const u = ctx.under
    if (u.kind === 'feature') {
      const f = u.feature
      if (f.type === 'stairs' || f.type === 'hatch') {
        if (!this.confirmed('stairs', ctx)) return
        return this.send(cm.input(f.dir === 'down' ? '>' : '<'))
      }
      // altars: DCSS 0.29+ converts with '>' (there is no pray command)
      if (f.type === 'portal' || f.type === 'shop' || f.type === 'transporter' || f.type === 'altar') return this.send(cm.input('>'))
    }
    if (u.kind === 'item' || (u.kind === 'feature' && u.items)) return this.send(cm.input(','))
    if (a.kind === 'feature' && a.feature.type === 'door' && a.feature.state === 'open') return this.closeAhead()
    // Move toward the same adjacent door that supplied the interaction prompt.
    if (a.kind === 'door-closed') return this.step(this.hooks.facing?.() ?? 0)
  }

  /**
   * Close the open door ahead: CMD_CLOSE_DOOR, then the direction only if the
   * server asks for one. With `easy_door` (on by default) and a single open
   * door adjacent, crawl closes it on `C` alone (movement.cc
   * close_door_action); a direction sent anyway would be a step. With more
   * doors, or `easy_door = false`, it prompts "Which direction?" in
   * MOUSE_MODE_TARGET_DIR (target-compass.cc prompt_compass_direction), and
   * that mode is the cue to answer with the interaction heading. The
   * rc does not reach the client, so the mode is the only way to know.
   * Anything else (the door closed, "It's broken", a --more--) ends the wait;
   * the server's own message says what happened.
   */
  private closeAhead() {
    const dir = MOVE_KEYS[this.hooks.facing?.() ?? 0]
    let done = false
    const finish = () => {
      done = true
      unsub()
      clearTimeout(timer)
      this.sequence = null
    }
    const timer = setTimeout(finish, 1500)
    const unsub = this.session.on((e) => {
      if (done) return
      if (e.type === 'state') {
        const st = this.session.state
        if (st.inputMode === MouseMode.TARGET_DIR) {
          finish()
          this.send(cm.input(dir))
        } else if (st.messages.more || st.inputMode !== MouseMode.COMMAND || st.menus.length || st.ui.length || st.textInput) finish()
        return
      }
      // the map moved on with no prompt: the door closed on `C` alone
      if (e.type === 'scene') finish()
    })
    this.abortSequence()
    this.sequence = { steps: [], abort: finish }
    this.send(cm.input('C'))
  }

  /**
   * "Confirm dangerous actions": with the setting on and hostiles in view, a
   * stairs action needs a second press within CONFIRM_WINDOW_MS. Returns
   * whether to go ahead.
   */
  private confirmed(what: string, ctx: Context): boolean {
    if (!this.hooks.confirmDangerous() || ctx.hostilesInView === 0) {
      this.armed = null
      return true
    }
    const now = this.hooks.now()
    if (this.armed && this.armed.what === what && now - this.armed.t <= CONFIRM_WINDOW_MS) {
      this.armed = null
      return true
    }
    this.armed = { what, t: now }
    this.hooks.status(`${ctx.hostilesInView} hostile${ctx.hostilesInView === 1 ? '' : 's'} in view: press again to confirm`)
    return false
  }

  abortSequence() {
    this.sequence?.abort()
    this.sequence = null
  }
}

/** The message the official client sends for a direction key with a modifier. */
function dirMessage(abs: Dir8, opts: { run?: boolean; attack?: boolean }): ClientMessage {
  const letter = MOVE_KEYS[abs]
  if (opts.attack) return cm.key(letter.toUpperCase().charCodeAt(0) - 64)
  if (opts.run) return cm.input(letter.toUpperCase())
  return cm.input(letter)
}

/** CMD_LOOK_AROUND, however it was typed: the `x` key as text or as a keycode. */
function isLookAround(msg: ClientMessage): boolean {
  if (msg.msg === 'input') return msg.text === 'x'
  return msg.msg === 'key' && msg.keycode === 'x'.charCodeAt(0)
}
