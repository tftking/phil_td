import { describe, expect, it } from 'vitest';
import {
  type Intent,
  type MatchSettings,
  type MatchState,
  JOKER,
  STANDARD_WAVES,
  Suit,
  applyIntent,
  buildSnapshot,
  contextOf,
  createMatch,
  hashState,
  parseCards,
  runTicks,
  secondsToTicks,
  stepMatch,
  towerForHand,
  unpackCreeps,
  HandCategory,
} from '../src/index';

const solo = (over: Partial<MatchSettings> = {}): MatchState =>
  createMatch({
    seed: 42,
    mode: 'coop',
    map: 'felt',
    difficulty: 'standard',
    players: [{ id: 'a', name: 'Alex' }],
    ...over,
  });

const ok = (state: MatchState, id: string, intent: Intent) => {
  const r = applyIntent(state, id, intent);
  expect(r, JSON.stringify(intent)).toEqual({ ok: true });
};

/** Puts a ready-made blueprint on a player's bench (bypasses the cards). */
function giveBlueprint(
  state: MatchState,
  id: string,
  category: HandCategory,
  power = 1.3,
  suit: Suit = 0,
) {
  const p = state.players[id]!;
  const bp = {
    id: state.nextId++,
    tower: towerForHand(category).id,
    category,
    power,
    suit,
    pure: false,
    value: 50,
    cards: [],
  };
  p.blueprints.push(bp);
  return bp.id;
}

function placeAt(
  state: MatchState,
  id: string,
  category: HandCategory,
  x: number,
  y: number,
  suit: Suit = 0,
) {
  const bp = giveBlueprint(state, id, category, 1.3, suit);
  ok(state, id, { t: 'place', blueprint: bp, x, y });
  return state.towers.at(-1)!;
}

/** Steps until wave `n` starts. Lives are topped up so an empty board can't lose first. */
const untilWave = (state: MatchState, n: number) => {
  for (let i = 0; state.wave.n < n; i++) {
    if (i > secondsToTicks(60 * 60)) throw new Error('wave never started');
    state.lives = Math.max(state.lives, 100);
    for (const p of Object.values(state.players)) {
      if (state.settings.mode === 'showdown') p.lives = Math.max(p.lives, 100);
    }
    stepMatch(state);
  }
};

describe('match setup', () => {
  it('starts in countdown with starting gold and lives', () => {
    const s = solo();
    expect(s.phase).toBe('countdown');
    expect(s.players.a!.gold).toBe(150);
    expect(s.lives).toBe(25); // 15 + 10 per player
    expect(s.players.a!.deck.draw).toHaveLength(52);
  });

  it('is deterministic for a seed', () => {
    expect(hashState(solo())).toBe(hashState(solo()));
    expect(hashState(solo())).not.toBe(hashState(solo({ seed: 43 })));
  });

  it('rejects mismatched maps and player counts', () => {
    expect(() =>
      solo({
        map: 'vegas',
        players: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      }),
    ).toThrow(/showdown map/);
    expect(() =>
      solo({ map: 'backroom', players: 'abcd'.split('').map((id) => ({ id, name: id })) }),
    ).toThrow(/1-3 players/);
  });
});

