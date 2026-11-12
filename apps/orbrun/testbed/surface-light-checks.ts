import { fixtureYield, releaseCanvas, pixelSampler } from './fixture'
import { Render25d, fittedScale, project } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'

/** Actual Canvas regressions for continuous light, exposure and authored projectile artwork. */
export async function surfaceLightChecks() {
  // Leave the browser responsive between readback-heavy frames; sample times remain deterministic.
  const yieldFrame = () => fixtureYield()
  const failures: unknown[] = []; let checks = 0
  const assert = (name: string, passed: boolean, detail: unknown) => { checks++; if (!passed) failures.push({ name, detail }) }
  const atlas = document.createElement('canvas'); atlas.width = 96; atlas.height = 32
  const ink = atlas.getContext('2d')!
  ink.fillStyle = '#404040'; ink.fillRect(0, 0, 32, 32)
  ink.fillStyle = '#287cff'; ink.fillRect(40, 4, 16, 26)
  ink.fillStyle = '#fff2a0'; ink.fillRect(64, 14, 32, 4)
  const source: TileSource = {
    tile: id => ({ atlas: 'test', sx: (id - 1) * 32, sy: 0, w: 32, h: 32, ox: 0, oy: 0, cell: 32 }),
    atlas: () => atlas, atlasNames: () => ['test'],
  }
  for (const dpr of [1, 2]) {
    await fixtureYield(`surfaces DPR${dpr}`)
    const canvas = document.createElement('canvas'), r = new Render25d({ animate: false })
    r.mount(canvas); r.resize(640, 480, dpr); r.setTiles(source)
    const scene = emptyScene(); scene.playerOnLevel = true
    for (let y = -5; y <= 5; y++) for (let x = -7; x <= 7; x++) scene.cells.set(cellKey(x, y), {
      x, y, floorTile: 1, kind: 'floor', visibility: x >= 4 ? 'remembered' : 'visible', occluder: false,
      flags: { water: false, lava: false },
    } as SceneCell)
    const p = { x: 0, y: 0, width: 640, height: 480, tilt: 50 * Math.PI / 180, scale: fittedScale(640, 480, 50 * Math.PI / 180) }
    const ctx = canvas.getContext('2d')!
    let snapshot: ReturnType<typeof pixelSampler> | undefined
    const draw = r.render.bind(r)
    r.render = now => { snapshot = undefined; draw(now) }
    const sample = (x: number, y: number, z = 0) => {
      const q = project(p, x, y, z)
      snapshot ??= pixelSampler(ctx, dpr, { x: 140, y: 150, width: 330, height: 120 })
      return snapshot(q.x, q.y)
    }
    const fire = { colour: [255, 158, 64] as [number, number, number], radius: 4.2, power: 0.7, pulse: 'fire' as const }
    r.setScene(scene); r.render(0)
    const ambient = sample(0, 0.2), memory = sample(5, 0.2)
    const distant = sample(-6, 0.2), blockedAmbient = sample(-2, -2.3), extendedAmbient = sample(1.2, 0.2)
    assert('near terrain is warm and distant terrain dims without hiding memory', ambient[0] > ambient[2] + 8 && distant[0] < ambient[0] - 10 && memory[0] < ambient[0] * 0.5 && memory[0] > 15, { dpr, ambient, distant, memory })
    scene.cells.get(cellKey(-1, 0))!.life = { lights: [fire] }; scene.revision++
    r.setScene(scene); r.render(0)
    const edge = [-0.56, -0.52, -0.48, -0.44].map(x => sample(x, 0.2)[0])
    assert('continuous falloff across floor boundary', Math.max(...edge.slice(1).map((v, i) => Math.abs(v - edge[i]))) <= 3 && edge[0] > ambient[0], { dpr, edge, ambient })
    const extended = sample(1.2, 0.2)
    assert('torch light reaches more than two cells beyond its source', extended[0] > extendedAmbient[0] + 2, { dpr, extended, extendedAmbient })
    assert('memory never receives torch light', JSON.stringify(sample(5, 0.2)) === JSON.stringify(memory), { dpr, memory: sample(5, 0.2) })
    for (let x = -3; x <= 2; x++) {
      const c = scene.cells.get(cellKey(x, -1))!; c.kind = 'wall'; c.occluder = true; c.wallTile = 1
    }
    scene.revision++; r.setScene(scene); r.render(0)
    const roof = [-0.56, -0.52, -0.48, -0.44].map(x => sample(x, -1, 0.58)[0])
    assert('continuous falloff across raised wall boundary', Math.max(...roof.slice(1).map((v, i) => Math.abs(v - roof[i]))) <= 3, { dpr, roof })
    const blocked = sample(-2, -2.3)
    assert('known walls block the shared light field', blocked.every((value, i) => Math.abs(value - blockedAmbient[i]) <= 1), { dpr, blocked, blockedAmbient })
    const outsideBefore = sample(-0.55, 0.4)
    scene.billboards = [{ kind: 'monster', tile: 2, x: -1, y: 1, height: 0.7, life: { motion: 'still' } }]
    scene.revision++; r.setScene(scene); r.render(0)
    assert('sprite lighting preserves transparent art', JSON.stringify(sample(-0.55, 0.4)) === JSON.stringify(outsideBefore), { dpr, before: outsideBefore, after: sample(-0.55, 0.4) })
    r.setOptions({ animate: true })
    const lightFrames: number[] = []
    for (let frame = 0; frame < 60; frame++) {
      r.render(10 + frame / 60); lightFrames.push(sample(-1, 0.2)[0])
      await yieldFrame()
    }
    assert('torch flicker changes smoothly each frame', Math.max(...lightFrames.slice(1).map((v, i) => Math.abs(v - lightFrames[i]))) <= 2 && new Set(lightFrames).size > 1, { dpr, lightFrames })
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.revision++; r.setScene(scene); r.render(19)
    const fadeAmbient = sample(-1, 0.2)[0]
    scene.cells.get(cellKey(-1, 0))!.life = { lights: [{ ...fire, transient: true }] }
    scene.revision++; r.setScene(scene, 20); r.render(20)
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.revision++; r.setScene(scene, 20.01)
    const fade: number[] = []
    for (let frame = 0; frame <= 22; frame++) {
      r.render(20.01 + frame / 60); fade.push(sample(-1, 0.2)[0])
      await yieldFrame()
    }
    assert('spell afterglow fades without stepped updates', new Set(fade).size > 12 && Math.max(...fade.slice(1).map((v, i) => Math.abs(v - fade[i]))) <= 5 && Math.abs(fade.at(-1)! - fadeAmbient) <= 1, { dpr, fade, fadeAmbient })
    // The source artwork owns projectile thickness. Independently rasterize its
    // entire 32×32 cell onto snapped ground-plane corners using native Canvas;
    // do not invoke the renderer's tile cache, planeRect or thinning path.
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.billboards = [0, 1].map(x => ({ kind: 'projectile' as const, tile: 3, x, y: 1, height: 0.5 }))
    scene.revision++; r.setOptions({ animate: false }); r.setScene(scene); r.render(0)
    const q = project(p, 0.5, 1, 0.28), half = p.scale
    const left = Math.floor((q.x - half) * dpr), top = Math.floor((q.y - half / 2) * dpr)
    const pixels = ctx.getImageData(left, top, Math.ceil(half * 2 * dpr), Math.ceil(half * dpr))
    const reference = document.createElement('canvas'); reference.width = pixels.width; reference.height = pixels.height
    const ref = reference.getContext('2d')!; ref.imageSmoothingEnabled = false
    const expected = (widthFactor = 1, heightFactor = 1, gap = 0) => {
      ref.clearRect(0, 0, reference.width, reference.height)
      for (const x of [0, 1]) {
        const a = project(p, x - 0.5, 0.5, 0.28), b = project(p, x + 0.5, 1.5, 0.28)
        const dx = Math.round(a.x * dpr) - left, dy = Math.round(a.y * dpr) - top
        const width = Math.round(b.x * dpr) - Math.round(a.x * dpr), height = Math.round(b.y * dpr) - Math.round(a.y * dpr)
        ref.drawImage(atlas, 64, 0, 32, 32, dx + (x ? gap : 0), dy, width * widthFactor, height * heightFactor)
      }
      return ref.getImageData(0, 0, reference.width, reference.height)
    }
    const mask = (image: ImageData) => {
      const result = new Uint8Array(image.width * image.height)
      for (let i = 0; i < result.length; i++) {
        const offset = i * 4, data = image.data
        result[i] = Number(data[offset + 3] > 0 && data[offset] > 140 && data[offset + 1] > 130 && data[offset] > data[offset + 2] * 1.2)
      }
      return result
    }
    const authored = mask(expected()), actual = mask(pixels)
    const differences = (candidate: Uint8Array) => authored.reduce((sum, value, i) => sum + Number(value !== candidate[i]), 0)
    assert('projectiles retain authored art thickness, width and connected coverage', authored.some(Boolean) && differences(actual) === 0,
      { dpr, differingPixels: differences(actual), authoredPixels: authored.reduce((sum, value) => sum + value, 0), scale: p.scale })
    // Prove the oracle rejects each historical failure mode instead of merely
    // increasing a permissive thickness threshold for this browser.
    const mutations = { width: differences(mask(expected(0.75))), thickness: differences(mask(expected(1, 0.5))), gap: differences(mask(expected(1, 1, 2))) }
    assert('authored art oracle rejects changed width, thickness and gaps', Object.values(mutations).every(count => count > 0), { dpr, mutations })
    releaseCanvas(reference)

    // Hold the camera still while the player moves, to distinguish a world
    // anchored grade from a fixed screen vignette. No semantic emitter exists.
    scene.billboards = []; scene.levelKey = 'ambient'; scene.player = { x: 0, y: 0 }
    scene.revision++; r.setOptions({ center: { x: 0, y: 0 } }); r.setScene(scene); r.render(0)
    const beforeLeft = sample(-3, 0.2), beforeRight = sample(3, 0.2)
    scene.player = { x: 2, y: 0 }; scene.revision++; r.setScene(scene); r.render(0)
    const afterLeft = sample(-3, 0.2), afterRight = sample(3, 0.2)
    assert('ambient exposure follows the player independently of the camera', afterLeft[0] < beforeLeft[0] - 3 && afterRight[0] > beforeRight[0] + 3 && !r.animating, { dpr, beforeLeft, beforeRight, afterLeft, afterRight })
    const unknown = ctx.getImageData(0, 0, 1, 1).data
    assert('ambient warmth never reveals unexplored space', Math.max(...unknown.slice(0, 3)) < 10 && r.pick(0, 0) === null, { dpr, unknown: [...unknown] })
    scene.playerOnLevel = false; scene.revision++; r.setScene(scene); r.render(0)
    const remote = sample(0, 0.2)
    assert('remote maps retain ungraded atlas colours', remote[0] === 64 && remote[1] === 64 && remote[2] === 64, { dpr, remote })
    r.destroy()
    releaseCanvas(canvas)
  }
  return { checks, failures }
}
