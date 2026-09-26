import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { PROTOCOL_VERSION, type S2C, decodeC2S, encode } from '@pokertd/protocol';
import { type Room, RoomRegistry, type Seat } from './rooms';

const MAX_INTENTS_PER_SECOND = 30;
const MAX_MESSAGE_BYTES = 4096;

export interface GameServer {
  http: Server;
  rooms: RoomRegistry;
  port: number;
  close(): Promise<void>;
}

/**
 * HTTP + WebSocket entry point.
 *   GET  /health  liveness
 *   POST /rooms   create a lobby, returns { code }
 *   WS   /ws      game connection (msgpack frames)
 */
export async function startServer(port = 0, host = '0.0.0.0'): Promise<GameServer> {
  const rooms = new RoomRegistry();

  const http = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.writeHead(204).end();
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, protocol: PROTOCOL_VERSION }));
    } else if (req.method === 'POST' && req.url === '/rooms') {
      const room = rooms.create();
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ code: room.code }));
    } else {
      res.writeHead(404).end();
    }
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
  wss.on('connection', (ws) => handleConnection(ws, rooms));

  await new Promise<void>((resolve) => http.listen(port, host, resolve));
  return {
    http,
    rooms,
    port: (http.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}

function handleConnection(ws: WebSocket, rooms: RoomRegistry): void {
  let room: Room | undefined;
  let seat: Seat | undefined;
  let windowStart = 0;
  let windowCount = 0;

  const send = (msg: S2C): void => {
    if (ws.readyState === ws.OPEN) ws.send(encode(msg));
  };

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return send({ t: 'reject', reason: 'bad_message' });

    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      windowCount = 0;
    }
    if (++windowCount > MAX_INTENTS_PER_SECOND)
      return send({ t: 'reject', reason: 'rate_limited' });

    const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
    const decoded = decodeC2S(bytes);
    if (!decoded.ok) return send({ t: 'reject', reason: 'bad_message' });
    const msg = decoded.msg;

    if (msg.t === 'join') {
      if (room) return send({ t: 'reject', reason: 'invalid_action', ref: 'join' });
      const target = rooms.get(msg.room);
      if (!target) return send({ t: 'reject', reason: 'room_not_found', ref: 'join' });
      const joined = target.join(msg.name, msg.token, send);
      if (joined === 'full') return send({ t: 'reject', reason: 'room_full', ref: 'join' });
      room = target;
      seat = joined;
      send({ t: 'welcome', you: seat.id, token: seat.token, protocol: PROTOCOL_VERSION });
      room.broadcast({ t: 'lobby', state: room.lobbyState() });
      return;
    }

    if (!room || !seat) return send({ t: 'reject', reason: 'not_in_room', ref: msg.t });

    switch (msg.t) {
      case 'ready':
        seat.ready = msg.ready;
        room.broadcast({ t: 'lobby', state: room.lobbyState() });
        return;
      case 'ack':
        return;
      default:
        // Gameplay intents are wired to the sim in M2.
        return send({ t: 'reject', reason: 'not_implemented', ref: msg.t });
    }
  });

  ws.on('close', () => {
    if (!room || !seat) return;
    room.disconnect(seat);
    if (room.empty) rooms.remove(room.code);
    else room.broadcast({ t: 'lobby', state: room.lobbyState() });
  });
}