describe('hand flow', () => {
  it('deals, redraws, locks and places a tower', () => {
    const s = solo();
    ok(s, 'a', { t: 'deal' });
    expect(s.players.a!.gold).toBe(100);
    expect(s.players.a!.hand!.cards).toHaveLength(5);

    ok(s, 'a', { t: 'redraw', idx: [0] });
    expect(s.players.a!.gold).toBe(100); // first redraw is free
    ok(s, 'a', { t: 'redraw', idx: [1] });
    expect(s.players.a!.gold).toBe(80); // then 20g
    expect(applyIntent(s, 'a', { t: 'deal' })).toEqual({ ok: false, reason: 'has_hand' });

    ok(s, 'a', { t: 'lock' });
    const bp = s.players.a!.blueprints[0]!;
    expect(bp.value).toBe(70);
    expect(s.players.a!.stats.handsPlayed).toBe(1);

    const [x, y] = contextOf(s).layout.lanes[0]!.buildTiles[0]!;
    ok(s, 'a', { t: 'place', blueprint: bp.id, x, y });
    expect(s.towers).toHaveLength(1);
    expect(s.towers[0]!.dmg).toBeGreaterThan(0);
    expect(applyIntent(s, 'a', { t: 'place', blueprint: bp.id, x, y })).toMatchObject({
      ok: false,
    });
  });

  it('keeps every card accounted for', () => {
    const s = solo();
    const p = s.players.a!;
    p.gold = 10_000;
    for (let i = 0; i < 30; i++) {
      ok(s, 'a', { t: 'deal' });
      ok(s, 'a', { t: 'redraw', idx: [0, 2, 4] });
      ok(s, 'a', { t: i % 2 ? 'lock' : 'fold' });
      p.blueprints = [];
    }
    const all = [...p.deck.draw, ...p.deck.discard].sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 52 }, (_, i) => i));
  });

  it('blocks dealing when the bench is full', () => {
    const s = solo();
    for (let i = 0; i < 3; i++) giveBlueprint(s, 'a', HandCategory.Pair);
    expect(applyIntent(s, 'a', { t: 'deal' })).toEqual({ ok: false, reason: 'bench_full' });
  });

  it('rejects placement off your lane or on a road', () => {
    const s = solo();
    const bp = giveBlueprint(s, 'a', HandCategory.Pair);
    expect(applyIntent(s, 'a', { t: 'place', blueprint: bp, x: 0, y: 1 })).toEqual({
      ok: false,
      reason: 'invalid_tile',
    });
  });

  it('limits Center Table towers per player', () => {
    const s = solo();
    const center = contextOf(s).layout.center!.buildTiles;
    for (let i = 0; i < 3; i++) placeAt(s, 'a', HandCategory.Pair, center[i]![0], center[i]![1]);
    const bp = giveBlueprint(s, 'a', HandCategory.Pair);
    expect(
      applyIntent(s, 'a', { t: 'place', blueprint: bp, x: center[3]![0], y: center[3]![1] }),
    ).toEqual({
      ok: false,
      reason: 'center_full',
    });
  });

  it('upgrades and sells with the documented costs', () => {
    const s = solo();
    const [x, y] = contextOf(s).layout.lanes[0]!.buildTiles[0]!;
    const t = placeAt(s, 'a', HandCategory.Pair, x, y);
    const baseDmg = t.dmg;
    s.players.a!.gold = 1000;
    ok(s, 'a', { t: 'upgrade', tower: t.id });
    expect(s.players.a!.gold).toBe(970);
    expect(t.dmg).toBeCloseTo(baseDmg * 1.35);
    // Within the grace period: full refund.
    ok(s, 'a', { t: 'sell', tower: t.id });
    expect(s.players.a!.gold).toBe(1050);
  });
});

describe('waves and combat', () => {
  it('pays the wave bonus and spawns creeps in the lane', () => {
    const s = solo();
    untilWave(s, 1);
    expect(s.phase).toBe('playing');
    expect(s.players.a!.gold).toBe(150 + 25 + 6);
    runTicks(s, secondsToTicks(5));
    expect(s.creeps.length).toBeGreaterThan(0);
    expect(s.creeps.every((c) => c.path === 'L0g')).toBe(true);
  });

  it('kills creeps and pays bounties', () => {
    const s = solo();
    const tiles = contextOf(s).layout.lanes[0]!.buildTiles;
    for (let i = 0; i < 6; i++)
      placeAt(s, 'a', HandCategory.TwoPair, tiles[i * 4]![0], tiles[i * 4]![1]);
    untilWave(s, 1);
    const gold = s.players.a!.gold;
    const lives = s.lives;
    runTicks(s, secondsToTicks(38));
    expect(s.players.a!.stats.kills).toBeGreaterThan(10);
    expect(s.players.a!.gold).toBeGreaterThan(gold);
    expect(s.lives).toBe(lives);
  });

  it('sends lane leaks through the Center Table before costing lives', () => {
    const s = solo();
    untilWave(s, 1);
    const lives = s.lives;
    let sawCenter = false;
    for (let i = 0; i < secondsToTicks(60) && s.lives === lives; i++) {
      stepMatch(s);
      if (s.creeps.some((c) => c.zone === -1 && c.path === 'C0')) sawCenter = true;
    }
    expect(sawCenter).toBe(true);
    expect(s.lives).toBeLessThan(lives);
    expect(s.players.a!.stats.leaks).toBeGreaterThan(0);
  });

  it('loses when lives run out', () => {
    const s = solo();
    s.lives = 1;
    runTicks(s, secondsToTicks(120));
    expect(s.phase).toBe('lost');
    expect(s.events.some((e) => e.kind === 'gameOver')).toBe(true);
  });

  it('wins after clearing the final wave', () => {
    const s = solo();
    s.wave.n = STANDARD_WAVES - 1;
    s.wave.nextAt = s.tick;
    stepMatch(s);
    expect(s.wave.final).toBe(true);
    // Wipe everything as it spawns.
    for (let i = 0; i < secondsToTicks(40) && s.phase === 'playing'; i++) {
      stepMatch(s);
      for (const c of s.creeps) c.hp = 0;
    }
    expect(s.phase).toBe('won');
  });

  it('splits Splitters into Swarm on death', () => {
    const s = solo();
    s.wave.n = 22; // splitter wave pattern
    s.wave.nextAt = s.tick;
    stepMatch(s);
    for (let i = 0; i < 1000 && !s.creeps.some((c) => c.type === 'splitter'); i++) stepMatch(s);
    const splitter = s.creeps.find((c) => c.type === 'splitter')!;
    splitter.hp = 0;
    stepMatch(s);
    expect(s.creeps.filter((c) => c.type === 'swarm').length).toBeGreaterThanOrEqual(3);
  });

  it('only lets anti-air towers hit flyers', () => {
    const s = solo();
    const tiles = contextOf(s).layout.lanes[0]!.buildTiles;
    const mortar = placeAt(s, 'a', HandCategory.FullHouse, tiles[3]![0], tiles[3]![1]);
    s.wave.n = 6; // wave 7 is an air wave
    s.wave.nextAt = s.tick;
    runTicks(s, secondsToTicks(20));
    expect(mortar.damageDealt).toBe(0);
  });
});

