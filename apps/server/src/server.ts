import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { type C2S, type RoomOptions, type S2C, decodeC2S, encode } from '@pokertd/protocol';
import { hashString } from '@pokertd/sim';
import { type Db, openDb } from './db';
import { Matchmaker, type QueueMode } from './matchmaker';
import { Metrics } from './metrics';
import { RateLimiter, filterChat } from './moderation';
import { Profiles } from './profiles';
import { ReplayStore } from './replays';
import { type Client, type MatchRecord, Room, newRoomCode } from './room';

export interface ServerOptions {
  port?: number;
  host?: string;
  /** SQLite file, or ':memory:'. */
  dbPath?: string;
  /** Where replays are stored; null disables saving. */
  replayDir?: string | null;
  /** Serve the built client from this directory (single-container deploys). */
  staticDir?: string | null;
  /** Injected clock for tests. */
  now?: () => number;
  /** Disable the real-time loops (tests drive rooms directly). */
  manualClock?: boolean;
}

export interface GameServer {
  http: Server;
  port: number;
  rooms: Map<string, Room>;
  db: Db;
  profiles: Profiles;
  matchmaker: Matchmaker;
  metrics: Metrics;
  /** Runs one housekeeping pass (tests). */
  maintain(): void;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 4096;
const MAX_MESSAGES_PER_SECOND = 30;
const MAX_ROOMS_PER_IP = 3;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

/** UTC day, e.g. "2026-09-27". */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The Daily Deal seed: the same for everyone on a given UTC day. */
export const dailySeed = (day: string): number =>
  parseInt(hashString(`daily:${day}`).slice(0, 8), 16);

export async function startServer(opts: ServerOptions = {}): Promise<GameServer> {
  const now = opts.now ?? Date.now;
  const db = openDb(opts.dbPath ?? ':memory:');
  const profiles = new Profiles(db);
  const replays = new ReplayStore(opts.replayDir ?? null);
  const metrics = new Metrics();
  const rooms = new Map<string, Room>();
  const roomIps = new WeakMap<Room, string>();
  const chatLimiter = new RateLimiter(5, 10_000);
  const errorLimiter = new RateLimiter(10, 60_000);

  const hooks = {
    onMatchStart: () => metrics.matchesStarted++,
    onEmpty: (room: Room) => rooms.delete(room.code),
    onEnd: (record: MatchRecord) => finishMatch(record),
  };

  function makeRoom(options: RoomOptions): Room {
    let code = newRoomCode();
    while (rooms.has(code)) code = newRoomCode();
    const room = new Room(code, options, hooks, now);
    rooms.set(code, room);
    return room;
  }

  const matchmaker = new Matchmaker((mode: QueueMode, clients: Client[]) => {
    const room = makeRoom(
      mode === 'coop'
        ? { mode, map: 'felt', difficulty: 'standard', botTakeover: true }
        : { mode, map: 'vegas', difficulty: 'standard', botTakeover: true },
    );
    for (const c of clients) room.join(c);
    if (mode === 'showdown') while (room.seats.length < 4) room.addBot('raiser');
    room.system('Quick Play match found. Starting…');
    room.start();
  }, now);

  /** Records a finished match: history, profiles, Daily Deal, replay, results. */
  function finishMatch({ room, state, replay, startedAt }: MatchRecord): void {
    metrics.matchesFinished++;
    const matchId = randomBytes(8).toString('hex');
    const coop = state.settings.mode === 'coop';
    const players = state.order.map((id) => state.players[id]!);
    db.prepare(
      `INSERT INTO matches (id, room, mode, map, difficulty, seed, label, result, wave, winner, started_at, ended_at, players)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      matchId,
      room.code,
      state.settings.mode,
      state.settings.map,
      state.settings.difficulty,
      state.settings.seed,
      state.settings.label ?? null,
      state.phase,
      state.wave.n,
      state.winner,
      startedAt,
      now(),
      JSON.stringify(players.map((p) => ({ seat: p.id, name: p.name, team: p.team }))),
    );
    replays.save(matchId, replay);

    for (const seat of room.seats) {
      const p = state.players[seat.id];
      if (!p || !seat.profileId) continue;
      const won = coop ? state.phase === 'won' : state.winner === p.team;
      db.prepare(
        'INSERT INTO match_players (match_id, profile_id, seat, won, stats) VALUES (?, ?, ?, ?, ?)',
      ).run(matchId, seat.profileId, seat.id, won ? 1 : 0, JSON.stringify(p.stats));
      const wave = coop ? state.wave.n : p.busted ? p.bustedWave : state.wave.n;
      const xpGained = profiles.recordMatch(seat.profileId, {
        won,
        wave,
        handCounts: p.stats.handCounts,
        bestHand: p.stats.bestHand,
      });
      if (room.label?.startsWith('daily:')) {
        const day = room.label.slice(6);
        const lives = state.lives;
        const prev = db
          .prepare('SELECT wave, lives FROM daily_scores WHERE day = ? AND profile_id = ?')
          .get(day, seat.profileId) as { wave: number; lives: number } | undefined;
        if (!prev || wave > prev.wave || (wave === prev.wave && lives > prev.lives)) {
          db.prepare(
            `INSERT OR REPLACE INTO daily_scores (day, profile_id, name, wave, lives, won, match_id, at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(day, seat.profileId, seat.name, wave, lives, won ? 1 : 0, matchId, now());
        }
      }
      seat.client?.send({
        t: 'end',
        result: {
          result: coop ? (state.phase === 'won' ? 'won' : 'lost') : won ? 'won' : 'lost',
          winner: state.winner,
          wave: state.wave.n,
          replayId: opts.replayDir === null ? null : matchId,
          xpGained,
          profile: profiles.get(seat.profileId),
        },
      });
    }
    for (const c of room.spectators) {
      c.send({
        t: 'end',
        result: {
          result: state.phase === 'won' ? 'won' : 'lost',
          winner: state.winner,
          wave: state.wave.n,
          replayId: matchId,
          xpGained: 0,
          profile: null,
        },
      });
    }
  }

