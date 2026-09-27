import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type C2S, type S2C, decodeS2C, encode } from '@pokertd/protocol';
import { type Replay, ReplayPlayer, hashState } from '@pokertd/sim';
import { type GameServer, dailySeed, dayOf, startServer } from '../src/server';

let server: GameServer;
let dir: string;
let clock = 1_700_000_000_000;
const now = () => clock;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pokertd-test-'));
  server = await startServer({
    host: '127.0.0.1',
    dbPath: join(dir, 'db.sqlite'),
    replayDir: join(dir, 'replays'),
    manualClock: true,
    now,
  });
});
afterEach(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

const base = () => `127.0.0.1:${server.port}`;

/** A test client that queues every server message. */
async function connect(name = 'Alex', token?: string) {
  const ws = new WebSocket(`ws://${base()}/ws`);
  const inbox: S2C[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (data) => {
    inbox.push(decodeS2C(data as Buffer));
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const client = {
    ws,
    inbox,
    send: (m: C2S) => ws.send(encode(m)),
    async next<T extends S2C['t']>(
      t: T,
      pred: (m: Extract<S2C, { t: T }>) => boolean = () => true,
    ): Promise<Extract<S2C, { t: T }>> {
      for (;;) {
        const i = inbox.findIndex((m) => m.t === t && pred(m as Extract<S2C, { t: T }>));
        if (i >= 0) return inbox.splice(i, 1)[0] as Extract<S2C, { t: T }>;
        await new Promise<void>((r) => waiters.push(r));
      }
    },
    drain: () => inbox.splice(0),
    close: () => ws.close(),
  };
  client.send({ t: 'hello', name, ...(token ? { token } : {}) });
  const profile = await client.next('profile');
  return { ...client, profile: profile.profile, token: profile.token };
}

const coop = { mode: 'coop', map: 'felt', difficulty: 'standard' } as const;

async function lobbyOfTwo() {
  const a = await connect('Alex');
  a.send({ t: 'create', options: coop });
  const welcome = await a.next('welcome');
  const b = await connect('Sam');
  b.send({ t: 'join', room: welcome.room });
  const bWelcome = await b.next('welcome');
  return { a, b, code: welcome.room, bSeat: bWelcome.seat! };
}

describe('http', () => {
  it('reports health and metrics', async () => {
    expect(await (await fetch(`http://${base()}/health`)).json()).toMatchObject({
      ok: true,
      rooms: 0,
    });
    expect(await (await fetch(`http://${base()}/metrics`)).json()).toMatchObject({ rooms: 0 });
  });
});

describe('client error reports', () => {
  it('accepts and rate-limits reports', async () => {
    const post = () =>
      fetch(`http://${base()}/client-errors`, {
        method: 'POST',
        body: JSON.stringify({ message: 'boom' }),
      });
    expect((await post()).status).toBe(204);
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await post()).status);
    expect(statuses).toContain(429);
  });
});

describe('profiles', () => {
  it('creates a guest profile and logs back in with its token', async () => {
    const a = await connect('Alex');
    expect(a.profile.level).toBe(1);
    a.close();
    const again = await connect('Ignored', a.token);
    expect(again.profile.id).toBe(a.profile.id);
    expect(again.profile.name).toBe('Alex');
    again.close();
  });

  it('requires hello first', async () => {
    const ws = new WebSocket(`ws://${base()}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(encode({ t: 'create', options: coop }));
    const msg = await new Promise<S2C>((r) => ws.once('message', (d) => r(decodeS2C(d as Buffer))));
    expect(msg).toMatchObject({ t: 'reject', reason: 'no_profile' });
    ws.close();
  });
});

describe('lobby', () => {
  it('seats players, lets only the host start, and adds bots', async () => {
    const { a, b } = await lobbyOfTwo();
    const lobby = await a.next('lobby', (m) => m.state.seats.length === 2);
    expect(lobby.state.seats.map((s) => s.name)).toEqual(['Alex', 'Sam']);
    expect(lobby.state.seats[0]!.host).toBe(true);

    b.send({ t: 'start' });
    expect((await b.next('reject')).reason).toBe('not_host');
    a.send({ t: 'start' });
    expect((await a.next('reject')).reason).toBe('not_ready');

    a.send({ t: 'addBot', style: 'smart' });
    await a.next('lobby', (m) => m.state.seats.length === 3);
    b.send({ t: 'ready', ready: true });
    await a.next('lobby', (m) => m.state.seats[1]?.ready === true);
    a.send({ t: 'start' });
    const start = await b.next('start');
    expect(start.settings.players).toHaveLength(3);
    expect(start.you).toBe('p2');
    a.close();
    b.close();
  });

  it('rejects invalid settings and unknown rooms', async () => {
    const a = await connect();
    a.send({ t: 'create', options: { mode: 'coop', map: 'vegas', difficulty: 'standard' } });
    expect((await a.next('reject')).reason).toBe('bad_settings');
    a.send({ t: 'join', room: 'ZZZZZ' });
    expect((await a.next('reject')).reason).toBe('room_not_found');
    a.send({ t: 'act', intent: { t: 'deal' } });
    expect((await a.next('reject')).reason).toBe('not_in_room');
    a.send({ t: 'act', intent: { t: 'redraw', idx: [9] } } as C2S);
    expect((await a.next('reject')).reason).toBe('bad_message');
    a.close();
  });
});

describe('match', () => {
  it('runs an authoritative match with private snapshots and reconnects', async () => {
    const { a, b, code, bSeat } = await lobbyOfTwo();
    b.send({ t: 'ready', ready: true });
    await a.next('lobby', (m) => m.state.seats[1]?.ready === true);
    a.send({ t: 'start' });
    await a.next('start');
    await b.next('start');
    const room = server.rooms.get(code)!;

    a.send({ t: 'act', intent: { t: 'deal' }, ref: 1 });
    await new Promise((r) => setTimeout(r, 50));
    room.runTicks(2);
    expect((await a.next('result', (m) => m.ref === 1)).result).toEqual({ ok: true });
    const snapA = await a.next('snap', (m) => !!m.snap.you?.hand);
    expect(snapA.snap.you!.hand!.cards).toHaveLength(5);
    room.runTicks(8);
    const snapB = await b.next(
      'snap',
      (m) => !!m.snap.players?.find((p) => p.id === 'p1')?.holdingHand,
    );
    expect(snapB.snap.you!.hand).toBeNull();

    // B drops and comes back with the seat token.
    b.close();
    await a.next('chat', (m) => !!m.system && m.text.includes('disconnected'));
    room.runTicks(400);
    const b2 = await connect('Sam', b.token);
    b2.send({ t: 'join', room: code, seat: bSeat });
    expect((await b2.next('welcome')).you).toBe('p2');
    await b2.next('start');
    const resync = await b2.next('snap');
    expect(resync.snap.towers).toBeDefined();
    expect(resync.snap.tick).toBe(room.state!.tick);
    a.close();
    b2.close();
  });

  it('saves a replay that reproduces the match exactly', async () => {
    const a = await connect('Alex');
    a.send({ t: 'create', options: coop });
    const { room: code } = await a.next('welcome');
    a.send({ t: 'addBot', style: 'smart' });
    await a.next('lobby', (m) => m.state.seats.length === 2);
    a.send({ t: 'start' });
    await a.next('start');
    const room = server.rooms.get(code)!;
    a.send({ t: 'act', intent: { t: 'deal' } });
    await new Promise((r) => setTimeout(r, 50));
    room.runTicks(3000);

    const state = room.state!;
    state.events.length = 0;
    const midHash = hashState(state);
    const ticks = state.tick;
    state.lives = 0; // force the end
    room.runTicks(1);
    const end = await a.next('end');
    expect(end.result.result).toBe('lost');
    expect(end.result.xpGained).toBeGreaterThan(0);
    expect(end.result.profile!.stats.matches).toBe(1);

    const replay = (await (
      await fetch(`http://${base()}/replays/${end.result.replayId}`)
    ).json()) as Replay;
    expect(replay.inputs.length).toBeGreaterThan(5);
    const player = new ReplayPlayer(replay);
    for (let i = 0; i < ticks; i++) {
      player.step();
      player.state.events.length = 0;
    }
    expect(hashState(player.state)).toBe(midHash);

    a.send({ t: 'rematch' });
    await a.next('lobby', (m) => m.state.status === 'lobby');
    a.close();
  });
});