describe('suits, research and special towers', () => {
  it('applies research to towers of that suit', () => {
    const s = solo();
    const [x, y] = contextOf(s).layout.lanes[0]!.buildTiles[0]!;
    const t = placeAt(s, 'a', HandCategory.Pair, x, y, Suit.Hearts);
    expect(t.crit).toBeCloseTo(0.1);
    s.players.a!.gold = 1000;
    ok(s, 'a', { t: 'research', suit: Suit.Hearts });
    expect(applyIntent(s, 'a', { t: 'research', suit: Suit.Clubs })).toEqual({
      ok: false,
      reason: 'busy',
    });
    runTicks(s, secondsToTicks(15) + 1);
    expect(s.players.a!.research[Suit.Hearts]).toBe(1);
    expect(t.crit).toBeCloseTo(0.14);
  });

  it('Crown aura boosts nearby towers, Jester copies its strongest neighbor', () => {
    const s = solo();
    const t = placeAt(s, 'a', HandCategory.Pair, 3, 2);
    const before = t.dmg;
    placeAt(s, 'a', HandCategory.RoyalFlush, 5, 2);
    expect(t.dmg).toBeCloseTo(before * 1.25);

    const jester = placeAt(s, 'a', HandCategory.FiveOfAKind, 6, 3);
    expect(jester.copyOf).toBe('crown');
    expect(jester.dmg).toBeGreaterThan(400);
  });

  it('Laser ramps up on one target', () => {
    const s = solo();
    const laser = placeAt(s, 'a', HandCategory.FourOfAKind, 3, 2);
    untilWave(s, 1);
    let first = -1;
    for (let i = 0; i < secondsToTicks(20); i++) {
      stepMatch(s);
      if (laser.damageDealt > 0 && first < 0) first = laser.damageDealt;
    }
    expect(laser.damageDealt).toBeGreaterThan(first * 20);
  });
});

