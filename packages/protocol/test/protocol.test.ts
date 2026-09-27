import { describe, expect, it } from 'vitest';
import { type C2S, type S2C, decodeC2S, decodeS2C, encode } from '../src/index';

describe('protocol', () => {
  it('round-trips valid client messages', () => {
    const msgs: C2S[] = [
      { t: 'hello', name: 'Alex' },
      { t: 'create', options: { mode: 'coop', map: 'felt', difficulty: 'standard' } },
      { t: 'join', room: 'FELT7' },
      { t: 'act', intent: { t: 'deal' } },
      { t: 'act', intent: { t: 'redraw', idx: [0, 3] }, ref: 4 },
      { t: 'act', intent: { t: 'place', blueprint: 1, x: 4, y: 2 } },
      { t: 'act', intent: { t: 'target', tower: 12, mode: 'strongest' } },
      { t: 'act', intent: { t: 'shopBuy', item: 'paint', card: 12, arg: 1 } },
      { t: 'ping', kind: 'help', x: 3.5, y: 7 },
      { t: 'chat', text: 'nice flush' },
    ];
    for (const m of msgs) expect(decodeC2S(encode(m))).toEqual({ ok: true, msg: m });
  });

  it('rejects invalid messages without throwing', () => {
    const bad: unknown[] = [
      { t: 'act', intent: { t: 'redraw', idx: [9] } },
      { t: 'act', intent: { t: 'gimmeGold', amount: 9999 } },
      { t: 'join', room: 'nope' },
      { t: 'hello', name: '<script>' },
      { t: 'hello', name: '' },
      { t: 'act', intent: { t: 'place', blueprint: -1, x: 0, y: 0 } },
      'hello',
      null,
    ];
    for (const b of bad) expect(decodeC2S(encode(b as C2S)).ok).toBe(false);
    expect(decodeC2S(new Uint8Array([0xc1, 0xff, 0x00])).ok).toBe(false);
  });

  it('survives random bytes', () => {
    let seed = 1;
    const byte = () => (seed = (seed * 1103515245 + 12345) >>> 0) & 0xff;
    for (let i = 0; i < 2000; i++) {
      const bytes = Uint8Array.from({ length: 1 + (i % 40) }, byte);
      expect(() => decodeC2S(bytes)).not.toThrow();
    }
  });

  it('round-trips server messages with binary payloads', () => {
    const m: S2C = { t: 'reject', reason: 'room_full', ref: 'join' };
    expect(decodeS2C(encode(m))).toEqual(m);
    const creeps = new Uint8Array([1, 2, 3, 250]);
    const back = decodeS2C(encode({ t: 'chat', from: 'p1', name: 'A', text: 'x' }));
    expect(back.t).toBe('chat');
    const packed = decodeS2C(encode({ t: 'snap', snap: { creeps } as never, events: [] }));
    expect(Array.from((packed as { snap: { creeps: Uint8Array } }).snap.creeps)).toEqual([
      1, 2, 3, 250,
    ]);
  });
});
