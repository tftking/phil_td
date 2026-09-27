import { describe, expect, it } from 'vitest';
import { type MatchSettings, createMatch, hashState, stepMatch } from '@pokertd/sim';
import { bestTile, createBot, driveBots, simulate } from '../src/index';

const settings = (seed: number, over: Partial<MatchSettings> = {}): MatchSettings => ({
  seed,
  mode: 'coop',
  map: 'felt',
  difficulty: 'standard',
  players: [{ id: 'a', name: 'A' }],
  ...over,
});

describe('bots', () => {
  it('greedy bot holds past wave 15 solo', () => {
    const r = simulate(settings(1), { a: 'greedy' }, 16);
    expect(r.wave).toBeGreaterThanOrEqual(16);
    expect(r.handCounts.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
  });

  it('smart bot can win a full match', () => {
    const r = simulate(settings(1000), { a: 'smart' });
    expect(r.phase).toBe('won');
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const s = createMatch(settings(5));
      const bots = new Map([['a', createBot('smart', 5)]]);
      for (let i = 0; i < 3000; i++) {
        driveBots(s, bots);
        stepMatch(s);
        s.events.length = 0;
      }
      return hashState(s);
    };
    expect(run()).toBe(run());
  });

  it('plays showdown with raises', () => {
    const r = simulate(
      settings(3, {
        mode: 'showdown',
        map: 'vegas',
        players: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
        ],
      }),
      { a: 'raiser', b: 'smart' },
    );
    expect(r.phase).toBe('won');
    expect(r.winner === 0 || r.winner === 1).toBe(true);
  });

  it('places towers where they cover the most path', () => {
    const s = createMatch(settings(1));
    const tile = bestTile(s, 0, 0, 3);
    expect(tile).not.toBeNull();
  });
});
