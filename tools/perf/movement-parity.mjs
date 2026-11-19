/** Compare pre/post renderer pixels across camera motion and LOS changes.
 * This is a diagnostic, not a CI gate: report final compositing differences.
 * MOVEMENT_PARITY_RASTERS=1 also asserts identical per-draw tile raster pixels;
 * MOVEMENT_PARITY_STRICT=1 requires exact final-frame pixels.
 * Run separately from timing probes: readbacks deliberately synchronize Canvas.
 * Usage: node tools/perf/movement-parity.mjs http://127.0.0.1:5297 HEAD
 * Output/captures are ignored under test-results/movement-parity. */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:5297')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Use a loopback fixture server')
const ref = process.argv[3] ?? 'HEAD'
await mkdir(`${root}scratchpad`, { recursive: true })
await mkdir(`${root}test-results/movement-parity`, { recursive: true })
const folder = await mkdtemp(`${root}scratchpad/movement-parity-`)
let browser
try {
  const archive = execFileSync('git', ['archive', ref, 'packages/render-2.5d/src'], { cwd: root })
  execFileSync('tar', ['-x', '-C', folder], { input: archive })
  browser = await chromium.launch({ headless: process.env.LOS_PERF_HEADFUL !== '1', channel: process.env.LOS_PERF_BROWSER || undefined })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('/testbed/dungeon.html', origin).href)
  await page.waitForFunction(() => window.__ready)
  const results = []
  for (const [width, height, dpr] of [[1280, 720, 1], [960, 540, 2], [390, 600, 1.5], [903, 701, 1.25]]) {
    await page.setViewportSize({ width, height })
    const report = await page.evaluate(async ({ baseline, current, width, height, dpr, raster }) => {
      window.renderer.setOptions({ animate: false })
      const classes = [(await import(baseline)).Render25d, (await import(current)).Render25d]
      const canvases = classes.map(() => document.createElement('canvas'))
      const composites = [[], []]
      const renderers = classes.map((Type, i) => {
        const renderer = new Type({ animate: true, unexploredFog: true })
        if (raster) {
          const composite = renderer.tiles.composite.bind(renderer.tiles)
          renderer.tiles.composite = (...args) => {
            const image = composite(...args)
            if (image) {
              const data = image.getContext('2d').getImageData(0, 0, image.width, image.height).data
              composites[i].push({ args: JSON.stringify(args), width: image.width, data })
            }
            return image
          }
        }
        renderer.mount(canvases[i]); renderer.resize(width, height, dpr); renderer.setTiles(window.tiles)
        return renderer
      })
      const scenes = classes.map(() => structuredClone(window.scene))
      const original = { ...scenes[0].player }
      let compared = 0, changedChannels = 0, maxDelta = 0, tileRasters = 0
      const differences = []
      for (let turn = 0; turn < 5; turn++) {
        const time = 100 + turn * 0.09
        for (let i = 0; i < renderers.length; i++) {
          const scene = scenes[i]
          scene.playerOnLevel = true; scene.levelKey = 'D:1'
          scene.player = { x: original.x + turn % 2, y: original.y + (turn === 3 ? 1 : 0) }
          scene.billboards = scene.billboards.map(b => b.kind === 'player' ? { ...b, ...scene.player } : b)
          for (const cell of scene.cells.values()) cell.visibility = cell.x + cell.y * 0.65 < (turn % 2 ? 10 : 11) ? 'remembered' : 'visible'
          scene.revision++; renderers[i].setScene(scene, time)
        }
        // Sample both the start of a confirmed step and its interpolated camera/fades.
        for (const offset of [0, 1 / 120, 1 / 60, 0.04, 0.08]) {
          composites.forEach(list => { list.length = 0 })
          const pixels = renderers.map((renderer, i) => {
            renderer.render(time + offset)
            return canvases[i].getContext('2d').getImageData(0, 0, canvases[i].width, canvases[i].height).data
          })
          if (raster) {
            if (composites[0].length !== composites[1].length) throw new Error('Tile draw count changed')
            for (let j = 0; j < composites[0].length; j++) {
              const a = composites[0][j], b = composites[1][j]
              if (a.args !== b.args || a.width !== b.width || a.data.length !== b.data.length || a.data.some((v, k) => v !== b.data[k])) {
                throw new Error(JSON.stringify({ turn, offset, composite: j, before: a.args, after: b.args }))
              }
              tileRasters++
            }
          }
          for (let k = 0; k < pixels[0].length; k++) {
            const delta = Math.abs(pixels[0][k] - pixels[1][k])
            if (delta) {
              changedChannels++
              if (differences.length < 10) differences.push({ turn, offset, x: Math.floor(k / 4) % canvases[0].width, y: Math.floor(k / 4 / canvases[0].width), before: pixels[0][k], after: pixels[1][k] })
            }
            maxDelta = Math.max(maxDelta, delta)
          }
          compared++
        }
      }
      // Keep only the finished current frame visible for manual desktop/narrow inspection.
      const display = document.createElement('canvas'); display.width = canvases[1].width; display.height = canvases[1].height
      display.style.cssText = `position:fixed;inset:0;width:${width}px;height:${height}px;z-index:9999`
      display.dataset.parity = 'true'
      display.getContext('2d').drawImage(canvases[1], 0, 0)
      document.querySelector('[data-parity]')?.remove(); document.body.append(display)
      renderers.forEach(renderer => renderer.destroy())
      canvases.forEach(canvas => { canvas.width = canvas.height = 0 })
      return { width, height, dpr, compared, tileRasters, changedChannels, maxDelta, differences }
    }, { baseline: `/@fs/${folder}/packages/render-2.5d/src/index.ts`, current: `/@fs/${root}packages/render-2.5d/src/index.ts`, width, height, dpr, raster: !!process.env.MOVEMENT_PARITY_RASTERS })
    results.push(report)
    await page.screenshot({ path: `${root}test-results/movement-parity/${width}x${height}.png` })
  }
  const report = { exact: results.every(result => result.changedChannels === 0), tileRastersChecked: !!process.env.MOVEMENT_PARITY_RASTERS, reference: execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim(), browser: browser.version(), results, errors }
  await writeFile(`${root}test-results/movement-parity/result.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (errors.length || process.env.MOVEMENT_PARITY_STRICT === '1' && !report.exact) throw new Error('Movement pixel parity failed')
} finally {
  if (browser) await browser.close()
  await rm(folder, { recursive: true, force: true })
}
