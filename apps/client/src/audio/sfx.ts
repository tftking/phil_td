import type { GameEvent } from '@pokertd/sim';
import { settings } from '../settings';

/**
 * All sound is synthesized with WebAudio: no asset files. Each effect is a
 * short envelope over oscillators or filtered noise. Repeated effects are
 * throttled so a big wave doesn't turn into noise.
 */
let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus = ctx.createGain();
  sfxBus.connect(master);
  musicBus.connect(master);
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ctx;
}

export function applyVolumes(): void {
  if (!ctx) return;
  const s = settings.value;
  master.gain.value = s.master;
  sfxBus.gain.value = s.sfx;
  musicBus.gain.value = s.music * 0.5;
}

/** Browsers only allow audio after a user gesture. */
export function unlockAudio(): void {
  const c = ensure();
  if (c?.state === 'suspended') void c.resume();
}

const lastPlayed = new Map<string, number>();
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if ((lastPlayed.get(key) ?? 0) + ms > now) return false;
  lastPlayed.set(key, now);
  return true;
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slide = 0,
  delay = 0,
): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(sfxBus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function hiss(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  click: () => tone(900, 0.04, 'square', 0.03),
  deal: () => {
    for (let i = 0; i < 5; i++) hiss(0.05, 0.25, 3000, 2, i * 0.045);
  },
  flip: () => hiss(0.05, 0.2, 2500, 2),
  lock: () => {
    tone(523, 0.12, 'triangle', 0.12);
    tone(784, 0.18, 'triangle', 0.1, 0, 0.07);
  },
  place: () => {
    tone(140, 0.15, 'sine', 0.25, 0.5);
    hiss(0.08, 0.15, 400, 1);
  },
  sell: () => {
    tone(1200, 0.06, 'square', 0.05);
    tone(1600, 0.08, 'square', 0.05, 0, 0.05);
  },
  upgrade: () => [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.05)),
  invalid: () => tone(160, 0.15, 'sawtooth', 0.06, 0.8),
  shot: (kind: string) => {
    if (!throttle(`shot:${kind}`, kind === 'mortar' || kind === 'sniper' ? 90 : 55)) return;
    switch (kind) {
      case 'sniper':
        hiss(0.12, 0.2, 1800, 0.8);
        tone(220, 0.1, 'square', 0.04, 0.4);
        break;
      case 'mortar':
        tone(90, 0.3, 'sine', 0.25, 0.4);
        hiss(0.2, 0.15, 300, 0.7);
        break;
      case 'chain':
      case 'storm':
        hiss(0.1, 0.12, 5000, 3);
        tone(1400, 0.08, 'sawtooth', 0.03, 1.8);
        break;
      case 'crown':
        tone(660, 0.25, 'triangle', 0.08, 0.5);
        hiss(0.2, 0.12, 900, 0.8);
        break;
      default:
        tone(700 + Math.random() * 100, 0.05, 'square', 0.03, 0.6);
    }
  },
  death: () => {
    if (throttle('death', 45)) tone(300 + Math.random() * 200, 0.08, 'triangle', 0.05, 0.4);
  },
  coin: () => {
    if (throttle('coin', 80)) tone(1318, 0.06, 'square', 0.025);
  },
  leak: () => {
    if (!throttle('leak', 300)) return;
    tone(220, 0.25, 'sawtooth', 0.12, 0.6);
    tone(180, 0.3, 'sawtooth', 0.1, 0.6, 0.12);
  },
  waveStart: (boss: boolean) => {
    const notes = boss ? [110, 131, 147] : [196, 247];
    notes.forEach((f, i) => tone(f, 0.45, 'sawtooth', 0.08, 1, i * 0.12));
  },
  bigHand: () =>
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.12, 1, i * 0.08)),
  shop: () => [1047, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 1, i * 0.1)),
  research: () => [659, 880].forEach((f, i) => tone(f, 0.2, 'sine', 0.1, 1, i * 0.08)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, 1, i * 0.15)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.08, 1, i * 0.2)),
  ping: () => tone(1760, 0.12, 'sine', 0.08),
  chat: () => tone(1100, 0.05, 'sine', 0.04),
};

/** Plays the sounds for a batch of game events. */
export function playEvents(
  events: GameEvent[],
  you: string | null,
  towerDefOf: (id: number) => string | undefined,
): void {
  for (const e of events) {
    switch (e.kind) {
      case 'attack':
        sfx.shot(towerDefOf(e.tower) ?? 'plinker');
        break;
      case 'death':
        sfx.death();
        if (e.to === you) sfx.coin();
        break;
      case 'leak':
        sfx.leak();
        break;
      case 'waveStart':
        sfx.waveStart(e.boss);
        break;
      case 'bigHand':
        sfx.bigHand();
        break;
      case 'shopOpen':
        sfx.shop();
        break;
      case 'research':
        if (e.player === you) sfx.research();
        break;
      case 'placed':
        if (e.player === you) sfx.place();
        break;
      case 'sold':
        if (e.player === you) sfx.sell();
        break;
      case 'upgraded':
        sfx.upgrade();
        break;
      case 'gameOver':
        break;
      default:
        break;
    }
  }
}

// ------------------------------------------------------------------ music

let musicTimer: ReturnType<typeof setInterval> | null = null;
let intensity = 0;

/** A small generative lounge loop: walking bass and soft chords. Intensity rises with the wave. */
export function startMusic(): void {
  const c = ensure();
  if (!c || musicTimer) return;
  const chords = [
    [220, 261.6, 329.6],
    [196, 246.9, 293.7],
    [174.6, 220, 261.6],
    [164.8, 207.7, 246.9],
  ];
  let step = 0;
  const beat = 0.42;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.05;
    const chord = chords[Math.floor(step / 8) % chords.length]!;
    const bass = chord[0]! / 2;
    const play = (f: number, dur: number, type: OscillatorType, vol: number, at: number): void => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = type;
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(musicBus);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    const walk = [1, 1.5, 1.335, 1.5][step % 4]!;
    play(bass * walk, beat * 0.9, 'triangle', 0.12, t);
    if (step % 4 === 0)
      chord.forEach((f) => play(f, beat * 3.5, 'sine', 0.03 + intensity * 0.02, t));
    if (intensity > 0.5 && step % 2 === 1) play(chord[2]! * 2, beat * 0.3, 'square', 0.01, t);
    step++;
  }, beat * 1000);
}

export function setMusicIntensity(v: number): void {
  intensity = Math.max(0, Math.min(1, v));
}

export function stopMusic(): void {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
