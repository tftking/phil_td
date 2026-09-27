import { defineConfig } from 'vite';

// In dev, the game server runs on :8787; proxy its WebSocket and HTTP API.
const server = 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: server, ws: true },
      '/rooms': server,
      '/replays': server,
      '/leaderboard': server,
      '/profiles': server,
      '/health': server,
    },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
