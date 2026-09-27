import { batch, computed, signal } from '@preact/signals';
import type { BotStyle } from '@pokertd/bots';
import type { C2S, LobbyState, MatchResult, Profile, RoomOptions, S2C } from '@pokertd/protocol';
import {
  type Card,
  type GameEvent,
  type Intent,
  type MapLayout,
  type MatchSettings,
  type PlayerStats,
  type PublicPlayer,
  type PublicTower,
  type Replay,
  type Snapshot,
  type WavePreview,
  applyTowers,
  buildLayout,
  mapDef,
} from '@pokertd/sim';
import { Emitter, type Link } from '../net/link';
import { LocalLink, ReplayLink } from '../net/local';
import { OnlineLink } from '../net/online';
import { settings, storeLocalReplay, updateSettings } from '../settings';

export type Screen = 'menu' | 'lobby' | 'game';

// ------------------------------------------------------------------ state

export const screen = signal<Screen>('menu');
export const profile = signal<Profile | null>(null);
export const online = signal<'connecting' | 'open' | 'closed'>('connecting');
export const lobby = signal<LobbyState | null>(null);
export const queue = signal<Extract<S2C, { t: 'queue' }> | null>(null);
/** The seat this client holds in the current room (null when spectating). */
export const seatId = signal<string | null>(null);

export interface MatchInfo {
  settings: MatchSettings;
  layout: MapLayout;
  you: string | null;
  kind: Link['kind'];
}
export const match = signal<MatchInfo | null>(null);
export const snap = signal<Snapshot | null>(null);
export const towers = signal<PublicTower[]>([]);
export const players = signal<PublicPlayer[]>([]);
export const stats = signal<Record<string, PlayerStats>>({});
export const nextWave = signal<WavePreview | null>(null);
export const deckCards = signal<Card[]>([]);
export const endResult = signal<MatchResult | null>(null);
export const lastReplay = signal<Replay | null>(null);
/** Wall-clock time the latest snapshot arrived (for interpolation). */
export let snapAt = 0;

export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
  system: boolean;
}
export const chat = signal<ChatLine[]>([]);

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'big';
}
export const toasts = signal<Toast[]>([]);

// Selection and panels.
export const marked = signal<Set<number>>(new Set());
export const selectedTower = signal<number | null>(null);
export const placing = signal<number | null>(null);
export const panel = signal<
  'none' | 'research' | 'shop' | 'raise' | 'pot' | 'settings' | 'cheatsheet'
>('none');
export const scoreboardOpen = signal(false);
export const chatOpen = signal(false);

/** Game events for the renderer and audio. */
export const gameEvents = new Emitter<GameEvent[]>();
export const pings = new Emitter<Extract<S2C, { t: 'ping' }>>();
export const snapshots = new Emitter<Snapshot>();

export const me = computed(() => {
  const id = match.value?.you;
  return id ? (players.value.find((p) => p.id === id) ?? null) : null;
});
export const you = computed(() => snap.value?.you ?? null);
export const myTowers = computed(() => towers.value.filter((t) => t.owner === match.value?.you));

let nextId = 1;

export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3000): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, text, kind }];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== id)), ms);
}

// ------------------------------------------------------------------ links

let onlineLink: OnlineLink | null = null;
let activeLink: Link | null = null;
let unsubscribe: (() => void) | null = null;

export const activeKind = signal<Link['kind'] | null>(null);
export function currentLink(): Link | null {
  return activeLink;
}

function use(link: Link): void {
  unsubscribe?.();
  if (activeLink && activeLink !== onlineLink) activeLink.close();
  activeLink = link;
  activeKind.value = link.kind;
  unsubscribe = link.onMessage(dispatch);
}

/** Connects to the server (once) and keeps the online link as the default. */
export function connectOnline(): void {
  if (onlineLink) return;
  const name = settings.value.name || `Player ${Math.floor(Math.random() * 900 + 100)}`;
  if (!settings.value.name) updateSettings({ name });
  onlineLink = new OnlineLink(() => ({
    t: 'hello',
    name: settings.value.name,
    ...(settings.value.token ? { token: settings.value.token } : {}),
  }));
  onlineLink.status.on((s) => {
    online.value = s;
    // After a reconnect, rejoin the room we were in.
    const last = settings.value.lastRoom;
    if (s === 'open' && last && activeLink === onlineLink) {
      onlineLink!.send({ t: 'join', room: last.code, seat: last.seat });
    }
  });
  use(onlineLink);
}

