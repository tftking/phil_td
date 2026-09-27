/** Lightweight server metrics, exposed as JSON on /metrics. */
export class Metrics {
  private tickTimes: number[] = [];
  bytesOut = 0;
  private bytesWindowStart = Date.now();
  private lastBytesPerSecond = 0;
  matchesStarted = 0;
  matchesFinished = 0;
  disconnects = 0;
  connections = 0;
  rejectedMessages = 0;

  recordTick(ms: number): void {
    this.tickTimes.push(ms);
    if (this.tickTimes.length > 2000) this.tickTimes.splice(0, 1000);
  }

  recordBytes(n: number): void {
    this.bytesOut += n;
    const now = Date.now();
    if (now - this.bytesWindowStart >= 5000) {
      this.lastBytesPerSecond = this.bytesOut / ((now - this.bytesWindowStart) / 1000);
      this.bytesOut = 0;
      this.bytesWindowStart = now;
    }
  }

  private percentile(p: number): number {
    if (this.tickTimes.length === 0) return 0;
    const sorted = [...this.tickTimes].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
  }

  snapshot(extra: Record<string, number>) {
    return {
      ...extra,
      connections: this.connections,
      tickMsP50: +this.percentile(0.5).toFixed(3),
      tickMsP99: +this.percentile(0.99).toFixed(3),
      bytesPerSecond: Math.round(this.lastBytesPerSecond),
      matchesStarted: this.matchesStarted,
      matchesFinished: this.matchesFinished,
      disconnects: this.disconnects,
      rejectedMessages: this.rejectedMessages,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
