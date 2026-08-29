import { DFA, type DFAJSON } from "./engine/dfa";
import type { Challenge, Difficulty } from "./engine/challenges";

export const KEYS = {
  DFA_SAVES: "iale_dfa_saves",
  PROGRESS: "iale_progress",
  MISTAKE_LOG: "iale_mistake_log",
  STATS: "iale_stats",
  AI_CHALLENGES: "iale_ai_challenges",
  LIBRARY: "iale_library",
  SESSION: "iale_session_memory",
  DRILL_REVIEWS: "iale_drill_reviews",
  EXAM_REPORTS: "iale_exam_reports",
  THEME: "iale_theme",
} as const;

const hasLS = () => typeof window !== "undefined" && !!window.localStorage;

function read<T>(key: string, fallback: T): T {
  if (!hasLS()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  if (!hasLS()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function emit(name: string, detail?: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

export interface PositionMap {
  [label: string]: { x: number; y: number };
}
export interface SaveRecord {
  dfa: DFAJSON;
  positions: PositionMap;
  updatedAt: number;
}
export interface ProgressRecord {
  shownAccepted: string[];
  shownRejected: string[];
  solved: boolean;
  attempts: number;
}
export interface Mistake {
  id: string;
  timestamp: number;
  category: string;
  challengeId: string;
  details: string;
}
export interface DrillReview {
  category: string;
  box: number;
  reviewedAt: number;
}
export interface ExamReport {
  at: number;
  durationS: number;
  score: number;
  total: number;
  concepts: { concept: string; correct: number; total: number }[];
  languages: string[];
}
export interface SerializedChallenge {
  id: string;
  name: string;
  difficulty: Difficulty;
  alphabet: string[];
  description: string;
  dfa: DFAJSON;
  hints?: string[];
  savedAt?: number;
  source?: Challenge["source"];
}

const serialize = (c: Challenge): SerializedChallenge => ({
  id: c.id,
  name: c.name,
  difficulty: c.difficulty,
  alphabet: c.alphabet,
  description: c.description,
  dfa: c.dfa.toJSON(),
  ...(c.hints !== undefined ? { hints: c.hints } : {}),
  ...(c.source !== undefined ? { source: c.source } : {}),
});

const hydrate = (s: SerializedChallenge): Challenge => {
  const dfa = DFA.fromJSON(s.dfa);
  const { hints, savedAt, source, ...rest } = s;
  return {
    ...rest,
    ...(hints !== undefined ? { hints } : {}),
    ...(savedAt !== undefined ? { savedAt } : {}),
    ...(source !== undefined ? { source } : {}),
    dfa,
    initialExamples: dfa.sampleStrings({ maxLen: 6, count: 4 }),
  };
};

export const Storage = {
  saveDFA(saveId: string, dfaJSON: DFAJSON, positions: PositionMap) {
    const all = read<Record<string, SaveRecord>>(KEYS.DFA_SAVES, {});
    all[saveId] = { dfa: dfaJSON, positions, updatedAt: Date.now() };
    return { ok: write(KEYS.DFA_SAVES, all) };
  },
  loadDFA(saveId: string) {
    const all = read<Record<string, SaveRecord>>(KEYS.DFA_SAVES, {});
    return { ok: true, data: all[saveId] ?? null };
  },
  deleteDFA(saveId: string) {
    const all = read<Record<string, SaveRecord>>(KEYS.DFA_SAVES, {});
    delete all[saveId];
    return { ok: write(KEYS.DFA_SAVES, all) };
  },

  getProgress(challengeId: string) {
    const all = read<Record<string, ProgressRecord>>(KEYS.PROGRESS, {});
    return { ok: true, data: all[challengeId] ?? null };
  },
  setProgress(challengeId: string, patch: Partial<ProgressRecord>) {
    const all = read<Record<string, ProgressRecord>>(KEYS.PROGRESS, {});
    const prev = all[challengeId] ?? {
      shownAccepted: [],
      shownRejected: [],
      solved: false,
      attempts: 0,
    };
    all[challengeId] = { ...prev, ...patch };
    return { ok: write(KEYS.PROGRESS, all) };
  },

  appendMistake(category: string, challengeId: string, details: string): Mistake {
    const log = read<Mistake[]>(KEYS.MISTAKE_LOG, []);
    const entry: Mistake = {
      id: `m${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      category,
      challengeId,
      details,
    };
    log.push(entry);
    write(KEYS.MISTAKE_LOG, log.slice(-500));
    return entry;
  },
  getAllMistakes() {
    return read<Mistake[]>(KEYS.MISTAKE_LOG, []);
  },
  getDrillReviews(): Record<string, DrillReview> {
    return read<Record<string, DrillReview>>(KEYS.DRILL_REVIEWS, {});
  },
  recordDrillReview(category: string, box: number) {
    const all = read<Record<string, DrillReview>>(KEYS.DRILL_REVIEWS, {});
    all[category] = { category, box, reviewedAt: Date.now() };
    const ok = write(KEYS.DRILL_REVIEWS, all);
    emit("iale-drill-reviewed", { category, box });
    return { ok };
  },

  saveExamReport(report: ExamReport) {
    const all = read<ExamReport[]>(KEYS.EXAM_REPORTS, []);
    const next = [...all, report].slice(-20);
    const ok = write(KEYS.EXAM_REPORTS, next);
    emit("iale-exam-report", report);
    return { ok };
  },
  getExamReports(): ExamReport[] {
    return read<ExamReport[]>(KEYS.EXAM_REPORTS, []);
  },
  getLastExamReport(): ExamReport | null {
    const all = read<ExamReport[]>(KEYS.EXAM_REPORTS, []);
    return all[all.length - 1] ?? null;
  },

  getMistakeSummary() {
    const counts = new Map<string, number>();
    for (const m of read<Mistake[]>(KEYS.MISTAKE_LOG, []))
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    return {
      ok: true,
      data: [...counts.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
    };
  },

  recordAttempt(moduleId: string, challengeId: string) {
    const stats = read<{
      attempts: Record<string, number>;
      solves: Record<string, { solvedAt: number; attempts: number }>;
    }>(KEYS.STATS, { attempts: {}, solves: {} });
    const key = `${moduleId}:${challengeId}`;
    stats.attempts[key] = (stats.attempts[key] ?? 0) + 1;
    return { ok: write(KEYS.STATS, stats) };
  },
  recordSolve(moduleId: string, challengeId: string, attemptsCount: number) {
    const stats = read<{
      attempts: Record<string, number>;
      solves: Record<string, { solvedAt: number; attempts: number }>;
    }>(KEYS.STATS, { attempts: {}, solves: {} });
    stats.solves[`${moduleId}:${challengeId}`] = { solvedAt: Date.now(), attempts: attemptsCount };
    const ok = write(KEYS.STATS, stats);
    emit("iale-stats-updated");
    return { ok };
  },
  getStats() {
    return read<{
      attempts: Record<string, number>;
      solves: Record<string, { solvedAt: number; attempts: number }>;
    }>(KEYS.STATS, { attempts: {}, solves: {} });
  },
  countAttemptedUnique() {
    const keys = Object.keys(Storage.getStats().attempts).map((k) =>
      k.split(":").slice(1).join(":"),
    );
    return new Set(keys).size;
  },
  countSolvedUnique() {
    const keys = Object.keys(Storage.getStats().solves).map((k) => k.split(":").slice(1).join(":"));
    return new Set(keys).size;
  },

  saveAIChallenge(challenge: Challenge) {
    const all = read<SerializedChallenge[]>(KEYS.AI_CHALLENGES, []);
    const next = [...all.filter((c) => c.id !== challenge.id), serialize(challenge)];
    const ok = write(KEYS.AI_CHALLENGES, next);
    emit("iale-ai-challenge-updated");
    return { ok };
  },
  getAIChallenges(): Challenge[] {
    return read<SerializedChallenge[]>(KEYS.AI_CHALLENGES, []).map(hydrate);
  },
  deleteAIChallenge(id: string) {
    const ok = write(
      KEYS.AI_CHALLENGES,
      read<SerializedChallenge[]>(KEYS.AI_CHALLENGES, []).filter((c) => c.id !== id),
    );
    emit("iale-ai-challenge-updated");
    return { ok };
  },

  saveToLibrary(challenge: Challenge) {
    const all = read<SerializedChallenge[]>(KEYS.LIBRARY, []);
    if (!all.some((c) => c.id === challenge.id))
      all.push({ ...serialize(challenge), savedAt: Date.now() });
    const ok = write(KEYS.LIBRARY, all);
    emit("iale-library-updated");
    return { ok };
  },
  getLibrary(): Challenge[] {
    return read<SerializedChallenge[]>(KEYS.LIBRARY, []).map(hydrate);
  },
  removeFromLibrary(id: string) {
    const ok = write(
      KEYS.LIBRARY,
      read<SerializedChallenge[]>(KEYS.LIBRARY, []).filter((c) => c.id !== id),
    );
    emit("iale-library-updated");
    return { ok };
  },
  isInLibrary(id: string) {
    return read<SerializedChallenge[]>(KEYS.LIBRARY, []).some((c) => c.id === id);
  },

  clearAllData() {
    if (!hasLS()) return { ok: false };
    for (const key of [
      KEYS.DFA_SAVES,
      KEYS.PROGRESS,
      KEYS.MISTAKE_LOG,
      KEYS.STATS,
      KEYS.AI_CHALLENGES,
      KEYS.LIBRARY,
      KEYS.SESSION,
      KEYS.DRILL_REVIEWS,
      KEYS.EXAM_REPORTS,
    ])
      window.localStorage.removeItem(key);
    emit("iale-data-cleared");
    return { ok: true };
  },
  /** Full factory reset — also wipes AI tutor settings and theme. */
  clearAllWithSettings() {
    if (!hasLS()) return { ok: false };
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("iale_")) window.localStorage.removeItem(key);
    }
    emit("iale-data-cleared");
    return { ok: true };
  },
};
