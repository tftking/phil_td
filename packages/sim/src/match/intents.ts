import { type Card, JOKER, type Suit, isJoker, makeCard, rankOf, suitOf } from '../cards/card';
import { discardCards, drawCards } from '../cards/deck';
import { type HandEval, bestHand, evaluateHand, handPower, handSuit } from '../cards/evaluate';
import { secondsToTicks } from '../core/time';
import { sendDef, towerDef, towerForHand } from '../data/index';
import type { TargetingMode } from '../data/types';
import { tileKey } from '../map/geometry';
import {
  contextOf,
  data,
  isOver,
  nextId,
  nextOpponent,
  playerRng,
  playersInOrder,
} from './context';
import { recomputeTowers } from './towers';
import { countJokers } from './waves';
import type { EntityId, MatchState, PlayerId, PlayerState, Tower } from './types';

export type Intent =
  | { t: 'deal' }
  | { t: 'redraw'; idx: number[] }
  | { t: 'lock' }
  | { t: 'fold' }
  | { t: 'place'; blueprint: EntityId; x: number; y: number }
  | { t: 'scrap'; blueprint: EntityId }
  | { t: 'upgrade'; tower: EntityId }
  | { t: 'sell'; tower: EntityId }
  | { t: 'target'; tower: EntityId; mode: TargetingMode }
  | { t: 'research'; suit: Suit }
  | { t: 'shopBuy'; item: string; card?: Card; arg?: number }
  | { t: 'slip'; card: number; to: PlayerId }
  | { t: 'pot'; amount: number }
  | { t: 'raise'; send: string; count: number }
  | { t: 'pauseVote' }
  | { t: 'callWave' };

export type RejectReason =
  | 'game_over'
  | 'busted'
  | 'unknown_player'
  | 'not_enough_gold'
  | 'bench_full'
  | 'no_hand'
  | 'has_hand'
  | 'invalid_tile'
  | 'tile_taken'
  | 'center_full'
  | 'not_found'
  | 'max_level'
  | 'busy'
  | 'shop_closed'
  | 'deck_too_small'
  | 'wrong_mode'
  | 'locked'
  | 'invalid_action';

export type IntentResult = { ok: true } | { ok: false; reason: RejectReason };

const OK: IntentResult = { ok: true };
const no = (reason: RejectReason): IntentResult => ({ ok: false, reason });

/** Gold cost of the player's next redraw on their current hand. */
export function redrawCost(p: PlayerState): number {
  const used = p.hand?.redrawsUsed ?? 0;
  if (used < p.freeRedraws) return 0;
  const costs = data.rules.cards.redrawCosts;
  return costs[Math.min(used - p.freeRedraws + 1, costs.length - 1)]!;
}

/** Evaluates a hand of 5 (or more, with River cards: best five). */
export function evaluatePlayerHand(cards: readonly Card[]): HandEval & { used: number[] } {
  if (cards.length === 5) return { ...evaluateHand(cards), used: [0, 1, 2, 3, 4] };
  return bestHand(cards);
}

function draw(state: MatchState, p: PlayerState, n: number): Card[] {
  const res = drawCards(p.deck, n, playerRng(p));
  if (res.reshuffled) state.events.push({ kind: 'reshuffle', player: p.id });
  return res.cards;
}

function ownTower(state: MatchState, p: PlayerState, id: EntityId): Tower | undefined {
  return state.towers.find((t) => t.id === id && t.owner === p.id);
}

/** Removes one copy of a card from the deck piles. */
function takeFromDeck(p: PlayerState, card: Card): boolean {
  for (const pile of [p.deck.discard, p.deck.draw]) {
    const i = pile.indexOf(card);
    if (i >= 0) {
      pile.splice(i, 1);
      return true;
    }
  }
  return false;
}

const deckSize = (p: PlayerState): number =>
  p.deck.draw.length + p.deck.discard.length + (p.hand?.cards.length ?? 0);

/**
 * Applies one player intent. All validation lives here; the server and the
 * offline host just forward intents and report rejections.
 */
