import {
  type Card,
  type Intent,
  type MatchState,
  type PlayerId,
  type PlayerState,
  GAME_DATA,
  HandCategory,
  Rng,
  evaluatePlayerHand,
  isJoker,
  rankOf,
  redrawCost,
  redrawOdds,
  suitOf,
  towerDef,
  sendDef,
  contextOf,
} from '@pokertd/sim';
import { bestTile } from './placement';

export type BotStyle = 'greedy' | 'smart' | 'raiser';
export const BOT_STYLES: BotStyle[] = ['greedy', 'smart', 'raiser'];

/** Rough worth of the tower each hand category gives, in reference DPS. */
const HAND_VALUE: number[] = [10, 24, 31, 45, 70, 60, 100, 180, 300, 500, 400];

export interface Bot {
  style: BotStyle;
  /** Intents to try this tick. The caller applies them in order. */
  think(state: MatchState, id: PlayerId): Intent[];
}

/**
 * Bots only use information a human in that seat has: their own hand and
 * the deck's contents (via the deck tracker), never the draw order.
 */
export function createBot(style: BotStyle, seed = 1): Bot {
  const rng = new Rng(Rng.streamState(seed, 'bot', style));
  let nextThink = 0;
  return {
    style,
    think(state, id) {
      if (state.tick < nextThink) return [];
      // Human-ish reaction time: act every 0.4–0.8 s.
      nextThink = state.tick + 8 + rng.int(9);
      const p = state.players[id];
      if (!p || p.busted) return [];
      return style === 'greedy' ? greedy(state, p) : smart(state, p, rng, style === 'raiser');
    },
  };
}

function placeIntents(state: MatchState, p: PlayerState, allowCenter: boolean): Intent[] {
  const out: Intent[] = [];
  for (const bp of p.blueprints) {
    const def = towerDef(bp.tower === 'jester' ? 'sentry' : bp.tower);
    let tile = bestTile(state, p.lane, p.lane, def.range, def.minRange ?? 0);
    if (!tile && allowCenter && state.settings.mode === 'coop') {
      const mine = state.towers.filter((t) => t.owner === p.id && t.zone === -1).length;
      if (mine < GAME_DATA.rules.coop.centerTowersPerPlayer) {
        tile = bestTile(state, p.lane, -1, def.range, def.minRange ?? 0);
      }
    }
    if (tile) out.push({ t: 'place', blueprint: bp.id, x: tile[0], y: tile[1] });
    else out.push(...makeRoom(state, p, bp.category));
  }
  return out;
}

/** Lane full: sell the weakest tower if the new one is better, else scrap the blueprint. */
function makeRoom(state: MatchState, p: PlayerState, category: number): Intent[] {
  const mine = state.towers.filter((t) => t.owner === p.id && t.zone === p.lane);
  if (mine.length === 0) return [];
  const worth = (cat: number, power: number, level: number) =>
    HAND_VALUE[cat]! * power * (1 + 0.35 * (level - 1));
  const worst = mine.reduce((a, b) =>
    worth(a.category, a.power, a.level) <= worth(b.category, b.power, b.level) ? a : b,
  );
  const bp = p.blueprints.find((b) => b.category === category);
  // Replace when the new tower, even before upgrades, is clearly better.
  if (bp && worth(category, bp.power, 1) > worth(worst.category, worst.power, worst.level) * 1.2) {
    return [{ t: 'sell', tower: worst.id }];
  }
  return bp ? [{ t: 'scrap', blueprint: bp.id }] : [];
}

/** The M1 baseline: deal whenever possible, lock anything that's a pair or better. */
function greedy(state: MatchState, p: PlayerState): Intent[] {
  const out: Intent[] = placeIntents(state, p, true);
  if (p.hand) {
    const ev = evaluatePlayerHand(p.hand.cards);
    if (ev.category >= HandCategory.Pair || redrawCost(p) > 0) return [...out, { t: 'lock' }];
    const keep = new Set(ev.scoring.map((i) => ev.used[i]!));
    const idx = p.hand.cards.map((_, i) => i).filter((i) => !keep.has(i));
    return [...out, { t: 'redraw', idx }, { t: 'lock' }];
  }
  if (p.gold >= GAME_DATA.rules.cards.dealCost) out.push({ t: 'deal' });
  return out;
}

/** Candidate cards to keep: made hand, four-flush, four-straight. */
function holdCandidates(cards: Card[]): number[][] {
  const out: number[][] = [];
  const ev = evaluatePlayerHand(cards);
  out.push(ev.scoring.map((i) => ev.used[i]!));

  const bySuit = new Map<number, number[]>();
  cards.forEach((c, i) => {
    if (isJoker(c)) return;
    const list = bySuit.get(suitOf(c)) ?? [];
    list.push(i);
    bySuit.set(suitOf(c), list);
  });
  for (const idx of bySuit.values()) if (idx.length >= 3) out.push(idx);

  const byRank = cards.map((c, i) => ({ r: isJoker(c) ? 0 : rankOf(c), i })).filter((x) => x.r > 0);
  for (let lo = 1; lo <= 10; lo++) {
    const window = byRank.filter(({ r }) => (r === 14 && lo === 1) || (r >= lo && r <= lo + 4));
    const distinct = new Map<number, number>();
    for (const { r, i } of window) if (!distinct.has(r)) distinct.set(r, i);
    if (distinct.size >= 4) out.push([...distinct.values()]);
  }
  // Always consider keeping jokers.
  const jokers = cards.map((c, i) => (isJoker(c) ? i : -1)).filter((i) => i >= 0);
  return out.map((h) => [...new Set([...h, ...jokers])]);
}

