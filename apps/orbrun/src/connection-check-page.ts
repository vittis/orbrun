import servers from '../data/servers.json'
import { checkConnection } from './connection-check'

const select = document.querySelector<HTMLSelectElement>('#server')!
const start = document.querySelector<HTMLButtonElement>('#start')!
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!
const result = document.querySelector<HTMLElement>('#result')!
for (const server of servers) select.add(new Option(`${server.name} · ${server.location}`, server.id))
select.value = 'cbrg'
let active: AbortController | null = null
start.addEventListener('click', async () => {
  if (active) return
  const server = servers.find((s) => s.id === select.value)!
  const controller = active = new AbortController()
  start.disabled = select.disabled = true
  cancel.disabled = false
  result.textContent = `Connecting to ${server.name}…`
  try {
    const samples = await checkConnection(server.ws, controller.signal, (xs) => {
      result.textContent = `${server.name}: ${xs.length}/8 responses\nLatest: ${Math.round(xs.at(-1)!)} ms`
    })
    const sorted = [...samples].sort((a, b) => a - b)
    result.textContent = `${server.name} · ${server.host}\nTypical (median): ${Math.round((sorted[3] + sorted[4]) / 2)} ms\nFastest: ${Math.round(sorted[0])} ms\nSlowest: ${Math.round(sorted[7])} ms\nSamples: ${samples.map(Math.round).join(', ')} ms`
  } catch (error) {
    result.textContent = error instanceof Error ? error.message : 'The check failed. Please try again.'
  } finally {
    active = null
    start.disabled = select.disabled = false
    cancel.disabled = true
  }
})
cancel.addEventListener('click', () => active?.abort())
document.addEventListener('visibilitychange', () => { if (document.hidden) active?.abort() })
window.addEventListener('pagehide', () => active?.abort())
