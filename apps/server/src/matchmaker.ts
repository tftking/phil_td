import type { Client } from './room';

export type QueueMode = 'coop' | 'showdown';

interface Entry {
  client: Client;
  since: number;
}

/**
 * Quick Play: groups queued players into rooms. A group starts as soon as it
 * is full, or after a wait with whoever is there; Showdown tops up with bots.
 */
export class Matchmaker {
  readonly queues: Record<QueueMode, Entry[]> = { coop: [], showdown: [] };
  static readonly TARGET: Record<QueueMode, number> = { coop: 4, showdown: 4 };
  static readonly WAIT_MS: Record<QueueMode, number> = { coop: 20_000, showdown: 30_000 };

  constructor(
    private readonly launch: (mode: QueueMode, clients: Client[]) => void,
    private readonly now: () => number = Date.now,
  ) {}

  enqueue(client: Client, mode: QueueMode): void {
    this.remove(client);
    this.queues[mode].push({ client, since: this.now() });
    this.tick();
  }

  remove(client: Client): void {
    for (const mode of ['coop', 'showdown'] as const) {
      this.queues[mode] = this.queues[mode].filter((e) => e.client !== client);
    }
  }

  modeOf(client: Client): QueueMode | null {
    for (const mode of ['coop', 'showdown'] as const) {
      if (this.queues[mode].some((e) => e.client === client)) return mode;
    }
    return null;
  }

  /** Called about once a second: launch full or timed-out groups, update waiters. */
  tick(): void {
    for (const mode of ['coop', 'showdown'] as const) {
      const q = this.queues[mode];
      const target = Matchmaker.TARGET[mode];
      while (q.length >= target)
        this.launch(
          mode,
          q.splice(0, target).map((e) => e.client),
        );
      if (q.length > 0 && this.now() - q[0]!.since >= Matchmaker.WAIT_MS[mode]) {
        this.launch(
          mode,
          q.splice(0).map((e) => e.client),
        );
      }
      for (const e of q) {
        const startsIn = Math.max(
          0,
          Math.ceil((q[0]!.since + Matchmaker.WAIT_MS[mode] - this.now()) / 1000),
        );
        e.client.send({ t: 'queue', status: 'searching', mode, waiting: q.length, startsIn });
      }
    }
  }
}
