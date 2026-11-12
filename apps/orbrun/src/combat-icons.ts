/** Small, monochrome combat symbols; SVG keeps them consistent across platforms. */
const paths = {
  hit: 'm12 2 2 7 7-4-5 7 6 2-8 1 3 7-6-5-4 5 1-8-7-2 7-3Z',
  armor: 'M8 3 4 5 2 10l4 2v9h12v-9l4-2-2-5-4-2c0 4-8 4-8 0Z M9 12h6 M9 16h6',
  shield: 'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z M8 12l3 3 5-6',
  miss: 'M4 8h11l-4-4 M15 8l-4 4 M20 16H9l4-4 M9 16l4 4',
  hurt: 'M12 3C10 7 5 11 5 15a7 7 0 0 0 14 0c0-4-5-8-7-12Z M9 16c0 2 1 3 3 3',
  kill: 'M7 17H5v-6a7 7 0 0 1 14 0v6h-2v4H7Z M8 11h1v2H8Z M15 11h1v2h-1Z M10 21v-3 M14 21v-3',
  heal: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  fire: 'M13 2c2 6-4 7-2 11 2 0 4-3 4-5 6 6 6 13-3 13S2 12 7 8c0 3 1 4 2 4-1-4 4-6 4-10Z',
  cold: 'M12 2v20 M3 7l18 10 M3 17 21 7 M9 4l3 3 3-3 M9 20l3-3 3 3 M3 10l4-1-1-4 M18 19l-1-4 4-1 M3 14l4 1-1 4 M18 5l-1 4 4 1',
  poison: 'M9 3h6 M10 3v7l-5 8q-2 3 2 3h10q4 0 2-3l-5-8V3 M8 15h8 M10 18h.01 M14 18h.01',
  acid: 'M6 3h8 M8 3v8l7 7a2 2 0 0 1-3 3L5 14V3 M6 9h4 M18 5l-2 4a2 2 0 0 0 4 0Z',
  electric: 'm14 2-10 12h7l-1 8L21 9h-8Z',
  magic: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  confused: 'M8 7a4 4 0 1 1 7 3c-3 2-3 2-3 5 M12 20h.01 M3 5l2 2 M20 4l-2 2',
  paralysed: 'M7 4h3v16H7Z M14 4h3v16h-3Z',
  slowed: 'M5 3h14 M5 21h14 M7 3v4l10 10v4 M17 3v4L7 17v4',
  hasted: 'm3 5 7 7-7 7 M12 5l7 7-7 7',
  berserk: 'm3 7 6 3 M21 7l-6 3 M7 14v2 M17 14v2 M8 21l4-4 4 4 M4 3l3 2 M20 3l-3 2',
  petrifying: 'm8 3 9 2 4 9-6 7H6L3 12Z M8 3l2 9-4 9 M10 12l11 2',
  invisible: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M9 12a3 3 0 0 0 3 3 M3 21 21 3',
  silenced: 'M11 4 6 9H3v6h3l5 5Z M16 9l6 6 M22 9l-6 6',
  held: 'M4 4h16v16H4Z M4 9h16 M4 15h16 M9 4v16 M15 4v16',
  cured: 'M9 3h6 M10 3v7l-5 8q-2 3 2 3h5 M14 3v7 M14 17l3 3 5-7',
} as const

export type CombatIcon = keyof typeof paths

export function combatIcon(name: CombatIcon): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    class: 'combat-icon', 'aria-hidden': 'true', 'data-icon': name,
  })) svg.setAttribute(key, value)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', paths[name])
  svg.append(path)
  return svg
}
