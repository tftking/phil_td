import { signal } from '@preact/signals';

export type Action =
  | 'deal'
  | 'redraw'
  | 'lock'
  | 'fold'
  | 'card1'
  | 'card2'
  | 'card3'
  | 'card4'
  | 'card5'
  | 'card6'
  | 'place'
  | 'upgrade'
  | 'sell'
  | 'targeting'
  | 'research'
  | 'scoreboard'
  | 'cheatsheet'
  | 'chat'
  | 'pause'
  | 'callWave'
  | 'focus'
  | 'cancel';

export const DEFAULT_KEYS: Record<Action, string> = {
  deal: 'd',
  redraw: 'r',
  lock: ' ',
  fold: 'x',
  card1: '1',
  card2: '2',
  card3: '3',
  card4: '4',
  card5: '5',
  card6: '6',
  place: 'b',
  upgrade: 'u',
  sell: 's',
  targeting: 't',
  research: 'q',
  scoreboard: 'tab',
  cheatsheet: 'h',
  chat: 'enter',
  pause: 'p',
  callWave: 'n',
  focus: 'f',
  cancel: 'escape',
};

export interface Settings {
  name: string;
  token: string;
  master: number;
  sfx: number;
  music: number;
  fourColorDeck: boolean;
  colorblind: boolean;
  reducedMotion: boolean;
  uiScale: number;
  showOdds: boolean;
  cardBack: string;
  felt: string;
  keys: Record<Action, string>;
  tutorialDone: boolean;
  /** Room to rejoin after a reload or dropped connection. */
  lastRoom: { code: string; seat: string } | null;
  muted: string[];
}

const DEFAULTS: Settings = {
  name: '',
  token: '',
  master: 0.8,
  sfx: 0.8,
  music: 0.4,
  fourColorDeck: false,
  colorblind: false,
  reducedMotion: false,
  uiScale: 1,
  showOdds: true,
  cardBack: 'classic',
  felt: 'green',
  keys: DEFAULT_KEYS,
  tutorialDone: false,
  lastRoom: null,
  muted: [],
};

const KEY = 'pokertd.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed, keys: { ...DEFAULT_KEYS, ...(parsed.keys ?? {}) } };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = signal<Settings>(load());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    // Private mode or storage blocked: settings still apply for this session.
  }
}

/** Normalizes a KeyboardEvent to the names used in `keys`. */
export function keyName(e: KeyboardEvent): string {
  const k = e.key.toLowerCase();
  return k === 'spacebar' ? ' ' : k;
}

/** Stored locally so offline replays survive a reload (last 10). */
export function storeLocalReplay(json: string): void {
  try {
    const list = JSON.parse(localStorage.getItem('pokertd.replays') ?? '[]') as string[];
    list.unshift(json);
    localStorage.setItem('pokertd.replays', JSON.stringify(list.slice(0, 10)));
  } catch {
    // Storage full or blocked: skip.
  }
}

export function localReplays(): string[] {
  try {
    return JSON.parse(localStorage.getItem('pokertd.replays') ?? '[]') as string[];
  } catch {
    return [];
  }
}
