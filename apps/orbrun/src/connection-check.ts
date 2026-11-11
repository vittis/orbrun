import { RemoteConnection } from '@orbrun/webtiles'

/** An isolated anonymous socket: never reuse a gameplay connection for this. */
export async function checkConnection(url: string, signal: AbortSignal, progress: (samples: number[]) => void): Promise<number[]> {
  if (signal.aborted) throw new Error('Check cancelled')
  const conn = new RemoteConnection({ url, gamedataBase: '', WebSocket: window.WebSocket as never })
  let cancel: (reason: Error) => void = () => {}
  const abort = () => cancel(new Error('Check cancelled'))
  const closed = conn.onClose(() => cancel(new Error('Connection closed before the check finished')))
  signal.addEventListener('abort', abort, { once: true })
  const wait = (subscribe: (done: () => void) => () => void, send?: () => void) => new Promise<void>((resolve, reject) => {
    let unsubscribe = () => {}
    const timer = window.setTimeout(() => finish(new Error('Server did not answer within 5 seconds')), 5000)
    const finish = (error?: Error) => {
      clearTimeout(timer)
      unsubscribe()
      cancel = () => {}
      if (error) reject(error)
      else resolve()
    }
    cancel = finish
    unsubscribe = subscribe(() => finish())
    send?.()
  })
  try {
    await wait((done) => conn.onOpen(done))
    const samples: number[] = []
    for (let i = 0; i < 8; i++) {
      if (signal.aborted) throw new Error('Check cancelled')
      // Space requests out; no continuous monitoring or background traffic.
      await wait((done) => { const timer = window.setTimeout(done, 300); return () => clearTimeout(timer) })
      const start = performance.now()
      await wait((done) => conn.onMessage((m) => { if (m.msg === 'go_lobby') done() }),
        () => conn.send({ msg: 'go_lobby' }))
      samples.push(performance.now() - start)
      progress([...samples])
    }
    return samples
  } finally {
    signal.removeEventListener('abort', abort)
    closed()
    conn.close()
  }
}
