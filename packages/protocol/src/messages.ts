import { z } from 'zod';
import type { GameEvent, Intent, IntentResult, MatchSettings, Snapshot } from '@pokertd/sim';

/**
 * Wire protocol. Client → server messages are validated with zod; the
 * server never trusts a client for state, it only accepts intents and checks
 * them against the rules. See docs/TECHNICAL_DESIGN.md §6.2.
 */
const id = z
  .number()
  .int()
  .nonnegative()
  .max(2 ** 31);
const tile = z.number().int().min(0).max(255);
const card = z.number().int().min(0).max(52);
const suit = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const targetMode = z.enum(['first', 'last', 'strongest', 'weakest', 'closest', 'flying']);
const playerName = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} _.\-']+$/u, "letters, numbers, spaces and _.-' only");
export const pingKind = z.enum(['help', 'flush', 'saving', 'look', 'danger']);
export const botStyle = z.enum(['greedy', 'smart', 'raiser']);
export const modeSchema = z.enum(['coop', 'showdown']);

/** Gameplay intents, mirroring the sim's Intent type exactly. */
export const IntentSchema: z.ZodType<Intent> = z.discriminatedUnion('t', [
  z.object({ t: z.literal('deal') }),
  z.object({ t: z.literal('redraw'), idx: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
  z.object({ t: z.literal('lock') }),
  z.object({ t: z.literal('fold') }),
  z.object({ t: z.literal('place'), blueprint: id, x: tile, y: tile }),
  z.object({ t: z.literal('scrap'), blueprint: id }),
  z.object({ t: z.literal('upgrade'), tower: id }),
  z.object({ t: z.literal('sell'), tower: id }),
  z.object({ t: z.literal('target'), tower: id, mode: targetMode }),
  z.object({ t: z.literal('research'), suit }),
  z.object({
    t: z.literal('shopBuy'),
    item: z.string().max(32),
    card: card.optional(),
    arg: z.number().int().min(0).max(3).optional(),
  }),
  z.object({ t: z.literal('slip'), card: z.number().int().min(0).max(6), to: z.string().max(32) }),
  z.object({ t: z.literal('pot'), amount: z.number().int().positive().max(100_000) }),
  z.object({
    t: z.literal('raise'),
    send: z.string().max(32),
    count: z.number().int().min(1).max(20),
  }),
  z.object({ t: z.literal('pauseVote') }),
  z.object({ t: z.literal('callWave') }),
]);

export const RoomOptions = z.object({
  mode: modeSchema,
  map: z.string().max(32),
  difficulty: z.string().max(32),
  endless: z.boolean().optional(),
  /** Hidden from the public lobby list. */
  private: z.boolean().optional(),
  /** Replace players who stay disconnected with a bot. */
  botTakeover: z.boolean().optional(),
});
export type RoomOptions = z.infer<typeof RoomOptions>;

export const C2S = z.discriminatedUnion('t', [
  /** First message: identify with a guest profile (created if no token). */
  z.object({ t: z.literal('hello'), name: playerName, token: z.string().max(128).optional() }),
  z.object({ t: z.literal('rename'), name: playerName }),
  z.object({ t: z.literal('create'), options: RoomOptions }),
  z.object({
    t: z.literal('join'),
    room: z.string().regex(/^[A-Z0-9]{5}$/),
    /** Seat token from an earlier welcome, to reclaim a seat after a disconnect. */
    seat: z.string().max(128).optional(),
    spectate: z.boolean().optional(),
  }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('settings'), options: RoomOptions.partial() }),
  z.object({
    t: z.literal('team'),
    seat: z.string().max(32),
    team: z.number().int().min(0).max(7),
  }),
  z.object({ t: z.literal('addBot'), style: botStyle }),
  z.object({ t: z.literal('kick'), seat: z.string().max(32) }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('rematch') }),
  z.object({ t: z.literal('quickPlay'), mode: modeSchema }),
  z.object({ t: z.literal('cancelQueue') }),
  z.object({ t: z.literal('daily') }),
  z.object({ t: z.literal('act'), intent: IntentSchema, ref: z.number().int().optional() }),
  z.object({
    t: z.literal('ping'),
    kind: pingKind,
    x: z.number().min(0).max(255),
    y: z.number().min(0).max(255),
  }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(200) }),
  z.object({ t: z.literal('report'), player: z.string().max(32), reason: z.string().max(200) }),
]);
export type C2S = z.infer<typeof C2S>;
export type C2SType = C2S['t'];

export interface Profile {
  id: string;
  name: string;
  level: number;
  xp: number;
  /** XP needed for the next level. */
  nextLevelXp: number;
  stats: {
    matches: number;
    wins: number;
    bestWave: number;
    royalFlushes: number;
    handsPlayed: number;
    bestHand: number;
  };
  /** Hand Book: [category] = times made, across all matches. */
  handBook: number[];
}

export interface LobbySeat {
  id: string;
  name: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
  bot: string | null;
  team: number;
  level: number;
}

export interface LobbyState {
  code: string;
  status: 'lobby' | 'playing' | 'ended';
  seats: LobbySeat[];
  spectators: number;
  options: RoomOptions;
  maxPlayers: number;
  minPlayers: number;
  label?: string;
}

export interface PublicRoom {
  code: string;
  mode: 'coop' | 'showdown';
  map: string;
  difficulty: string;
  players: number;
  maxPlayers: number;
  status: 'lobby' | 'playing' | 'ended';
}

export interface MatchResult {
  result: 'won' | 'lost';
  winner: number | null;
  wave: number;
  replayId: string | null;
  xpGained: number;
  profile: Profile | null;
}

/** Server → client messages. Produced by trusted code, so typed but not validated. */
export type S2C =
  | { t: 'profile'; profile: Profile; token: string }
  | { t: 'welcome'; room: string; you: string | null; seat: string | null; protocol: number }
  | { t: 'lobby'; state: LobbyState }
  | { t: 'left' }
  | { t: 'start'; settings: MatchSettings; you: string | null }
  | { t: 'snap'; snap: Snapshot; events: GameEvent[] }
  | { t: 'result'; ref?: number; result: IntentResult }
  | { t: 'end'; result: MatchResult }
  | {
      t: 'queue';
      status: 'searching' | 'idle';
      mode: 'coop' | 'showdown' | null;
      waiting: number;
      startsIn: number | null;
    }
  | { t: 'chat'; from: string; name: string; text: string; system?: boolean }
  | { t: 'ping'; from: string; kind: z.infer<typeof pingKind>; x: number; y: number }
  | { t: 'reject'; reason: RejectReason; ref?: string };

export type RejectReason =
  | 'bad_message'
  | 'rate_limited'
  | 'no_profile'
  | 'not_in_room'
  | 'already_in_room'
  | 'room_not_found'
  | 'room_full'
  | 'not_host'
  | 'not_ready'
  | 'in_progress'
  | 'bad_settings'
  | 'muted';

/** Bumped on any breaking change to the messages above. */
export const PROTOCOL_VERSION = 2;
