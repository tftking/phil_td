import { HandCategory } from '../cards/evaluate';
import { buildMapGeometry } from '../map/geometry';
import type { GameData } from './types';

/**
 * Cross-checks the data files. Returns a list of problems (empty = valid),
 * so tests and tools can show every issue at once.
 */
export function validateGameData(data: GameData): string[] {
  const errors: string[] = [];
  const err = (msg: string): void => {
    errors.push(msg);
  };

  const hands = new Set<number>();
  const towerIds = new Set<string>();
  for (const t of data.towers) {
    if (towerIds.has(t.id)) err(`tower ${t.id}: duplicate id`);
    towerIds.add(t.id);
    if (hands.has(t.hand)) err(`tower ${t.id}: hand ${t.hand} already mapped`);
    hands.add(t.hand);
    if (t.range < 0 || t.damage < 0 || t.attacksPerSecond < 0) err(`tower ${t.id}: negative stat`);
  }
  for (const h of Object.values(HandCategory)) {
    if (!hands.has(h)) err(`no tower for hand category ${h}`);
  }

  const enemyIds = new Set(data.enemies.map((e) => e.id));
  for (const e of data.enemies) {
    if (e.hp <= 0 || e.speed <= 0 || e.count <= 0) err(`enemy ${e.id}: hp/speed/count must be > 0`);
    if (e.splitInto && !enemyIds.has(e.splitInto.enemy)) {
      err(`enemy ${e.id}: splitInto unknown enemy ${e.splitInto.enemy}`);
    }
  }

  data.waves.schedule.forEach((w, i) => {
    if (w.wave !== i + 1) err(`wave schedule index ${i} has wave ${w.wave}`);
    const weights = Object.entries(w.mix);
    if (weights.length === 0) err(`wave ${w.wave}: empty mix`);
    for (const [id, weight] of weights) {
      if (!enemyIds.has(id)) err(`wave ${w.wave}: unknown enemy ${id}`);
      if (!(weight > 0)) err(`wave ${w.wave}: weight for ${id} must be > 0`);
    }
    if (w.modifiers && w.modifiers > data.waves.modifiers.length) {
      err(`wave ${w.wave}: more modifiers than exist`);
    }
  });

  const { rules } = data;
  if (rules.cards.redrawCosts.length === 0) err('rules: redrawCosts empty');
  if (rules.suits.length !== 4) err('rules: need exactly 4 suit effects');
  if (rules.difficulties.length === 0) err('rules: no difficulties');

  for (const map of data.maps) {
    try {
      buildMapGeometry(map);
    } catch (e) {
      err(`map ${map.id}: ${(e as Error).message}`);
    }
  }
  return errors;
}
