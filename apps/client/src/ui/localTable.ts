import { computed, signal } from '@preact/signals';
import {
  type Card,
  type Deck,
  GAME_DATA,
  HandCategory,
  Rng,
  createDeck,
  deckCounts,
  discardCards,
  drawCards,
  evaluateHand,
  handPower,
  handSuit,
  redrawOdds,
  standardDeck,
  towerForHand,
} from '@pokertd/sim';

/**
 * Offline hand flow for the M0 client: deal, mark cards, redraw, lock.
 * Gold, placement and waves are M1; this proves the sim runs in the browser.
 */
const rules = GAME_DATA.rules.cards;
const seed = (Math.random() * 2 ** 32) >>> 0;
const rng = Rng.stream(seed, 'deck', 'local');
const oddsRng = Rng.stream(seed, 'odds-hint');
let deck: Deck = createDeck(standardDeck(), rng);

export const hand = signal<Card[]>([]);
export const marked = signal<Set<number>>(new Set());
export const redrawsUsed = signal(0);
export const locked = signal<{ tower: string; hand: string } | null>(null);
export const lastEvent = signal('');
export const counts = signal(deckCounts(deck));
export const deals = signal(0);

export const evaluation = computed(() =>
  hand.value.length === 5 ? evaluateHand(hand.value) : null,
);

export const nextRedrawCost = computed(
  () => rules.redrawCosts[Math.min(redrawsUsed.value, rules.redrawCosts.length - 1)]!,
);

/** Chance the marked redraw beats the current hand category. */
export const redrawHint = computed(() => {
  const ev = evaluation.value;
  const idx = [...marked.value];
  if (!ev || idx.length === 0) return null;
  const odds = redrawOdds(hand.value, idx, deck.draw, oddsRng, 4000);
  const better = ev.category < HandCategory.FiveOfAKind ? odds.atLeast[ev.category + 1]! : 0;
  return { better, exact: odds.exact };
});

export function deal(): void {
  if (hand.value.length) discardCards(deck, hand.value);
  const res = drawCards(deck, rules.handSize, rng);
  hand.value = res.cards;
  marked.value = new Set();
  redrawsUsed.value = 0;
  locked.value = null;
  deals.value++;
  lastEvent.value = res.reshuffled ? 'Deck reshuffled' : '';
  counts.value = deckCounts(deck);
}

export function toggle(i: number): void {
  if (!hand.value.length || locked.value) return;
  const next = new Set(marked.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  marked.value = next;
}

export function redraw(): void {
  const idx = [...marked.value];
  if (!idx.length || locked.value) return;
  const res = drawCards(deck, idx.length, rng);
  const cards = [...hand.value];
  discardCards(
    deck,
    idx.map((i) => cards[i]!),
  );
  idx.forEach((i, k) => (cards[i] = res.cards[k]!));
  hand.value = cards;
  marked.value = new Set();
  redrawsUsed.value++;
  lastEvent.value = res.reshuffled ? 'Deck reshuffled' : '';
  counts.value = deckCounts(deck);
}

export function lock(): void {
  const ev = evaluation.value;
  if (!ev || locked.value) return;
  const tower = towerForHand(ev.category);
  const { suit, pure } = handSuit(ev);
  locked.value = {
    tower: tower.name,
    hand: `power ×${handPower(ev).toFixed(2)} · ${'♠♥♦♣'[suit]}${pure ? ' ×2' : ''}`,
  };
}

/** Starts over with a fresh shuffled deck. */
export function resetDeck(): void {
  deck = createDeck(standardDeck(), rng);
  hand.value = [];
  marked.value = new Set();
  locked.value = null;
  counts.value = deckCounts(deck);
}
