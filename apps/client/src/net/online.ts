import { type C2S, type S2C, decodeS2C, encode } from '@pokertd/protocol';
import { Emitter, type Link } from './link';

export type OnlineStatus = 'connecting' | 'open' | 'closed';

/** Where the game server lives: VITE_SERVER_URL, else the page's own origin. */
export function serverBase(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env.replace(/\/$/, '');
  return `${location.protocol}//${location.host}`;
}

/**
 * WebSocket link with automatic reconnect. On every (re)connect it says
 * hello with the stored profile token and lets the caller rejoin its room.
 */
export class OnlineLink implements Link {
  readonly kind = 'online' as const;
  private ws: WebSocket | null = null;
  private readonly messages = new Emitter<S2C>();
  readonly status = new Emitter<OnlineStatus>();
  private closed = false;
  private attempts = 0;
  private outbox: C2S[] = [];

  constructor(private readonly hello: () => C2S) {
    this.connect();
  }

  private connect(): void {
    const url = serverBase().replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.status.emit('connecting');
    ws.onopen = () => {
      this.attempts = 0;
      this.status.emit('open');
      ws.send(encode(this.hello()));
      for (const m of this.outbox.splice(0)) ws.send(encode(m));
    };
    ws.onmessage = (e) => this.messages.emit(decodeS2C(new Uint8Array(e.data as ArrayBuffer)));
    ws.onclose = () => {
      this.status.emit('closed');
      if (this.closed) return;
      const delay = Math.min(10_000, 500 * 2 ** this.attempts++);
      setTimeout(() => this.connect(), delay);
    };
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: C2S): void {
    if (this.open) this.ws!.send(encode(msg));
    else if (msg.t !== 'act' && msg.t !== 'ping') this.outbox.push(msg);
  }

  onMessage(cb: (msg: S2C) => void): () => void {
    return this.messages.on(cb);
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
