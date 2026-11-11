import type { ClientMessage, ServerMessage } from './protocol.js'

export type Unsubscribe = () => void
export type CloseReason = { code: number; reason: string; clean: boolean }

/**
 * A frame on the wire, for a profiler in the app (perf.ts there). The
 * connection is the only layer that sees bytes and batches: above it a
 * message has already been unpacked from whatever arrived with it, and a
 * burst of twenty in one frame is indistinguishable from twenty frames.
 */
export interface TrafficEvent {
  dir: 'in' | 'out'
  bytes: number
  /** messages the frame unpacked to; 1 going out */
  msgs: number
  /** the client message's name, going out */
  name?: string
}

export interface Connection {
  readonly kind: 'remote' | 'local-native' | 'local-wasm'
  /** Where tileinfo/enums/atlases are served from, without the version segment. */
  readonly gamedataBase: string
  send(msg: ClientMessage): void
  onMessage(handler: (msg: ServerMessage) => void): Unsubscribe
  onClose(handler: (reason: CloseReason) => void): Unsubscribe
  onOpen(handler: () => void): Unsubscribe
  close(): void
  /**
   * Open the socket again after it closed, keeping every handler. Absent on a
   * connection that cannot be reopened.
   */
  reopen?(): void
  readonly open: boolean
  /** Set to watch the wire; nothing is measured while it is unset. */
  onTraffic?: ((e: TrafficEvent) => void) | null
}

export interface WebSocketLike {
  binaryType: string
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  /** Native sockets expose bytes queued for transmission; test transports may omit it. */
  readonly bufferedAmount?: number
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: { code: number; reason: string; wasClean: boolean }) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocketLike

export interface RemoteConnectionOptions {
  url: string
  gamedataBase: string
  WebSocket: WebSocketCtor
  /** Prefer the uncompressed subprotocol. Set false if a server refuses it. */
  noCompression?: boolean
  onDiagnostic?: (text: string, detail?: unknown) => void
}

/** Generous enough for full maps/rc files, bounded against a stalled or malformed peer. */
export const CONNECTION_LIMITS = {
  frameBytes: 16 * 1024 * 1024,
  batchMessages: 8192,
  messageNameLength: 128,
  outboundMessageBytes: 1024 * 1024,
  queuedMessages: 1024,
  queuedBytes: 2 * 1024 * 1024,
} as const

function messageObject(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const msg = (value as Record<string, unknown>).msg
  return typeof msg === 'string' && msg.length > 0 && msg.length <= CONNECTION_LIMITS.messageNameLength
}

/**
 * A WebTiles WebSocket connection. Unpacks `{msgs: [...]}` batches in order,
 * answers pings, and delivers every message synchronously to handlers.
 */
export class RemoteConnection implements Connection {
  readonly kind = 'remote' as const
  readonly gamedataBase: string
  private ws: WebSocketLike | null = null
  /** Which socket is the current one: a socket this connection has moved on from reports nothing (an old one closing late). */
  private gen = 0
  private messageHandlers = new Set<(msg: ServerMessage) => void>()
  private closeHandlers = new Set<(reason: CloseReason) => void>()
  private openHandlers = new Set<() => void>()
  private decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
  private opts: RemoteConnectionOptions
  open = false
  /** The socket has closed: nothing sent can go out until `reopen` makes another. */
  closed = false
  /** Set by a profiler to watch the wire (perf.ts); unset, nothing is measured. */
  onTraffic: ((e: TrafficEvent) => void) | null = null
  /** What was sent before the socket opened, to go out in order once it has. Only while connecting: a closed socket keeps nothing. */
  private queue: string[] = []
  private queueBytes = 0
  private encoder = new TextEncoder()

  constructor(opts: RemoteConnectionOptions) {
    this.opts = opts
    this.gamedataBase = opts.gamedataBase
    this.connect()
  }

