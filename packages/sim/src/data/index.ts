import towersJson from '../../data/towers.json';
import enemiesJson from '../../data/enemies.json';
import wavesJson from '../../data/waves.json';
import rulesJson from '../../data/rules.json';
import feltJson from '../../data/maps/felt.json';
import type { HandCategory } from '../cards/evaluate';
import type { EnemyDef, GameData, MapDef, TowerDef, WavesData, RulesData } from './types';
import { validateGameData } from './validate';

export * from './types';
export { validateGameData };

/**
 * All tuning data, loaded from packages/sim/data. JSON imports are only
 * loosely typed, so the casts are backed by validateGameData below.
 */
export const GAME_DATA: GameData = {
  towers: towersJson.towers as unknown as TowerDef[],
  enemies: enemiesJson.enemies as EnemyDef[],
  waves: wavesJson as unknown as WavesData,
  rules: rulesJson as unknown as RulesData,
  maps: [feltJson as unknown as MapDef],
};

const problems = validateGameData(GAME_DATA);
if (problems.length > 0) {
  throw new Error(`Invalid game data:\n  ${problems.join('\n  ')}`);
}

const towerByHand = new Map(GAME_DATA.towers.map((t) => [t.hand, t]));
const enemyById = new Map(GAME_DATA.enemies.map((e) => [e.id, e]));
const mapById = new Map(GAME_DATA.maps.map((m) => [m.id, m]));

export const towerForHand = (hand: HandCategory): TowerDef => towerByHand.get(hand)!;

export function enemyDef(id: string): EnemyDef {
  const e = enemyById.get(id);
  if (!e) throw new Error(`Unknown enemy ${id}`);
  return e;
}

export function mapDef(id: string): MapDef {
  const m = mapById.get(id);
  if (!m) throw new Error(`Unknown map ${id}`);
  return m;
}
