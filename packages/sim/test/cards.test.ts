import { describe, expect, it } from 'vitest';
import {
  HandCategory,
  JOKER,
  bestHand,
  cardToString,
  evaluateHand,
  handPower,
  handSuit,
  makeCard,
  parseCard,
  parseCards,
  rankOf,
  score5,
  categoryOfValue,
  suitOf,
  Suit,
} from '../src/index';

const ev = (s: string) => evaluateHand(parseCards(s));
const cat = (s: string) => ev(s).category;

describe('card model', () => {
  it('round-trips every card through its string form', () => {
    for (let c = 0; c < 52; c++) expect(parseCard(cardToString(c))).toBe(c);
    expect(parseCard('JK')).toBe(JOKER);
    expect(parseCard('10s')).toBe(parseCard('TS'));
  });

  it('decodes rank and suit', () => {
    const c = makeCard(14, Suit.Hearts);
    expect(rankOf(c)).toBe(14);
    expect(suitOf(c)).toBe(Suit.Hearts);
    expect(cardToString(c)).toBe('AH');
  });

  it('rejects bad input', () => {
    expect(() => parseCard('1H')).toThrow();
    expect(() => parseCard('AX')).toThrow();
  });
});

describe('evaluateHand categories', () => {
  it.each([
    ['AH KD 7C 4S 2H', HandCategory.HighCard],
    ['AH AD 7C 4S 2H', HandCategory.Pair],
    ['AH AD 7C 7S 2H', HandCategory.TwoPair],
    ['AH AD AC 7S 2H', HandCategory.ThreeOfAKind],
    ['5H 6D 7C 8S 9H', HandCategory.Straight],
    ['AH 2D 3C 4S 5H', HandCategory.Straight],
    ['TH JD QC KS AH', HandCategory.Straight],
    ['AH 9H 7H 4H 2H', HandCategory.Flush],
    ['AH AD AC 7S 7H', HandCategory.FullHouse],
    ['AH AD AC AS 7H', HandCategory.FourOfAKind],
    ['5H 6H 7H 8H 9H', HandCategory.StraightFlush],
    ['AH 2H 3H 4H 5H', HandCategory.StraightFlush],
    ['TH JH QH KH AH', HandCategory.RoyalFlush],
  ])('%s', (hand, expected) => {
    expect(cat(hand)).toBe(expected);
  });

  it('does not wrap straights around the ace', () => {
    expect(cat('QH KD AC 2S 3H')).toBe(HandCategory.HighCard);
  });

  it('handles duplicate cards from marked decks', () => {
    expect(cat('AH AH AH AH AH')).toBe(HandCategory.FiveOfAKind);
    // Two copies of AH plus three more hearts is still a flush, which beats the pair.
    expect(cat('AH AH 9H 7H 2H')).toBe(HandCategory.Flush);
    // A full house beats a flush even when all cards share a suit.
    expect(cat('AH AH AH 7H 7H')).toBe(HandCategory.FullHouse);
  });
});

describe('hand ordering', () => {
  const beats = (a: string, b: string) => expect(ev(a).value).toBeGreaterThan(ev(b).value);

  it('ranks categories', () => {
    beats('2H 2D 3C 4S 5D', 'AH KD QC JS 9H');
    beats('TH JH QH KH AH', '9H TH JH QH KH');
    beats('2H 3H 4H 5H 6H', 'AH 2H 3H 4H 5H');
  });

  it('breaks ties within a category', () => {
    beats('AH AD 3C 4S 5D', 'KH KD QC JS 9H');
    beats('AH AD 3C 4S 6D', 'AC AS 3D 4H 5C');
    beats('3H 3D 3C 2S 2D', '2H 2C 2S AS AD');
    beats('6H 7D 8C 9S TD', 'AH 2D 3C 4S 5H');
    beats('AH KD 7C 4S 3H', 'AH KD 7C 4S 2H');
  });

  it('treats identical ranks as equal', () => {
    expect(ev('AH KD 7C 4S 2H').value).toBe(ev('AS KC 7D 4H 2D').value);
  });
});

describe('scoring cards', () => {
  it('picks the cards that make the hand', () => {
    const pair = ev('AH 7D AC 4S 2H');
    expect(pair.scoring).toEqual([0, 2]);
    expect(ev('AH KD 7C 4S 2H').scoring).toEqual([0]);
    expect(ev('7H 7D AC AS 2H').scoring).toEqual([0, 1, 2, 3]);
    expect(ev('7H 7D 7C 7S 2H').scoring).toEqual([0, 1, 2, 3]);
    expect(ev('5H 6D 7C 8S 9H').scoring).toHaveLength(5);
  });
});

describe('jokers', () => {
  it('become the best card', () => {
    expect(cat('AH AD AC AS JK')).toBe(HandCategory.FiveOfAKind);
    expect(cat('TH JH QH KH JK')).toBe(HandCategory.RoyalFlush);
    expect(cat('2C 7D 9H KS JK')).toBe(HandCategory.Pair);
    expect(cat('JK JK 2C 2D 9S')).toBe(HandCategory.FourOfAKind);
  });

  it('report what they stood for', () => {
    const e = ev('AH AD AC AS JK');
    expect(e.resolved.every((c) => rankOf(c) === 14)).toBe(true);
    expect(e.resolved).not.toContain(JOKER);
  });

  it('refuses more than two jokers', () => {
    expect(() => evaluateHand([JOKER, JOKER, JOKER, 0, 1])).toThrow();
  });
});

describe('bestHand', () => {
  it('finds the best five of seven', () => {
    const cards = parseCards('2C 7D TH JH QH KH AH');
    const best = bestHand(cards);
    expect(best.category).toBe(HandCategory.RoyalFlush);
    expect(best.used).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('power and suit', () => {
  it('scales power with the rank of scoring cards', () => {
    expect(handPower(ev('2H 2D 7C 9S KH'))).toBeCloseTo(1.0);
    expect(handPower(ev('AH AD 7C 9S KH'))).toBeCloseTo(1.6);
    // High card uses only the single highest card.
    expect(handPower(ev('AH 3D 7C 9S 4H'))).toBeCloseTo(1.6);
  });

  it('takes the dominant scoring suit, ties to the highest card', () => {
    expect(handSuit(ev('AH AD 7C 9S KH')).suit).toBe(Suit.Hearts);
    expect(handSuit(ev('AH AD AS 9S KH')).suit).toBe(Suit.Hearts);
    expect(handSuit(ev('7S 7D 3S 3D KH'))).toEqual({ suit: Suit.Spades, pure: false });
    expect(handSuit(ev('AC 9C 7C 4C 2C'))).toEqual({ suit: Suit.Clubs, pure: true });
  });
});

describe('exhaustive 5-card frequencies', () => {
  it('matches the known distribution over all 2,598,960 hands', { timeout: 120_000 }, () => {
    const tally = new Array<number>(11).fill(0);
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) tally[categoryOfValue(score5(a, b, c, d, e))]!++;

    expect(tally).toEqual([
      1_302_540, // high card
      1_098_240, // pair
      123_552, // two pair
      54_912, // three of a kind
      10_200, // straight
      5_108, // flush
      3_744, // full house
      624, // four of a kind
      36, // straight flush
      4, // royal flush
      0, // five of a kind (impossible without duplicates)
    ]);
  });
});
