/**
 * Assignment packs — the existing single-challenge JSON export, generalised to
 * a collection. A pack is just `{ kind, version, name, challenges: [...] }`
 * where each entry is the same serialized challenge the creator already emits,
 * so single-challenge files import as one-item packs.
 *
 * Packs can also travel in the URL: `?pack=<base64url json>` for a self
 * contained link, or `?pack=<https url>` to fetch a hosted pack file.
 */
import { DFA, type DFAJSON } from "./engine/dfa";
import type { Challenge, Difficulty } from "./engine/challenges";

export interface PackChallenge {
  id: string;
  name: string;
  difficulty: Difficulty;
  alphabet: string[];
  description: string;
  dfa: DFAJSON;
  hints?: string[];
}

export interface AssignmentPack {
  kind: "iale-pack";
  version: 1;
  name: string;
  createdAt: number;
  challenges: PackChallenge[];
}

const serialize = (c: Challenge): PackChallenge => ({
  id: c.id,
  name: c.name,
  difficulty: c.difficulty,
  alphabet: c.alphabet,
  description: c.description,
  dfa: c.dfa.toJSON(),
  ...(c.hints ? { hints: c.hints } : {}),
});

export function hydratePackChallenge(p: PackChallenge): Challenge {
  const dfa = DFA.fromJSON(p.dfa);
  return {
    id: p.id,
    name: p.name,
    difficulty: p.difficulty,
    alphabet: p.alphabet,
    description: p.description,
    ...(p.hints ? { hints: p.hints } : {}),
    dfa,
    initialExamples: dfa.sampleStrings({ maxLen: 6, count: 4 }),
    source: "fixed",
  };
}

export function buildPack(name: string, challenges: Challenge[]): AssignmentPack {
  return {
    kind: "iale-pack",
    version: 1,
    name: name.trim() || "Assignment pack",
    createdAt: Date.now(),
    challenges: challenges.map(serialize),
  };
}

export type PackParse = { ok: true; pack: AssignmentPack } | { ok: false; error: string };

/** Accepts a pack file or a legacy single-challenge export. */
export function parsePack(text: string): PackParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const obj = raw as Partial<AssignmentPack> & Partial<PackChallenge>;
  const list: unknown[] = Array.isArray(obj.challenges)
    ? obj.challenges
    : obj.dfa
      ? [obj]
      : Array.isArray(raw)
        ? (raw as unknown[])
        : [];
  if (!list.length) return { ok: false, error: "No challenges found in that file." };

  const challenges: PackChallenge[] = [];
  for (const item of list) {
    const c = item as PackChallenge;
    if (!c || typeof c !== "object" || !c.dfa) continue;
    try {
      DFA.fromJSON(c.dfa); // structural validation
    } catch {
      continue;
    }
    challenges.push({
      id: c.id || `pack-${challenges.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      name: c.name || `Challenge ${challenges.length + 1}`,
      difficulty: (["Easy", "Medium", "Hard"] as Difficulty[]).includes(c.difficulty)
        ? c.difficulty
        : "Medium",
      alphabet: Array.isArray(c.alphabet) && c.alphabet.length ? c.alphabet : ["0", "1"],
      description: c.description || "Imported challenge.",
      dfa: c.dfa,
      ...(Array.isArray(c.hints) ? { hints: c.hints } : {}),
    });
  }
  if (!challenges.length)
    return { ok: false, error: "None of the challenges in that file parsed." };
  return {
    ok: true,
    pack: {
      kind: "iale-pack",
      version: 1,
      name: typeof obj.name === "string" && !obj.dfa ? obj.name : "Imported pack",
      createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
      challenges,
    },
  };
}

const toB64Url = (json: string) =>
  btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromB64Url = (b64: string) =>
  decodeURIComponent(escape(atob(b64.replace(/-/g, "+").replace(/_/g, "/"))));

export function packToParam(pack: AssignmentPack): string {
  return toB64Url(JSON.stringify(pack));
}

export function packUrl(pack: AssignmentPack): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?pack=${packToParam(pack)}`;
}

/** Read `?pack=` from the current URL and resolve it to a pack, if present. */
export async function loadPackFromLocation(): Promise<PackParse | null> {
  if (typeof window === "undefined") return null;
  const param = new URLSearchParams(window.location.search).get("pack");
  if (!param) return null;
  if (/^https?:\/\//i.test(param)) {
    try {
      const res = await fetch(param);
      if (!res.ok) return { ok: false, error: `Pack URL returned ${res.status}.` };
      return parsePack(await res.text());
    } catch {
      return { ok: false, error: "Could not fetch that pack URL." };
    }
  }
  try {
    return parsePack(fromB64Url(param));
  } catch {
    return { ok: false, error: "That pack link is malformed." };
  }
}