export function send(msg: C2S): void {
  activeLink?.send(msg);
}

let ref = 1;
const pending = new Map<number, string>();

/** Sends a gameplay intent; rejections show up as toasts. */
export function act(intent: Intent): void {
  const r = ref++;
  pending.set(r, intent.t);
  send({ t: 'act', intent, ref: r });
}

// ---------------------------------------------------------- local modes

export function startSolo(opts: {
  map: string;
  difficulty: string;
  allies: BotStyle[];
  endless?: boolean;
  seed?: number;
  label?: string;
}): LocalLink {
  const ids = ['you', ...opts.allies.map((_, i) => `bot${i + 1}`)];
  const link = new LocalLink(
    {
      seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
      mode: 'coop',
      map: opts.map,
      difficulty: opts.difficulty,
      players: ids.map((id, i) => ({
        id,
        name: i === 0 ? settings.value.name || 'You' : `Dealer Bot ${i}`,
      })),
      ...(opts.endless ? { endless: true } : {}),
      ...(opts.label ? { label: opts.label } : {}),
    },
    'you',
    Object.fromEntries(opts.allies.map((s, i) => [`bot${i + 1}`, s])),
  );
  link.onReplay = (r) => {
    lastReplay.value = r;
    storeLocalReplay(JSON.stringify(r));
  };
  use(link);
  return link;
}

/** Offline Showdown practice against bots. */
export function startPractice(opponents: BotStyle[], map = 'vegas'): LocalLink {
  const ids = ['you', ...opponents.map((_, i) => `bot${i + 1}`)];
  const link = new LocalLink(
    {
      seed: Math.floor(Math.random() * 2 ** 31),
      mode: 'showdown',
      map,
      difficulty: 'standard',
      players: ids.map((id, i) => ({
        id,
        name: i === 0 ? settings.value.name || 'You' : `Shark Bot ${i}`,
        team: i,
      })),
    },
    'you',
    Object.fromEntries(opponents.map((s, i) => [`bot${i + 1}`, s])),
  );
  link.onReplay = (r) => (lastReplay.value = r);
  use(link);
  return link;
}

export function watchReplay(replay: Replay): ReplayLink {
  const link = new ReplayLink(replay);
  use(link);
  return link;
}

/** Leaves whatever is going on and returns to the menu. */
export function toMenu(): void {
  if (activeLink === onlineLink) send({ t: 'leave' });
  updateSettings({ lastRoom: null });
  batch(() => {
    resetMatch();
    lobby.value = null;
    screen.value = 'menu';
  });
  if (onlineLink) use(onlineLink);
}

function resetMatch(): void {
  match.value = null;
  snap.value = null;
  towers.value = [];
  players.value = [];
  stats.value = {};
  nextWave.value = null;
  endResult.value = null;
  marked.value = new Set();
  selectedTower.value = null;
  placing.value = null;
  panel.value = 'none';
}

export function createRoom(options: RoomOptions): void {
  if (activeLink !== onlineLink) connectOnline();
  send({ t: 'create', options });
}

export function joinRoom(code: string, spectate = false): void {
  if (activeLink !== onlineLink && onlineLink) use(onlineLink);
  send({ t: 'join', room: code.toUpperCase(), ...(spectate ? { spectate } : {}) });
}

// --------------------------------------------------------------- dispatch

const REJECT_TEXT: Record<string, string> = {
  not_enough_gold: 'Not enough gold',
  bench_full: 'Your bench is full: place or scrap a tower first',
  no_hand: 'Deal a hand first',
  has_hand: 'Finish your current hand first',
  invalid_tile: "You can't build there",
  tile_taken: 'That tile is taken',
  center_full: 'You already have 3 towers on the Center Table',
  max_level: 'Already at max',
  busy: 'Not right now',
  shop_closed: 'The shop is closed',
  deck_too_small: 'Your deck is at the minimum size',
  wrong_mode: 'Not available in this mode',
  locked: 'Not unlocked yet',
  room_not_found: 'Room not found',
  room_full: 'That room is full',
  not_host: 'Only the host can do that',
  not_ready: 'Everyone needs to be ready (Showdown needs 2+ teams)',
  bad_settings: "Those settings don't fit this room",
  rate_limited: 'Slow down a little',
  muted: "You're sending messages too fast",
  in_progress: 'The match already started',
  already_in_room: 'Leave your current room first',
};

