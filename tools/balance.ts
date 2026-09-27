/**
 * Balance runner: plays many headless matches with bots and reports how far
 * each bot style gets, which towers do the work, and whether the balance
 * guardrails from docs/MECHANICS.md §7 hold.
 *
 *   pnpm balance                       # 40 runs per style, solo Standard on The Felt
 *   pnpm balance --runs 200 --check    # exit 1 if a guardrail fails (nightly CI)
 *   pnpm balance --map riverboat --players 2 --difficulty high_roller
 *   pnpm balance --mode showdown --map vegas --players 4
 *   pnpm balance --csv results.csv
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { type BotStyle, type SimResult, simulate } from '../packages/bots/src/index';
import { HAND_NAMES, type MatchSettings } from '../packages/sim/src/index';

interface Job {
  settings: MatchSettings;
  styles: Record<string, BotStyle>;
  label: string;
}

// Child process mode: run the jobs in a file and print one JSON result per line.
const workerFile = process.env.BALANCE_JOBS;
if (workerFile) {
  const jobs = JSON.parse(readFileSync(workerFile, 'utf8')) as Job[];
  for (const job of jobs) {
    const result = simulate(job.settings, job.styles);
    process.stdout.write(JSON.stringify({ label: job.label, result }) + '\n');
  }
  process.exit(0);
}

const { values } = parseArgs({
  options: {
    runs: { type: 'string', default: '40' },
    map: { type: 'string', default: 'felt' },
    players: { type: 'string', default: '1' },
    difficulty: { type: 'string', default: 'standard' },
    mode: { type: 'string', default: 'coop' },
    styles: { type: 'string' },
    seed: { type: 'string', default: '1000' },
    check: { type: 'boolean', default: false },
    csv: { type: 'string' },
  },
});

const runs = Number(values.runs);
const players = Number(values.players);
const mode = values.mode as MatchSettings['mode'];
const styleList = (values.styles ?? (mode === 'showdown' ? 'smart,raiser' : 'greedy,smart')).split(
  ',',
) as BotStyle[];

const jobs: Job[] = [];
for (const style of styleList) {
  for (let i = 0; i < runs; i++) {
    const ids = Array.from({ length: players }, (_, k) => `p${k + 1}`);
    // Showdown: alternate styles around the table so each style faces the others.
    const styles = Object.fromEntries(
      ids.map((id, k) => [
        id,
        mode === 'showdown' ? styleList[(k + i) % styleList.length]! : style,
      ]),
    );
    jobs.push({
      label: mode === 'showdown' ? 'showdown' : style,
      styles,
      settings: {
        seed: Number(values.seed) + i,
        mode,
        map: values.map!,
        difficulty: values.difficulty!,
        players: ids.map((id) => ({ id, name: id })),
      },
    });
  }
  if (mode === 'showdown') break;
}

const threads = Math.max(1, Math.min(availableParallelism(), jobs.length));
const results: { label: string; result: SimResult }[] = [];
const started = Date.now();
const self = fileURLToPath(import.meta.url);
await Promise.all(
  Array.from({ length: threads }, (_, t) => {
    const file = join(tmpdir(), `pokertd-balance-${process.pid}-${t}.json`);
    writeFileSync(file, JSON.stringify(jobs.filter((_, i) => i % threads === t)));
    return new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', self], {
        env: { ...process.env, BALANCE_JOBS: file },
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      let buf = '';
      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          results.push(JSON.parse(buf.slice(0, nl)) as { label: string; result: SimResult });
          buf = buf.slice(nl + 1);
          process.stderr.write(`\r${results.length}/${jobs.length} matches`);
        }
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)),
      );
    });
  }),
);
process.stderr.write(
  `\r${results.length} matches in ${((Date.now() - started) / 1000).toFixed(1)}s\n\n`,
);

const pct = (n: number, d: number): string => `${((100 * n) / Math.max(1, d)).toFixed(0)}%`;
const failures: string[] = [];

function damageShare(rs: SimResult[]): [string, number][] {
  const total: Record<string, number> = {};
  for (const r of rs)
    for (const [k, v] of Object.entries(r.damageByTower)) total[k] = (total[k] ?? 0) + v;
  const sum = Object.values(total).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(total)
    .map(([k, v]) => [k, v / sum] as [string, number])
    .sort((a, b) => b[1] - a[1]);
}

if (mode === 'coop') {
  console.log(
    `Co-op · ${values.map} · ${players}p · ${values.difficulty} · ${runs} runs per style\n`,
  );
  console.log('style    win   ≥w15  ≥w25  avg wave  median  lives(win)  hands  best hand');
  for (const style of styleList) {
    const rs = results.filter((r) => r.label === style).map((r) => r.result);
    const wins = rs.filter((r) => r.phase === 'won');
    const waves = rs.map((r) => (r.phase === 'won' ? 40 : r.wave - 1)).sort((a, b) => a - b);
    const cleared = (w: number) => rs.filter((r) => r.phase === 'won' || r.wave - 1 >= w).length;
    const hands = rs.reduce((s, r) => s + r.handCounts.reduce((a, b) => a + b, 0), 0) / rs.length;
    const best = Math.max(...rs.flatMap((r) => r.handCounts.map((n, i) => (n > 0 ? i : -1))));
    console.log(
      `${style.padEnd(8)} ${pct(wins.length, rs.length).padStart(4)}  ${pct(cleared(15), rs.length).padStart(4)}  ${pct(cleared(25), rs.length).padStart(4)}  ` +
        `${(waves.reduce((a, b) => a + b, 0) / waves.length).toFixed(1).padStart(8)}  ${String(waves[Math.floor(waves.length / 2)]).padStart(6)}  ` +
        `${(wins.reduce((s, r) => s + r.lives, 0) / Math.max(1, wins.length)).toFixed(1).padStart(10)}  ${hands.toFixed(0).padStart(5)}  ${HAND_NAMES[best as 0] ?? '-'}`,
    );
    const share = damageShare(wins.length ? wins : rs);
    console.log(
      `         damage share: ${share
        .slice(0, 6)
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
        .join(', ')}`,
    );

    // Guardrails (docs/MECHANICS.md §7), defined for solo Standard.
    if (values.difficulty === 'standard' && players === 1) {
      if (style === 'greedy') {
        if (cleared(15) / rs.length < 0.9)
          failures.push(`greedy clears w15 in ${pct(cleared(15), rs.length)} (< 90%)`);
        if (wins.length / rs.length > 0.05)
          failures.push(`greedy wins ${pct(wins.length, rs.length)} (> 5%)`);
      }
      if (style === 'smart') {
        if (wins.length / rs.length < 0.6)
          failures.push(`smart wins ${pct(wins.length, rs.length)} (< 60%)`);
        const top = share[0];
        if (top && top[1] > 0.5)
          failures.push(`${top[0]} deals ${(top[1] * 100).toFixed(0)}% of smart damage (> 50%)`);
      }
    }
  }
} else {
  console.log(`Showdown · ${values.map} · ${players}p · ${runs} runs\n`);
  const rs = results.map((r) => r.result);
  const winsByStyle: Record<string, number> = {};
  const seatsByStyle: Record<string, number> = {};
  for (const r of rs) {
    for (const [id, style] of Object.entries(r.styles)) {
      seatsByStyle[style] = (seatsByStyle[style] ?? 0) + 1;
      const team = Number(id.slice(1)) - 1;
      if (r.winner === team) winsByStyle[style] = (winsByStyle[style] ?? 0) + 1;
    }
  }
  const lengths = rs.map((r) => r.ticks / 20 / 60).sort((a, b) => a - b);
  console.log(
    `median length ${lengths[Math.floor(lengths.length / 2)]!.toFixed(1)} min, median final wave ${rs.map((r) => r.wave).sort((a, b) => a - b)[Math.floor(rs.length / 2)]}`,
  );
  const rates: number[] = [];
  for (const style of styleList) {
    const rate = (winsByStyle[style] ?? 0) / Math.max(1, seatsByStyle[style] ?? 0);
    rates.push(rate);
    console.log(
      `${style.padEnd(8)} win rate per seat ${(rate * 100).toFixed(0)}% (${seatsByStyle[style] ?? 0} seats)`,
    );
  }
  console.log(
    `damage share: ${damageShare(rs)
      .slice(0, 6)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
      .join(', ')}`,
  );

  // Guardrails (docs/ROADMAP.md M4): no dominant raise style, 15–25 minute matches.
  const spread = Math.max(...rates) - Math.min(...rates);
  if (rates.length > 1 && spread > 0.1)
    failures.push(`win-rate spread ${(spread * 100).toFixed(0)} points (> 10)`);
  const median = lengths[Math.floor(lengths.length / 2)]!;
  if (median < 15 || median > 25)
    failures.push(`median match ${median.toFixed(1)} min (outside 15-25)`);
}

if (values.csv) {
  const header = 'label,seed,phase,wave,lives,ticks,towers,goldEarned,winner';
  const rows = results.map(({ label, result: r }) =>
    [label, r.seed, r.phase, r.wave, r.lives, r.ticks, r.towers, r.goldEarned, r.winner ?? ''].join(
      ',',
    ),
  );
  writeFileSync(values.csv, [header, ...rows].join('\n') + '\n');
  console.log(`\nwrote ${values.csv}`);
}

if (values.check) {
  if (failures.length) {
    console.log(`\nGuardrails FAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nGuardrails passed.');
}
