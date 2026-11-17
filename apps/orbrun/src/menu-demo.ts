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
import manifest from '../data/menu-replays.json'

export interface MenuDemo {
  setActive(active: boolean): void
  chooseRecording(file: string | null): void
  refresh(): void
  destroy(): void
}

/** Same-origin, version-pinned state and artwork. No server connection or engine. */
export async function loadMenuDemo(canvas: HTMLCanvasElement, signal: AbortSignal, failed: () => void): Promise<MenuDemo> {
  signal.throwIfAborted()
  const loading = new AbortController()
  const abort = () => loading.abort()
  signal.addEventListener('abort', abort, { once: true })
  const data = new Map<string, Gamedata>()
  try {
    const [, clips] = await Promise.all([
      Promise.all([...new Set(manifest.clips.map(clip => clip.version))].map(version =>
        loadGamedata({ base: '/menu', version, io: browserIo(), signal: loading.signal }).then(loaded => {
        if (loading.signal.aborted) { loaded.dispose(); loading.signal.throwIfAborted() }
        data.set(version, loaded)
      }))),
      Promise.all(manifest.clips.map(async clip => {
        const response = await fetch('/menu/' + clip.file, { signal: loading.signal })
        if (!response.ok) throw new Error('Menu recording unavailable')
        const text = await response.text()
        if (text.length > 2 * 1024 * 1024) throw new Error('Menu recording too large')
        return readReplay(JSON.parse(text), clip.version)
      })),
    ])
    signal.throwIfAborted()
    return new RecordedMenuDemo(canvas, data, clips, failed)
  } catch (error) { loading.abort(); for (const loaded of data.values()) loaded.dispose(); throw error }
  finally { signal.removeEventListener('abort', abort) }
}

/** The normal dungeon renderer and confirmed combat pipeline, driven by recorded server output. */
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
  private lastFrame = -Infinity
  private data!: Gamedata

  constructor(private canvas: HTMLCanvasElement, private versions: Map<string, Gamedata>, clips: ReplayClip[], private failed: () => void) {
    try {
      this.clock = new ReplayClock(clips, (messages, version) => this.reset(messages, version), messages => this.apply(messages), () => this.fail())
      this.resize = new ResizeObserver(() => { this.fit(); this.wake() })
      this.resize.observe(canvas)
    } catch { this.clock?.destroy(); this.renderer?.destroy(); this.resize?.disconnect(); throw new Error('Menu playback failed to initialize') }
  }

  private reset(messages: ServerMessage[], version: string) {
    this.renderer?.destroy()
    this.renderer = null
    const data = this.versions.get(version)
    if (!data) throw new Error('Menu recording artwork unavailable')
    this.data = data
    this.state = initialState()
    reduce(this.state, { msg: 'game_started' })
    for (const message of messages) reduce(this.state, message)
    this.scene = emptyScene()
    this.feedback = new CombatFeedback(this.state)
    this.dirty = true
    this.flush()
    if (!this.scene.playerOnLevel || !this.scene.cells.size) throw new Error('Menu recording has no dungeon')
    this.renderer = new Render25d({ ...dungeonOptions(getSettings(), false), minibars: null })
    this.renderer.mount(this.canvas)
    this.renderer.setTiles(this.data)
    this.fit()
    this.wake()
  }

  private apply(messages: ServerMessage[]) {
    for (const message of messages) {
      reduce(this.state, message)
      this.feedback.observe(this.state, message)
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

  private flush() {
    if (!this.dirty) return
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
      if (now - this.lastFrame >= 1000 / 30) {
        this.lastFrame = now
        this.flush()
        if (this.dirty || this.renderer.animating) {
          this.renderer.setOptions({ ...dungeonOptions(getSettings(), false), center: this.state.map.viewCenter, minibars: null })
          this.renderer.setScene(this.scene, now / 1000)
          const events = this.feedback.flush(this.scene, now)
          presentCombat(this.renderer, this.scene, events, this.feedback.takeSpells(), this.state.player.inv[this.state.player.weapon_index]?.name,
            now, true, getSettings().meleeBumpSpeed)
          this.renderer.render(now / 1000)
          this.canvas.hidden = false
          this.dirty = false
        }
      }
      if (this.dirty || this.renderer.animating) this.wake()
    } catch { this.fail() }
  }

  setActive(active: boolean) {
    if (this.destroyed || this.active === active) return
    this.active = active
    this.clock.setActive(active)
    this.feedback = new CombatFeedback(this.state)
    if (active) { this.dirty = true; this.wake() }
    else {
      cancelAnimationFrame(this.raf); this.raf = 0
      this.renderer?.setOptions({ animate: false })
    }
  }

  /** A settings edit must repaint even when the current recorded scene is resting. */
  refresh() {
    this.dirty = true
    this.wake()
  }

  chooseRecording(file: string | null) {
    if (this.destroyed) return
    const index = file === null ? null : manifest.clips.findIndex(clip => clip.file === file)
    if (index === -1) return
    this.clock.select(index)
  }

  private fail() { this.destroy(); this.failed() }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.clock.destroy()
    cancelAnimationFrame(this.raf)
    this.resize?.disconnect()
    this.renderer?.destroy()
    for (const data of this.versions.values()) data.dispose()
    this.canvas.hidden = true
  }
}
