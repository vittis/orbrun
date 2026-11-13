import { fixtureStart, fixtureComplete, fixtureYield, captures, releaseCanvas } from './fixture'
import { loadRoomTiles } from '../src/room/tiles'
import { antechamberScene } from '../src/room/scene'
import { ImpactArt } from '../../../packages/render-2.5d/src/impact-draw'
import { IMPACT_PALETTES, type ImpactKind } from '../../../packages/render-2.5d/src/impact-art'
import { drawTile } from '../../../packages/render-2.5d/src/tiles'

fixtureStart('impact-checks')
const tiles = await loadRoomTiles(), { scene } = antechamberScene(tiles), art = new ImpactArt()
const floor = [...scene.cells.values()].find(c => !c.occluder && c.kind === 'floor')!.floorTile
const checks: { kind: string; phase: string; pixels: number; passed: boolean }[] = []
for (const kind of Object.keys(IMPACT_PALETTES) as ImpactKind[]) {
  for (const [phase, age] of [['contact', 0.02], ['burst', 0.3], ['remnants', 0.8], ['expired', 1]] as const) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 224
    const ctx = canvas.getContext('2d')!; ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#28252b'; ctx.fillRect(0, 0, 224, 224)
    ctx.globalAlpha = 0.6
    for (let y = -32; y < 224; y += 96) for (let x = -32; x < 224; x += 96) drawTile(ctx, tiles, { tile: floor }, x, y, 96)
    ctx.globalAlpha = 1; drawTile(ctx, tiles, { tile: 7189 }, 64, 82, 96)
    const before = ctx.getImageData(0, 0, 224, 224).data
    if (phase === 'remnants') art.draw(ctx, kind, 0.35, 3, 0.6, 112, 170, 96, 1, 0.75, true)
    art.draw(ctx, kind, age, 3, 0.6, 112, 128, 96, 1)
    const after = ctx.getImageData(0, 0, 224, 224).data
    let pixels = 0
    for (let i = 0; i < after.length; i += 4) if (Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]) > 8) pixels++
    const outcome = kind === 'block' || kind === 'no-damage'
    const passed = phase === 'expired' ? pixels === 0 : outcome ? pixels > (phase === 'remnants' ? 10 : 100) && pixels < 650 : pixels > 25
    checks.push({ kind, phase, pixels, passed })
    await fixtureYield(`${kind}:${phase}`)
    if (phase === 'expired' || !captures) { releaseCanvas(canvas); continue }
    const figure = document.createElement('figure'), label = document.createElement('figcaption')
    label.textContent = `${kind.toUpperCase()} · ${phase} · ${passed ? 'PASS' : 'FAIL'}`
    figure.append(label, canvas); document.getElementById('captures')!.append(figure)
  }
}
fixtureComplete({ checks: checks.length, failures: checks.filter(c => !c.passed) })
