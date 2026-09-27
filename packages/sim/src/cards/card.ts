/**
 * Cards are small integers so hands can be evaluated without allocation.
 *
 *   0..51  regular cards: suit * 13 + (rank - 2)
 *   52     Joker
 *
 * Ranks run 2..14 (J=11, Q=12, K=13, A=14). Suits: 0 ♠, 1 ♥, 2 ♦, 3 ♣.
 * Decks may hold duplicates of a card (Card Shop "Mark").
 */
export type Card = number;

export const Suit = {
  Spades: 0,
  Hearts: 1,
  Diamonds: 2,
  Clubs: 3,
} as const;
export type Suit = (typeof Suit)[keyof typeof Suit];

export const SUITS: readonly Suit[] = [0, 1, 2, 3];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export const SUIT_LETTERS = 'SHDC';
export const SUIT_SYMBOLS = '♠♥♦♣';
export const RANK_LETTERS = '23456789TJQKA';

export const JOKER: Card = 52;
export const MIN_RANK = 2;
export const ACE = 14;

export const makeCard = (rank: number, suit: Suit): Card => suit * 13 + (rank - 2);
export const isJoker = (c: Card): boolean => c === JOKER;
export const rankOf = (c: Card): number => (c % 13) + 2;
export const suitOf = (c: Card): Suit => Math.floor(c / 13) as Suit;

/** A standard 52-card deck in canonical order. */
export function standardDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i);
}

export function cardToString(c: Card): string {
  if (isJoker(c)) return 'JK';
  return RANK_LETTERS[rankOf(c) - 2]! + SUIT_LETTERS[suitOf(c)]!;
}

/** Parses "AH", "Td", "10s", "JK" (Joker). Throws on invalid input. */
export function parseCard(text: string): Card {
  const s = text.trim().toUpperCase();
  if (s === 'JK' || s === 'JOKER') return JOKER;
  const m = /^(10|[2-9TJQKA])([SHDC])$/.exec(s);
  if (!m) throw new Error(`Invalid card: "${text}"`);
  const rank = m[1] === '10' ? 10 : RANK_LETTERS.indexOf(m[1]!) + 2;
  return makeCard(rank, SUIT_LETTERS.indexOf(m[2]!) as Suit);
}

/** Parses a whitespace or comma separated list of cards. */
export function parseCards(text: string): Card[] {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(parseCard);
}