export function applyIntent(state: MatchState, playerId: PlayerId, intent: Intent): IntentResult {
  const p = state.players[playerId];
  if (!p) return no('unknown_player');
  if (isOver(state)) return no('game_over');
  if (p.busted && intent.t !== 'pauseVote') return no('busted');
  const rules = data.rules;
  const coop = state.settings.mode === 'coop';

  switch (intent.t) {
    case 'deal': {
      if (p.hand) return no('has_hand');
      if (p.blueprints.length > p.benchSlots) return no('bench_full');
      if (p.gold < rules.cards.dealCost) return no('not_enough_gold');
      p.gold -= rules.cards.dealCost;
      const cards = draw(state, p, rules.cards.handSize + p.riverCards);
      p.riverCards = 0;
      p.hand = { cards, redrawsUsed: 0, spent: rules.cards.dealCost };
      return OK;
    }

    case 'redraw': {
      if (!p.hand) return no('no_hand');
      const idx = [...new Set(intent.idx)];
      if (idx.length === 0 || idx.some((i) => i < 0 || i >= p.hand!.cards.length)) {
        return no('invalid_action');
      }
      const cost = redrawCost(p);
      if (p.gold < cost) return no('not_enough_gold');
      p.gold -= cost;
      const cards = [...p.hand.cards];
      const old = idx.map((i) => cards[i]!);
      let fresh: Card[];
      if (p.slipIncoming !== null) {
        fresh = [p.slipIncoming, ...(idx.length > 1 ? draw(state, p, idx.length - 1) : [])];
        p.slipIncoming = null;
      } else {
        fresh = draw(state, p, idx.length);
      }
      discardCards(p.deck, old);
      idx.forEach((i, k) => (cards[i] = fresh[k]!));
      p.hand = { cards, redrawsUsed: p.hand.redrawsUsed + 1, spent: p.hand.spent + cost };
      return OK;
    }

    case 'lock': {
      if (!p.hand) return no('no_hand');
      const ev = evaluatePlayerHand(p.hand.cards);
      const tower = towerForHand(ev.category);
      const { suit, pure } = handSuit(ev);
      p.blueprints.push({
        id: nextId(state),
        tower: tower.id,
        category: ev.category,
        power: handPower(ev),
        suit,
        pure,
        value: p.hand.spent,
        cards: ev.used.map((i) => p.hand!.cards[i]!),
      });
      discardCards(p.deck, p.hand.cards);
      p.hand = null;
      p.stats.handsPlayed++;
      p.stats.handCounts[ev.category]!++;
      p.stats.bestHand = Math.max(p.stats.bestHand, ev.category);
      if (ev.category >= rules.bigHandCategory) {
        state.events.push({
          kind: 'bigHand',
          player: p.id,
          category: ev.category,
          tower: tower.id,
        });
      }
      return OK;
    }

    case 'fold': {
      if (!p.hand) return no('no_hand');
      discardCards(p.deck, p.hand.cards);
      p.hand = null;
      return OK;
    }

    case 'place': {
      const bi = p.blueprints.findIndex((b) => b.id === intent.blueprint);
      if (bi < 0) return no('not_found');
      const { layout } = contextOf(state);
      const zone = layout.buildZone.get(tileKey(intent.x, intent.y));
      if (zone === undefined) return no('invalid_tile');
      if (zone >= 0 && zone !== p.lane) return no('invalid_tile');
      if (zone === -1) {
        if (!coop) return no('invalid_tile');
        const mine = state.towers.filter((t) => t.zone === -1 && t.owner === p.id).length;
        if (mine >= rules.coop.centerTowersPerPlayer) return no('center_full');
      }
      if (state.towers.some((t) => t.x === intent.x && t.y === intent.y)) return no('tile_taken');
      const bp = p.blueprints[bi]!;
      p.blueprints.splice(bi, 1);
      const def = towerDef(bp.tower);
      const id = nextId(state);
      state.towers.push({
        id,
        owner: p.id,
        def: bp.tower,
        x: intent.x,
        y: intent.y,
        zone,
        level: 1,
        category: bp.category,
        power: bp.power,
        suit: bp.suit,
        pure: bp.pure,
        value: bp.value,
        invested: bp.value,
        placedTick: state.tick,
        targeting: def.defaultTargeting ?? 'first',
        cooldown: 0,
        beamTarget: 0,
        beamTicks: 0,
        copyOf: null,
        dmg: 0,
        range: 0,
        minRange: 0,
        period: 0,
        hitsAir: def.hitsAir,
        pierce: 0,
        crit: 0,
        greed: 0,
        slow: 0,
        aura: 0,
        damageDealt: 0,
        kills: 0,
      });
      p.stats.towersPlaced++;
      recomputeTowers(state);
      state.events.push({ kind: 'placed', tower: id, player: p.id });
      return OK;
    }

    case 'scrap': {
      const bi = p.blueprints.findIndex((b) => b.id === intent.blueprint);
      if (bi < 0) return no('not_found');
      const refund = Math.floor(p.blueprints[bi]!.value * rules.towers.scrapRefund);
      p.blueprints.splice(bi, 1);
      p.gold += refund;
      return OK;
    }

    case 'upgrade': {
      const t = ownTower(state, p, intent.tower);
      if (!t) return no('not_found');
      if (t.level >= rules.towers.maxLevel) return no('max_level');
      const cost = upgradeCost(t);
      if (p.gold < cost) return no('not_enough_gold');
      p.gold -= cost;
      t.invested += cost;
      t.level++;
      recomputeTowers(state);
      state.events.push({ kind: 'upgraded', tower: t.id, level: t.level });
      return OK;
    }

    case 'sell': {
      const t = ownTower(state, p, intent.tower);
      if (!t) return no('not_found');
      const refund = sellValue(state, t);
      p.gold += refund;
      state.towers = state.towers.filter((x) => x !== t);
      recomputeTowers(state);
      state.events.push({ kind: 'sold', tower: t.id, player: p.id, refund });
      return OK;
    }

    case 'target': {
      const t = ownTower(state, p, intent.tower);
      if (!t) return no('not_found');
      if (!rules.towers.targeting.includes(intent.mode)) return no('invalid_action');
      t.targeting = intent.mode;
      state.towersVersion++;
      return OK;
    }

    case 'research': {
      const suit = intent.suit;
      if (![0, 1, 2, 3].includes(suit)) return no('invalid_action');
      if (p.researching) return no('busy');
      const level = p.research[suit];
      if (level >= rules.research.costs.length) return no('max_level');
      const cost = rules.research.costs[level]!;
      if (p.gold < cost) return no('not_enough_gold');
      p.gold -= cost;
      p.researching = { suit, doneAt: state.tick + secondsToTicks(rules.research.seconds) };
      return OK;
    }

    case 'shopBuy':
      return shopBuy(state, p, intent);

    case 'slip': {
      if (!coop) return no('wrong_mode');
      if (!p.hand) return no('no_hand');
      const to = state.players[intent.to];
      if (!to || to.id === p.id || to.busted) return no('not_found');
      if (p.slipWave === state.wave.n) return no('busy');
      if (to.slipIncoming !== null) return no('busy');
      if (intent.card < 0 || intent.card >= p.hand.cards.length) return no('invalid_action');
      const cards = [...p.hand.cards];
      const [card] = cards.splice(intent.card, 1, ...draw(state, p, 1));
      p.hand = { ...p.hand, cards };
      to.slipIncoming = card!;
      p.slipWave = state.wave.n;
      state.events.push({ kind: 'slip', from: p.id, to: to.id });
      return OK;
    }

    case 'pot': {
      if (!coop) return no('wrong_mode');
      const amount = Math.floor(intent.amount);
      if (amount <= 0) return no('invalid_action');
      if (p.gold < amount) return no('not_enough_gold');
      p.gold -= amount;
      state.pot.gold += amount;
      while (state.pot.gold >= state.pot.target) {
        state.pot.gold -= state.pot.target;
        for (const q of playersInOrder(state)) if (!q.busted) q.riverCards++;
        state.events.push({ kind: 'potFilled', gold: state.pot.target });
      }
      return OK;
    }

    case 'raise': {
      if (coop) return no('wrong_mode');
      const send = sendDef(intent.send);
      const count = Math.floor(intent.count);
      if (!send || count < 1 || count > 20) return no('invalid_action');
      const wave = Math.max(1, state.wave.n);
      if (wave < send.unlockWave) return no('locked');
      if (send.cooldownWaves) {
        if (count > 1 || p.lastAllInWave + send.cooldownWaves > wave) return no('busy');
      }
      const cost = send.cost * count;
      if (p.gold < cost) return no('not_enough_gold');
      const target = nextOpponent(state, p.id);
      if (!target) return no('not_found');
      p.gold -= cost;
      p.income += send.income * count;
      p.stats.raiseGold += cost;
      if (send.cooldownWaves) p.lastAllInWave = wave;
      const existing = p.raises.find((r) => r.send === send.id && r.target === target.id);
      if (existing) existing.count += count;
      else p.raises.push({ send: send.id, count, target: target.id });
      state.events.push({ kind: 'raise', from: p.id, target: target.id, gold: cost });
      return OK;
    }

    case 'pauseVote': {
      if (!coop) return no('wrong_mode');
      const votes = state.pause.votes;
      const i = votes.indexOf(p.id);
      if (i >= 0) votes.splice(i, 1);
      else votes.push(p.id);
      const shouldPause = votes.length * 2 > state.order.length && state.pause.budget > 0;
      if (shouldPause !== state.pause.paused) {
        state.pause.paused = shouldPause;
        state.events.push({ kind: 'paused', paused: shouldPause });
      }
      return OK;
    }

    case 'callWave': {
      if (state.order.length !== 1) return no('wrong_mode');
      if (state.wave.spawns.length > 0 || state.wave.final) return no('busy');
      const skipped = Math.max(0, state.wave.nextAt - state.tick);
      p.gold += Math.floor(skipped / secondsToTicks(2));
      state.wave.nextAt = state.tick;
      return OK;
    }
  }
}

