import { type Card, type Suit, ACE, JOKER, isJoker, rankOf, suitOf } from './card';

export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  ThreeOfAKind: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  FourOfAKind: 7,
  StraightFlush: 8,
  RoyalFlush: 9,
  FiveOfAKind: 10,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const HAND_NAMES: Record<HandCategory, string> = {
  0: 'High Card',
  1: 'Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
  9: 'Royal Flush',
  10: 'Five of a Kind',
};

/** Categories whose scoring cards are all one suit (suit effect is doubled). */
export const PURE_SUIT_CATEGORIES: ReadonlySet<HandCategory> = new Set([
  HandCategory.Flush,
  HandCategory.StraightFlush,
  HandCategory.RoyalFlush,
]);

/**
 * Packed hand value: category in the high bits, then up to five 4-bit
 * tiebreak ranks. A larger value is always a better hand.
 */
const CATEGORY_SHIFT = 20;
export const categoryOfValue = (value: number): HandCategory =>
  Math.floor(value / (1 << CATEGORY_SHIFT)) as HandCategory;

const WHEEL_MASK = (1 << 14) | (1 << 5) | (1 << 4) | (1 << 3) | (1 << 2);
const counts = new Uint8Array(15);

function popcount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/**
 * Scores exactly five non-Joker cards. Allocation-free so the exhaustive
 * test and the odds tool can call it millions of times.
 */
export function score5(c0: Card, c1: Card, c2: Card, c3: Card, c4: Card): number {
  const r0 = rankOf(c0);
  const r1 = rankOf(c1);
  const r2 = rankOf(c2);
  const r3 = rankOf(c3);
  const r4 = rankOf(c4);
  counts.fill(0);
  counts[r0]!++;
  counts[r1]!++;
  counts[r2]!++;
  counts[r3]!++;
  counts[r4]!++;
  const mask = (1 << r0) | (1 << r1) | (1 << r2) | (1 << r3) | (1 << r4);
  const s = suitOf(c0);
  const flush = suitOf(c1) === s && suitOf(c2) === s && suitOf(c3) === s && suitOf(c4) === s;
  const distinct = popcount(mask);

  // Tiebreak ranks ordered by group size, then rank (e.g. full house: trips rank, pair rank).
  let tiebreak = 0;
  let maxCount = 0;
  for (let count = 5; count >= 1; count--) {
    for (let r = ACE; r >= 2; r--) {
      if (counts[r] === count) {
        tiebreak = (tiebreak << 4) | r;
        if (count > maxCount) maxCount = count;
      }
    }
  }
  // Left-align so hands of the same category with fewer groups compare correctly.
  tiebreak <<= 4 * (5 - distinct);

  let category: HandCategory;
  if (distinct === 5) {
    const low = 31 - Math.clz32(mask & -mask);
    const straight = mask === 31 << low || mask === WHEEL_MASK;
    if (straight) {
      const high = mask === WHEEL_MASK ? 5 : low + 4;
      tiebreak = high << 16;
      category = flush
        ? high === ACE
          ? HandCategory.RoyalFlush
          : HandCategory.StraightFlush
        : HandCategory.Straight;
    } else {
      category = flush ? HandCategory.Flush : HandCategory.HighCard;
    }
  } else if (distinct === 4) {
    category = HandCategory.Pair;
  } else if (distinct === 3) {
    category = maxCount === 3 ? HandCategory.ThreeOfAKind : HandCategory.TwoPair;
  } else if (distinct === 2) {
    category = maxCount === 4 ? HandCategory.FourOfAKind : HandCategory.FullHouse;
  } else {
    category = HandCategory.FiveOfAKind;
  }

  // Decks can contain duplicates, so a flush can coexist with pairs.
  if (flush && category < HandCategory.Flush) {
    category = HandCategory.Flush;
    tiebreak = 0;
    for (const r of [r0, r1, r2, r3, r4].sort((a, b) => b - a)) tiebreak = (tiebreak << 4) | r;
  }

  return category * (1 << CATEGORY_SHIFT) + tiebreak;
}

export interface HandEval {
  category: HandCategory;
  /** Comparable score: higher is better. */
  value: number;
  /** The five cards with any Jokers replaced by what they stand for. */
  resolved: Card[];
  /** Indices (into the evaluated five) of the cards that make the hand. */
  scoring: number[];
}

