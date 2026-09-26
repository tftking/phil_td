import type { MapDef, Point } from '../data/types';

export interface PathGeometry {
  id: string;
  air: boolean;
  points: Point[];
  /** cumulative[i] = distance along the path to points[i], in tiles. */
  cumulative: number[];
  length: number;
}

export interface MapGeometry {
  def: MapDef;
  paths: Map<string, PathGeometry>;
  /** Tiles covered by ground paths, as "x,y" keys. */
  pathTiles: Set<string>;
  /** Tiles players may build on. */
  buildTiles: Point[];
}

export const tileKey = (x: number, y: number): string => `${x},${y}`;

function buildPath(id: string, air: boolean, points: Point[]): PathGeometry {
  if (points.length < 2) throw new Error(`path ${id} needs at least 2 points`);
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(bx - ax, by - ay));
  }
  return { id, air, points, cumulative, length: cumulative[cumulative.length - 1]! };
}

/** World position (in tile units) at `dist` tiles along a path. Clamped to the ends. */
export function pointAtDistance(path: PathGeometry, dist: number): Point {
  const { points, cumulative } = path;
  if (dist <= 0) return [...points[0]!];
  if (dist >= path.length) return [...points[points.length - 1]!];
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

/** Precomputes paths and build tiles for a map, validating the layout. */
export function buildMapGeometry(def: MapDef): MapGeometry {
  const inBounds = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < def.width && y < def.height;

  const paths = new Map<string, PathGeometry>();
  const pathTiles = new Set<string>();
  for (const p of def.paths) {
    if (paths.has(p.id)) throw new Error(`duplicate path ${p.id}`);
    for (const [x, y] of p.points) {
      if (!inBounds(x, y)) throw new Error(`path ${p.id} point ${x},${y} out of bounds`);
    }
    paths.set(p.id, buildPath(p.id, p.air ?? false, p.points));
    if (p.air) continue;
    for (let i = 1; i < p.points.length; i++) {
      const [ax, ay] = p.points[i - 1]!;
      const [bx, by] = p.points[i]!;
      if (ax !== bx && ay !== by) throw new Error(`ground path ${p.id} segment ${i} is diagonal`);
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        pathTiles.add(tileKey(ax + Math.sign(bx - ax) * s, ay + Math.sign(by - ay) * s));
      }
    }
  }
  if (![...paths.values()].some((p) => !p.air)) throw new Error('map needs a ground path');

  const seen = new Set<string>();
  const buildTiles: Point[] = [];
  for (const [rx, ry, w, h] of def.buildAreas) {
    for (let y = ry; y < ry + h; y++) {
      for (let x = rx; x < rx + w; x++) {
        const k = tileKey(x, y);
        if (!inBounds(x, y)) throw new Error(`build tile ${k} out of bounds`);
        if (pathTiles.has(k)) throw new Error(`build tile ${k} is on the path`);
        if (seen.has(k)) throw new Error(`build tile ${k} listed twice`);
        seen.add(k);
        buildTiles.push([x, y]);
      }
    }
  }
  for (const hot of def.hotTiles) {
    if (!seen.has(tileKey(hot.x, hot.y))) {
      throw new Error(`hot tile ${hot.x},${hot.y} is not a build tile`);
    }
  }
  if (!inBounds(def.vault[0], def.vault[1])) throw new Error('vault out of bounds');

  return { def, paths, pathTiles, buildTiles };
}
