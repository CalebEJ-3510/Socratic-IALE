import { DFA, type DFAJSON } from "./engine/dfa";
import { machineToDFA, positionsOf, type Machine } from "./machine";
import type { PositionMap } from "./storage";

export interface SharePayload {
  a: string[];
  d: DFAJSON;
  p: PositionMap;
}

const toB64Url = (json: string) =>
  btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64Url = (b64: string) =>
  decodeURIComponent(escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/"))));

/** Encode the current machine into a compact URL-hash payload. */
export function encodeShare(machine: Machine, alphabet: string[]): string {
  const payload: SharePayload = {
    a: alphabet,
    d: machineToDFA(machine, alphabet).toJSON(),
    p: positionsOf(machine),
  };
  return toB64Url(JSON.stringify(payload));
}

/** Decode a `#m=...` hash back into a machine payload. Returns null on any malformed input. */
export function decodeShare(hash: string): SharePayload | null {
  if (!hash.startsWith("#m=")) return null;
  try {
    const parsed = JSON.parse(fromB64Url(hash.slice(3))) as SharePayload;
    if (!Array.isArray(parsed.a) || !parsed.d || typeof parsed.d !== "object") return null;
    // Round-trip through the DFA class to validate the structure.
    DFA.fromJSON(parsed.d);
    return parsed;
  } catch {
    return null;
  }
}

export function shareUrl(machine: Machine, alphabet: string[]): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#m=${encodeShare(machine, alphabet)}`;
}
