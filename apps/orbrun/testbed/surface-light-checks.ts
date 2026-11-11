import { Render25d, fittedScale, project } from '@orbrun/render-2.5d'
import { cellKey, emptyScene, type SceneCell, type TileSource } from '@orbrun/scene'

/** Actual Canvas regressions for continuous light, exposure and thin beams. */
export function surfaceLightChecks() {
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
    const canvas = document.createElement('canvas'), r = new Render25d({ animate: false })
    r.mount(canvas); r.resize(640, 480, dpr); r.setTiles(source)
    const scene = emptyScene(); scene.playerOnLevel = true
    for (let y = -5; y <= 5; y++) for (let x = -7; x <= 7; x++) scene.cells.set(cellKey(x, y), {
      x, y, floorTile: 1, kind: 'floor', visibility: x >= 4 ? 'remembered' : 'visible', occluder: false,
      flags: { water: false, lava: false },
    } as SceneCell)
    const p = { x: 0, y: 0, width: 640, height: 480, tilt: 50 * Math.PI / 180, scale: fittedScale(640, 480, 50 * Math.PI / 180) }
    const ctx = canvas.getContext('2d')!
    const sample = (x: number, y: number, z = 0) => {
      const q = project(p, x, y, z)
      return [...ctx.getImageData(Math.floor(q.x * dpr), Math.floor(q.y * dpr), 1, 1).data]
    }
    const fire = { colour: [255, 158, 64] as [number, number, number], radius: 4.2, power: 0.7, pulse: 'fire' as const }
    r.setScene(scene); r.render(0)
    const ambient = sample(0, 0.2), memory = sample(5, 0.2)
    assert('LOS uses original WebTiles atlas brightness', ambient[0] === 64 && memory[0] < ambient[0] * 0.5 && Math.max(...memory.slice(0, 3)) - Math.min(...memory.slice(0, 3)) <= 1, { dpr, ambient, memory })
    scene.cells.get(cellKey(-1, 0))!.life = { lights: [fire] }; scene.revision++
    r.setScene(scene); r.render(0)
    const edge = [-0.56, -0.52, -0.48, -0.44].map(x => sample(x, 0.2)[0])
    assert('continuous falloff across floor boundary', Math.max(...edge.slice(1).map((v, i) => Math.abs(v - edge[i]))) <= 3 && edge[0] > ambient[0], { dpr, edge, ambient })
    assert('memory never receives torch light', JSON.stringify(sample(5, 0.2)) === JSON.stringify(memory), { dpr, memory: sample(5, 0.2) })
    for (let x = -3; x <= 2; x++) {
      const c = scene.cells.get(cellKey(x, -1))!; c.kind = 'wall'; c.occluder = true; c.wallTile = 1
    }
    scene.revision++; r.setScene(scene); r.render(0)
    const roof = [-0.56, -0.52, -0.48, -0.44].map(x => sample(x, -1, 0.58)[0])
    assert('continuous falloff across raised wall boundary', Math.max(...roof.slice(1).map((v, i) => Math.abs(v - roof[i]))) <= 3, { dpr, roof })
    const blocked = sample(-2, -2.3)
    assert('known walls block the shared light field', Math.abs(blocked[0] - ambient[0]) <= 1 && blocked[0] === blocked[2], { dpr, blocked, ambient })
    const outsideBefore = sample(-0.55, 0.4)
    scene.billboards = [{ kind: 'monster', tile: 2, x: -1, y: 1, height: 0.7, life: { motion: 'still' } }]
    scene.revision++; r.setScene(scene); r.render(0)
    assert('sprite lighting preserves transparent art', JSON.stringify(sample(-0.55, 0.4)) === JSON.stringify(outsideBefore), { dpr, before: outsideBefore, after: sample(-0.55, 0.4) })
    r.setOptions({ animate: true })
    const lightFrames: number[] = []
    for (let frame = 0; frame < 60; frame++) { r.render(10 + frame / 60); lightFrames.push(sample(-1, 0.2)[0]) }
    assert('torch flicker changes smoothly each frame', Math.max(...lightFrames.slice(1).map((v, i) => Math.abs(v - lightFrames[i]))) <= 2 && new Set(lightFrames).size > 1, { dpr, lightFrames })
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.revision++; r.setScene(scene); r.render(19)
    const fadeAmbient = sample(-1, 0.2)[0]
    scene.cells.get(cellKey(-1, 0))!.life = { lights: [{ ...fire, transient: true }] }
    scene.revision++; r.setScene(scene, 20); r.render(20)
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.revision++; r.setScene(scene, 20.01)
    const fade: number[] = []
    for (let frame = 0; frame <= 22; frame++) { r.render(20.01 + frame / 60); fade.push(sample(-1, 0.2)[0]) }
    assert('spell afterglow fades without stepped updates', new Set(fade).size > 12 && Math.max(...fade.slice(1).map((v, i) => Math.abs(v - fade[i]))) <= 5 && Math.abs(fade.at(-1)! - fadeAmbient) <= 1, { dpr, fade, fadeAmbient })
    // No lights: isolate beam pixels from the terrain and compare with the
    // projected cell. Its width stays cell-long while its thickness shrinks.
    scene.cells.get(cellKey(-1, 0))!.life = undefined
    scene.billboards = [0, 1].map(x => ({ kind: 'projectile' as const, tile: 3, x, y: 1, height: 0.5 }))
    scene.revision++; r.setOptions({ animate: false }); r.setScene(scene); r.render(0)
    const q = project(p, 0.5, 1, 0.28), half = p.scale
    const pixels = ctx.getImageData(Math.floor((q.x - half) * dpr), Math.floor((q.y - half / 2) * dpr), Math.ceil(half * 2 * dpr), Math.ceil(half * dpr))
    let top = pixels.height, bottom = -1, columns = new Set<number>()
    for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
      const i = (y * pixels.width + x) * 4
      if (pixels.data[i] > 140 && pixels.data[i + 1] > 130 && pixels.data[i] > pixels.data[i + 2] * 1.2) { top = Math.min(top, y); bottom = Math.max(bottom, y); columns.add(x) }
    }
    assert('thin connected beam segments', bottom >= top && bottom - top + 1 <= Math.ceil(p.scale * dpr * 0.09) && columns.size >= Math.floor(p.scale * 1.9 * dpr), { dpr, thickness: bottom - top + 1, columns: columns.size, scale: p.scale })
    r.destroy()
  }
  return { checks, failures }
}
