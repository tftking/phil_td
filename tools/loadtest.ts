/**
 * Server load test: runs many rooms of bots in one process through the same
 * Room code the server uses (snapshots are built and encoded for a fake
 * client per seat) and reports tick cost.
 *
 *   pnpm loadtest --rooms 200 --players 6 --seconds 60
 */
import { parseArgs } from 'node:util';
import { encode } from '../packages/protocol/src/index';
import { type Client, Room } from '../apps/server/src/room';

const { values } = parseArgs({
  options: {
    rooms: { type: 'string', default: '100' },
    players: { type: 'string', default: '6' },
    seconds: { type: 'string', default: '60' },
  },
});
const roomCount = Number(values.rooms);
const players = Number(values.players);
const seconds = Number(values.seconds);

let bytes = 0;
const hooks = { onEnd: () => {}, onEmpty: () => {}, onMatchStart: () => {} };
const rooms: Room[] = [];
for (let r = 0; r < roomCount; r++) {
  const room = new Room(
    `R${r}`.padEnd(5, '0'),
    { mode: 'coop', map: 'felt', difficulty: 'standard' },
    hooks,
  );
  // One fake human per room receives snapshots, the rest are bots.
  const viewer: Client = {
    id: `c${r}`,
    profileId: '',
    name: 'viewer',
    level: 1,
    room: null,
    seat: null,
    towersVersion: -1,
    send: (msg) => {
      bytes += encode(msg).byteLength;
    },
  };
  room.join(viewer);
  for (let i = 1; i < players; i++) room.addBot('smart');
  room.start();
  rooms.push(room);
}

const ticks = seconds * 20;
const perTick: number[] = [];
const started = performance.now();
for (let t = 0; t < ticks; t++) {
  const t0 = performance.now();
  for (const room of rooms) room.runTicks(1);
  perTick.push((performance.now() - t0) / rooms.length);
  if (t % 200 === 0) process.stderr.write(`\rtick ${t}/${ticks}`);
}
const total = (performance.now() - started) / 1000;
perTick.sort((a, b) => a - b);
const pct = (p: number) => perTick[Math.floor(perTick.length * p)]!.toFixed(3);
const creeps = rooms.reduce((s, r) => s + (r.state?.creeps.length ?? 0), 0);
const towers = rooms.reduce((s, r) => s + (r.state?.towers.length ?? 0), 0);
console.log(
  `\n${roomCount} rooms × ${players} players, ${seconds}s of game time in ${total.toFixed(1)}s wall`,
);
console.log(`per-room tick: p50 ${pct(0.5)} ms, p99 ${pct(0.99)} ms`);
console.log(
  `real-time capacity at this load: ${((seconds / total) * roomCount).toFixed(0)} rooms per core`,
);
console.log(`snapshot bytes per viewer: ${(bytes / roomCount / seconds / 1024).toFixed(1)} KB/s`);
console.log(`final: ${creeps} creeps, ${towers} towers across all rooms`);