function dispatch(msg: S2C): void {
  switch (msg.t) {
    case 'profile':
      profile.value = msg.profile;
      if (msg.token) updateSettings({ token: msg.token, name: msg.profile.name });
      return;

    case 'welcome':
      seatId.value = msg.you;
      if (msg.seat) updateSettings({ lastRoom: { code: msg.room, seat: msg.seat } });
      queue.value = null;
      if (screen.value === 'menu') screen.value = 'lobby';
      return;

    case 'lobby':
      lobby.value = msg.state;
      // A rematch sends everyone back to the lobby.
      if (msg.state.status === 'lobby' && screen.value === 'game') {
        batch(() => {
          resetMatch();
          screen.value = 'lobby';
        });
      }
      return;

    case 'left':
      toMenu();
      return;

    case 'queue':
      queue.value = msg.status === 'idle' ? null : msg;
      return;

    case 'start': {
      const layout = buildLayout(mapDef(msg.settings.map), msg.settings.players.length);
      batch(() => {
        resetMatch();
        match.value = {
          settings: msg.settings,
          layout,
          you: msg.you,
          kind: activeLink?.kind ?? 'online',
        };
        screen.value = 'game';
      });
      return;
    }

    case 'snap': {
      const s = msg.snap;
      snapAt = performance.now();
      batch(() => {
        towers.value = applyTowers(towers.value, s);
        if (s.players) {
          const prev = new Map(players.value.map((p) => [p.id, p]));
          players.value = s.players.map((p) => ({ ...p, stats: p.stats ?? prev.get(p.id)?.stats }));
          if (s.players[0]?.stats) {
            stats.value = Object.fromEntries(s.players.map((p) => [p.id, p.stats!]));
          }
        }
        if (s.wave.next !== undefined) nextWave.value = s.wave.next;
        if (s.you?.deckCards) deckCards.value = s.you.deckCards;
        // Keep gold live between player-list updates.
        if (s.you && match.value?.you) {
          const id = match.value.you;
          players.value = players.value.map((p) => (p.id === id ? { ...p, gold: s.you!.gold } : p));
        }
        snap.value = s;
        if (placing.value !== null && !s.you?.blueprints.some((b) => b.id === placing.value))
          placing.value = null;
        if (
          selectedTower.value !== null &&
          !towers.value.some((t) => t.id === selectedTower.value)
        ) {
          selectedTower.value = null;
        }
        if (!s.you?.hand) marked.value = new Set();
        const offers = s.you?.shopOffers;
        if (offers && panel.value === 'none' && s.shopOpenUntil > s.tick) panel.value = 'shop';
        if (!offers && panel.value === 'shop') panel.value = 'none';
      });
      snapshots.emit(s);
      if (msg.events.length) gameEvents.emit(msg.events);
      return;
    }

    case 'result':
      if (!msg.result.ok) {
        const what = msg.ref !== undefined ? pending.get(msg.ref) : undefined;
        toast(REJECT_TEXT[msg.result.reason] ?? `Can't ${what ?? 'do that'}`, 'error', 2000);
      }
      if (msg.ref !== undefined) pending.delete(msg.ref);
      return;

    case 'end':
      endResult.value = msg.result;
      if (msg.result.profile) profile.value = msg.result.profile;
      return;

    case 'chat': {
      if (!msg.system && settings.value.muted.includes(msg.from)) return;
      const line = {
        id: nextId++,
        from: msg.from,
        name: msg.name,
        text: msg.text,
        system: !!msg.system,
      };
      chat.value = [...chat.value.slice(-60), line];
      return;
    }

    case 'ping':
      pings.emit(msg);
      return;

    case 'reject':
      toast(REJECT_TEXT[msg.reason] ?? msg.reason, 'error');
      if (msg.ref === 'join' && settings.value.lastRoom) updateSettings({ lastRoom: null });
      return;
  }
}
