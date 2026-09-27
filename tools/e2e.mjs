/**
 * End-to-end browser test: starts the real server (serving the built client)
 * on a temporary database and drives the game in Chromium.
 *
 *   pnpm e2e            (builds the client first)
 *
 * Covers: menu, solo deal/redraw/lock/place, online co-op with two
 * browsers (create, join by code, ready, start, place), Showdown practice,
 * the Card Shop, the end screen and the replay viewer.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url).pathname;
const port = 8900 + Math.floor(Math.random() * 90);
const data = mkdtempSync(join(tmpdir(), 'pokertd-e2e-'));
const base = `http://localhost:${port}`;
let failures = 0;

function check(cond, msg) {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures++;
}

const server = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
  cwd: join(root, 'apps/server'),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: data,
    STATIC_DIR: join(root, 'apps/client/dist'),
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const errors = [];

async function open(name, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.addInitScript(
    (n) =>
      localStorage.setItem('pokertd.settings.v1', JSON.stringify({ name: n, tutorialDone: true })),
    name,
  );
  await page.goto(base);
  await page.waitForFunction(() => window.pokertd?.store.online.value === 'open', null, {
    timeout: 10_000,
  });
  return page;
}

async function placeTowers(page, lane, n) {
  const tiles = await page.evaluate(
    (l) => window.pokertd.store.match.value.layout.lanes[l].buildTiles,
    lane,
  );
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('d');
    await page.waitForFunction(() => !!window.pokertd.store.snap.value?.you?.hand);
    await page.keyboard.press(' ');
    await page.waitForFunction(() => window.pokertd.store.snap.value?.you?.blueprints.length > 0);
    const before = await page.evaluate(() => window.pokertd.store.myTowers.value.length);
    const free = await page.evaluate((list) => {
      const taken = new Set(window.pokertd.store.towers.value.map((t) => `${t.x},${t.y}`));
      return list.filter(([x, y]) => !taken.has(`${x},${y}`))[3];
    }, tiles);
    const pt = await page.evaluate(([x, y]) => window.pokertd.tileToClient(x, y), free);
    await page.mouse.click(pt.x, pt.y);
    await page.waitForFunction((k) => window.pokertd.store.myTowers.value.length > k, before);
  }
}

try {
  // ---- Solo
  const solo = await open('solo');
  check((await solo.textContent('.status')).includes('online'), 'client connects to the server');
  await solo.click('.menu-card button.btn:has-text("Solo")');
  await solo.click('.modal button.btn:has-text("Deal them in")');
  await solo.waitForFunction(() => window.pokertd.store.screen.value === 'game');
  await solo.keyboard.press('d');
  await solo.waitForFunction(() => !!window.pokertd.store.snap.value?.you?.hand);
  await solo.keyboard.press('1');
  await solo.keyboard.press('r');
  await solo.waitForFunction(() => window.pokertd.store.snap.value?.you?.hand?.redrawsUsed === 1);
  check(true, 'solo: deal and free redraw');
  await solo.keyboard.press(' ');
  await solo.waitForFunction(() => window.pokertd.store.snap.value?.you?.blueprints.length === 1);
  const tiles = await solo.evaluate(
    () => window.pokertd.store.match.value.layout.lanes[0].buildTiles,
  );
  const pt = await solo.evaluate(([x, y]) => window.pokertd.tileToClient(x, y), tiles[2]);
  await solo.mouse.click(pt.x, pt.y);
  await solo.waitForFunction(() => window.pokertd.store.myTowers.value.length === 1);
  check(true, 'solo: lock and place a tower by clicking the board');
  await solo.evaluate(() => (window.pokertd.store.currentLink().match.players.you.gold = 500));
  await placeTowers(solo, 0, 3);
  await solo.evaluate(() => {
    const m = window.pokertd.store.currentLink().match;
    m.wave.nextAt = m.tick + 1;
  });
  await solo.waitForFunction(() => window.pokertd.store.snap.value?.creeps.length > 0, null, {
    timeout: 15_000,
  });
  check(true, 'solo: wave spawns creeps');
  await solo.waitForFunction(() => window.pokertd.store.players.value[0]?.stats?.kills > 0, null, {
    timeout: 30_000,
  });
  check(true, 'solo: towers kill creeps');

  // ---- Online co-op with two browsers
  const a = await open('Alex');
  const b = await open('Sam');
  await a.click('.menu-card button.btn:has-text("Create room")');
  await a.click('.modal button.btn:has-text("Create room")');
  await a.waitForSelector('.lobby h1');
  const code = (await a.textContent('.lobby h1')).trim().slice(-5);
  await b.fill('input[aria-label="Room code"]', code);
  await b.click('.join-row button');
  await b.waitForSelector('.lobby h1');
  check(true, `online: second player joins room ${code} by code`);
  await b.click('.seats button.btn:has-text("Ready")');
  await a.waitForFunction(() => window.pokertd.store.lobby.value?.seats[1]?.ready === true);
  await a.click('text=Deal them in');
  await a.waitForFunction(() => window.pokertd.store.screen.value === 'game');
  await b.waitForFunction(() => window.pokertd.store.screen.value === 'game');
  check(true, 'online: host starts the match for both players');
  await placeTowers(a, 0, 2);
  await placeTowers(b, 1, 2);
  await a.waitForFunction(() => window.pokertd.store.towers.value.length >= 4, null, {
    timeout: 5_000,
  });
  check(true, 'online: each player sees the other player’s towers');
  const bHand = await b.evaluate(() =>
    window.pokertd.store.players.value.find((p) => p.id === 'p1'),
  );
  check(bHand && !('deck' in bHand), 'online: no private data from other players in snapshots');

  // ---- Showdown practice, shop, end screen, replay
  const sd = await open('Shark');
  await sd.click('.menu-card button.btn:has-text("Showdown practice")');
  await sd.click('.modal button.btn:has-text("Deal them in")');
  await sd.waitForFunction(() => window.pokertd.store.screen.value === 'game');
  await sd.evaluate(() => {
    const m = window.pokertd.store.currentLink().match;
    m.players.you.gold = 900;
    m.wave.n = 5;
    m.wave.nextAt = m.tick + 1;
  });
  await sd.waitForSelector('.shop .offer');
  check(
    (await sd.locator('.shop .offer').count()) === 3,
    'showdown: Card Shop opens with 3 offers on wave 6',
  );
  await sd.keyboard.press('Escape');
  await sd.click('.raise button.btn:has-text("Grunt")');
  await sd.waitForFunction(
    () => window.pokertd.store.players.value.find((p) => p.id === 'you')?.income > 0,
  );
  check(true, 'showdown: raising increases income');
  await sd.evaluate(() => {
    const m = window.pokertd.store.currentLink().match;
    for (const id of Object.keys(m.players)) if (id !== 'you') m.players[id].lives = 0;
  });
  await sd.waitForSelector('.end-card');
  check(
    (await sd.textContent('.end-card h1')).includes('Last one standing'),
    'showdown: winner sees the end screen',
  );
  await sd.click('.end-card button.btn:has-text("Watch replay")');
  await sd.waitForSelector('.replay-controls');
  check(true, 'replay viewer opens');

  check(
    errors.length === 0,
    `no browser errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`,
  );
} catch (e) {
  failures++;
  console.error('✘ e2e aborted:', e.message);
} finally {
  await browser.close();
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
