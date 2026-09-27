# Deploying Poker TD

One process serves both the game server (WebSocket + HTTP API) and the built
web client. State lives in one SQLite file plus a folder of gzipped replays.

## Docker (recommended)

```sh
docker build -t pokertd .
docker run -d --name pokertd -p 8787:8787 -v pokertd-data:/data pokertd
# open http://localhost:8787
```

- The image runs as the unprivileged `node` user and keeps data in the `/data` volume.
- A built-in health check hits `/health`.
- Put it behind any TLS-terminating proxy (Caddy, nginx, a cloud load balancer).
  WebSockets need `Upgrade` headers passed through on `/ws`.

Example Caddyfile:

```
play.example.com {
  reverse_proxy localhost:8787
}
```

## Fly.io (or any container host)

```sh
fly launch --no-deploy          # accept the Dockerfile, pick one region
fly volumes create pokertd_data --size 1
# in fly.toml: [mounts] source = "pokertd_data", destination = "/data"
#              [http_service] internal_port = 8787
fly deploy
```

Keep a **single instance**: rooms live in memory, and SQLite is a single file.

## Without Docker

```sh
pnpm install
pnpm start        # builds the client, then serves everything on :8787
```

## Configuration

| Variable          | Default                    | Meaning                                                                                |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `PORT`            | `8787`                     | HTTP/WebSocket port                                                                    |
| `DATA_DIR`        | `./data`                   | Where the database and replays go                                                      |
| `DB_PATH`         | `$DATA_DIR/pokertd.sqlite` | SQLite file                                                                            |
| `REPLAY_DIR`      | `$DATA_DIR/replays`        | Replay folder                                                                          |
| `STATIC_DIR`      | unset                      | Serve the built client from here                                                       |
| `VITE_SERVER_URL` | same origin                | **Client build time.** Server URL for clients hosted elsewhere (desktop builds, a CDN) |

## Endpoints

| Path                                    | What                                                            |
| --------------------------------------- | --------------------------------------------------------------- |
| `GET /health`                           | Liveness                                                        |
| `GET /metrics`                          | Rooms, connections, tick p50/p99, bytes/s, matches, disconnects |
| `GET /rooms`                            | Public lobbies                                                  |
| `GET /replays/:id`                      | A replay as JSON                                                |
| `GET /leaderboard/daily?day=YYYY-MM-DD` | Daily Deal top 50                                               |
| `GET /profiles/:id`                     | Public profile and recent matches                               |
| `POST /client-errors`                   | Browser error reports (logged as JSON)                          |
| `WS /ws`                                | Game protocol (msgpack)                                         |

## Capacity

`pnpm loadtest --rooms 100 --players 6` runs rooms through the real room code.
On one core, a 6-player room costs about 0.04 ms per tick (p99 0.18 ms), which
is roughly **1,100 simultaneous six-player rooms per core**. Snapshots are about
7–8 KB/s per player. Bandwidth, not CPU, is the first limit.

## Backups

Copy `/data` (the SQLite file with its `-wal` file, and `replays/`). SQLite runs
in WAL mode, so use `sqlite3 pokertd.sqlite ".backup backup.sqlite"` for a
consistent copy while the server is running.

## Desktop builds

See `apps/desktop`. Build the client with `VITE_SERVER_URL=https://play.example.com`
so the desktop app can find your server; solo, practice and the tutorial work offline.

```sh
cd apps/desktop
VITE_SERVER_URL=https://play.example.com pnpm bundle   # .deb/.AppImage on Linux, .msi/.exe on Windows, .dmg on macOS
```

Linux builds need WebKitGTK (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`).