export function upgradeCost(t: Tower): number {
  return Math.round(data.rules.towers.upgradeCostFactor * t.value);
}

export function sellValue(state: MatchState, t: Tower): number {
  const grace = secondsToTicks(data.rules.towers.sellGraceSeconds);
  return state.tick - t.placedTick <= grace
    ? t.invested
    : Math.floor(t.invested * data.rules.towers.sellRefund);
}

function shopBuy(
  state: MatchState,
  p: PlayerState,
  intent: { item: string; card?: Card; arg?: number },
): IntentResult {
  const rules = data.rules;
  if (state.tick >= state.shop.openUntil || !p.shopOffers) return no('shop_closed');
  if (!p.shopOffers.includes(intent.item) || p.shopBought.includes(intent.item)) {
    return no('invalid_action');
  }
  const item = rules.shop.items.find((i) => i.id === intent.item)!;
  if (p.gold < item.cost) return no('not_enough_gold');

  const card = intent.card;
  const needsCard = ['burn', 'mark', 'paint', 'promote'].includes(item.id);
  if (needsCard) {
    if (card === undefined || !Number.isInteger(card) || card < 0 || card >= 52) {
      return no('invalid_action');
    }
    if (![...p.deck.draw, ...p.deck.discard].includes(card)) return no('not_found');
  }

  switch (item.id) {
    case 'burn':
      if (deckSize(p) <= rules.cards.minDeckSize) return no('deck_too_small');
      takeFromDeck(p, card!);
      break;
    case 'mark':
      p.deck.discard.push(card!);
      break;
    case 'paint': {
      const suit = intent.arg;
      if (suit === undefined || ![0, 1, 2, 3].includes(suit) || suitOf(card!) === suit) {
        return no('invalid_action');
      }
      takeFromDeck(p, card!);
      p.deck.discard.push(makeCard(rankOf(card!), suit as Suit));
      break;
    }
    case 'promote':
      if (isJoker(card!) || rankOf(card!) >= 14) return no('max_level');
      takeFromDeck(p, card!);
      p.deck.discard.push(makeCard(rankOf(card!) + 1, suitOf(card!)));
      break;
    case 'joker':
      if (countJokers(p) >= rules.cards.maxJokers) return no('max_level');
      p.deck.discard.push(JOKER);
      break;
    case 'extra_redraw':
      p.freeRedraws++;
      break;
    case 'bench_slot':
      if (p.benchSlots >= rules.cards.maxBenchSlots) return no('max_level');
      p.benchSlots++;
      break;
    default:
      return no('invalid_action');
  }
  p.gold -= item.cost;
  p.shopBought.push(item.id);
  return OK;
}
