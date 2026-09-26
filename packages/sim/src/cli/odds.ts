/**
 * Odds tool: what happens if I redraw these cards?
 *
 *   pnpm odds "AH KH 7H 2C 9H" --redraw 2C
 *   pnpm odds "AH KH 7H 2C 9H" --redraw 2C,7H --seed 7
 *
 * Unseen cards are assumed to be the rest of a standard 52-card deck.
 */
import { parseArgs } from 'node:util';
import {
  HAND_NAMES,
  type HandCategory,
  Rng,
  cardToString,
  evaluateHand,
  handPower,
  handSuit,
  parseCard,
  parseCards,
  redrawOdds,
  standardDeck,
  towerForHand,
  SUIT_SYMBOLS,
} from '../index';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    redraw: { type: 'string', short: 'r' },
    seed: { type: 'string', default: '1' },
    samples: { type: 'string', default: '50000' },
  },
});

if (positionals.length === 0) {
  console.error('usage: pnpm odds "AH KH 7H 2C 9H" [--redraw 2C,7H]');
  process.exit(1);
}

const hand = parseCards(positionals.join(' '));
if (hand.length !== 5) {
  console.error(`Need exactly 5 cards, got ${hand.length}`);
  process.exit(1);
}

const redrawCards = (values.redraw ?? '')
  .split(/[\s,]+/)
  .filter(Boolean)
  .map(parseCard);
const redraw = redrawCards.map((c) => {
  const i = hand.indexOf(c);
  if (i < 0) {
    console.error(`${cardToString(c)} is not in the hand`);
    process.exit(1);
  }
  return i;
});

const current = evaluateHand(hand);
const tower = towerForHand(current.category);
const { suit, pure } = handSuit(current);
console.log(`Hand:    ${hand.map(cardToString).join(' ')}`);
console.log(
  `Now:     ${HAND_NAMES[current.category]} → ${tower.name}` +
    `  (power ×${handPower(current).toFixed(2)}, ${SUIT_SYMBOLS[suit]}${pure ? ' ×2' : ''})`,
);

if (redraw.length === 0) process.exit(0);

const pool = standardDeck().filter((c) => !hand.includes(c));
const odds = redrawOdds(
  hand,
  redraw,
  pool,
  Rng.stream(Number(values.seed), 'odds-cli'),
  Number(values.samples),
);
console.log(
  `Redraw:  ${redrawCards.map(cardToString).join(' ')}  ` +
    `(${odds.exact ? 'exact' : 'sampled'}, ${odds.samples.toLocaleString()} outcomes)\n`,
);
console.log('  Result            Chance   At least');
odds.byCategory.forEach((p, cat) => {
  if (p === 0) return;
  const name = HAND_NAMES[cat as HandCategory].padEnd(16);
  console.log(
    `  ${name} ${(p * 100).toFixed(2).padStart(6)}%  ${(odds.atLeast[cat]! * 100).toFixed(2).padStart(7)}%`,
  );
});
