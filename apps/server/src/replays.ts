import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Replay } from '@pokertd/sim';

/** Replays are small (seed + inputs), stored gzipped on disk by match id. */
export class ReplayStore {
  constructor(private readonly dir: string | null) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  save(id: string, replay: Replay): void {
    if (!this.dir) return;
    writeFileSync(join(this.dir, `${id}.json.gz`), gzipSync(JSON.stringify(replay)));
  }

  load(id: string): Replay | null {
    if (!this.dir || !/^[a-f0-9]{16}$/.test(id)) return null;
    const file = join(this.dir, `${id}.json.gz`);
    if (!existsSync(file)) return null;
    return JSON.parse(gunzipSync(readFileSync(file)).toString()) as Replay;
  }
}
