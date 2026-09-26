/**
 * Seeded PRNG (xoshiro128**) with named, independent streams.
 *
 * Each subsystem gets its own stream, e.g. `Rng.stream(seed, 'deck', playerId)`,
 * so adding a random roll in one feature never shifts the outcomes of another.
 * State is four uint32s and can be saved/restored for snapshots and replays.
 */
export type RngState = [number, number, number, number];

/** FNV-1a over a string, used to mix stream keys into the seed. */
function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  constructor(state: RngState) {
    [this.s0, this.s1, this.s2, this.s3] = state;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Creates the RNG for one named stream of a match seed. */
  static stream(seed: number, ...keys: (string | number)[]): Rng {
    const mixed = fnv1a(keys.join('\u0000'), fnv1a(String(seed >>> 0)));
    const sm = splitmix32(mixed);
    return new Rng([sm(), sm(), sm(), sm()]);
  }

  get state(): RngState {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  set state(st: RngState) {
    [this.s0, this.s1, this.s2, this.s3] = st;
  }

  /** Next uint32. */
  nextU32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 11);
    this.s0 >>>= 0;
    this.s1 >>>= 0;
    this.s2 >>>= 0;
    return result;
  }

  /** Float in [0, 1). */
  next(): number {
    return this.nextU32() / 0x100000000;
  }

  /** Unbiased integer in [0, n). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0 || n > 0x100000000) throw new RangeError(`int(${n})`);
    const limit = 0x100000000 - (0x100000000 % n);
    let x: number;
    do x = this.nextU32();
    while (x >= limit);
    return x % n;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }
}
