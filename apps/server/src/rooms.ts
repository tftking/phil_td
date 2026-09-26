import { randomBytes, randomInt } from 'node:crypto';
import type { LobbyState, S2C } from '@pokertd/protocol';

// No 0/O/1/I so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_PLAYERS = 6;

export interface Seat {
  id: string;
  name: string;
  token: string;
  ready: boolean;
  send: ((msg: S2C) => void) | null;
}

/**
 * One lobby/match. M0 handles only the lobby; the sim-driven match loop
 * lands in M2 (docs/ROADMAP.md).
 */
export class Room {
  readonly seats: Seat[] = [];
  private nextSeat = 1;

  constructor(readonly code: string) {}

  get empty(): boolean {
    return this.seats.every((s) => s.send === null);
  }

  /** Adds a player, or reattaches one presenting a valid session token. */
  join(name: string, token: string | undefined, send: (msg: S2C) => void): Seat | 'full' {
    const existing = token ? this.seats.find((s) => s.token === token) : undefined;
    if (existing) {
      existing.send = send;
      return existing;
    }
    if (this.seats.length >= MAX_PLAYERS) return 'full';
    const seat: Seat = {
      id: `p${this.nextSeat++}`,
      name,
      token: randomBytes(16).toString('hex'),
      ready: false,
      send,
    };
    this.seats.push(seat);
    return seat;
  }

  disconnect(seat: Seat): void {
    seat.send = null;
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      players: this.seats.map((s, i) => ({
        id: s.id,
        name: s.name,
        ready: s.ready,
        host: i === 0,
        connected: s.send !== null,
      })),
      mode: 'coop',
      map: 'felt',
      difficulty: 'standard',
    };
  }

  broadcast(msg: S2C): void {
    for (const s of this.seats) s.send?.(msg);
  }
}

export class RoomRegistry {
  private readonly rooms = new Map<string, Room>();

  create(): Room {
    let code: string;
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(
        '',
      );
    } while (this.rooms.has(code));
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  get size(): number {
    return this.rooms.size;
  }
}
