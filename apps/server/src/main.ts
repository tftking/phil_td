import { startServer } from './server';

const port = Number(process.env.PORT ?? 8787);
const server = await startServer(port);
console.log(`Poker TD server listening on :${server.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void server.close().then(() => process.exit(0));
  });
}
