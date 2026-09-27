import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server';

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
// Serve the built web client if it exists (pnpm start builds it first).
const builtClient = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
const staticDir =
  process.env.STATIC_DIR ?? (existsSync(join(builtClient, 'index.html')) ? builtClient : null);

const server = await startServer({
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? join(dataDir, 'pokertd.sqlite'),
  replayDir: process.env.REPLAY_DIR ?? join(dataDir, 'replays'),
  staticDir,
});
console.log(`Poker TD server listening on :${server.port}`);
if (staticDir) console.log(`Open http://localhost:${server.port} to play`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void server.close().then(() => process.exit(0));
  });
}
