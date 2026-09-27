import { describe, expect, it } from 'vitest';
import {
  FixedStepper,
  Rng,
  TICK_MS,
  createDeck,
  deckCounts,
  discardCards,
  drawCards,
  hashState,
  redrawOdds,
  parseCards,
  standardDeck,
  HandCategory,
} from '../src/index';

describe('Rng', () => {
  it('is deterministic per seed and stream', () => {
    const a = Rng.stream(42, 'deck', 'p1');
    const b = Rng.stream(42, 'deck', 'p1');
    const seqA = Array.from({ length: 20 }, () => a.nextU32());
    const seqB = Array.from({ length: 20 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('separates streams and seeds', () => {
    const first = (r: Rng) => Array.from({ length: 5 }, () => r.nextU32());
    expect(first(Rng.stream(42, 'deck', 'p1'))).not.toEqual(first(Rng.stream(42, 'deck', 'p2')));
    expect(first(Rng.stream(42, 'deck'))).not.toEqual(first(Rng.stream(43, 'deck')));
  });

  it('can save and restore state', () => {
    const r = Rng.stream(1, 'x');
    r.nextU32();
    const saved = r.state;
    const next = [r.nextU32(), r.nextU32()];
    r.state = saved;
    expect([r.nextU32(), r.nextU32()]).toEqual(next);
  });

  it('produces roughly uniform ints', () => {
    const r = Rng.stream(7, 'uniform');
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) buckets[r.int(10)]!++;
    for (const b of buckets) expect(Math.abs(b - 10_000)).toBeLessThan(500);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});

describe('Deck', () => {
  it('deals the same sequence for the same seed', () => {
    const deal = (seed: number) => {
      const rng = Rng.stream(seed, 'deck', 'p1');
      const deck = createDeck(standardDeck(), rng);
      return [drawCards(deck, 5, rng).cards, drawCards(deck, 5, rng).cards];
    };
    expect(deal(99)).toEqual(deal(99));
    expect(deal(99)).not.toEqual(deal(100));
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const rng = Rng.stream(3, 'deck');
    const deck = createDeck(standardDeck(), rng);
    let drawn = 0;
    while (deck.draw.length >= 5) {
      discardCards(deck, drawCards(deck, 5, rng).cards);
      drawn += 5;
    }
    expect(drawn).toBe(50);
    const res = drawCards(deck, 5, rng);
    expect(res.reshuffled).toBe(true);
    expect(res.cards).toHaveLength(5);
    // No card is lost or duplicated across hand + piles.
    const all = [...res.cards, ...deck.draw, ...deck.discard].sort((a, b) => a - b);
    expect(all).toEqual(standardDeck());
  });

  it('reports public counts', () => {
    const rng = Rng.stream(3, 'deck');
    const deck = createDeck(standardDeck(), rng);
    drawCards(deck, 5, rng);
    const counts = deckCounts(deck);
    expect(counts.drawPile).toBe(47);
    expect(counts.ranks.reduce((a, b) => a + b, 0)).toBe(47);
    expect(counts.suits.reduce((a, b) => a + b, 0)).toBe(47);
  });

  it('throws when the deck is too small', () => {
    const rng = Rng.stream(1, 'deck');
    const deck = createDeck([0, 1, 2], rng);
    expect(() => drawCards(deck, 5, rng)).toThrow();
  });
});

describe('redrawOdds', () => {
  it('computes exact four-flush odds (9 outs of 47)', () => {
    const hand = parseCards('AH KH 7H 2C 9H');
    const pool = standardDeck().filter((c) => !hand.includes(c));
    const odds = redrawOdds(hand, [3], pool, Rng.stream(1, 't'));
    expect(odds.exact).toBe(true);
    expect(odds.samples).toBe(47);
    expect(odds.byCategory[HandCategory.Flush]).toBeCloseTo(9 / 47, 10);
  });

  it('samples large redraws and stays close to exact values', () => {
    const hand = parseCards('AH KD 7C 4S 2H');
    const pool = standardDeck().filter((c) => !hand.includes(c));
    const odds = redrawOdds(hand, [0, 1, 2, 3, 4], pool, Rng.stream(1, 't'), 40_000);
    expect(odds.exact).toBe(false);
    expect(odds.byCategory[HandCategory.Pair]).toBeCloseTo(0.4226, 1);
    expect(odds.atLeast[0]).toBeCloseTo(1, 10);
  });
});

describe('FixedStepper', () => {
  it('runs whole ticks and carries the remainder', () => {
    let ticks = 0;
    const s = new FixedStepper(() => ticks++);
    expect(s.advance(TICK_MS * 2.5)).toBe(2);
    expect(s.alpha).toBeCloseTo(0.5);
    expect(s.advance(TICK_MS * 0.5)).toBe(1);
    expect(ticks).toBe(3);
  });

  it('caps catch-up after a stall', () => {
    let ticks = 0;
    const s = new FixedStepper(() => ticks++, 5);
    expect(s.advance(10_000)).toBe(5);
    expect(s.advance(0)).toBe(0);
  });
});

describe('hashState', () => {
  it('ignores key order and detects changes', () => {
    expect(hashState({ a: 1, b: [1, 2] })).toBe(hashState({ b: [1, 2], a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });
});
