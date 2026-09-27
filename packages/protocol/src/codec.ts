import { Packr } from 'msgpackr';
import { C2S, type S2C } from './messages';

const packr = new Packr({ useRecords: false });

export const encode = (msg: C2S | S2C): Uint8Array<ArrayBuffer> =>
  packr.pack(msg) as Uint8Array<ArrayBuffer>;

export type DecodeResult<T> = { ok: true; msg: T } | { ok: false; error: string };

/**
 * Decodes and validates a client message. Never throws: bad bytes or bad
 * shapes come back as errors so a room can reject them and keep running.
 */
export function decodeC2S(bytes: Uint8Array): DecodeResult<C2S> {
  let raw: unknown;
  try {
    raw = packr.unpack(bytes);
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const parsed = C2S.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid' };
  return { ok: true, msg: parsed.data };
}

/** Decodes a server message (trusted source, no validation). */
export const decodeS2C = (bytes: Uint8Array): S2C => packr.unpack(bytes) as S2C;
