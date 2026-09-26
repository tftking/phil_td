import { z } from 'zod';

/**
 * Client → server intents. The server never trusts a client for state; it
 * only accepts these requests and validates them against the rules.
 * See docs/TECHNICAL_DESIGN.md §6.2.
 */
const id = z.number().int().nonnegative();
const tile = z.number().int().min(0).max(255);
const suit = z.number().int().min(0).max(3);
const targetMode = z.enum(['first', 'last', 'strongest', 'weakest', 'closest', 'flying']);
const pingKind = z.enum(['help', 'flush', 'saving', 'look']);

export const C2S = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('join'),
    room: z.string().regex(/^[A-Z0-9]{5}$/),
    name: z.string().trim().min(1).max(24),
    token: z.string().max(128).optional(),
  }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('deal') }),
  z.object({
    t: z.literal('redraw'),
    idx: z.array(z.number().int().min(0).max(4)).min(1).max(5),
  }),
  z.object({ t: z.literal('lock') }),
  z.object({ t: z.literal('fold') }),
  z.object({ t: z.literal('place'), blueprint: id, x: tile, y: tile }),
  z.object({ t: z.literal('upgrade'), tower: id }),
  z.object({ t: z.literal('sell'), tower: id }),
  z.object({ t: z.literal('target'), tower: id, mode: targetMode }),
  z.object({ t: z.literal('research'), suit }),
  z.object({
    t: z.literal('shopBuy'),
    item: id,
    card: id.optional(),
    arg: z.number().int().optional(),
  }),
  z.object({ t: z.literal('slip'), card: z.number().int().min(0).max(4), to: z.string().max(32) }),
  z.object({ t: z.literal('pot'), amount: z.number().int().positive().max(100_000) }),
  z.object({
    t: z.literal('raise'),
    send: z.string().max(32),
    count: z.number().int().min(1).max(20),
  }),
  z.object({ t: z.literal('ping'), kind: pingKind, x: tile, y: tile }),
  z.object({ t: z.literal('chat'), text: z.string().trim().min(1).max(200) }),
  z.object({ t: z.literal('ack'), snap: id }),
]);
export type C2S = z.infer<typeof C2S>;
export type C2SType = C2S['t'];

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  players: LobbyPlayer[];
  mode: 'coop' | 'showdown';
  map: string;
  difficulty: string;
}

/** Server → client messages. Produced by trusted code, so typed but not validated. */
export type S2C =
  | { t: 'welcome'; you: string; token: string; protocol: number }
  | { t: 'lobby'; state: LobbyState }
  | { t: 'snap'; n: number; base: number; delta: Uint8Array }
  | { t: 'hand'; cards: number[]; redrawsUsed: number; category: number }
  | { t: 'deckCounts'; ranks: number[]; suits: number[]; jokers: number }
  | { t: 'event'; e: { kind: string; [key: string]: unknown } }
  | { t: 'reject'; reason: RejectReason; ref?: string }
  | { t: 'pong'; at: number };

export type RejectReason =
  | 'bad_message'
  | 'rate_limited'
  | 'not_in_room'
  | 'room_not_found'
  | 'room_full'
  | 'not_implemented'
  | 'not_enough_gold'
  | 'invalid_tile'
  | 'invalid_action';

/** Bumped on any breaking change to the messages above. */
export const PROTOCOL_VERSION = 1;
