import { type MatchState, type Point, contextOf, pointAtDistance, tileKey } from '@pokertd/sim';

/** Sample points along the paths a lane's creeps walk (ground, air and center). */
function laneSamples(state: MatchState, lane: number, zone: number): Point[] {
  const { layout } = contextOf(state);
  const l = layout.lanes[lane]!;
  const paths =
    zone === -1 ? layout.lanes.flatMap((x) => (x.center ? [x.center] : [])) : [l.ground, l.air];
  const pts: Point[] = [];
  for (const p of paths) {
    for (let d = 0; d <= p.length; d += 0.5) pts.push(pointAtDistance(p, d));
  }
  return pts;
}

const coverageCache = new Map<string, Map<string, number>>();

/** How much path a tower of `range` covers from each build tile of a zone. */
export function coverage(
  state: MatchState,
  lane: number,
  zone: number,
  range: number,
  minRange = 0,
): Map<string, number> {
  const { layout } = contextOf(state);
  const key = `${state.settings.map}:${layout.players}:${lane}:${zone}:${range.toFixed(2)}:${minRange}`;
  const hit = coverageCache.get(key);
  if (hit) return hit;
  const samples = laneSamples(state, lane, zone);
  const tiles = zone === -1 ? layout.center!.buildTiles : layout.lanes[lane]!.buildTiles;
  const out = new Map<string, number>();
  for (const [x, y] of tiles) {
    let n = 0;
    for (const [px, py] of samples) {
      const d = Math.hypot(px - x, py - y);
      if (d <= range && d >= minRange) n++;
    }
    out.set(tileKey(x, y), n);
  }
  coverageCache.set(key, out);
  return out;
}

/** Best free tile for a tower in a zone, or null if the zone is full. */
export function bestTile(
  state: MatchState,
  lane: number,
  zone: number,
  range: number,
  minRange = 0,
): Point | null {
  const taken = new Set(state.towers.map((t) => tileKey(t.x, t.y)));
  let best: Point | null = null;
  let bestScore = -1;
  for (const [key, score] of coverage(state, lane, zone, range, minRange)) {
    if (taken.has(key)) continue;
    const hot = contextOf(state).layout.hot.has(key) ? 3 : 0;
    if (score + hot > bestScore) {
      bestScore = score + hot;
      const [x, y] = key.split(',').map(Number) as [number, number];
      best = [x, y];
    }
  }
  return best;
}
