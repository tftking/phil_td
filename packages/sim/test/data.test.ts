import { describe, expect, it } from 'vitest';
import {
  GAME_DATA,
  HandCategory,
  buildLayout,
  creepHp,
  enemyDef,
  interest,
  applyArmor,
  mapDef,
  pointAtDistance,
  towerForHand,
  validateGameData,
  waveBonus,
  killBounty,
} from '../src/index';

const standard = GAME_DATA.rules.difficulties.find((d) => d.id === 'standard')!;

describe('game data', () => {
  it('is valid', () => {
    expect(validateGameData(GAME_DATA)).toEqual([]);
  });

  it('maps every hand to a tower', () => {
    expect(towerForHand(HandCategory.Pair).id).toBe('twin');
    expect(towerForHand(HandCategory.RoyalFlush).id).toBe('crown');
    expect(towerForHand(HandCategory.FiveOfAKind).id).toBe('jester');
  });

  it('has a 40-wave schedule with bosses every 10 waves', () => {
    const s = GAME_DATA.waves.schedule;
    expect(s).toHaveLength(40);
    for (const w of [10, 20, 30, 40]) expect(s[w - 1]!.tags).toContain('boss');
    for (const w of [7, 17, 27, 37]) expect(s[w - 1]!.tags).toContain('air');
  });

  it('catches broken data', () => {
    const broken = structuredClone(GAME_DATA);
    broken.waves.schedule[0]!.mix = { dragon: 1 };
    broken.towers.pop();
    const errors = validateGameData(broken);
    expect(errors.some((e) => e.includes('dragon'))).toBe(true);
    expect(errors.some((e) => e.includes('hand category 10'))).toBe(true);
  });
});

describe('formulas', () => {
  it('follows the documented HP curve', () => {
    const grunt = enemyDef('grunt');
    expect(creepHp(GAME_DATA, 1, grunt, standard)).toBe(60);
    expect(creepHp(GAME_DATA, 10, grunt, standard)).toBeCloseTo(180, -1);
    expect(creepHp(GAME_DATA, 20, grunt, standard)).toBeCloseTo(610, -1);
  });

  it('computes economy values', () => {
    expect(waveBonus(GAME_DATA, 1)).toBe(25);
    expect(interest(GAME_DATA, 100)).toBe(4);
    expect(interest(GAME_DATA, 10_000)).toBe(30);
    expect(killBounty(GAME_DATA, 9, standard)).toBe(5);
  });

  it('applies armor with a damage floor', () => {
    expect(applyArmor(GAME_DATA, 20, 5)).toBe(15);
    expect(applyArmor(GAME_DATA, 10, 100)).toBe(2);
    expect(applyArmor(GAME_DATA, 20, 5, 3)).toBe(18);
  });
});

describe('map layouts', () => {
  it('builds every map for every supported player count', () => {
    for (const map of GAME_DATA.maps) {
      for (let n = map.players[0]; n <= map.players[1]; n++) {
        const layout = buildLayout(map, n);
        expect(layout.lanes).toHaveLength(n);
      }
    }
  });

  it('lays out a 1-player felt with a center road to the vault', () => {
    const layout = buildLayout(mapDef('felt'), 1);
    const lane = layout.lanes[0]!;
    expect(lane.ground.length).toBe(11 + 3 + 9 + 3 + 11);
    expect(lane.buildTiles).toHaveLength(32);
    expect(pointAtDistance(lane.ground, 0)).toEqual([0, 1]);
    expect(pointAtDistance(lane.ground, 5)).toEqual([5, 1]);
    expect(pointAtDistance(lane.ground, 12.5)).toEqual([11, 2.5]);
    // Center path starts at the lane exit and ends at the vault.
    expect(lane.center!.points[0]).toEqual([13, 7]);
    expect(lane.center!.points.at(-1)).toEqual(layout.center!.vault);
    for (const [x, y] of lane.buildTiles) expect(layout.roadTiles.has(`${x},${y}`)).toBe(false);
  });

  it('mirrors right-hand co-op lanes toward the center', () => {
    const layout = buildLayout(mapDef('felt'), 2);
    const right = layout.lanes[1]!;
    expect(right.mirrored).toBe(true);
    const exit = right.ground.points.at(-1)!;
    expect(exit[0]).toBe(layout.center!.rect[0] + layout.center!.rect[2]);
    expect(right.center!.points[1]![0]).toBe(layout.center!.boss.points[0]![0]);
  });

  it('gives each showdown lane its own vault', () => {
    const layout = buildLayout(mapDef('vegas'), 4);
    expect(layout.center).toBeNull();
    for (const lane of layout.lanes) expect(lane.vault).toEqual(lane.ground.points.at(-1));
  });

  it('rejects bad templates and player counts', () => {
    const bad = structuredClone(mapDef('felt'));
    bad.id = 'bad';
    bad.lane.buildAreas.push([0, 1, 1, 1]);
    expect(() => buildLayout(bad, 1)).toThrow(/on the path/);
    expect(() => buildLayout(mapDef('backroom'), 5)).toThrow(/1-3 players/);
  });
});
