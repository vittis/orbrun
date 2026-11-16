import { browserIo, loadGamedata, type Gamedata } from '@orbrun/gamedata'
import { createEngineWorker, type FromWorker, type ToWorker } from '@orbrun/offline'
import { Render25d } from '@orbrun/render-2.5d'
import { emptyScene, type Scene } from '@orbrun/scene'
import { buildScene } from '@orbrun/scene-webtiles'
import { initialState, reduce, type ServerMessage } from '@orbrun/webtiles'
import { CombatFeedback } from './combat-feedback'
import { presentCombat } from './combat-presentation'
import { dungeonOptions } from './dungeon-options'
import { getSettings } from './settings'
import { MENU_RC, menuArgs, MenuDemoController } from './menu-demo-controller'

export interface MenuDemo {
  setActive(active: boolean): void
  destroy(): void
}

const ROOT = '/menu-engine'

/** Load only this deployment's pinned assets. Never visits the offline lobby or account storage. */
export async function loadMenuDemo(canvas: HTMLCanvasElement, signal: AbortSignal, failed: () => void): Promise<MenuDemo> {
  const response = await fetch(`${ROOT}/manifest.json`, { signal })
  if (!response.ok) throw new Error('Menu engine unavailable')
  const manifest = await response.json() as { protocol: number; build: string; gamedata: string }
  if (manifest.protocol !== 1 || !/^[a-f0-9]{40}-[a-f0-9]{16}$/.test(manifest.build) || !/^[a-f0-9]{40}$/.test(manifest.gamedata)) {
    throw new Error('Invalid menu engine manifest')
  }
  const data = await loadGamedata({ base: ROOT, version: manifest.gamedata, io: browserIo(), signal })
  if (signal.aborted) { data.dispose(); throw signal.reason }
  try { return new LiveMenuDemo(canvas, data, `${ROOT}/builds/${manifest.build}/`, failed) }
  catch (error) { data.dispose(); throw error }
}

/** Owns exactly one engine and one instance of the normal dungeon renderer. No DOM input or audio. */
class LiveMenuDemo implements MenuDemo {
  private worker: Worker | null = null
  private renderer: Render25d
  private state = initialState()
  private scene: Scene = emptyScene()
  private feedback = new CombatFeedback(this.state)
  private controller = new MenuDemoController()
  private resize: ResizeObserver
  private active = false
  private destroyed = false
  private dirty = false
  private ready = false
  private idle = false
  private sequence = 0
  private partial = ''
  private raf = 0
  private lastFrame = -Infinity
  private timer: ReturnType<typeof setTimeout> | undefined
  private watchdog: ReturnType<typeof setTimeout> | undefined
  private restart = false

  constructor(private canvas: HTMLCanvasElement, private data: Gamedata, private base: string, private failed: () => void) {
    this.renderer = this.makeRenderer()
    this.resize = new ResizeObserver(() => { this.fit(); this.wake() })
    this.resize.observe(canvas)
    this.fit()
  }

  private makeRenderer() {
    const renderer = new Render25d({ ...dungeonOptions(getSettings(), false), minibars: null })
    renderer.mount(this.canvas)
    renderer.setTiles(this.data)
    return renderer
  }

