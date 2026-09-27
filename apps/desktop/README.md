# Poker TD desktop (Tauri)

A native window around the web client. Solo, Showdown practice, the tutorial
and replays work offline. Online play talks to the server set at build time.

```sh
# from the repo root
pnpm install
cd apps/desktop
VITE_SERVER_URL=https://play.example.com pnpm build   # installers in src-tauri/target/release/bundle/
pnpm dev                                             # dev window against the Vite dev server
pnpm icons                                           # regenerate icons from icon-source.png
```

Requirements: Rust (stable) and, on Linux, WebKitGTK:
`sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev`.

Verified here: a Linux `.deb` (about 2 MB) builds and launches. Windows (`.msi`/`.exe`)
and macOS (`.dmg`) builds use the same config but must be built on those systems.
Steam distribution (Steamworks SDK, achievements, lobby invites) is not wired up yet.
