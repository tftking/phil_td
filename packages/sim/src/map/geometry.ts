import type { MapDef, Point } from '../data/types';

/**
 * Map layout. A map is a lane template; the layout builder places one lane
 * per player. Co-op lanes sit on both sides of the Center Table, a shared
 * road that leads to the Vault. Showdown lanes sit in a grid, each ending in
 * its own vault. All coordinates are in tiles; points are tile centers.
 */

export interface PathGeometry {
  key: string;
  air: boolean;
  points: Point[];
  /** cumulative[i] = distance along the path to points[i], in tiles. */
  cumulative: number[];
  length: number;
}

export type Rect = [number, number, number, number];

export interface LaneLayout {
  index: number;
  /** World rect of the lane: [x, y, width, height]. */
  rect: Rect;
  mirrored: boolean;
  ground: PathGeometry;
  air: PathGeometry;
  /** Co-op: the path from this lane's exit, across the center, to the vault. */
  center: PathGeometry | null;
  buildTiles: Point[];
  hotTiles: { x: number; y: number; bonus: 'range' | 'damage'; amount: number }[];
  /** Showdown: this lane's own vault. Co-op: null (shared vault). */
  vault: Point | null;
}

export interface MapLayout {
  def: MapDef;
  players: number;
  width: number;
  height: number;
  lanes: LaneLayout[];
  /** Co-op only. */
  center: {
    rect: Rect;
    buildTiles: Point[];
    boss: PathGeometry;
    vault: Point;
  } | null;
  /** Every path by key: L{i}g, L{i}a, C{i}, B. */
  paths: Map<string, PathGeometry>;
  /** Ground road tiles, as "x,y" keys (for rendering and validation). */
  roadTiles: Set<string>;
  /** Build tile "x,y" → zone: lane index, or -1 for the Center Table. */
  buildZone: Map<string, number>;
  hot: Map<string, { bonus: 'range' | 'damage'; amount: number }>;
}

export const tileKey = (x: number, y: number): string => `${x},${y}`;

export function makePath(key: string, air: boolean, points: Point[]): PathGeometry {
  if (points.length < 2) throw new Error(`path ${key} needs at least 2 points`);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { key, air, points, cumulative, length: cumulative[cumulative.length - 1]! };
}

/** World position (tile units) at `dist` tiles along a path, clamped to the ends. */
export function pointAtDistance(path: PathGeometry, dist: number): Point {
  const { points, cumulative } = path;
  if (dist <= 0) return [points[0]![0], points[0]![1]];
  if (dist >= path.length) {
    const last = points[points.length - 1]!;
    return [last[0], last[1]];
  }
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= dist) lo = mid;
    else hi = mid;
  }
  const [ax, ay] = points[lo]!;
  const [bx, by] = points[hi]!;
  const t = (dist - cumulative[lo]!) / (cumulative[hi]! - cumulative[lo]!);
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** Tiles covered by an axis-aligned polyline. */
function roadTilesOf(points: Point[], out: Set<string>, what: string): void {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    if (ax !== bx && ay !== by) throw new Error(`${what}: segment ${i} is diagonal`);
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let s = 0; s <= steps; s++) {
      out.add(tileKey(ax + Math.sign(bx - ax) * s, ay + Math.sign(by - ay) * s));
    }
  }
}

function rectTiles([rx, ry, w, h]: Rect): Point[] {
  const out: Point[] = [];
  for (let y = ry; y < ry + h; y++) for (let x = rx; x < rx + w; x++) out.push([x, y]);
  return out;
}

/** Validates a lane template on its own (local coordinates). */
function checkTemplate(def: MapDef): void {
  const { lane } = def;
  const inLane = ([x, y]: Point): boolean => x >= 0 && y >= 0 && x < lane.width && y < lane.height;
  const road = new Set<string>();
  roadTilesOf(lane.ground, road, 'ground path');
  for (const p of [...lane.ground, ...lane.air]) {
    if (!inLane(p)) throw new Error(`path point ${p} outside lane`);
  }
  const seen = new Set<string>();
  for (const area of lane.buildAreas) {
    for (const t of rectTiles(area)) {
      const k = tileKey(t[0], t[1]);
      if (!inLane(t)) throw new Error(`build tile ${k} outside lane`);
      if (road.has(k)) throw new Error(`build tile ${k} is on the path`);
      if (seen.has(k)) throw new Error(`build tile ${k} listed twice`);
      seen.add(k);
    }
  }
  for (const h of lane.hotTiles) {
    if (!seen.has(tileKey(h.x, h.y))) throw new Error(`hot tile ${h.x},${h.y} is not a build tile`);
  }
  if (def.mode === 'coop') {
    const exit = lane.ground[lane.ground.length - 1]!;
    if (exit[0] !== lane.width - 1) throw new Error('co-op lane must exit on its right edge');
  }
}

const cache = new Map<string, MapLayout>();