  private fit() {
    // Bound fill cost on large/HiDPI displays; CSS composes the scene behind the command column.
    const rect = this.canvas.getBoundingClientRect()
    const scale = Math.min(1, 1280 / Math.max(1, rect.width), 720 / Math.max(1, rect.height))
    this.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), scale)
    this.dirty = true
  }

  private boot() {
    try { this.startEncounter() } catch { this.fail() }
  }

  private startEncounter() {
    this.worker?.terminate()
    this.renderer.destroy()
    this.renderer = this.makeRenderer()
    this.fit()
    this.state = initialState()
    reduce(this.state, { msg: 'game_started' })
    this.scene = emptyScene()
    this.feedback = new CombatFeedback(this.state)
    this.controller = new MenuDemoController()
    this.ready = this.idle = this.restart = false
    this.partial = ''
    this.sequence = 0
    const worker = this.worker = createEngineWorker()
    worker.onmessage = (event: MessageEvent<FromWorker>) => {
      if (this.destroyed || this.worker !== worker) return
      try {
        const message = event.data
        if (message.type === 'output') this.output(message.text)
        else if (message.type === 'idle' && message.sequence === this.sequence) {
          clearTimeout(this.watchdog)
          this.idle = true
          this.flush()
          this.schedule()
        } else if (message.type === 'error') this.fail()
        else if (message.type === 'exit') {
          if (!this.ready) this.fail()
          else { clearTimeout(this.watchdog); this.restart = this.idle = true; this.schedule() }
        }
      } catch { this.fail() }
    }
    worker.onerror = () => this.fail()
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    this.post({ type: 'start', base: new URL(this.base, location.href).href, persistent: false,
      saveDir: '/menu-demo', args: menuArgs(seed), files: { '/menu.rc': MENU_RC } })
    this.send({ type: 'control', json: JSON.stringify({ msg: 'attach', primary: true }) }, 60_000)
  }

  private post(message: ToWorker) { this.worker?.postMessage(message) }
  private send(message: Exclude<ToWorker, { type: 'start' }>, timeout = 10_000) {
    this.idle = false
    this.sequence++
    clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => this.fail(), timeout)
    this.post(message)
  }

  private output(text: string) {
    this.partial += text
    if (this.partial.length > 4 * 1024 * 1024) throw new Error('Menu engine output limit')
    const lines = this.partial.split('\n')
    this.partial = lines.pop()!
    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('*')) {
        if (JSON.parse(line.slice(1)).msg === 'ending') this.restart = true
        continue
      }
      const message = JSON.parse(line) as ServerMessage
      reduce(this.state, message)
      this.feedback.observe(this.state, message)
      this.dirty = true
    }
    this.wake()
  }

  private flush() {
    if (!this.dirty || !this.state.map.cells.size) return
    this.scene = buildScene(this.state, this.data, { previous: this.scene, dirty: { cells: this.state.dirtyCells, mapCleared: this.state.mapCleared } })
    this.state.dirtyCells.clear()
    this.state.mapCleared = false
    this.ready = this.scene.playerOnLevel && this.scene.cells.size > 0
  }

  private schedule() {
    if (this.destroyed || !this.active || !this.idle || this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.active || this.destroyed) return
      if (this.restart) { this.boot(); return }
      const key = this.controller.next(this.state, this.scene)
      if (key === null) {
        if (!this.ready) { this.fail(); return }
        this.restart = true
        this.schedule()
      } else this.send({ type: 'keys', text: key })
    }, this.restart ? 2500 : 650)
  }

  private wake() {
    if (this.active && !this.destroyed && !this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (!this.active || this.destroyed) return
    if (now - this.lastFrame >= 1000 / 30) {
      this.lastFrame = now
      this.flush()
      if (this.ready && (this.dirty || this.renderer.animating)) {
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
    if (this.dirty && this.ready || this.renderer.animating) this.wake()
  }

  setActive(active: boolean) {
    if (this.destroyed) return
    if (active && !this.active) this.feedback = new CombatFeedback(this.state)
    this.active = active
    if (active) {
      if (!this.worker) this.boot()
      this.dirty = true
      this.wake()
      this.schedule()
    } else {
      clearTimeout(this.timer); this.timer = undefined
      cancelAnimationFrame(this.raf); this.raf = 0
      this.renderer.setOptions({ animate: false })
      // A single in-flight turn may finish; its effects are not replayed on resume.
      this.feedback = new CombatFeedback(this.state)
    }
  }

  private fail() { this.destroy(); this.failed() }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    clearTimeout(this.timer)
    clearTimeout(this.watchdog)
    cancelAnimationFrame(this.raf)
    this.worker?.terminate()
    this.worker = null
    this.resize.disconnect()
    this.renderer.destroy()
    this.data.dispose()
    this.canvas.hidden = true
  }
}