  private connect() {
    const { url, WebSocket } = this.opts
    const gen = ++this.gen
    const mine = () => gen === this.gen
    const ws = (this.ws =
      this.opts.noCompression === false ? new WebSocket(url) : new WebSocket(url, ['no-compression']))
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      if (!mine()) return
      this.open = true
      const pending = this.queue
      this.queue = []
      this.queueBytes = 0
      for (const s of pending) {
        if (!this.transmit(s, this.encoder.encode(s).byteLength)) return
      }
      for (const h of this.openHandlers) h()
    }
    ws.onmessage = (ev) => {
      if (!mine()) return
      let text: string
      let bytes: number
      if (typeof ev.data === 'string') {
        // Reject oversized strings before allocating another encoded copy.
        if (ev.data.length > CONNECTION_LIMITS.frameBytes) return this.terminate('incoming frame exceeds byte limit')
        text = ev.data
        bytes = this.encoder.encode(text).byteLength
      } else if (ev.data instanceof ArrayBuffer && this.decoder) {
        bytes = ev.data.byteLength
        if (bytes > CONNECTION_LIMITS.frameBytes) return this.terminate('incoming frame exceeds byte limit')
        text = this.decoder.decode(ev.data)
      } else {
        this.terminate('unsupported WebTiles frame type')
        return
      }
      if (bytes > CONNECTION_LIMITS.frameBytes) return this.terminate('incoming frame exceeds byte limit')
      this.dispatchText(text, bytes)
    }
    ws.onclose = (ev) => {
      if (!mine()) return
      this.open = false
      this.closed = true
      // whatever was waiting for the socket to open never will now
      this.queue = []
      this.queueBytes = 0
      for (const h of this.closeHandlers) h({ code: ev.code, reason: ev.reason, clean: ev.wasClean })
    }
    ws.onerror = (ev) => {
      if (!mine()) return
      this.opts.onDiagnostic?.('websocket error', ev)
    }
  }

  private dispatchText(text: string, bytes: number) {
    let obj: unknown
    try {
      obj = JSON.parse(text)
    } catch {
      this.terminate('invalid WebTiles JSON', 4002)
      return
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      this.terminate('invalid WebTiles envelope', 4002)
      return
    }
    let msgs: unknown[]
    if (Object.hasOwn(obj, 'msgs')) {
      const batch = (obj as Record<string, unknown>).msgs
      if (!Array.isArray(batch)) {
        this.terminate('invalid WebTiles message batch', 4002)
        return
      }
      msgs = batch
    } else msgs = [obj]
    if (msgs.length > CONNECTION_LIMITS.batchMessages) {
      this.terminate('incoming batch exceeds message limit')
      return
    }
    // Validate the complete envelope first: applying only a prefix would lose
    // authoritative deltas while leaving the UI looking connected.
    if (!msgs.every(messageObject)) {
      this.terminate('invalid WebTiles message', 4002)
      return
    }
    // before the handlers run: what arrived is the network's, what they then cost is the frame's
    this.onTraffic?.({ dir: 'in', bytes, msgs: msgs.length })
    for (const m of msgs) {
      if (this.closed) break
      this.dispatch(m)
    }
  }

  private dispatch(m: ServerMessage) {
    if (m.msg === 'ping') {
      this.send({ msg: 'pong' })
      return
    }
    for (const h of this.messageHandlers) {
      try {
        h(m)
      } catch (e) {
        this.opts.onDiagnostic?.('handler error for ' + m.msg, e)
      }
    }
  }

  /** Resource/protocol failures end the session explicitly; queued commands are never replayed later. */
  private terminate(reason: string, code = 4000): void {
    if (this.closed) return
    const ws = this.ws
    ++this.gen // ignore late open/message/close callbacks from the rejected socket
    this.open = false
    this.closed = true
    this.queue = []
    this.queueBytes = 0
    this.opts.onDiagnostic?.(reason)
    ws?.close(code, reason)
    for (const h of this.closeHandlers) h({ code, reason, clean: false })
  }

  private transmit(s: string, bytes: number): boolean {
    if ((this.ws?.bufferedAmount ?? 0) + bytes > CONNECTION_LIMITS.queuedBytes) {
      this.terminate('outgoing socket buffer exceeds byte limit')
      return false
    }
    try {
      this.ws!.send(s)
      return true
    } catch {
      this.terminate('websocket send failed')
      return false
    }
  }

  send(msg: ClientMessage): void {
    if (this.closed) {
      this.opts.onDiagnostic?.('message dropped: the connection is closed', msg.msg)
      return
    }
    const s = JSON.stringify(msg)
    if (s.length > CONNECTION_LIMITS.outboundMessageBytes) return this.terminate('outgoing message exceeds byte limit')
    const bytes = this.encoder.encode(s).byteLength
    if (bytes > CONNECTION_LIMITS.outboundMessageBytes) return this.terminate('outgoing message exceeds byte limit')
    this.onTraffic?.({ dir: 'out', bytes, msgs: 1, name: msg.msg })
    if (this.ws && this.open && this.ws.readyState === 1) this.transmit(s, bytes)
    else if (this.queue.length >= CONNECTION_LIMITS.queuedMessages || this.queueBytes + bytes > CONNECTION_LIMITS.queuedBytes) {
      this.terminate('outgoing connection queue exceeds limit')
    } else {
      this.queue.push(s)
      this.queueBytes += bytes
    }
  }

  onMessage(handler: (msg: ServerMessage) => void): Unsubscribe {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onClose(handler: (reason: CloseReason) => void): Unsubscribe {
    this.closeHandlers.add(handler)
    return () => this.closeHandlers.delete(handler)
  }

  onOpen(handler: () => void): Unsubscribe {
    this.openHandlers.add(handler)
    return () => this.openHandlers.delete(handler)
  }

  close(): void {
    this.ws?.close()
  }

  /**
   * Open a socket again after this one closed: same URL, same handlers, so
   * everything watching this connection keeps watching. Nothing of the old
   * socket carries over, here or on the server, which stops the game whose
   * socket went (ws_handler.py `on_close`): what follows is a login on a
   * fresh connection. Ignored while a socket is still up or on its way.
   */
  reopen(): void {
    if (!this.closed) return
    this.closed = false
    this.open = false
    this.queue = []
    this.queueBytes = 0
    this.connect()
  }
}

