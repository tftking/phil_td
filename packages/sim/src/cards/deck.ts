import { type Card, isJoker, rankOf, suitOf } from './card';
import type { Rng } from '../core/rng';

/**
 * A player's personal deck. Plain data so it serializes into match state.
 * `draw` is ordered: the next card dealt is the last element.
 */
export interface Deck {
  draw: Card[];
  discard: Card[];
}

export interface DeckCounts {
  /** Remaining cards in the draw pile by rank, index 0 = rank 2 ... 12 = Ace. */
  ranks: number[];
  /** Remaining cards in the draw pile by suit (♠♥♦♣). */
  suits: number[];
  jokers: number;
  drawPile: number;
  discardPile: number;
}

export function createDeck(cards: readonly Card[], rng: Rng): Deck {
  return { draw: rng.shuffle([...cards]), discard: [] };
}

export interface DrawResult {
  cards: Card[];
  /** True if the discard pile was shuffled back in during this draw. */
  reshuffled: boolean;
}

/**
 * Draws `n` cards. When the draw pile runs out, the discard pile is shuffled
 * to form a new draw pile. Throws if the deck cannot supply `n` cards at all
 * (cards currently in hand are in neither pile).
 */
export function drawCards(deck: Deck, n: number, rng: Rng): DrawResult {
  if (deck.draw.length + deck.discard.length < n) {
    throw new Error(`Deck cannot supply ${n} cards`);
  }
  const cards: Card[] = [];
  let reshuffled = false;
  for (let i = 0; i < n; i++) {
    if (deck.draw.length === 0) {
      deck.draw = rng.shuffle(deck.discard);
      deck.discard = [];
      reshuffled = true;
    }
    cards.push(deck.draw.pop()!);
  }
  return { cards, reshuffled };
}

export function discardCards(deck: Deck, cards: readonly Card[]): void {
  deck.discard.push(...cards);
}

/** Public information about the draw pile, used for card counting. */
export function deckCounts(deck: Deck): DeckCounts {
  const ranks = new Array<number>(13).fill(0);
  const suits = new Array<number>(4).fill(0);
  let jokers = 0;
  for (const c of deck.draw) {
    if (isJoker(c)) {
      jokers++;
      continue;
    }
    ranks[rankOf(c) - 2]!++;
    suits[suitOf(c)]!++;
  }
  return { ranks, suits, jokers, drawPile: deck.draw.length, discardPile: deck.discard.length };
}