/** Indices of the cards that form the hand (e.g. the two cards of a pair). */
function scoringIndices(cards: readonly Card[], category: HandCategory): number[] {
  const all = [0, 1, 2, 3, 4];
  switch (category) {
    case HandCategory.HighCard: {
      let best = 0;
      for (let i = 1; i < 5; i++) if (rankOf(cards[i]!) > rankOf(cards[best]!)) best = i;
      return [best];
    }
    case HandCategory.Pair:
    case HandCategory.TwoPair:
    case HandCategory.ThreeOfAKind:
    case HandCategory.FourOfAKind: {
      const byRank = new Map<number, number>();
      for (const c of cards) byRank.set(rankOf(c), (byRank.get(rankOf(c)) ?? 0) + 1);
      const need = category === HandCategory.FourOfAKind ? 4 : 2;
      return all.filter((i) => byRank.get(rankOf(cards[i]!))! >= need);
    }
    default:
      return all;
  }
}

function evaluateResolved(resolved: Card[], value: number): HandEval {
  const category = categoryOfValue(value);
  return { category, value, resolved, scoring: scoringIndices(resolved, category) };
}

/**
 * Evaluates a five-card hand. Jokers are wild and become whichever card
 * gives the best result (a Joker may duplicate a card already in the hand,
 * which is how Five of a Kind happens).
 */
export function evaluateHand(cards: readonly Card[]): HandEval {
  if (cards.length !== 5) throw new Error(`evaluateHand needs 5 cards, got ${cards.length}`);
  const jokers: number[] = [];
  cards.forEach((c, i) => {
    if (isJoker(c)) jokers.push(i);
    else if (!Number.isInteger(c) || c < 0 || c > JOKER) throw new Error(`Invalid card ${c}`);
  });

  if (jokers.length > 2) throw new Error('At most 2 Jokers per hand are supported');
  if (jokers.length === 0) {
    const [a, b, c, d, e] = cards as [Card, Card, Card, Card, Card];
    return evaluateResolved([...cards], score5(a, b, c, d, e));
  }

  const trial = [...cards];
  let bestValue = -1;
  let best: Card[] = trial;
  const assign = (j: number): void => {
    if (j === jokers.length) {
      const v = score5(trial[0]!, trial[1]!, trial[2]!, trial[3]!, trial[4]!);
      if (v > bestValue) {
        bestValue = v;
        best = [...trial];
      }
      return;
    }
    for (let c = 0; c < 52; c++) {
      trial[jokers[j]!] = c;
      assign(j + 1);
    }
  };
  assign(0);
  return evaluateResolved(best, bestValue);
}

/** Best five-card hand from five or more cards (River card, Hold'em). */
export function bestHand(cards: readonly Card[]): HandEval & { used: number[] } {
  if (cards.length < 5) throw new Error(`bestHand needs at least 5 cards, got ${cards.length}`);
  let best: (HandEval & { used: number[] }) | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const used = [a, b, c, d, e];
            const ev = evaluateHand(used.map((i) => cards[i]!));
            if (!best || ev.value > best.value) best = { ...ev, used };
          }
  return best!;
}

/** Tower power from the ranks of the scoring cards: 2s = ×1.00, Aces = ×1.60. */
export function handPower(ev: HandEval): number {
  const ranks = ev.scoring.map((i) => rankOf(ev.resolved[i]!));
  const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
  return 1 + 0.05 * (avg - 2);
}

/**
 * Suit affinity: the most common suit among scoring cards. Ties go to the
 * suit of the highest-ranked scoring card (earliest in the hand if tied).
 */
export function handSuit(ev: HandEval): { suit: Suit; pure: boolean } {
  const scoring = ev.scoring.map((i) => ev.resolved[i]!);
  const tally = [0, 0, 0, 0];
  for (const c of scoring) tally[suitOf(c)]!++;
  const top = Math.max(...tally);
  let highest: Card | undefined;
  for (const c of scoring) {
    if (tally[suitOf(c)] === top && (highest === undefined || rankOf(c) > rankOf(highest))) {
      highest = c;
    }
  }
  return { suit: suitOf(highest!), pure: PURE_SUIT_CATEGORIES.has(ev.category) };
}
