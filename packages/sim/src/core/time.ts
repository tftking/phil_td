/** The simulation runs at a fixed 20 ticks per second. */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_SECONDS = 1 / TICK_RATE;

export const secondsToTicks = (s: number): number => Math.round(s * TICK_RATE);
export const ticksToSeconds = (t: number): number => t / TICK_RATE;

/**
 * Turns variable real-time frame deltas into whole fixed ticks. The caller
 * owns the clock (server timer, requestAnimationFrame, or a test loop).
 */
export class FixedStepper {
  private acc = 0;

  /** @param maxCatchUp  cap on ticks per advance, so a stalled tab doesn't spiral. */
  constructor(
    private readonly step: () => void,
    private readonly maxCatchUp = 10,
  ) {}

  /** Advances by `deltaMs` of real time; returns the number of ticks run. */
  advance(deltaMs: number): number {
    this.acc += deltaMs;
    let ran = 0;
    while (this.acc >= TICK_MS && ran < this.maxCatchUp) {
      this.step();
      this.acc -= TICK_MS;
      ran++;
    }
    // After a stall, drop the backlog instead of fast-forwarding through it.
    if (ran === this.maxCatchUp) this.acc %= TICK_MS;
    return ran;
  }

  /** Fraction of the way to the next tick, for render interpolation. */
  get alpha(): number {
    return this.acc / TICK_MS;
  }
}