describe('social', () => {
  it('filters and rate-limits chat, relays pings', async () => {
    const { a, b } = await lobbyOfTwo();
    a.send({ t: 'chat', text: 'well shit that leaked' });
    const msg = await b.next('chat', (m) => !m.system);
    expect(msg.text).toBe('well s*** that leaked');
    for (let i = 0; i < 6; i++) a.send({ t: 'chat', text: `spam ${i}` });
    expect((await a.next('reject')).reason).toBe('muted');
    a.send({ t: 'ping', kind: 'help', x: 4, y: 2 });
    expect(await b.next('ping')).toMatchObject({ from: 'p1', kind: 'help' });
    a.close();
    b.close();
  });
});

describe('quick play and daily', () => {
  it('groups queued players into a match after the wait', async () => {
    const a = await connect('A');
    const b = await connect('B');
    a.send({ t: 'quickPlay', mode: 'coop' });
    b.send({ t: 'quickPlay', mode: 'coop' });
    await b.next('queue', (m) => m.waiting === 2);
    clock += 21_000;
    server.maintain();
    const sa = await a.next('start');
    const sb = await b.next('start');
    expect(sa.settings.players).toHaveLength(2);
    expect(sb.you).toBe('p2');
    a.close();
    b.close();
  });

  it('starts the Daily Deal with the day seed and ranks results', async () => {
    const a = await connect('Alex');
    a.send({ t: 'daily' });
    const start = await a.next('start');
    const day = dayOf(clock);
    expect(start.settings.seed).toBe(dailySeed(day));
    const room = [...server.rooms.values()][0]!;
    room.runTicks(1200);
    room.state!.lives = 0;
    room.runTicks(1);
    await a.next('end');
    const board = (await (await fetch(`http://${base()}/leaderboard/daily?day=${day}`)).json()) as {
      scores: { name: string; wave: number }[];
    };
    expect(board.scores[0]!.name).toBe('Alex');
    expect(board.scores[0]!.wave).toBeGreaterThanOrEqual(1);
    a.close();
  });
});
