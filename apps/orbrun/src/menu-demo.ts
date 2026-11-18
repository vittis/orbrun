import { browserIo, loadGamedata, type Gamedata } from '@orbrun/gamedata'
import { Render25d } from '@orbrun/render-2.5d'
import { emptyScene, type Scene } from '@orbrun/scene'
import { buildScene } from '@orbrun/scene-webtiles'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { CombatFeedback } from './combat-feedback'
import { presentCombat } from './combat-presentation'
import { dungeonOptions } from './dungeon-options'
import { getSettings } from './settings'
import { readReplay, ReplayClock, type ReplayClip } from './menu-replay'
import type manifest from '../data/menu-replays.json'

export interface MenuDemo {
  setActive(active: boolean): void
  refresh(): void
  destroy(): void
}

interface ReplayCallbacks {
  progress(): void
  finished(): void
  failed(error: unknown): void
}

/** Same-origin, version-pinned state and artwork. No server connection or engine. */
export async function loadMenuDemo(canvas: HTMLCanvasElement, signal: AbortSignal, entry: typeof manifest.clips[number],
  callbacks: ReplayCallbacks): Promise<MenuDemo> {
  signal.throwIfAborted()
  const response = await fetch('/menu/' + entry.file, { signal })
  if (!response.ok) throw new Error(`Menu recording ${entry.file}: HTTP ${response.status}`)
  const text = await response.text()
  if (text.length > 2 * 1024 * 1024) throw new Error('Menu recording too large')
  const clip = readReplay(JSON.parse(text), entry.version)
  callbacks.progress()
  const data = await loadGamedata({ base: '/menu', version: entry.version, io: browserIo(), signal, onProgress: callbacks.progress })
  try {
    signal.throwIfAborted()
    return new RecordedMenuDemo(canvas, data, clip, callbacks.finished, callbacks.failed)
  } catch (error) { data.dispose(); throw error }
}

/** Menu clips drive an isolated copy of the dungeon scene and combat presentation. */
class RecordedMenuDemo implements MenuDemo {
  private renderer: Render25d | null = null
  private state = initialState()
  private scene: Scene = emptyScene()
  private feedback = new CombatFeedback(this.state)
  private resize: ResizeObserver | null = null
  private clock!: ReplayClock
  private active = false
  private destroyed = false
  private dirty = true
  private raf = 0
  private nextFrame = 0

  constructor(private canvas: HTMLCanvasElement, private data: Gamedata, clip: ReplayClip, finished: () => void, private failed: (error: unknown) => void) {
    try {
      this.clock = new ReplayClock(clip, messages => this.reset(messages), (messages, projectileTimeMs) => this.apply(messages, projectileTimeMs), finished, error => this.fail(error))
      this.resize = new ResizeObserver(() => { this.fit(); this.wake() })
      this.resize.observe(canvas)
    } catch (error) { this.clock?.destroy(); this.renderer?.destroy(); this.resize?.disconnect(); throw error }
  }

  private reset(messages: ServerMessage[]) {
    this.renderer?.destroy()
    this.renderer = null
    this.state = initialState()
    reduce(this.state, { msg: 'game_started' })
    for (const message of messages) reduce(this.state, message)
    this.scene = emptyScene()
    this.feedback = new CombatFeedback(this.state)
    this.dirty = true
    this.buildScene()
    if (!this.scene.playerOnLevel || !this.scene.cells.size) throw new Error('Menu recording has no dungeon')
    this.renderer = new Render25d({ ...dungeonOptions(getSettings()), minibars: null })
    this.renderer.mount(this.canvas)
    this.renderer.setTiles(this.data)
    this.fit()
    this.renderer.setOptions({ center: this.state.map.viewCenter })
    this.renderer.setScene(this.scene)
    this.wake()
  }

  private apply(messages: ServerMessage[], projectileTimeMs?: number) {
    for (const message of messages) {
      reduce(this.state, message)
      this.feedback.observe(this.state, message)
    }
    // A slug can cross several cells between menu paints. Give the renderer
    // every authored frame so it can interpolate the same path as live play.
    const now = performance.now()
    this.buildScene()
    this.scene.projectileTime = (projectileTimeMs ?? 0) / 1000
    if (this.renderer) {
      this.renderer.setOptions({ center: this.state.map.viewCenter })
      this.renderer.setScene(this.scene, now / 1000)
      presentCombat(this.renderer, this.scene, this.feedback.flush(this.scene, now), this.feedback.takeSpells(),
        this.state.player.inv[this.state.player.weapon_index]?.name, now, getSettings().meleeBumpSpeed)
    }
    this.dirty = true
    this.wake()
  }

  private fit() {
    if (!this.renderer) return
    const rect = this.canvas.getBoundingClientRect()
    const scale = Math.min(1, 1280 / Math.max(1, rect.width), 720 / Math.max(1, rect.height))
    this.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), scale)
    this.dirty = true
  }

  private buildScene() {
    this.scene = buildScene(this.state, this.data, { previous: this.scene, dirty: { cells: this.state.dirtyCells, mapCleared: this.state.mapCleared } })
    this.state.dirtyCells.clear()
    this.state.mapCleared = false
  }

  private wake() {
    if (this.active && !this.destroyed && !this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (!this.active || this.destroyed || !this.renderer) return
    try {
      // RAF timestamps can fall just short of 1/30 s. Keep the phase across
      // refreshes and discard missed slots after a pause or slow draw.
      if (now + 0.5 >= this.nextFrame) {
        const period = 1000 / 30
        this.nextFrame = this.nextFrame > 0 && now - this.nextFrame < period
          ? this.nextFrame + period : now + period
        if (this.dirty || this.renderer.animating) {
          this.renderer.render(now / 1000)
          this.canvas.hidden = false
          this.dirty = false
        }
      }
      if (this.dirty || this.renderer.animating) this.wake()
    } catch (error) { this.fail(error) }
  }

  setActive(active: boolean) {
    if (this.destroyed || this.active === active) return
    this.active = active
    this.clock.setActive(active)
    this.feedback = new CombatFeedback(this.state)
    if (active) this.refresh()
    else {
      cancelAnimationFrame(this.raf); this.raf = 0
      this.renderer?.setOptions({ animate: false })
    }
  }

  /** A settings edit must repaint even when the current recorded scene is resting. */
  refresh() {
    if (this.active) this.renderer?.setOptions(dungeonOptions(getSettings()))
    this.dirty = true
    this.wake()
  }

  private fail(error: unknown) { this.destroy(); this.failed(error) }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.clock.destroy()
    cancelAnimationFrame(this.raf)
    this.resize?.disconnect()
    this.renderer?.destroy()
    this.data.dispose()
    this.canvas.hidden = true
  }
}
