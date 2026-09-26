import type { Card } from './card';
import { evaluateHand } from './evaluate';
import type { Rng } from '../core/rng';

export interface OddsResult {
  /** Probability of finishing in each category, indexed by HandCategory. */
  byCategory: number[];
  /** Probability of finishing at or above each category. */
  atLeast: number[];
  samples: number;
  exact: boolean;
}

/** Above this many redraw outcomes we switch from enumeration to sampling. */
const EXACT_LIMIT = 250_000;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/**
 * Odds of each final hand if the cards at `redraw` indices are replaced by
 * cards from `pool` (the unseen cards: the draw pile, or draw + discard when
 * a reshuffle may happen). Enumerates exactly when small, else samples.
 */
export function redrawOdds(
  hand: readonly Card[],
  redraw: readonly number[],
  pool: readonly Card[],
  rng: Rng,
  maxSamples = 50_000,
): OddsResult {
  const k = redraw.length;
  const tally = new Array<number>(11).fill(0);
  const trial = [...hand];
  let samples = 0;
  const combos = choose(pool.length, k);
  const exact = combos <= EXACT_LIMIT;

  if (exact) {
    const pick = (start: number, depth: number): void => {
      if (depth === k) {
        tally[evaluateHand(trial).category]!++;
        samples++;
        return;
      }
      for (let i = start; i <= pool.length - (k - depth); i++) {
        trial[redraw[depth]!] = pool[i]!;
        pick(i + 1, depth + 1);
      }
    };
    pick(0, 0);
  } else {
    const scratch = [...pool];
    for (let s = 0; s < maxSamples; s++) {
      // Partial Fisher–Yates: draw k distinct cards from the pool.
      for (let d = 0; d < k; d++) {
        const j = d + rng.int(scratch.length - d);
        const tmp = scratch[d]!;
        scratch[d] = scratch[j]!;
        scratch[j] = tmp;
        trial[redraw[d]!] = scratch[d]!;
      }
      tally[evaluateHand(trial).category]!++;
      samples++;
    }
  }

  const byCategory = tally.map((t) => t / samples);
  const atLeast = byCategory.map((_, i) => byCategory.slice(i).reduce((a, b) => a + b, 0));
  return { byCategory, atLeast, samples, exact };
}
