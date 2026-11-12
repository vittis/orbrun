import type { SpellEffect } from '@orbrun/scene'
import { DEATH_ART, deathDither } from './death-art.js'
import type { Context2d } from './tiles.js'

export type ImpactKind = SpellEffect['kind'] | 'sand' | 'water'
type Palette = readonly [string, string, string, string, string]
/** Outline, shade, body, lit edge, hot core: the same small ramps as tile art. */
export const IMPACT_PALETTES: Record<ImpactKind, Palette> = {
  physical: ['#25242b', '#56565b', '#94958d', '#d2d3bd', '#fff1ce'],
  earth: ['#302b2b', '#645044', '#9d8060', '#c6aa7b', '#ead6a5'],
  sand: ['#39302a', '#796247', '#b39869', '#d8bd88', '#f0dcaa'],
  fire: ['#38232c', '#73312c', '#bc5430', '#f2a649', '#ffe7ac'],
  cold: ['#202d3c', '#38596e', '#679eae', '#a4d7df', '#e3fcf3'],
  electric: ['#29253b', '#514772', '#8983c0', '#bbc2ed', '#f5f1ff'],
  poison: ['#263024', '#445d35', '#729449', '#afd16b', '#ecf3b8'],
  acid: ['#343322', '#676b2e', '#a9b443', '#d1da73', '#faf0b5'],
  magic: ['#2d233c', '#584065', '#9669ad', '#c5a4d6', '#f5deef'],
  air: ['#30363f', '#596d77', '#91a8af', '#cadcdb', '#edf2df'],
  drain: ['#251f32', '#45324d', '#785377', '#af84a4', '#e0c2ca'],
  holy: ['#44332c', '#8a6539', '#c59b50', '#efd08a', '#fff5cc'],
  heal: ['#23382f', '#3e6c52', '#71a679', '#ace0a2', '#ebf7cc'],
  buff: ['#3a3031', '#816444', '#b79a69', '#e4ce96', '#fff1c5'],
  debuff: ['#292337', '#4b395e', '#805780', '#b288ac', '#e8c3d6'],
  teleport: ['#28233b', '#4e497a', '#8477af', '#baadd9', '#eee1fa'],
  water: ['#202f39', '#365260', '#608c9b', '#a2c3ca', '#dce9e1'],
}
const SMOKE: Palette = ['#25232b', '#39303a', '#57434a', '#7e5b51', '#a77b5f']
const ART = {
  flash: [
    '0000000100000000', '0001001310001000', '0000133431000000', '0100134431000100',
    '0011134431111000', '0001345544310000', '0113455555431100', '1344555555544310',
    '0113455555431100', '0001345544310000', '0011134431111000', '0100134431000100',
    '0000133431000000', '0001001310001000', '0000000100000000', '0000000000000000',
  ],
  spark: ['0001000', '0015100', '0014100', '0014100', '0013100', '0012100', '0001000'],
  grain: ['00100', '01310', '13441', '01210', '00100'],
  flame: [
    '000000001000', '000000013100', '000000134100', '000100134100',
    '001310134100', '001431344100', '013443454310', '013445554310',
    '134455554431', '134555554431', '123455544321', '012334433210',
    '001233332100', '000111111000',
  ],
  crystal: [
    '00000100000', '00001310000', '00013531000', '00013541000', '00134543100',
    '01345554310', '00134543100', '00013431000', '00012310000', '00001110000', '00000100000',
  ],
  cross: ['000111000', '000151000', '000141000', '111454111', '154555451', '111454111', '000141000', '000131000', '000111000'],
  rune: ['001111100', '013444310', '014111410', '014101410', '014151410', '014141410', '011343110', '001343100', '000111000'],
  curl: ['000001111000', '000134443100', '001341113410', '013410001410', '014310000110', '001443111100', '000134444310', '000011111100'],
  ...DEATH_ART,
} as const
type Sprite = keyof typeof ART