describe('shop, pot and slip', () => {
  it('opens the shop on wave 6 and sells deck changes', () => {
    const s = solo();
    const p = s.players.a!;
    untilWave(s, 6);
    expect(p.shopOffers).toHaveLength(3);
    p.gold = 10_000;
    p.shopOffers = ['mark', 'joker', 'burn'];
    const card = p.deck.draw[0]!;
    ok(s, 'a', { t: 'shopBuy', item: 'mark', card });
    ok(s, 'a', { t: 'shopBuy', item: 'joker' });
    ok(s, 'a', { t: 'shopBuy', item: 'burn', card });
    expect(applyIntent(s, 'a', { t: 'shopBuy', item: 'mark', card })).toMatchObject({ ok: false });
    const all = [...p.deck.draw, ...p.deck.discard];
    expect(all.filter((c) => c === card)).toHaveLength(1);
    expect(all).toContain(JOKER);
    runTicks(s, secondsToTicks(21));
    expect(applyIntent(s, 'a', { t: 'shopBuy', item: 'burn', card })).toEqual({
      ok: false,
      reason: 'shop_closed',
    });
  });

  it('fills the Pot and gives everyone a River card', () => {
    const s = solo({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    s.players.a!.gold = 500;
    ok(s, 'a', { t: 'pot', amount: 300 });
    expect(s.players.b!.riverCards).toBe(1);
    ok(s, 'b', { t: 'deal' });
    expect(s.players.b!.hand!.cards).toHaveLength(6);
    ok(s, 'b', { t: 'lock' });
  });

  it('slips a card to a teammate for their next redraw', () => {
    const s = solo({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    ok(s, 'a', { t: 'deal' });
    const card = s.players.a!.hand!.cards[2]!;
    ok(s, 'a', { t: 'slip', card: 2, to: 'b' });
    expect(applyIntent(s, 'a', { t: 'slip', card: 1, to: 'b' })).toMatchObject({ ok: false });
    ok(s, 'b', { t: 'deal' });
    ok(s, 'b', { t: 'redraw', idx: [4] });
    expect(s.players.b!.hand!.cards[4]).toBe(card);
  });

  it('evaluates a River hand as the best five of six', () => {
    const s = solo();
    const p = s.players.a!;
    p.hand = { cards: parseCards('AH KH QH JH TH 2C'), redrawsUsed: 0, spent: 50 };
    ok(s, 'a', { t: 'lock' });
    expect(p.blueprints[0]!.tower).toBe('crown');
    expect(s.events.some((e) => e.kind === 'bigHand')).toBe(true);
  });
});

describe('showdown', () => {
  const duel = () =>
    createMatch({
      seed: 7,
      mode: 'showdown',
      map: 'vegas',
      difficulty: 'standard',
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });

  it('raises income and sends creeps into the opponent lane', () => {
    const s = duel();
    untilWave(s, 1);
    s.players.a!.gold = 500;
    ok(s, 'a', { t: 'raise', send: 'grunts', count: 2 });
    expect(s.players.a!.income).toBe(4);
    expect(applyIntent(s, 'a', { t: 'raise', send: 'brute', count: 1 })).toEqual({
      ok: false,
      reason: 'locked',
    });
    const snap = buildSnapshot(s, 'b');
    expect(snap.players!.find((p) => p.id === 'b')!.incoming).toBe(60);
    untilWave(s, 2);
    const sent = s.wave.spawns.filter((sp) => sp.sender === 'a');
    expect(sent).toHaveLength(6);
    expect(sent.every((sp) => sp.lane === 1)).toBe(true);
  });

  it('busts a player at zero lives and ends the match', () => {
    const s = duel();
    untilWave(s, 1);
    s.players.b!.lives = 1;
    runTicks(s, secondsToTicks(90));
    expect(s.players.b!.busted).toBe(true);
    expect(s.phase).toBe('won');
    expect(s.winner).toBe(s.players.a!.team);
  });

  it('rejects co-op tools', () => {
    const s = duel();
    expect(applyIntent(s, 'a', { t: 'pot', amount: 10 })).toEqual({
      ok: false,
      reason: 'wrong_mode',
    });
  });
});

describe('snapshots', () => {
  it('packs creeps and hides other players private state', () => {
    const s = solo({
      players: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    });
    ok(s, 'a', { t: 'deal' });
    untilWave(s, 1);
    runTicks(s, secondsToTicks(4));
    const snap = buildSnapshot(s, 'b');
    expect(snap.you!.hand).toBeNull();
    expect(snap.players!.find((p) => p.id === 'a')!.holdingHand).toBe(true);
    expect(JSON.stringify(snap)).not.toContain('"draw"');
    const creeps = unpackCreeps(snap.creeps, contextOf(s).pathKeys);
    expect(creeps).toHaveLength(s.creeps.length);
    expect(creeps[0]!.dist).toBeCloseTo(s.creeps[0]!.dist, 1);
    expect(buildSnapshot(s, 'b', s.towersVersion).towers).toBeUndefined();
  });
});

describe('determinism', () => {
  it('replays identically from seed and inputs', () => {
    const run = () => {
      const s = solo({
        players: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      });
      const tiles = contextOf(s).layout.lanes;
      for (let tick = 0; tick < secondsToTicks(150); tick++) {
        for (const id of ['a', 'b']) {
          const p = s.players[id]!;
          if (!p.hand && p.gold >= 50 && p.blueprints.length === 0)
            applyIntent(s, id, { t: 'deal' });
          else if (p.hand) applyIntent(s, id, { t: 'lock' });
          const bp = p.blueprints[0];
          if (bp) {
            const free = tiles[p.lane]!.buildTiles.find(
              ([x, y]) => !s.towers.some((t) => t.x === x && t.y === y),
            );
            if (free) applyIntent(s, id, { t: 'place', blueprint: bp.id, x: free[0], y: free[1] });
          }
        }
        stepMatch(s);
        s.events.length = 0;
      }
      return s;
    };
    const a = run();
    const b = run();
    expect(a.towers.length).toBeGreaterThan(3);
    expect(hashState(a)).toBe(hashState(b));
  });
});