function expectedValue(p: PlayerState, keep: number[], rng: Rng): number {
  const cards = p.hand!.cards;
  const redraw = cards.map((_, i) => i).filter((i) => !keep.includes(i));
  if (redraw.length === 0) return HAND_VALUE[evaluatePlayerHand(cards).category]!;
  const pool =
    p.deck.draw.length >= redraw.length ? p.deck.draw : [...p.deck.draw, ...p.deck.discard];
  if (cards.length !== 5) return HAND_VALUE[evaluatePlayerHand(cards).category]!;
  const odds = redrawOdds(cards, redraw, pool, rng, 300, 1200);
  return odds.byCategory.reduce((s, prob, cat) => s + prob * HAND_VALUE[cat]!, 0);
}

function smart(state: MatchState, p: PlayerState, rng: Rng, raiser: boolean): Intent[] {
  const rules = GAME_DATA.rules;
  const out: Intent[] = placeIntents(state, p, true);

  if (p.hand) {
    const ev = evaluatePlayerHand(p.hand.cards);
    const now = HAND_VALUE[ev.category]!;
    const cost = redrawCost(p);
    if (p.hand.cards.length === 5 && p.gold >= cost && p.hand.redrawsUsed < 3) {
      let best: number[] | null = null;
      let bestGain = 0;
      for (const keep of holdCandidates(p.hand.cards)) {
        if (keep.length === 5) continue;
        const gain = expectedValue(p, keep, rng) - now;
        if (gain > bestGain) {
          bestGain = gain;
          best = keep;
        }
      }
      // A redraw is worth it if the expected gain beats its gold cost (~1 DPS per 2 gold).
      if (best && bestGain > cost / 2 + 2) {
        const idx = p.hand.cards.map((_, i) => i).filter((i) => !best!.includes(i));
        return [...out, { t: 'redraw', idx }];
      }
    }
    return [...out, { t: 'lock' }];
  }

  // Shop: deck quality and convenience first.
  if (p.shopOffers && state.tick < state.shop.openUntil) {
    for (const item of p.shopOffers) {
      if (p.shopBought.includes(item)) continue;
      const cost = rules.shop.items.find((i) => i.id === item)!.cost;
      if (p.gold < cost + rules.cards.dealCost) continue;
      if (item === 'extra_redraw' || item === 'joker' || item === 'bench_slot')
        out.push({ t: 'shopBuy', item });
      if (item === 'burn') {
        const low = [...p.deck.draw, ...p.deck.discard]
          .filter((c) => !isJoker(c))
          .sort((a, b) => rankOf(a) - rankOf(b))[0];
        if (low !== undefined) out.push({ t: 'shopBuy', item, card: low });
      }
    }
  }

  // Showdown raises: invest ~30% of gold in the best-value unlocked send.
  if (raiser && state.settings.mode === 'showdown' && state.wave.n >= 1) {
    const budget = Math.floor(p.gold * 0.3);
    const sends = GAME_DATA.sends
      .filter((s) => s.unlockWave <= state.wave.n && !s.cooldownWaves && s.cost <= budget)
      .sort((a, b) => b.income / b.cost - a.income / a.cost || b.cost - a.cost);
    const send = sends[0];
    if (send && state.tick % 200 < 20)
      out.push({ t: 'raise', send: send.id, count: Math.max(1, Math.floor(budget / send.cost)) });
    const allIn = sendDef('all_in');
    if (allIn && state.wave.n >= allIn.unlockWave && p.gold > allIn.cost * 2)
      out.push({ t: 'raise', send: 'all_in', count: 1 });
  }

  // Spending plan. Early: deal for towers. Once the lane fills up, gold goes to
  // research and upgrades, and deals only chase replacements.
  const mine = state.towers.filter((t) => t.owner === p.id);
  const laneFull = !bestTile(state, p.lane, p.lane, 3);
  let reserve = 0;

  const lane = contextOf(state).layout.lanes[p.lane]!.buildTiles.length;
  const filling = mine.length < lane * 0.75;
  if (!p.researching && !filling) {
    const weight = [0, 0, 0, 0];
    for (const t of mine) weight[t.suit]! += t.dmg / Math.max(1, t.period);
    const order = [0, 1, 2, 3].sort((a, b) => weight[b]! - weight[a]!) as (0 | 1 | 2 | 3)[];
    // Main suit first; the second suit once the main one is well along.
    const suit = order.find((s, k) => p.research[s] < 5 && (k === 0 || p.research[order[0]!] >= 3));
    if (suit !== undefined) {
      const cost = rules.research.costs[p.research[suit]]!;
      if (p.gold >= cost) out.push({ t: 'research', suit });
      else reserve = Math.min(cost, 300);
    }
  }

  if (laneFull || !filling) {
    const target = mine
      .filter((t) => t.level < rules.towers.maxLevel)
      .sort((a, b) => HAND_VALUE[b.category]! * b.power - HAND_VALUE[a.category]! * a.power)[0];
    if (target) {
      const cost = Math.round(rules.towers.upgradeCostFactor * target.value);
      if (p.gold >= cost + reserve) out.push({ t: 'upgrade', tower: target.id });
      else if (laneFull) reserve = Math.max(reserve, cost);
    }
  }

  // Co-op Pot: chip in spare gold.
  if (state.settings.mode === 'coop' && state.order.length > 1 && p.gold > 600 + reserve) {
    out.push({ t: 'pot', amount: 100 });
  }

  if (p.gold >= rules.cards.dealCost + reserve) out.push({ t: 'deal' });
  return out;
}
