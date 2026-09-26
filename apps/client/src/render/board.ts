import { Application, Container, Graphics, Text } from 'pixi.js';
import { type MapGeometry, tileKey } from '@pokertd/sim';

const COLORS = {
  background: 0x0a2a20,
  felt: 0x0f3d2e,
  grid: 0x14493a,
  path: 0x6b4f32,
  pathEdge: 0x4a3622,
  build: 0x1b5a44,
  buildEdge: 0x2a7a5d,
  hot: 0xe8c15a,
  vault: 0xd8454b,
  air: 0x7fb8d8,
};

/** Draws the static map. Towers and creeps get their own layers in M1. */
export async function createBoard(host: HTMLElement, geo: MapGeometry): Promise<Application> {
  const app = new Application();
  await app.init({ resizeTo: host, background: COLORS.background, antialias: true });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  drawMap(world, geo);

  const fit = (): void => {
    const { width, height } = geo.def;
    const scale = Math.min(app.screen.width / width, app.screen.height / height) * 0.94;
    world.scale.set(scale);
    world.position.set(
      (app.screen.width - width * scale) / 2,
      (app.screen.height - height * scale) / 2,
    );
  };
  fit();
  app.renderer.on('resize', fit);
  return app;
}

function drawMap(layer: Container, geo: MapGeometry): void {
  const { width, height } = geo.def;
  const g = new Graphics();

  g.roundRect(-0.2, -0.2, width + 0.4, height + 0.4, 0.4).fill(COLORS.felt);
  for (let x = 0; x <= width; x++) g.moveTo(x, 0).lineTo(x, height);
  for (let y = 0; y <= height; y++) g.moveTo(0, y).lineTo(width, y);
  g.stroke({ width: 0.02, color: COLORS.grid });

  for (const [x, y] of geo.buildTiles) {
    g.roundRect(x + 0.06, y + 0.06, 0.88, 0.88, 0.12)
      .fill(COLORS.build)
      .stroke({ width: 0.03, color: COLORS.buildEdge });
  }
  for (const hot of geo.def.hotTiles) {
    g.circle(hot.x + 0.5, hot.y + 0.5, 0.12).fill(COLORS.hot);
  }

  for (const key of geo.pathTiles) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    g.rect(x, y, 1, 1).fill(COLORS.path);
  }
  // Soft edge where the path meets non-path tiles.
  for (const key of geo.pathTiles) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (!geo.pathTiles.has(tileKey(x, y - 1))) g.moveTo(x, y).lineTo(x + 1, y);
    if (!geo.pathTiles.has(tileKey(x, y + 1))) g.moveTo(x, y + 1).lineTo(x + 1, y + 1);
    if (!geo.pathTiles.has(tileKey(x - 1, y))) g.moveTo(x, y).lineTo(x, y + 1);
    if (!geo.pathTiles.has(tileKey(x + 1, y))) g.moveTo(x + 1, y).lineTo(x + 1, y + 1);
  }
  g.stroke({ width: 0.05, color: COLORS.pathEdge });

  for (const path of geo.paths.values()) {
    if (!path.air) continue;
    const [first, ...rest] = path.points;
    g.moveTo(first![0] + 0.5, first![1] + 0.5);
    for (const [x, y] of rest) g.lineTo(x + 0.5, y + 0.5);
    g.stroke({ width: 0.04, color: COLORS.air, alpha: 0.5 });
  }

  const [vx, vy] = geo.def.vault;
  g.roundRect(vx + 0.1, vy + 0.1, 0.8, 0.8, 0.15).fill(COLORS.vault);
  layer.addChild(g);

  const label = new Text({
    text: 'VAULT',
    style: { fill: 0xffffff, fontSize: 48, fontWeight: '700' },
  });
  label.scale.set(0.004);
  label.anchor.set(0.5);
  label.position.set(vx + 0.5, vy + 0.5);
  layer.addChild(label);
}