/** Stamp only whole opaque texels. Late frames dissolve texels rather than
 * alpha-blending the whole effect into a smooth vector overlay. */
function stamp(ctx: Context2d, sprite: Sprite, x: number, y: number, colours: Palette, turn = 0, scale = 1, fade = 1) {
  if (fade <= 0) return
  const mask = ART[sprite], h = mask.length, w = mask[0].length
  const quarter = ((turn % 4) + 4) % 4
  const rw = quarter % 2 ? h : w, rh = quarter % 2 ? w : h
  const width = Math.max(1, Math.round(rw * scale)), height = Math.max(1, Math.round(rh * scale))
  const left = Math.round(x - width / 2), top = Math.round(y - height / 2)
  for (let dy = 0; dy < height; dy++) {
    let run = -1, shade = 0
    for (let dx = 0; dx <= width; dx++) {
      const rx = Math.min(rw - 1, Math.floor(dx * rw / width)), ry = Math.min(rh - 1, Math.floor(dy * rh / height))
      const sx = quarter === 0 ? rx : quarter === 1 ? ry : quarter === 2 ? w - 1 - rx : w - 1 - ry
      const sy = quarter === 0 ? ry : quarter === 1 ? h - 1 - rx : quarter === 2 ? h - 1 - ry : rx
      const ink = dx === width || fade <= deathDither(left + dx + 64, top + dy + 64) ? 0 : Number(mask[sy]?.[sx] ?? 0)
      if (ink === shade) continue
      if (shade && run >= 0) { ctx.fillStyle = colours[shade - 1]; ctx.fillRect(left + run, top + dy, dx - run, 1) }
      run = dx; shade = ink
    }
  }
}

function bolt(ctx: Context2d, x: number, y: number, seed: number, colours: Palette, fade: number) {
  const length = Math.max(1, Math.hypot(x, y)), ux = x / length, uy = y / length
  for (let t = 2; t < length; t++) {
    const kink = Math.sin(Math.floor(t / 3) * 5 + seed) * 2
    const px = Math.round(ux * t - uy * kink), py = Math.round(uy * t + ux * kink)
    if (fade <= deathDither(px + 64, py + 64)) continue
    ctx.fillStyle = colours[0]; ctx.fillRect(px - 1, py - 1, 3, 1); ctx.fillRect(px - 1, py + 1, 3, 1)
    ctx.fillStyle = colours[t % 3 ? 3 : 4]; ctx.fillRect(px, py, 2, 1)
  }
}

/** Shared contact art for projectiles, spells, melee and generic damage cues.
 * Coordinates are tile texels around (0,0), so callers can cache whole frames. */
