import { join } from 'node:path';
import { startServer } from './server';

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
const server = await startServer({
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? join(dataDir, 'pokertd.sqlite'),
  replayDir: process.env.REPLAY_DIR ?? join(dataDir, 'replays'),
  staticDir: process.env.STATIC_DIR ?? null,
});
console.log(`Poker TD server listening on :${server.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void server.close().then(() => process.exit(0));
  });
}
