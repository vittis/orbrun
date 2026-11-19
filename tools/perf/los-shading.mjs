/** Local LOS A/B measurements, outside CI. Start this checkout's strict loopback
 * Vite server first. Arguments: origin, then optional historical Git refs.
 * Example: node tools/perf/los-shading.mjs http://127.0.0.1:5297 96dc64e 2501952
 * Historical sources are extracted into temporary ignored workspace folders.
 * Run without competing tests/builds; timings are descriptive, not thresholds. */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:5297')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Use a loopback fixture server')
const frames = Number(process.env.LOS_PERF_FRAMES ?? 120)
if (!Number.isInteger(frames) || frames < 30 || frames > 600) throw new Error('LOS_PERF_FRAMES must be 30–600')
const scenarios = (process.env.LOS_PERF_SCENARIOS ?? 'room-idle,room-los,map-idle,map-los').split(',')
if (scenarios.some(s => !['room-idle', 'room-los', 'map-idle', 'map-los', 'room-moving', 'map-moving'].includes(s))) throw new Error('Unknown LOS scenario')
const folders = [], variants = []
let browser
try {
  await mkdir(`${root}scratchpad`, { recursive: true })
  for (const ref of process.argv.slice(3)) {
    const folder = await mkdtemp(`${root}scratchpad/los-perf-`)
    folders.push(folder)
    const archive = execFileSync('git', ['archive', ref, 'packages/render-2.5d/src'], { cwd: root })
    execFileSync('tar', ['-x', '-C', folder], { input: archive })
    variants.push({ name: ref, url: `/@fs/${folder}/packages/render-2.5d/src/index.ts` })
  }
  variants.push({ name: 'current', url: `/@fs/${root}packages/render-2.5d/src/index.ts` })
  browser = await chromium.launch({ headless: process.env.LOS_PERF_HEADFUL !== '1', channel: process.env.LOS_PERF_BROWSER || undefined })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/testbed/dungeon.html', origin).href)
  await page.waitForFunction(() => window.__ready)
  await page.bringToFront()
  await page.evaluate(() => window.renderer.setOptions({ animate: false }))
  await page.evaluate(async variants => {
    window.losClasses = {}
    for (const v of variants) window.losClasses[v.name] = (await import(v.url)).Render25d
    window.losScene = structuredClone(window.scene)
    window.losAlloc = { canvases: 0, pixelBuffers: 0, uploadedPixels: 0 }
    const Canvas = window.OffscreenCanvas
    window.OffscreenCanvas = class extends Canvas {
      constructor(...args) { super(...args); window.losAlloc.canvases++ }
    }
    const prototype = OffscreenCanvasRenderingContext2D.prototype
    const create = prototype.createImageData, put = prototype.putImageData
    prototype.createImageData = function(...args) { window.losAlloc.pixelBuffers++; return create.apply(this, args) }
    prototype.putImageData = function(...args) {
      window.losAlloc.uploadedPixels += args[0].width * args[0].height
      return put.apply(this, args)
    }
  }, variants)
  const results = []
  // Alternate variant order across scenarios/repeats to reduce warm-cache bias.
  for (const [index, scenario] of scenarios.entries()) for (const { name } of index % 2 ? [...variants].reverse() : variants) {
    const result = await page.evaluate(async ({ scenario, name, frames }) => {
      const large = scenario.startsWith('map'), moving = scenario.endsWith('moving'), fading = moving || scenario.endsWith('los')
      const canvas = document.createElement('canvas'); canvas.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:100'; document.body.append(canvas)
      const renderer = new window.losClasses[name]({ animate: true, unexploredFog: !large })
      renderer.mount(canvas); renderer.resize(1280, 720, 2); renderer.setTiles(window.tiles)
      let scratchComposites = 0
      const composite = renderer.tiles.composite.bind(renderer.tiles)
      renderer.tiles.composite = (...args) => {
        const output = composite(...args)
        if (output && renderer.tiles.fading.get(output.width) === output) scratchComposites++
        return output
      }
      const scene = structuredClone(window.losScene)
      scene.levelKey = 'D:1'; scene.playerOnLevel = true
      if (large) {
        scene.cells.clear(); scene.billboards = []; scene.player = { x: 0, y: 0 }
        renderer.setOptions({ center: { x: 0, y: 0 } })
        for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) scene.cells.set(window.cellKey(x, y), {
          x, y, kind: 'floor', occluder: false, visibility: 'remembered', floorTile: 4, flags: { water: false, lava: false },
        })
      }
      const initialPlayer = { ...scene.player }
      if (moving && large) scene.billboards = [{ kind: 'player', x: 0, y: 0, tile: 4519, height: 1, life: { motion: 'breath' } }]
      const update = (i, now = 100 + i / 60) => {
        if (moving) {
          scene.player = { x: initialPlayer.x + Math.floor(i / 6) % 2, y: initialPlayer.y }
          scene.billboards = scene.billboards.map(b => b.kind === 'player' ? { ...b, ...scene.player } : b)
          renderer.setOptions({ center: scene.player })
        }
        for (const cell of scene.cells.values()) {
          const remembered = large ? Math.hypot(cell.x - Math.floor(i / 6) % 2, cell.y) > 7
            : cell.x + cell.y * 0.65 < (Math.floor(i / 6) % 2 ? 10 : 11)
          cell.visibility = remembered ? 'remembered' : 'visible'
        }
        scene.revision++; renderer.setScene(scene, now)
      }
      update(0)
      const draws = [], work = [], intervals = []
      const reset = () => { Object.assign(window.losAlloc, { canvases: 0, pixelBuffers: 0, uploadedPixels: 0 }); scratchComposites = 0 }
      if (moving) {
        // Drive confirmed turns from real elapsed time, independently of FPS.
        // Warm the actual movement/fade/camera paths before measuring them.
        const began = await new Promise(requestAnimationFrame)
        let recordStart, previous, lastTurn = -1
        while (true) {
          const timestamp = await new Promise(requestAnimationFrame)
          const elapsed = timestamp - began
          if (elapsed >= 1500 && recordStart === undefined) { recordStart = timestamp; reset() }
          if (recordStart !== undefined && timestamp - recordStart >= 3000) break
          const start = performance.now(), turn = Math.floor(elapsed / 90)
          const time = 100 + elapsed / 1000
          if (turn !== lastTurn) { update(turn * 6, time); lastTurn = turn }
          const drawStart = performance.now(); renderer.render(time)
          if (recordStart !== undefined) {
            draws.push(performance.now() - drawStart); work.push(performance.now() - start)
            if (previous !== undefined) intervals.push(timestamp - previous)
            previous = timestamp
          }
        }
      } else {
        for (let i = 0; i < 20; i++) { await new Promise(requestAnimationFrame); renderer.render(100) }
        reset()
        let previous
        for (let i = 0; i < frames; i++) {
          const time = await new Promise(requestAnimationFrame)
          if (previous !== undefined) intervals.push(time - previous)
          previous = time
          const start = performance.now()
          if (fading && i % 6 === 0) update(i)
          const drawStart = performance.now(); renderer.render(100 + i / 60)
          draws.push(performance.now() - drawStart); work.push(performance.now() - start)
        }
      }
      const stats = values => {
        const sorted = [...values].sort((a, b) => a - b)
        return { mean: values.reduce((a, b) => a + b, 0) / values.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.floor(sorted.length * .95)] }
      }
      const result = { scenario, variant: name, cells: scene.cells.size, samples: draws.length, warmup: moving ? '1500 ms moving' : '20 idle frames',
        movementCadenceMs: moving ? 90 : undefined,
        scratchComposites, frameWorkMs: stats(work), renderMs: stats(draws), frameIntervalMs: stats(intervals), allocations: { ...window.losAlloc } }
      renderer.destroy(); canvas.remove(); canvas.width = canvas.height = 0
      return result
    }, { scenario, name, frames })
    results.push(result)
    process.stderr.write(`${scenario}: ${name}, median ${result.renderMs.p50.toFixed(2)} ms\n`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const system = await browser.newBrowserCDPSession()
  const { gpu } = await system.send('SystemInfo.getInfo')
  console.log(JSON.stringify({ gpu: { renderer: gpu.auxAttributes.glRenderer, features: gpu.featureStatus }, browser: browser.version(), node: process.version, platform: `${process.platform}/${process.arch}`,
    viewport: { width: 1280, height: 720, dpr: 2 }, results }, null, 2))
} finally {
  if (browser) await browser.close()
  for (const folder of folders) await rm(folder, { recursive: true, force: true })
}
