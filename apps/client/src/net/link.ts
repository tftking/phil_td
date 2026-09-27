import type { C2S, S2C } from '@pokertd/protocol';

/**
 * Where the game's messages come from. The UI only speaks the server
 * protocol, so online play, offline solo, the tutorial and replays all look
 * the same to it.
 */
export interface Link {
  readonly kind: 'online' | 'local' | 'replay';
  send(msg: C2S): void;
  onMessage(cb: (msg: S2C) => void): () => void;
  close(): void;
}

export class Emitter<T> {
  private readonly subs = new Set<(v: T) => void>();

  on(cb: (v: T) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  emit(v: T): void {
    for (const cb of this.subs) cb(v);
  }
}
