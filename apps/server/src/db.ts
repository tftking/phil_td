import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite persistence (node:sqlite, no native build step). One file holds
 * profiles, match history, Daily Deal scores and reports. Swapping to
 * Postgres later only touches this module.
 */
export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  best_wave INTEGER NOT NULL DEFAULT 0,
  hands INTEGER NOT NULL DEFAULT 0,
  best_hand INTEGER NOT NULL DEFAULT -1,
  hand_book TEXT NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0,0]',
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  seed INTEGER NOT NULL,
  label TEXT,
  result TEXT NOT NULL,
  wave INTEGER NOT NULL,
  winner INTEGER,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  players TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  seat TEXT NOT NULL,
  won INTEGER NOT NULL,
  stats TEXT NOT NULL,
  PRIMARY KEY (match_id, seat)
);
CREATE INDEX IF NOT EXISTS match_players_profile ON match_players(profile_id);
CREATE TABLE IF NOT EXISTS daily_scores (
  day TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  name TEXT NOT NULL,
  wave INTEGER NOT NULL,
  lives INTEGER NOT NULL,
  won INTEGER NOT NULL,
  match_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (day, profile_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  reported TEXT NOT NULL,
  room TEXT NOT NULL,
  reason TEXT NOT NULL,
  at INTEGER NOT NULL
);
`;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