/** Builds (and caches) the world layout of a map for a player count. */
export function buildLayout(def: MapDef, players: number): MapLayout {
  const cacheKey = `${def.id}:${players}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.def === def) return hit;

  const [min, max] = def.players;
  if (players < min || players > max) {
    throw new Error(`${def.name} supports ${min}-${max} players, got ${players}`);
  }
  checkTemplate(def);
  const layout = def.mode === 'coop' ? coopLayout(def, players) : showdownLayout(def, players);
  cache.set(cacheKey, layout);
  return layout;
}

function placeLane(
  def: MapDef,
  index: number,
  ox: number,
  oy: number,
  mirrored: boolean,
): Omit<LaneLayout, 'center' | 'vault'> {
  const { lane } = def;
  const tx = ([x, y]: Point): Point => [ox + (mirrored ? lane.width - 1 - x : x), oy + y];
  return {
    index,
    rect: [ox, oy, lane.width, lane.height],
    mirrored,
    ground: makePath(`L${index}g`, false, lane.ground.map(tx)),
    air: makePath(`L${index}a`, true, lane.air.map(tx)),
    buildTiles: lane.buildAreas.flatMap(rectTiles).map(tx),
    hotTiles: lane.hotTiles.map((h) => {
      const [x, y] = tx([h.x, h.y]);
      return { x, y, bonus: h.bonus, amount: h.amount };
    }),
  };
}

function finish(
  def: MapDef,
  players: number,
  width: number,
  height: number,
  lanes: LaneLayout[],
  center: MapLayout['center'],
): MapLayout {
  const paths = new Map<string, PathGeometry>();
  const roadTiles = new Set<string>();
  const buildZone = new Map<string, number>();
  const hot = new Map<string, { bonus: 'range' | 'damage'; amount: number }>();
  const add = (p: PathGeometry): void => {
    paths.set(p.key, p);
    if (!p.air) roadTilesOf(p.points, roadTiles, p.key);
  };
  for (const l of lanes) {
    add(l.ground);
    add(l.air);
    if (l.center) add(l.center);
    for (const [x, y] of l.buildTiles) buildZone.set(tileKey(x, y), l.index);
    for (const h of l.hotTiles) hot.set(tileKey(h.x, h.y), { bonus: h.bonus, amount: h.amount });
  }
  if (center) {
    add(center.boss);
    for (const [x, y] of center.buildTiles) {
      const k = tileKey(x, y);
      if (!roadTiles.has(k)) buildZone.set(k, -1);
    }
    center.buildTiles = center.buildTiles.filter(([x, y]) => buildZone.get(tileKey(x, y)) === -1);
  }
  for (const k of buildZone.keys()) {
    if (roadTiles.has(k)) throw new Error(`build tile ${k} overlaps a road`);
  }
  return { def, players, width, height, lanes, center, paths, roadTiles, buildZone, hot };
}

/**
 * Co-op: lanes 0, 2, 4 on the left, 1, 3, 5 mirrored on the right, the
 * Center Table between them. Each lane's exit connects to the center road,
 * which runs down to the Vault. Bosses walk the full center road.
 */
function coopLayout(def: MapDef, players: number): MapLayout {
  const { lane } = def;
  const cw = 5;
  const roadX = lane.width + 2;
  const rows = Math.ceil(players / 2);
  const height = rows * lane.height + 2;
  const width = players > 1 ? lane.width * 2 + cw : lane.width + cw;
  const vault: Point = [roadX, height - 1];

  const lanes: LaneLayout[] = [];
  for (let i = 0; i < players; i++) {
    const right = i % 2 === 1;
    const oy = Math.floor(i / 2) * lane.height;
    const ox = right ? lane.width + cw : 0;
    const placed = placeLane(def, i, ox, oy, right);
    const exit = placed.ground.points[placed.ground.points.length - 1]!;
    const center = makePath(`C${i}`, false, [exit, [roadX, exit[1]], vault]);
    lanes.push({ ...placed, center, vault: null });
  }

  const centerRect: Rect = [lane.width, 0, cw, height];
  const buildTiles: Point[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (const dx of [0, 1, 3, 4]) buildTiles.push([lane.width + dx, y]);
  }
  const boss = makePath('B', false, [[roadX, 0], vault]);
  return finish(def, players, width, height, lanes, {
    rect: centerRect,
    buildTiles,
    boss,
    vault,
  });
}

/** Showdown: lanes in a two-column grid, each ending in its own vault. */
function showdownLayout(def: MapDef, players: number): MapLayout {
  const { lane } = def;
  const gap = 1;
  const cols = Math.min(players, 2);
  const rows = Math.ceil(players / 2);
  const lanes: LaneLayout[] = [];
  for (let i = 0; i < players; i++) {
    const ox = (i % 2) * (lane.width + gap);
    const oy = Math.floor(i / 2) * (lane.height + gap);
    const placed = placeLane(def, i, ox, oy, false);
    const exit = placed.ground.points[placed.ground.points.length - 1]!;
    lanes.push({ ...placed, center: null, vault: exit });
  }
  const width = cols * lane.width + (cols - 1) * gap;
  const height = rows * lane.height + (rows - 1) * gap;
  return finish(def, players, width, height, lanes, null);
}
