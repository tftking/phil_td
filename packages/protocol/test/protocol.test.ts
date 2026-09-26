import { describe, expect, it } from 'vitest';
import { type C2S, type S2C, decodeC2S, decodeS2C, encode } from '../src/index';

describe('protocol', () => {
  it('round-trips valid client intents', () => {
    const msgs: C2S[] = [
      { t: 'join', room: 'FELT7', name: 'Alex' },
      { t: 'deal' },
      { t: 'redraw', idx: [0, 3] },
      { t: 'place', blueprint: 1, x: 4, y: 2 },
      { t: 'target', tower: 12, mode: 'strongest' },
      { t: 'chat', text: 'nice flush' },
    ];
    for (const m of msgs) expect(decodeC2S(encode(m))).toEqual({ ok: true, msg: m });
  });

  it('rejects invalid intents without throwing', () => {
    const bad: unknown[] = [
      { t: 'redraw', idx: [7] },
      { t: 'join', room: 'nope', name: 'x' },
      { t: 'place', blueprint: -1, x: 0, y: 0 },
      { t: 'gimmeGold', amount: 9999 },
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

  it('round-trips server messages', () => {
    const m: S2C = { t: 'reject', reason: 'not_enough_gold', ref: 'deal' };
    expect(decodeS2C(encode(m))).toEqual(m);
  });
});