  // ---------------------------------------------------------------- HTTP

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
    if (!opts.staticDir) return false;
    const root = resolve(opts.staticDir);
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = normalize(join(root, url));
    if (!file.startsWith(root)) return false;
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    if (!existsSync(file)) return false;
    const ext = extname(file);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': url.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(readFileSync(file));
    return true;
  }

  const http = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { ok: true, rooms: rooms.size, protocol: 2 });
    }
    if (req.method === 'GET' && path === '/metrics') {
      const playing = [...rooms.values()].filter((r) => r.status === 'playing').length;
      return json(res, 200, metrics.snapshot({ rooms: rooms.size, playing }));
    }
    if (req.method === 'GET' && path === '/rooms') {
      const list = [...rooms.values()]
        .filter((r) => !r.options.private && !r.label && r.status === 'lobby')
        .map((r) => ({
          code: r.code,
          mode: r.options.mode,
          map: r.options.map,
          difficulty: r.options.difficulty,
          players: r.seats.length,
          maxPlayers: r.limits.max,
          status: r.status,
        }));
      return json(res, 200, list);
    }
    const replay = /^\/replays\/([a-f0-9]{16})$/.exec(path);
    if (req.method === 'GET' && replay) {
      const r = replays.load(replay[1]!);
      return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
    }
    if (req.method === 'GET' && path === '/leaderboard/daily') {
      const day = url.searchParams.get('day') ?? dayOf(now());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json(res, 400, { error: 'bad day' });
      const rows = db
        .prepare(
          'SELECT name, wave, lives, won, match_id AS matchId FROM daily_scores WHERE day = ? ORDER BY wave DESC, lives DESC, at ASC LIMIT 50',
        )
        .all(day);
      return json(res, 200, { day, seed: dailySeed(day), scores: rows });
    }
    const profile = /^\/profiles\/([a-f0-9]{16})$/.exec(path);
    if (req.method === 'GET' && profile) {
      const p = profiles.get(profile[1]!);
      if (!p) return json(res, 404, { error: 'not found' });
      const recent = db
        .prepare(
          `SELECT m.id, m.mode, m.map, m.difficulty, m.result, m.wave, m.ended_at AS endedAt, mp.won
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
           WHERE mp.profile_id = ? ORDER BY m.ended_at DESC LIMIT 20`,
        )
        .all(p.id);
      return json(res, 200, { profile: p, recent });
    }
    if (req.method === 'POST' && path === '/client-errors') {
      const ip = req.socket.remoteAddress ?? '?';
      if (!errorLimiter.allow(ip)) return json(res, 429, { error: 'slow down' });
      let body = '';
      req.on('data', (c: Buffer) => {
        body += c.toString();
        if (body.length > 8192) req.destroy();
      });
      req.on('end', () => {
        try {
          const report = JSON.parse(body) as Record<string, unknown>;
          console.error(
            JSON.stringify({ level: 'error', source: 'client', at: now(), ...report }).slice(
              0,
              4000,
            ),
          );
        } catch {
          // Ignore malformed reports.
        }
        json(res, 204, null);
      });
      return;
    }
    if (req.method === 'GET' && serveStatic(req, res)) return;
    json(res, 404, { error: 'not found' });
  });

  // ----------------------------------------------------------- WebSockets

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (ws, req) => {
    metrics.connections++;
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '?';
    handleConnection(ws, ip);
  });

  function handleConnection(ws: WebSocket, ip: string): void {
    let windowStart = 0;
    let windowCount = 0;
    let identified = false;
    const client: Client = {
      id: randomBytes(6).toString('hex'),
      profileId: '',
      name: '',
      level: 1,
      room: null,
      seat: null,
      towersVersion: -1,
      send: (msg: S2C) => {
        if (ws.readyState !== ws.OPEN) return;
        const bytes = encode(msg);
        metrics.recordBytes(bytes.byteLength);
        ws.send(bytes);
      },
    };
    const reject = (reason: Extract<S2C, { t: 'reject' }>['reason'], ref?: string): void => {
      metrics.rejectedMessages++;
      client.send({ t: 'reject', reason, ...(ref ? { ref } : {}) });
    };

    ws.on('message', (data, isBinary) => {
      if (!isBinary) return reject('bad_message');
      const t = now();
      if (t - windowStart >= 1000) {
        windowStart = t;
        windowCount = 0;
      }
      if (++windowCount > MAX_MESSAGES_PER_SECOND) return reject('rate_limited');
      const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      const decoded = decodeC2S(bytes);
      if (!decoded.ok) return reject('bad_message');
      const msg = decoded.msg;
      if (msg.t === 'hello') {
        const { profile, token } = profiles.login(msg.name, msg.token);
        client.profileId = profile.id;
        client.name = profile.name;
        client.level = profile.level;
        identified = true;
        client.send({ t: 'profile', profile, token });
        return;
      }
      if (!identified) return reject('no_profile', msg.t);
      handle(client, msg, reject, ip);
    });

    ws.on('close', () => {
      metrics.connections--;
      metrics.disconnects++;
      matchmaker.remove(client);
      client.room?.disconnect(client);
    });
  }

  function handle(
    client: Client,
    msg: Exclude<C2S, { t: 'hello' }>,
    reject: (reason: Extract<S2C, { t: 'reject' }>['reason'], ref?: string) => void,
    ip: string,
  ): void {
    const room = client.room;
    switch (msg.t) {
      case 'rename':
        profiles.rename(client.profileId, msg.name);
        client.name = msg.name;
        client.send({ t: 'profile', profile: profiles.get(client.profileId)!, token: '' });
        return;

      case 'create': {
        if (room) return reject('already_in_room', 'create');
        const open = [...rooms.values()].filter((r) => roomIps.get(r) === ip).length;
        if (open >= MAX_ROOMS_PER_IP) return reject('rate_limited', 'create');
        const probe = new Room('XXXXX', msg.options, hooks, now);
        if (!probe.setOptions({})) return reject('bad_settings', 'create');
        const created = makeRoom(msg.options);
        roomIps.set(created, ip);
        created.join(client);
        return;
      }

      case 'join': {
        if (room && room.code !== msg.room) return reject('already_in_room', 'join');
        const target = rooms.get(msg.room);
        if (!target) return reject('room_not_found', 'join');
        matchmaker.remove(client);
        if (target.join(client, msg.seat, msg.spectate) === 'full')
          return reject('room_full', 'join');
        return;
      }

      case 'quickPlay':
        if (room) return reject('already_in_room', 'quickPlay');
        matchmaker.enqueue(client, msg.mode);
        return;

      case 'cancelQueue':
        matchmaker.remove(client);
        client.send({ t: 'queue', status: 'idle', mode: null, waiting: 0, startsIn: null });
        return;

      case 'daily': {
        if (room) return reject('already_in_room', 'daily');
        const day = dayOf(now());
        const daily = makeRoom({
          mode: 'coop',
          map: 'felt',
          difficulty: 'standard',
          private: true,
          botTakeover: false,
        });
        daily.label = `daily:${day}`;
        daily.fixedSeed = dailySeed(day);
        daily.join(client);
        daily.start();
        return;
      }

      case 'report':
        if (!room) return reject('not_in_room', 'report');
        db.prepare(
          'INSERT INTO reports (reporter, reported, room, reason, at) VALUES (?, ?, ?, ?, ?)',
        ).run(client.profileId, msg.player, room.code, msg.reason, now());
        client.send({
          t: 'chat',
          from: '',
          name: '',
          text: 'Thanks, your report was recorded.',
          system: true,
        });
        return;
    }

    if (!room) return reject('not_in_room', msg.t);

    switch (msg.t) {
      case 'leave':
        room.leave(client);
        client.send({ t: 'left' });
        return;
      case 'ready':
        room.setReady(client, msg.ready);
        return;
      case 'settings':
        if (!room.isHost(client)) return reject('not_host', 'settings');
        if (room.status !== 'lobby' || !room.setOptions(msg.options))
          return reject('bad_settings', 'settings');
        return;
      case 'team':
        if (!room.isHost(client)) return reject('not_host', 'team');
        room.setTeam(msg.seat, msg.team);
        return;
      case 'addBot':
        if (!room.isHost(client)) return reject('not_host', 'addBot');
        if (!room.addBot(msg.style)) return reject('room_full', 'addBot');
        return;
      case 'kick':
        if (!room.isHost(client)) return reject('not_host', 'kick');
        room.kick(msg.seat);
        return;
      case 'start': {
        if (!room.isHost(client)) return reject('not_host', 'start');
        if (room.status !== 'lobby') return reject('in_progress', 'start');
        const ok = room.canStart();
        if (ok !== 'ok') return reject(ok, 'start');
        room.start();
        return;
      }
      case 'rematch':
        if (!room.isHost(client)) return reject('not_host', 'rematch');
        room.rematch();
        return;
      case 'act':
        room.act(client, msg.intent, msg.ref);
        return;
      case 'ping':
        if (!client.seat) return;
        room.broadcast({ t: 'ping', from: client.seat, kind: msg.kind, x: msg.x, y: msg.y });
        return;
      case 'chat': {
        if (!chatLimiter.allow(client.id)) return reject('muted', 'chat');
        room.broadcast({
          t: 'chat',
          from: client.seat ?? '',
          name: client.name,
          text: filterChat(msg.text),
        });
        return;
      }
    }
  }

  // ---------------------------------------------------------------- Loops

  function maintain(): void {
    for (const room of [...rooms.values()]) room.maintain();
    matchmaker.tick();
  }

  const timers: NodeJS.Timeout[] = [];
  if (!opts.manualClock) {
    timers.push(
      setInterval(() => {
        for (const room of rooms.values()) {
          if (room.status !== 'playing') continue;
          const t0 = performance.now();
          if (room.advance() > 0) metrics.recordTick(performance.now() - t0);
        }
      }, 25),
    );
    timers.push(setInterval(maintain, 1000));
  }

  await new Promise<void>((done) => http.listen(opts.port ?? 0, opts.host ?? '0.0.0.0', done));
  return {
    http,
    port: (http.address() as AddressInfo).port,
    rooms,
    db,
    profiles,
    matchmaker,
    metrics,
    maintain,
    close: () =>
      new Promise<void>((done) => {
        timers.forEach(clearInterval);
        for (const c of wss.clients) c.terminate();
        wss.close(() =>
          http.close(() => {
            db.close();
            done();
          }),
        );
      }),
  };
}
