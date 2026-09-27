import { createHash, randomBytes } from 'node:crypto';
import type { Profile } from '@pokertd/protocol';
import type { Db } from './db';

const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Level from XP: each level costs 100 XP more than the last (100, 200, 300…). */
export function levelFor(xp: number): { level: number; nextLevelXp: number } {
  let level = 1;
  let need = 100;
  let spent = 0;
  while (xp >= spent + need) {
    spent += need;
    level++;
    need += 100;
  }
  return { level, nextLevelXp: spent + need };
}

interface Row {
  id: string;
  name: string;
  xp: number;
  matches: number;
  wins: number;
  best_wave: number;
  hands: number;
  best_hand: number;
  hand_book: string;
}

function toProfile(r: Row): Profile {
  const handBook = JSON.parse(r.hand_book) as number[];
  return {
    id: r.id,
    name: r.name,
    xp: r.xp,
    ...levelFor(r.xp),
    stats: {
      matches: r.matches,
      wins: r.wins,
      bestWave: r.best_wave,
      royalFlushes: handBook[9] ?? 0,
      handsPlayed: r.hands,
      bestHand: r.best_hand,
    },
    handBook,
  };
}

/** Guest accounts: a random token held by the client identifies the profile. */
export class Profiles {
  constructor(private readonly db: Db) {}

  /** Finds the profile for a token, or creates a new guest profile. */
  login(name: string, token?: string): { profile: Profile; token: string } {
    const now = Date.now();
    if (token) {
      const row = this.db
        .prepare('SELECT * FROM profiles WHERE token_hash = ?')
        .get(hash(token)) as Row | undefined;
      if (row) {
        this.db.prepare('UPDATE profiles SET seen_at = ? WHERE id = ?').run(now, row.id);
        return { profile: toProfile(row), token };
      }
    }
    const fresh = randomBytes(24).toString('base64url');
    const id = randomBytes(8).toString('hex');
    this.db
      .prepare(
        'INSERT INTO profiles (id, token_hash, name, created_at, seen_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, hash(fresh), name, now, now);
    return { profile: this.get(id)!, token: fresh };
  }

  get(id: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Row | undefined;
    return row ? toProfile(row) : null;
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE profiles SET name = ? WHERE id = ?').run(name, id);
  }

  /** Adds a finished match to a profile. Returns the XP gained. */
  recordMatch(
    id: string,
    m: { won: boolean; wave: number; handCounts: number[]; bestHand: number },
  ): number {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Row | undefined;
    if (!row) return 0;
    const book = JSON.parse(row.hand_book) as number[];
    m.handCounts.forEach((n, i) => (book[i] = (book[i] ?? 0) + n));
    const hands = m.handCounts.reduce((a, b) => a + b, 0);
    // XP: waves survived, a win bonus, and a little extra for big hands.
    const big = m.handCounts.slice(7).reduce((a, b) => a + b, 0);
    const xp = m.wave * 10 + (m.won ? 200 : 0) + big * 25;
    this.db
      .prepare(
        `UPDATE profiles SET xp = xp + ?, matches = matches + 1, wins = wins + ?,
         best_wave = MAX(best_wave, ?), hands = hands + ?, best_hand = MAX(best_hand, ?), hand_book = ?
         WHERE id = ?`,
      )
      .run(xp, m.won ? 1 : 0, m.wave, hands, m.bestHand, JSON.stringify(book), id);
    return xp;
  }
}
