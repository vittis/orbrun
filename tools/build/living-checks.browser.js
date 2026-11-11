/** Real-browser atmosphere checks, run through the existing renderer harness:
 * node tools/build/render-compare.mjs eval tools/build/living-checks.browser.js <dev-url>
 * Use this checkout's own dev URL when other worktrees have Vite running.
 */
const sceneModule = performance.getEntriesByType('resource').find(r => /\/packages\/scene\/src\/index\.ts/.test(r.name)).name
const packageRoot = new URL(sceneModule).pathname.replace(/\/scene\/src\/index\.ts.*$/, '')
const { cellKey } = await import(sceneModule)
const { Render25d } = await import(`${packageRoot}/render-2.5d/src/index.ts`)
const { Render2d } = await import(`${packageRoot}/render-2d/src/index.ts`)
const { scene, r } = window
const fire = { colour: [255, 118, 30], radius: 3.4, power: 0.7, pulse: 'fire' }
for (const cell of scene.cells.values()) {
  if (cell.x < 7) cell.visibility = 'remembered'
  cell.life = { motion: cell.flags?.water ? 'water' : cell.flags?.lava ? 'lava' : undefined }
}
scene.cells.get(cellKey(10, 3)).life = { motion: 'flame', lights: [fire] }
for (const b of scene.billboards) b.life = { motion: b.scenery ? 'plant' : b.kind === 'monster' ? 'breath' : b.kind === 'cloud' ? 'cloud' : b.kind === 'item' ? 'gold' : undefined }
scene.revision++
r.setOptions({ motion: true })
r.setScene(scene, 10)
window.frame(0)
for (let i = 0; i < 64; i++) r.render(10)
const glCanvas = document.querySelector('canvas')
const checks = []
const captures = {}
const image = (view, canvas, time) => { view.render(time); return canvas.toDataURL() }
const a = image(r, glCanvas, 10), b = image(r, glCanvas, 11)
checks.push({ name: '3d animated', passed: a !== b })
r.setOptions({ motion: false })
for (let i = 0; i < 64; i++) r.render(12)
checks.push({ name: '3d still', passed: image(r, glCanvas, 12) === image(r, glCanvas, 14) })
captures['3d'] = b
for (const [name, Renderer, options] of [
  ['2.5d', Render25d, { animate: true }],
  ['2d', Render2d, { living: true, animate: true, cellSize: 48, center: { x: 11, y: 5 } }],
]) for (const [width, height, dpr] of [[960, 720, 1], [390, 600, 2]]) {
  const canvas = document.createElement('canvas')
  const view = new Renderer(options)
  view.mount(canvas); view.resize(width, height, dpr)
  view.setTiles(r.tiles); view.setScene(scene, 10)
  const first = image(view, canvas, 10), second = image(view, canvas, 11)
  checks.push({ name: `${name} ${width} DPR${dpr} animated`, passed: first !== second })
  view.setOptions({ animate: false })
  checks.push({ name: `${name} ${width} DPR${dpr} still`, passed: image(view, canvas, 12) === image(view, canvas, 14) })
  view.setOptions({ animate: true })
  const before = image(view, canvas, 20.4)
  view.impact(11, 5, 1, 20)
  const impact = image(view, canvas, 20.4)
  checks.push({ name: `${name} ${width} DPR${dpr} impact`, passed: before !== impact })
  captures[`${name}-${width}`] = second
  view.destroy()
}
// Preserve the existing raster acceptance checks (seams, atlas proportions,
// item-marker placement, memory contrast, unknown fog and still mode).
for (const id of ['captures', 'result']) {
  const div = document.createElement('div'); div.id = id; document.body.append(div)
}
await import('/testbed/dungeon-checks.ts')
const raster = JSON.parse(document.getElementById('result').textContent)
checks.push({ name: `${raster.checks} raster checks`, passed: raster.failures.length === 0, failures: raster.failures })
window.__livingCaptures = captures
const failed = checks.filter(c => !c.passed)
if (failed.length) throw new Error(JSON.stringify(failed))
return { passed: checks.length, checks }
