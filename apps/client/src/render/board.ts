import { Application, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js';
import {
  type GameEvent,
  type MapLayout,
  type PathGeometry,
  type PublicTower,
  type Snapshot,
  pointAtDistance,
  tileKey,
  unpackCreeps,
  enemyDef,
} from '@pokertd/sim';
import { settings } from '../settings';

export const SUIT_COLORS = [0xa9b6c8, 0xe0525a, 0x4aa3e0, 0x58c27d];
const FELTS: Record<
  string,
  { bg: number; felt: number; grid: number; build: number; edge: number }
> = {
  green: { bg: 0x0a2a20, felt: 0x0f3d2e, grid: 0x14493a, build: 0x1b5a44, edge: 0x2a7a5d },
  blue: { bg: 0x0b1d2e, felt: 0x10304a, grid: 0x173d5c, build: 0x1d4c70, edge: 0x2d6a96 },
  red: { bg: 0x2a0d12, felt: 0x46161e, grid: 0x551d27, build: 0x6a2632, edge: 0x8e3847 },
  black: { bg: 0x0b0b0e, felt: 0x17171d, grid: 0x202029, build: 0x2a2a35, edge: 0x3d3d4d },
  purple: { bg: 0x1b0f2a, felt: 0x2a1842, grid: 0x352052, build: 0x422a66, edge: 0x5d3d8c },
};

const CREEP_STYLE: Record<
  string,
  {
    color: number;
    shape: 'circle' | 'triangle' | 'square' | 'diamond' | 'hex' | 'star';
    size: number;
  }
> = {
  grunt: { color: 0xd9c9a3, shape: 'circle', size: 0.22 },
  runner: { color: 0xf2d05e, shape: 'triangle', size: 0.2 },
  brute: { color: 0x9a7b5f, shape: 'square', size: 0.3 },
  swarm: { color: 0xc98bdb, shape: 'circle', size: 0.13 },
  flyer: { color: 0x9fd8f5, shape: 'diamond', size: 0.22 },
  regen: { color: 0x7fe08a, shape: 'hex', size: 0.24 },
  shield: { color: 0x8fa6ff, shape: 'hex', size: 0.24 },
  splitter: { color: 0xf09a5b, shape: 'star', size: 0.26 },
  boss: { color: 0xe0525a, shape: 'star', size: 0.45 },
};

interface CreepView {
  node: Container;
  body: Graphics;
  bar: Graphics;
  path: string;
  from: number;
  to: number;
  hp: number;
  seen: number;
  x: number;
  y: number;
}

interface Fx {
  g: Graphics;
  life: number;
  max: number;
  update(g: Graphics, t: number): void;
}

export interface BoardCallbacks {
  onTileClick(x: number, y: number, button: number): void;
  onHover(x: number, y: number): void;
}

/** Draws the table and everything on it. Owns nothing but visuals. */
export class Board {
  readonly app = new Application();
  private world = new Container();
  private mapLayer = new Container();
  private overlay = new Graphics();
  private towerLayer = new Container();
  private creepLayer = new Container();
  private fxLayer = new Container();
  private textLayer = new Container();
  private layout: MapLayout | null = null;
  private towerViews = new Map<number, { node: Container; key: string; tower: PublicTower }>();
  private creeps = new Map<number, CreepView>();
  private fx: Fx[] = [];
  private floats: { t: Text; life: number; vy: number }[] = [];
  private snapTime = 0;
  private scale = 32;
  private dragging: { x: number; y: number; wx: number; wy: number; moved: boolean } | null = null;
  private userCamera = false;
  hover: { x: number; y: number } | null = null;
  highlight: {
    tiles: Set<string>;
    range: { x: number; y: number; r: number; min: number } | null;
  } = {
    tiles: new Set(),
    range: null,
  };
  selected: number | null = null;
  you: string | null = null;
  private ready: Promise<void>;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: BoardCallbacks,
  ) {
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.host,
      background: FELTS[settings.value.felt]?.bg ?? FELTS.green!.bg,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.world.addChild(
      this.mapLayer,
      this.overlay,
      this.towerLayer,
      this.creepLayer,
      this.fxLayer,
      this.textLayer,
    );
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => this.pointerMove(e));
    this.app.stage.on('pointerdown', (e) => this.pointerDown(e));
    this.app.stage.on('pointerup', (e) => this.pointerUp(e));
    this.app.stage.on('pointerupoutside', () => (this.dragging = null));
    this.app.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.app.renderer.on('resize', () => {
      if (!this.userCamera) this.fit();
    });
    this.app.ticker.add((t) => this.frame(t.deltaMS));
  }

  async setLayout(layout: MapLayout, you: string | null): Promise<void> {
    await this.ready;
    if (this.destroyed) return;
    this.layout = layout;
    this.you = you;
    this.userCamera = false;
    for (const v of this.towerViews.values()) v.node.destroy({ children: true });
    this.towerViews.clear();
    for (const c of this.creeps.values()) c.node.destroy({ children: true });
    this.creeps.clear();
    this.drawMap();
    this.fit();
  }

  /** Fits the whole table on screen. */
  fit(): void {
    if (!this.layout) return;
    const { width, height } = this.layout;
    const s = Math.min(this.app.screen.width / (width + 1), this.app.screen.height / (height + 1));
    this.scale = s;
    this.world.scale.set(s);
    this.world.position.set(
      (this.app.screen.width - width * s) / 2,
      (this.app.screen.height - height * s) / 2,
    );
  }

  /** Zooms to a lane (F key). */
  focusLane(lane: number): void {
    const l = this.layout?.lanes[lane];
    if (!l) return;
    const [x, y, w, h] = l.rect;
    const s = Math.min(this.app.screen.width / (w + 2), this.app.screen.height / (h + 2));
    this.scale = s;
    this.world.scale.set(s);
    this.world.position.set(
      this.app.screen.width / 2 - (x + w / 2) * s,
      this.app.screen.height / 2 - (y + h / 2) * s,
    );
    this.userCamera = true;
  }

  resetCamera(): void {
    this.userCamera = false;
    this.fit();
  }

  private drawMap(): void {
    const layout = this.layout!;
    this.mapLayer.removeChildren().forEach((c) => c.destroy());
    const felt = FELTS[settings.value.felt] ?? FELTS.green!;
    this.app.renderer.background.color = felt.bg;
    const g = new Graphics();
    g.roundRect(-0.3, -0.3, layout.width + 0.6, layout.height + 0.6, 0.6).fill(felt.felt);
    // Lane owner tint: your lane is slightly lighter.
    for (const lane of layout.lanes) {
      const [x, y, w, h] = lane.rect;
      g.roundRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1, 0.3).stroke({
        width: 0.04,
        color: felt.grid,
        alpha: 0.9,
      });
    }
    if (layout.center) {
      const [x, y, w, h] = layout.center.rect;
      g.roundRect(x + 0.1, y + 0.1, w - 0.2, h - 0.2, 0.4).fill({ color: 0x000000, alpha: 0.12 });
    }
    for (const key of layout.buildZone.keys()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      g.roundRect(x + 0.07, y + 0.07, 0.86, 0.86, 0.14)
        .fill(felt.build)
        .stroke({ width: 0.03, color: felt.edge });
    }
    for (const [key, hot] of layout.hot) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      g.circle(x + 0.5, y + 0.5, 0.1).fill(hot.bonus === 'damage' ? 0xe8c15a : 0x9fd8f5);
    }
    for (const key of layout.roadTiles) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      g.rect(x, y, 1, 1).fill(0x6b4f32);
    }
    for (const key of layout.roadTiles) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (!layout.roadTiles.has(tileKey(x, y - 1))) g.moveTo(x, y).lineTo(x + 1, y);
      if (!layout.roadTiles.has(tileKey(x, y + 1))) g.moveTo(x, y + 1).lineTo(x + 1, y + 1);
      if (!layout.roadTiles.has(tileKey(x - 1, y))) g.moveTo(x, y).lineTo(x, y + 1);
      if (!layout.roadTiles.has(tileKey(x + 1, y))) g.moveTo(x + 1, y).lineTo(x + 1, y + 1);
    }
    g.stroke({ width: 0.05, color: 0x4a3622 });
    // Direction chevrons along ground paths.
    for (const p of layout.paths.values()) {
      if (p.air) continue;
      for (let d = 1.5; d < p.length - 0.5; d += 3) {
        const [ax, ay] = pointAtDistance(p, d);
        const [bx, by] = pointAtDistance(p, d + 0.3);
        const ang = Math.atan2(by - ay, bx - ax);
        const cx = ax + 0.5;
        const cy = ay + 0.5;
        g.moveTo(cx + Math.cos(ang + 2.5) * 0.18, cy + Math.sin(ang + 2.5) * 0.18)
          .lineTo(cx + Math.cos(ang) * 0.18, cy + Math.sin(ang) * 0.18)
          .lineTo(cx + Math.cos(ang - 2.5) * 0.18, cy + Math.sin(ang - 2.5) * 0.18);
      }
    }
    g.stroke({ width: 0.05, color: 0x8a6a45, alpha: 0.8 });
    for (const p of layout.paths.values()) {
      if (!p.air) continue;
      const [first, ...rest] = p.points;
      g.moveTo(first![0] + 0.5, first![1] + 0.5);
      for (const [x, y] of rest) g.lineTo(x + 0.5, y + 0.5);
      g.stroke({ width: 0.04, color: 0x9fd8f5, alpha: 0.35 });
    }
    const vaults = layout.center ? [layout.center.vault] : layout.lanes.map((l) => l.vault!);
    for (const [vx, vy] of vaults) {
      g.roundRect(vx + 0.08, vy + 0.08, 0.84, 0.84, 0.18)
        .fill(0xd8454b)
        .stroke({ width: 0.05, color: 0xffd0d0 });
      g.circle(vx + 0.5, vy + 0.5, 0.18).fill(0xffe9a8);
    }
    this.mapLayer.addChild(g);
    // Lane name tags.
    for (const lane of layout.lanes) {
      const label = new Text({
        text: `Lane ${lane.index + 1}`,
        style: { fill: 0xffffff, fontSize: 40, fontWeight: '600' },
      });
      label.alpha = 0.25;
      label.scale.set(0.012);
      label.position.set(lane.rect[0] + 0.3, lane.rect[1] + lane.rect[3] - 0.7);
      this.mapLayer.addChild(label);
    }
  }

  // ----------------------------------------------------------- towers

  setTowers(towers: PublicTower[]): void {
    if (!this.layout) return;
    const seen = new Set<number>();
    for (const t of towers) {
      seen.add(t.id);
      const key = `${t.def}:${t.copyOf}:${t.level}:${t.suit}:${t.pure}:${t.aura}:${this.selected === t.id}`;
      const existing = this.towerViews.get(t.id);
      if (existing && existing.key === key) {
        existing.tower = t;
        continue;
      }
      existing?.node.destroy({ children: true });
      const node = this.drawTower(t);
      this.towerLayer.addChild(node);
      this.towerViews.set(t.id, { node, key, tower: t });
    }
    for (const [id, v] of this.towerViews) {
      if (!seen.has(id)) {
        this.burst(v.tower.x + 0.5, v.tower.y + 0.5, 0xe8c15a, 10);
        v.node.destroy({ children: true });
        this.towerViews.delete(id);
      }
    }
  }

  private drawTower(t: PublicTower): Container {
    const node = new Container();
    node.position.set(t.x + 0.5, t.y + 0.5);
    const color = SUIT_COLORS[t.suit]!;
    const g = new Graphics();
    const kind = t.def === 'jester' ? (t.copyOf ?? 'jester') : t.def;
    const mine = t.owner === this.you;
    g.circle(0, 0, 0.42).fill({ color: 0x000000, alpha: 0.25 });
    switch (kind) {
      case 'plinker':
        g.circle(0, 0, 0.22).fill(color);
        break;
      case 'twin':
        g.circle(-0.14, 0, 0.16).fill(color).circle(0.14, 0, 0.16).fill(color);
        break;
      case 'sentry':
        g.roundRect(-0.25, -0.25, 0.5, 0.5, 0.08).fill(color);
        break;
      case 'sniper':
        g.poly([0, -0.36, 0.22, 0.26, -0.22, 0.26]).fill(color);
        g.rect(-0.03, -0.42, 0.06, 0.3).fill(0xffffff);
        break;
      case 'chain':
        g.poly([0, -0.32, 0.28, 0, 0, 0.32, -0.28, 0]).fill(color);
        g.moveTo(-0.1, -0.12)
          .lineTo(0.06, 0)
          .lineTo(-0.06, 0.02)
          .lineTo(0.1, 0.14)
          .stroke({ width: 0.05, color: 0xffffff });
        break;
      case 'elemental':
        g.star(0, 0, 6, 0.32, 0.18).fill(color);
        break;
      case 'mortar':
        g.circle(0, 0, 0.3).fill(color).circle(0, 0, 0.14).fill(0x222222);
        break;
      case 'laser':
        g.poly([-0.3, -0.12, 0.3, -0.12, 0.3, 0.12, -0.3, 0.12]).fill(color);
        g.circle(0, 0, 0.1).fill(0xfff4a8);
        break;
      case 'storm':
        g.star(0, 0, 8, 0.36, 0.2).fill(color);
        g.circle(0, 0, 0.1).fill(0xffffff);
        break;
      case 'crown':
        g.poly([
          -0.32, 0.22, -0.32, -0.12, -0.16, 0.04, 0, -0.3, 0.16, 0.04, 0.32, -0.12, 0.32, 0.22,
        ]).fill(0xe8c15a);
        g.circle(0, 0.06, 0.07).fill(color);
        break;
      default:
        g.star(0, 0, 5, 0.3, 0.14).fill(0xc98bdb);
    }
    if (t.def === 'jester') g.circle(0, 0, 0.4).stroke({ width: 0.04, color: 0xc98bdb });
    if (t.aura > 0) g.circle(0, 0, 0.44).stroke({ width: 0.03, color: 0xe8c15a, alpha: 0.7 });
    if (t.pure) g.circle(0, 0, 0.36).stroke({ width: 0.03, color, alpha: 0.9 });
    for (let i = 0; i < t.level; i++)
      g.circle(-0.18 + i * 0.18, 0.38, 0.05).fill(i < t.level ? 0xffe9a8 : 0x444444);
    if (!mine) g.alpha = 0.92;
    if (this.selected === t.id) g.circle(0, 0, 0.47).stroke({ width: 0.05, color: 0xffffff });
    node.addChild(g);
    if (settings.value.colorblind) {
      const glyph = new Text({ text: '♠♥♦♣'[t.suit]!, style: { fill: 0xffffff, fontSize: 40 } });
      glyph.scale.set(0.006);
      glyph.anchor.set(0.5);
      glyph.position.set(0.3, -0.3);
      node.addChild(glyph);
    }
    return node;
  }

  // ----------------------------------------------------------- creeps

  applySnapshot(snap: Snapshot): void {
    if (!this.layout) return;
    const keys = [...this.layout.paths.keys()];
    const now = performance.now();
    const list = unpackCreeps(snap.creeps, keys);
    const seen = new Set<number>();
    for (const c of list) {
      seen.add(c.id);
      let v = this.creeps.get(c.id);
      if (!v) {
        v = this.makeCreep(c.type, c.boss);
        v.path = c.path;
        v.from = c.dist;
        v.to = c.dist;
        this.creeps.set(c.id, v);
      } else if (v.path !== c.path) {
        v.path = c.path;
        v.from = c.dist;
        v.to = c.dist;
      } else {
        v.from = this.currentDist(v, now);
        v.to = c.dist;
      }
      v.seen = now;
      if (v.hp !== c.hp) {
        v.hp = c.hp;
        v.bar.clear();
        const w = v.body.width / Math.max(1, this.scale) + 0.1;
        v.bar
          .rect(-w / 2, 0, w, 0.07)
          .fill(0x331111)
          .rect(-w / 2, 0, w * c.hp, 0.07)
          .fill(c.hp > 0.5 ? 0x6fdc6f : c.hp > 0.25 ? 0xe8c15a : 0xe0525a);
      }
      v.body.tint = c.slowed ? 0x9fd8f5 : 0xffffff;
      v.body.alpha = c.shielded ? 0.85 : 1;
    }
    for (const [id, v] of this.creeps) {
      if (!seen.has(id)) {
        v.node.destroy({ children: true });
        this.creeps.delete(id);
      }
    }
    this.snapTime = now;
  }

  private currentDist(v: CreepView, now: number): number {
    const t = Math.min(1, (now - this.snapTime) / 100);
    return v.from + (v.to - v.from) * t;
  }

  private makeCreep(type: string, boss: boolean): CreepView {
    const style = CREEP_STYLE[type] ?? CREEP_STYLE.grunt!;
    const size = boss ? CREEP_STYLE.boss!.size : style.size;
    const node = new Container();
    const body = new Graphics();
    const color = boss ? CREEP_STYLE.boss!.color : style.color;
    switch (boss ? 'star' : style.shape) {
      case 'circle':
        body.circle(0, 0, size).fill(color);
        break;
      case 'triangle':
        body.poly([0, -size, size, size * 0.8, -size, size * 0.8]).fill(color);
        break;
      case 'square':
        body.rect(-size, -size, size * 2, size * 2).fill(color);
        break;
      case 'diamond':
        body.poly([0, -size, size, 0, 0, size, -size, 0]).fill(color);
        body
          .moveTo(-size * 1.3, 0)
          .lineTo(size * 1.3, 0)
          .stroke({ width: 0.04, color });
        break;
      case 'hex':
        body.regularPoly(0, 0, size, 6).fill(color);
        if (type === 'shield')
          body.circle(0, 0, size * 1.3).stroke({ width: 0.04, color: 0x8fa6ff });
        break;
      case 'star':
        body.star(0, 0, boss ? 7 : 5, size, size * 0.55).fill(color);
        break;
    }
    body.stroke({ width: 0.03, color: 0x000000, alpha: 0.4 });
    const bar = new Graphics();
    bar.position.set(0, -size - 0.14);
    node.addChild(body, bar);
    this.creepLayer.addChild(node);
    return { node, body, bar, path: '', from: 0, to: 0, hp: -1, seen: 0, x: 0, y: 0 };
  }

  /** World position of a creep (tile units, centered), for effects. */
  creepPos(id: number): { x: number; y: number } | null {
    const v = this.creeps.get(id & 0xffff);
    return v ? { x: v.x, y: v.y } : null;
  }

  // ----------------------------------------------------------- events

  handleEvents(events: GameEvent[]): void {
    const reduced = settings.value.reducedMotion;
    for (const e of events) {
      switch (e.kind) {
        case 'attack': {
          const t = this.towerViews.get(e.tower)?.tower;
          if (!t) break;
          const kind = t.def === 'jester' ? (t.copyOf ?? 'plinker') : t.def;
          const color = e.crit ? 0xffffff : SUIT_COLORS[t.suit]!;
          const from = { x: t.x + 0.5, y: t.y + 0.5 };
          if (kind === 'chain' || kind === 'storm') {
            const pts = [
              from,
              ...e.targets
                .map((id) => this.creepPos(id))
                .filter((p): p is { x: number; y: number } => !!p),
            ];
            this.lightning(pts, color);
          } else if (kind === 'mortar' || kind === 'elemental' || kind === 'crown') {
            const p = this.creepPos(e.targets[0]!);
            if (p) this.lob(from, p, color, kind === 'mortar' ? 1.5 : kind === 'crown' ? 2 : 1);
          } else if (kind === 'sniper') {
            const p = this.creepPos(e.targets[0]!);
            if (p) this.tracer(from, p, color);
          } else {
            for (const id of e.targets) {
              const p = this.creepPos(id);
              if (p) this.bolt(from, p, color);
            }
          }
          if (e.crit && !reduced) this.floatText(from.x, from.y - 0.4, 'CRIT', 0xffffff);
          break;
        }
        case 'beam': {
          const t = this.towerViews.get(e.tower)?.tower;
          const p = this.creepPos(e.target);
          if (t && p) this.beam({ x: t.x + 0.5, y: t.y + 0.5 }, p, SUIT_COLORS[t.suit]!, e.dps);
          break;
        }
        case 'death': {
          const x = e.x + 0.5;
          const y = e.y + 0.5;
          this.burst(x, y, 0xffe9a8, reduced ? 3 : 8);
          if (e.to === this.you) this.floatText(x, y - 0.2, `+${e.bounty}`, 0xe8c15a);
          break;
        }
        case 'leak': {
          const layout = this.layout;
          const vault = layout?.center?.vault ?? layout?.lanes[e.lane]?.vault;
          if (vault) {
            this.ring(vault[0] + 0.5, vault[1] + 0.5, 0xe0525a, 1.5, 500);
            this.floatText(vault[0] + 0.5, vault[1], `-${e.lives}`, 0xe0525a);
          }
          break;
        }
        case 'placed': {
          const t = this.towerViews.get(e.tower)?.tower;
          if (t) this.ring(t.x + 0.5, t.y + 0.5, 0xffffff, 0.8, 350);
          break;
        }
        case 'upgraded': {
          const t = this.towerViews.get(e.tower)?.tower;
          if (t) {
            this.ring(t.x + 0.5, t.y + 0.5, 0xe8c15a, 0.9, 400);
            this.floatText(t.x + 0.5, t.y, `Lv ${e.level}`, 0xe8c15a);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  ping(x: number, y: number, color: number): void {
    this.ring(x, y, color, 1.2, 900);
    this.ring(x, y, color, 0.6, 600);
  }

  private addFx(max: number, update: Fx['update']): void {
    if (this.fx.length > 400) return;
    const g = new Graphics();
    this.fxLayer.addChild(g);
    this.fx.push({ g, life: 0, max, update });
  }

  private bolt(a: { x: number; y: number }, b: { x: number; y: number }, color: number): void {
    this.addFx(120, (g, t) => {
      g.clear()
        .circle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.07)
        .fill(color);
    });
  }

  private tracer(a: { x: number; y: number }, b: { x: number; y: number }, color: number): void {
    this.addFx(180, (g, t) => {
      g.clear()
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 0.06 * (1 - t), color, alpha: 1 - t });
    });
  }

  private lightning(pts: { x: number; y: number }[], color: number): void {
    if (pts.length < 2) return;
    const jitter = pts.map((p, i) =>
      i === 0 ? p : { x: p.x + (Math.random() - 0.5) * 0.2, y: p.y + (Math.random() - 0.5) * 0.2 },
    );
    this.addFx(160, (g, t) => {
      g.clear().moveTo(jitter[0]!.x, jitter[0]!.y);
      for (const p of jitter.slice(1)) g.lineTo(p.x, p.y);
      g.stroke({ width: 0.06, color, alpha: 1 - t });
    });
  }

  private lob(
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: number,
    splash: number,
  ): void {
    this.addFx(260, (g, t) => {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 0.8;
      g.clear().circle(x, y, 0.1).fill(color);
    });
    setTimeout(() => this.ring(b.x, b.y, color, splash, 280), 240);
  }

  private beam(
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: number,
    dps: number,
  ): void {
    const width = 0.05 + Math.min(0.12, dps / 3000);
    this.addFx(260, (g, t) => {
      g.clear()
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width, color, alpha: 0.9 - t * 0.6 });
    });
  }

  private ring(x: number, y: number, color: number, radius: number, ms: number): void {
    this.addFx(ms, (g, t) => {
      g.clear()
        .circle(x, y, radius * (0.3 + 0.7 * t))
        .stroke({ width: 0.06, color, alpha: 1 - t });
    });
  }

  private burst(x: number, y: number, color: number, n: number): void {
    const parts = Array.from({ length: n }, () => ({
      a: Math.random() * Math.PI * 2,
      s: 0.4 + Math.random() * 0.6,
    }));
    this.addFx(350, (g, t) => {
      g.clear();
      for (const p of parts)
        g.circle(x + Math.cos(p.a) * p.s * t, y + Math.sin(p.a) * p.s * t, 0.05 * (1 - t)).fill(
          color,
        );
    });
  }

  floatText(x: number, y: number, text: string, color: number): void {
    if (this.floats.length > 40) return;
    const t = new Text({
      text,
      style: {
        fill: color,
        fontSize: 36,
        fontWeight: '700',
        stroke: { color: 0x000000, width: 5 },
      },
    });
    t.anchor.set(0.5);
    t.scale.set(0.011);
    t.position.set(x, y);
    this.textLayer.addChild(t);
    this.floats.push({ t, life: 0, vy: -0.6 });
  }

  // ----------------------------------------------------------- frame

  private frame(dt: number): void {
    if (!this.layout) return;
    const now = performance.now();
    for (const v of this.creeps.values()) {
      const path = this.layout.paths.get(v.path) as PathGeometry | undefined;
      if (!path) continue;
      const [x, y] = pointAtDistance(path, this.currentDist(v, now));
      v.x = x + 0.5;
      v.y = y + 0.5;
      v.node.position.set(v.x, v.y);
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]!;
      f.life += dt;
      const t = Math.min(1, f.life / f.max);
      f.update(f.g, t);
      if (t >= 1) {
        f.g.destroy();
        this.fx.splice(i, 1);
      }
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.life += dt;
      f.t.y += (f.vy * dt) / 1000;
      f.t.alpha = Math.max(0, 1 - f.life / 900);
      if (f.life > 900) {
        f.t.destroy();
        this.floats.splice(i, 1);
      }
    }
    this.drawOverlay();
  }

  private drawOverlay(): void {
    const g = this.overlay.clear();
    for (const key of this.highlight.tiles) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      g.roundRect(x + 0.1, y + 0.1, 0.8, 0.8, 0.12).stroke({
        width: 0.05,
        color: 0x9ff09f,
        alpha: 0.8,
      });
    }
    const r = this.highlight.range;
    if (r) {
      g.circle(r.x + 0.5, r.y + 0.5, r.r)
        .fill({ color: 0xffffff, alpha: 0.06 })
        .stroke({ width: 0.04, color: 0xffffff, alpha: 0.5 });
      if (r.min > 0)
        g.circle(r.x + 0.5, r.y + 0.5, r.min).stroke({ width: 0.03, color: 0xe0525a, alpha: 0.6 });
    }
    if (this.hover && this.highlight.tiles.has(tileKey(this.hover.x, this.hover.y))) {
      g.roundRect(this.hover.x + 0.05, this.hover.y + 0.05, 0.9, 0.9, 0.14).fill({
        color: 0x9ff09f,
        alpha: 0.25,
      });
    }
  }

  // ----------------------------------------------------------- input

  private toTile(e: FederatedPointerEvent): { x: number; y: number } {
    const p = this.world.toLocal(e.global);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }

  private pointerMove(e: FederatedPointerEvent): void {
    if (this.dragging) {
      const dx = e.global.x - this.dragging.x;
      const dy = e.global.y - this.dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.dragging.moved = true;
      if (this.dragging.moved) {
        this.world.position.set(this.dragging.wx + dx, this.dragging.wy + dy);
        this.userCamera = true;
      }
    }
    const tile = this.toTile(e);
    if (!this.hover || this.hover.x !== tile.x || this.hover.y !== tile.y) {
      this.hover = tile;
      this.cb.onHover(tile.x, tile.y);
    }
  }

  private pointerDown(e: FederatedPointerEvent): void {
    this.dragging = {
      x: e.global.x,
      y: e.global.y,
      wx: this.world.x,
      wy: this.world.y,
      moved: false,
    };
  }

  private pointerUp(e: FederatedPointerEvent): void {
    const drag = this.dragging;
    this.dragging = null;
    if (drag?.moved) return;
    const tile = this.toTile(e);
    this.cb.onTileClick(tile.x, tile.y, e.button);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = { x: (mx - this.world.x) / this.scale, y: (my - this.world.y) / this.scale };
    this.scale = Math.max(8, Math.min(140, this.scale * factor));
    this.world.scale.set(this.scale);
    this.world.position.set(mx - before.x * this.scale, my - before.y * this.scale);
    this.userCamera = true;
  }

  /** Screen (client) coordinates of a tile's center, for tests and tutorials. */
  tileToClient(x: number, y: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const p = this.world.toGlobal({ x: x + 0.5, y: y + 0.5 });
    return { x: rect.left + p.x, y: rect.top + p.y };
  }

  destroy(): void {
    this.destroyed = true;
    void this.ready.then(() => {
      if (this.app.renderer) this.app.destroy(true, { children: true });
    });
  }
}

/** Tile-center position of a tower or creep, for convenience in the UI. */
export const creepColor = (type: string): number => CREEP_STYLE[type]?.color ?? 0xffffff;
export const enemyName = (type: string): string => enemyDef(type).name;
