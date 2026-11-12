import { loadGamedata, browserIo } from '@orbrun/gamedata'
import { Render25d } from '@orbrun/render-2.5d'
import { type Connection, type ServerMessage } from '@orbrun/webtiles'
import { Session } from '../src/session'
import type { ServerInfo } from '../src/servers'

const result = document.getElementById('result')!
try {
  const gd = await loadGamedata({ base: '/gamedata-proxy/crawl.dcss.io', version: '0703b2fa62e821390161d95cf52f9da1183761d4', io: browserIo() })
  const cases = ['BOLT_SANDBLAST', 'BOLT_STONE_ARROW', 'BOLT_IRON_SHOT', 'BOLT_MAGIC_DART', 'BOLT_FROST', 'MI_ARROW']
  const checks: { spell: string; phase: string; changedPixels: number; sleeping?: boolean; passed: boolean }[] = []
  for (const name of cases) {
    let deliver: (m: ServerMessage) => void = () => {}
    const connection: Connection = { kind: 'remote', gamedataBase: '', open: true, send() {}, close() {},
      onMessage(fn) { deliver = fn; return () => {} }, onOpen: () => () => {}, onClose: () => () => {} }
    const session = new Session({ id: 'projectile-preview' } as ServerInfo, null, connection)
    session.gamedata = gd
    deliver({ msg: 'player', pos: { x: 0, y: 0 }, place: 'Dungeon', depth: 1 })
    const bg = gd.dngn.id('FLOOR_GREY_DIRT')!
    const cells = [-2, -1, 0, 1, 2].flatMap(y => [-3, -2, -1, 0, 1, 2, 3].map(x => ({ x, y, f: 33, mf: 1, g: '.', t: { bg } })))
    deliver({ msg: 'map', clear: true, player_on_level: true, cells })
    session.flushScene()
    const base = session.scene
    const canvas = document.createElement('canvas'), baseline = document.createElement('canvas')
    const renderer = new Render25d({ zoom: 1.6 }), plain = new Render25d({ zoom: 1.6 })
    for (const [r, surface] of [[renderer, canvas], [plain, baseline]] as const) {
      r.mount(surface); r.resize(640, 320, 2); r.setTiles(gd); r.setScene(base, 0)
    }
    session.on(event => { if (event.type === 'scene') renderer.setScene(event.scene, 1) })
    const tile = gd.main.id(name)
    if (tile === undefined) throw new Error(`Missing server artwork: ${name}`)
    for (const x of [-1, 0, 1, 2]) {
      deliver({ msg: 'map', cells: [{ x, y: 0, t: { ov: [tile] } }, ...(x > -1 ? [{ x: x - 1, y: 0, t: { ov: [] } }] : [])] })
      deliver({ msg: 'delay', t: 10 })
    }
    deliver({ msg: 'map', cells: [{ x: 2, y: 0, t: { ov: [] } }] })
    session.flushScene()
    for (const [phase, time] of [['Projectile', 1.016], ['Impact', 1.3], ['Residue', 1.8], ['Expired', 4]] as const) {
      renderer.render(time); plain.render(time)
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      const before = baseline.getContext('2d')!.getImageData(0, 0, baseline.width, baseline.height).data
      let changedPixels = 0
      for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - before[i]) + Math.abs(pixels[i + 1] - before[i + 1]) + Math.abs(pixels[i + 2] - before[i + 2]) > 8) changedPixels++
      const passed = phase === 'Expired' ? changedPixels === 0 && !renderer.animating : changedPixels > 5
      checks.push({ spell: name, phase, changedPixels, sleeping: !renderer.animating, passed })
      if (phase === 'Expired') continue
      const figure = document.createElement('figure'), label = document.createElement('figcaption'), copy = document.createElement('canvas')
      const top = renderer.project(-3.7, -3.1), bottom = renderer.project(3.7, 2.8)
      const sx = Math.max(0, Math.floor(top.x * 2)), sy = Math.max(0, Math.floor(top.y * 2))
      copy.width = Math.min(canvas.width - sx, Math.ceil((bottom.x - top.x) * 2))
      copy.height = Math.min(canvas.height - sy, Math.ceil((bottom.y - top.y) * 2))
      copy.getContext('2d')!.drawImage(canvas, sx, sy, copy.width, copy.height, 0, 0, copy.width, copy.height)
      label.textContent = `${name.replace('BOLT_', '').replaceAll('_', ' ')} · ${phase} · ${passed ? 'PASS' : 'FAIL'}`
      figure.append(label, copy); document.getElementById('captures')!.append(figure)
    }
    renderer.destroy(); plain.destroy(); session.close()
  }
  const report = { checks: checks.length, passed: checks.filter(c => c.passed).length, failures: checks.filter(c => !c.passed) }
  result.textContent = JSON.stringify(report, null, 2)
  document.getElementById('details')!.textContent = JSON.stringify({ ...report, results: checks }, null, 2)
} catch (error) { result.textContent = String(error); throw error }
