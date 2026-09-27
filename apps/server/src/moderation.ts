/**
 * Chat moderation: a small blocklist masked with asterisks, plus a rate
 * limit. Players can also mute each other client-side and report to the DB.
 */
const BLOCKLIST = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'kys'];
const pattern = new RegExp(`\\b(${BLOCKLIST.join('|')})\\w*`, 'gi');

export function filterChat(text: string): string {
  return text
    .replace(pattern, (w) => w[0] + '*'.repeat(w.length - 1))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Allows `limit` events per `windowMs`, per key. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}
