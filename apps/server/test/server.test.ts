import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type C2S, type S2C, decodeS2C, encode } from '@pokertd/protocol';
import { type GameServer, startServer } from '../src/server';

let server: GameServer;
beforeEach(async () => {
  server = await startServer(0, '127.0.0.1');
});
afterEach(async () => {
  await server.close();
});

const base = () => `127.0.0.1:${server.port}`;

async function createRoom(): Promise<string> {
  const res = await fetch(`http://${base()}/rooms`, { method: 'POST' });
  return ((await res.json()) as { code: string }).code;
}

/** A test client that queues every server message. */
async function connect() {
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
  return {
    send: (m: C2S) => ws.send(encode(m)),
    async next<T extends S2C['t']>(t: T): Promise<Extract<S2C, { t: T }>> {
      for (;;) {
        const i = inbox.findIndex((m) => m.t === t);
        if (i >= 0) return inbox.splice(i, 1)[0] as Extract<S2C, { t: T }>;
        await new Promise<void>((r) => waiters.push(r));
      }
    },
    close: () => ws.close(),
  };
}

describe('server', () => {
  it('reports health', async () => {
    const res = await fetch(`http://${base()}/health`);
    expect(await res.json()).toMatchObject({ ok: true, rooms: 0 });
  });

  it('lets two players join a lobby and ready up', async () => {
    const code = await createRoom();
    const a = await connect();
    a.send({ t: 'join', room: code, name: 'Alex' });
    expect((await a.next('welcome')).you).toBe('p1');
    await a.next('lobby');

    const b = await connect();
    b.send({ t: 'join', room: code, name: 'Sam' });
    await b.next('welcome');
    const lobby = await a.next('lobby');
    expect(lobby.state.players.map((p) => p.name)).toEqual(['Alex', 'Sam']);
    expect(lobby.state.players[0]!.host).toBe(true);

    b.send({ t: 'ready', ready: true });
    await b.next('lobby');
    const afterReady = await a.next('lobby');
    expect(afterReady.state.players[1]!.ready).toBe(true);
    a.close();
    b.close();
  });

  it('reconnects a player by token', async () => {
    const code = await createRoom();
    const a = await connect();
    const b = await connect();
    a.send({ t: 'join', room: code, name: 'Alex' });
    const { token } = await a.next('welcome');
    b.send({ t: 'join', room: code, name: 'Sam' });
    await b.next('welcome');
    a.close();
    const disconnected = await b.next('lobby').then(() => b.next('lobby'));
    expect(disconnected.state.players[0]!.connected).toBe(false);

    const a2 = await connect();
    a2.send({ t: 'join', room: code, name: 'Alex', token });
    expect((await a2.next('welcome')).you).toBe('p1');
    a2.close();
    b.close();
  });

  it('rejects bad joins and invalid messages', async () => {
    const c = await connect();
    c.send({ t: 'join', room: 'ZZZZZ', name: 'x' });
    expect((await c.next('reject')).reason).toBe('room_not_found');
    c.send({ t: 'deal' });
    expect((await c.next('reject')).reason).toBe('not_in_room');
    c.send({ t: 'redraw', idx: [9] } as C2S);
    expect((await c.next('reject')).reason).toBe('bad_message');
    c.close();
  });
});
