import { describe, expect, it } from 'vitest';
import {
  GAME_DATA,
  HandCategory,
  buildMapGeometry,
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

describe('map geometry', () => {
  const geo = buildMapGeometry(mapDef('felt'));

  it('builds paths with lengths', () => {
    const ground = geo.paths.get('ground')!;
    expect(ground.length).toBe(12 + 3 + 9 + 3 + 12);
    expect(pointAtDistance(ground, 0)).toEqual([0, 1]);
    expect(pointAtDistance(ground, 6)).toEqual([6, 1]);
    expect(pointAtDistance(ground, 13.5)).toEqual([12, 2.5]);
    expect(pointAtDistance(ground, 999)).toEqual([15, 7]);
  });

  it('keeps build tiles off the path', () => {
    expect(geo.buildTiles.length).toBe(32);
    for (const [x, y] of geo.buildTiles) expect(geo.pathTiles.has(`${x},${y}`)).toBe(false);
  });

  it('rejects build tiles on the path', () => {
    const bad = structuredClone(mapDef('felt'));
    bad.buildAreas.push([0, 1, 1, 1]);
    expect(() => buildMapGeometry(bad)).toThrow(/on the path/);
  });
});