export function paintImpact(ctx: Context2d, kind: ImpactKind, age: number, seed = 0, strength = 0.6, direction?: number) {
  if (age < 0 || age >= 1) return
  const colours = IMPACT_PALETTES[kind], expand = 1 - (1 - age) ** 3
  const fade = age < 0.55 ? 1 : (1 - age) / 0.45
  const count = 6 + Math.round(strength * 6), physical = kind === 'physical' || kind === 'earth' || kind === 'sand'
  ctx.globalAlpha = 1
  if (kind === 'water') {
    for (let i = 0; i < 10; i++) {
      const a = i * Math.PI / 5, r = 3 + expand * 17
      stamp(ctx, 'grain', Math.cos(a) * r, Math.sin(a) * r, colours, i % 4, 0.5, fade * 0.8)
    }
    return
  }
  // A short, substantial contact silhouette, dark-edged like weapon/monster art.
  if (age < 0.35) stamp(ctx, kind === 'heal' || kind === 'holy' ? 'cross' : kind === 'cold' ? 'crystal' : 'flash',
    0, 0, colours, seed % 4, age < 0.07 ? 0.75 : 1, age < 0.2 ? 1 : (0.35 - age) / 0.15)
  for (let i = 0; i < count; i++) {
    const a = direction === undefined || !physical ? seed * 0.71 + i * 2.4
      : direction + Math.sin(i * 2.4 + seed) * 1.1 + (i % 4 === 0 ? Math.PI : 0)
    const radius = (3 + expand * (8 + strength * 7)) * (0.7 + i % 3 * 0.15)
    let x = Math.cos(a) * radius, y = Math.sin(a) * radius * 0.7
    if (kind === 'fire') {
      y -= age * (8 + i % 3 * 3)
      if (age > 0.28 && i % 3 === 0) stamp(ctx, 'chip', x, y - 3, SMOKE, 0, 0.65 + age * 0.4, fade * 0.8)
      stamp(ctx, i % 3 === 0 ? 'flame' : 'spark', x, y, colours, 0, i % 3 === 0 ? 0.8 : 0.6, fade)
    } else if (kind === 'electric') {
      bolt(ctx, x * (1.1 + i % 2 * 0.3), y, seed + Math.floor(age * 8) + i, colours, fade)
      if (i % 3 === 0) stamp(ctx, 'spark', x, y, colours, i % 4, 0.6, fade)
    } else if (kind === 'cold') {
      stamp(ctx, i % 3 === 0 ? 'crystal' : 'shard', x, y + age * age * 8, colours, i % 4, i % 3 === 0 ? 0.7 : 0.6, fade)
    } else if (kind === 'poison' || kind === 'acid') {
      y += age * age * 14 - Math.sin(age * Math.PI) * 7
      stamp(ctx, age > 0.65 ? 'splat' : 'drop', x, y, colours, age > 0.65 ? i % 4 : 0, kind === 'acid' ? 0.7 : 0.55, fade)
    } else if (physical) {
      y += age * age * 14 - Math.sin(age * Math.PI) * (kind === 'physical' ? 3 : 7)
      stamp(ctx, kind === 'sand' ? 'grain' : kind === 'earth' ? 'chip' : i % 3 ? 'spark' : 'shard',
        x, y, colours, i % 4, kind === 'earth' ? 0.65 : kind === 'sand' ? 0.7 : 0.55, fade)
    } else if (kind === 'drain') {
      stamp(ctx, 'wisp', Math.cos(a) * (1 - age) * 19, Math.sin(a) * (1 - age) * 12, colours, i % 4, 0.65, fade)
    } else if (kind === 'air') {
      stamp(ctx, 'curl', x, y - age * 6, colours, i % 4, 0.7, fade)
    } else if (kind === 'heal' || kind === 'holy') {
      stamp(ctx, i % 3 === 0 ? 'cross' : 'spark', x * 0.8, y - age * 13, colours, 0, i % 3 === 0 ? 0.7 : 0.6, fade)
    } else {
      // Broken glyphs and lit facets, rather than circles for every enchantment.
      stamp(ctx, kind === 'teleport' || kind === 'buff' || kind === 'debuff' ? 'rune' : i % 3 ? 'grain' : 'crystal',
        x, y - age * (kind === 'debuff' ? -5 : 7), colours, i % 4, i % 3 ? 0.65 : 0.8, fade)
    }
  }
}

/** Ash, chips, frost and puddles live on the floor after the contact flash. */
export function paintImpactResidue(ctx: Context2d, kind: ImpactKind, age: number, seed = 0) {
  if (age < 0 || age >= 1) return
  ctx.globalAlpha = 1
  const colours = kind === 'fire' ? SMOKE : IMPACT_PALETTES[kind]
  const fade = (1 - age) ** 1.3
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(seed + i * 4.1) * 10, y = Math.cos(seed + i * 3.7) * 9
    const sprite = kind === 'poison' || kind === 'acid' ? 'splat' : kind === 'cold' ? 'shard'
      : kind === 'earth' || kind === 'fire' ? 'chip' : 'grain'
    stamp(ctx, sprite, x, y, colours, i % 4, sprite === 'splat' ? 0.65 : 0.45, fade)
    if (kind === 'fire' && i < 2) stamp(ctx, 'grain', x + 1, y, IMPACT_PALETTES.fire, 0, 0.4, fade)
  }
}
