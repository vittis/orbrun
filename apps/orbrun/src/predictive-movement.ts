import { DIR8_DX, DIR8_DY, getCell, monstersInView, type Dir8 } from '@orbrun/scene'
import { MouseMode, type ClientMessage, type ServerMessage } from '@orbrun/webtiles'
import type { CameraController } from './camera'
import type { Session } from './session'

/** A stalled connection must not leave the eye on an unconfirmed tile indefinitely. */
export const PREDICTION_TIMEOUT_MS = 1500

/**
 * Presentation only. WebTiles has no input sequence acknowledgements, so never
 * extrapolate a queue of moves. Count sent inputs and command-ready boundaries
 * conservatively; a missing boundary disables prediction, not ordinary input.
 * No commands are generated, held, replayed or discarded here.
 */
export class PredictiveMovement {
  private inputs = 0
  private replied = false
  private pending: { x: number; y: number; place: string; at: number } | null = null

  constructor(private session: Session, private cam: CameraController, private enabled: () => boolean) {}

  sent(msg: ClientMessage, dir: Dir8 | null, now: number) {
    if (!['input', 'key', 'text_input', 'click_cell'].includes(msg.msg)) return
    // Menu/prompt keys do not each produce a dungeon command-ready boundary.
    // Counting them as walks would disable prediction after closing a menu.
    if ((dir === null && this.session.state.inputMode !== MouseMode.COMMAND) || this.session.state.menus.length || this.session.state.ui.length) {
      this.cancel(now)
      return
    }
    const idle = this.inputs === 0
    this.inputs++
    if (dir === null) {
      this.cancel(now)
      return
    }
    if (!idle || this.pending || !this.canPredict(dir)) return
    const p = this.session.scene.player
    if (!this.cam.predictStep(p.x + DIR8_DX[dir], p.y + DIR8_DY[dir], now / 1000)) return
    this.pending = { x: p.x, y: p.y, place: this.place(), at: now }
    this.replied = false
  }

  state(msg: ServerMessage, now: number) {
    if (msg.msg === 'game_client' || msg.msg === 'go_lobby') return this.reset(now)
    if (this.session.state.menus.length || this.session.state.ui.length) {
      this.inputs = 0
      this.replied = true
    }
    if (msg.msg !== 'input_mode') return
    if (msg.mode === MouseMode.COMMAND) {
      this.inputs = Math.max(0, this.inputs - 1)
      this.replied = true
    } else if (msg.mode !== MouseMode.NORMAL) {
      // A prompt is also an answer, but not permission to predict movement.
      this.inputs = 0
      this.replied = true
    }
  }

  /** Called after scene rebuilding, before the normal camera walk is scheduled. */
  reconcile(now: number, hops: readonly { dx: number; dy: number }[], jumped: boolean): boolean {
    const pending = this.pending
    if (!pending) return false
    const scene = this.session.scene
    if (!scene.playerOnLevel || pending.place !== this.place() || jumped) {
      this.reset(now)
      return false
    }
    const p = scene.player
    if (p.x === pending.x && p.y === pending.y) return false
    this.pending = null
    this.replied = false
    // More than one actual hop is not the single predicted path (even when
    // the net destination happens to match). Let the normal path handle it.
    if (hops.length <= 1 && this.cam.confirmPrediction(p.x, p.y, now / 1000)) return true
    this.cam.cancelPrediction(now / 1000)
    return false
  }

  /** Also handles replies containing only a refusal/prompt, with no scene update. */
  update(now: number) {
    if (!this.pending) return
    if (!this.enabled() || this.session.closed || this.session.watching || this.cam.reducedMotion ||
        this.replied || now - this.pending.at >= PREDICTION_TIMEOUT_MS) this.cancel(now)
  }

  reset(now: number) {
    this.cancel(now)
    this.inputs = 0
  }

  private cancel(now: number) {
    this.pending = null
    this.replied = false
    this.cam.cancelPrediction(now / 1000)
  }

  private place(): string {
    const p = this.session.state.player
    return `${p.place}:${p.depth}`
  }

  private canPredict(dir: Dir8): boolean {
    const s = this.session
    const p = s.scene.player
    const c = this.cam.camera
    if (!this.enabled() || s.server.offline || s.closed || !s.conn.open || s.watching || !s.scene.playerOnLevel ||
        s.state.inputMode !== MouseMode.COMMAND || s.state.menus.length || s.state.ui.length ||
        s.state.player.status.length || monstersInView(s.scene).length ||
        s.state.player.pos?.x !== p.x || s.state.player.pos?.y !== p.y || c.x !== p.x || c.y !== p.y) return false
    const x = p.x + DIR8_DX[dir], y = p.y + DIR8_DY[dir]
    const clear = (cx: number, cy: number) => {
      const cell = getCell(s.scene, cx, cy)
      return cell?.visibility === 'visible' && cell.kind === 'floor' && !cell.occluder && !cell.feature &&
        !cell.flags.water && !cell.flags.lava && !cell.flags.excluded &&
        !s.scene.billboards.some((b) => b.x === cx && b.y === cy && b.kind !== 'player')
    }
    // Diagonals must not predict a route through a door or an occluding corner.
    return clear(p.x, p.y) && clear(x, y) &&
      (DIR8_DX[dir] === 0 || DIR8_DY[dir] === 0 || (clear(x, p.y) && clear(p.x, y)))
  }
}
