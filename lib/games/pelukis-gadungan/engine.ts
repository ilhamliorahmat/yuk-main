import type {
  CustomDrawingPrompt,
  DrawingPromptItem,
  PlayerSecretDoc,
  SpyMode,
} from '../types';
import { BUILTIN_DRAWING_PROMPTS_ID } from './prompts-id';

const INK_PALETTE = [
  '#F43F5E', // Rose
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
  '#A855F7', // Purple
  '#10B981', // Emerald
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#84CC16', // Lime
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#EAB308', // Yellow
  '#8B5CF6', // Violet
];

export function sanitizeCustomDrawingPrompt(input: {
  id?: string;
  category: string;
  word: string;
}): CustomDrawingPrompt | null {
  const category = input.category.trim().replace(/\s+/g, ' ').slice(0, 40);
  const word = input.word.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!category || !word) return null;

  const id =
    input.id?.trim().slice(0, 40) ||
    `custom_pg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  return { id, category, word };
}

export function mergeDrawingPromptPool(
  enabledPacks: string[],
  customPrompts: CustomDrawingPrompt[] = [],
): DrawingPromptItem[] {
  const packSet = new Set(enabledPacks);
  const builtIn = BUILTIN_DRAWING_PROMPTS_ID.filter((item) => packSet.has(item.packId));
  const custom: DrawingPromptItem[] = customPrompts
    .map((item) => sanitizeCustomDrawingPrompt(item))
    .filter((item): item is CustomDrawingPrompt => item !== null)
    .map((item) => ({
      ...item,
      packId: 'custom',
      packLabel: 'Tema Kustom',
    }));

  const combined = [...builtIn, ...custom];
  return combined.length > 0 ? combined : BUILTIN_DRAWING_PROMPTS_ID.slice(0, 14);
}

/**
 * Downsamples raw [x0, y0, x1, y1, ...] canvas points into a clean, compact 0..1000
 * integer polyline capped at `maxPoints` vertices (default 50) so strokes stay tiny.
 */
export function normalizeAndSimplifyPoints(
  rawPoints: number[],
  minDist = 10,
  maxPoints = 50,
): number[] {
  if (!Array.isArray(rawPoints) || rawPoints.length < 2) {
    return [];
  }

  const pairs: Array<[number, number]> = [];
  const count = Math.floor(rawPoints.length / 2);
  for (let i = 0; i < count; i++) {
    const x = Math.max(0, Math.min(1000, Math.round(Number(rawPoints[i * 2]))));
    const y = Math.max(0, Math.min(1000, Math.round(Number(rawPoints[i * 2 + 1]))));
    if (Number.isNaN(x) || Number.isNaN(y)) continue;

    if (pairs.length === 0) {
      pairs.push([x, y]);
      continue;
    }

    const prev = pairs[pairs.length - 1];
    const dist = Math.hypot(x - prev[0], y - prev[1]);
    if (dist >= minDist || i === count - 1) {
      pairs.push([x, y]);
    }
  }

  if (pairs.length === 0) return [];
  if (pairs.length === 1) {
    // Allow intentional dot/short tap as a minimal visible 2-point segment
    const [x, y] = pairs[0];
    return [x, y, Math.min(1000, x + 2), Math.min(1000, y + 2)];
  }

  let finalPairs = pairs;
  if (pairs.length > maxPoints) {
    finalPairs = [];
    const step = (pairs.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i++) {
      finalPairs.push(pairs[Math.round(i * step)]);
    }
  }

  const flat: number[] = [];
  for (const [x, y] of finalPairs) {
    flat.push(x, y);
  }
  return flat;
}

export function resolveGadunganCount(
  playerCount: number,
  spyMode: SpyMode,
  rng: () => number = Math.random,
): number {
  if (playerCount < 6) return 1;
  if (spyMode === 'double') return 2;
  if (spyMode === 'random') return rng() < 0.4 ? 2 : 1;
  return 1;
}

export function dealPelukisGadunganRound(params: {
  players: Array<{ uid: string; displayName: string; avatarColor?: string }>;
  pool: DrawingPromptItem[];
  spyMode: SpyMode;
  previousWord?: string | null;
  roundId: string;
  rng?: () => number;
}): {
  prompt: DrawingPromptItem;
  gadunganUids: string[];
  gadunganNames: string[];
  turnOrder: string[];
  turnNamesByUid: Record<string, string>;
  turnColorsByUid: Record<string, string>;
  secretsByUid: Record<string, PlayerSecretDoc>;
} {
  const rng = params.rng ?? Math.random;
  if (params.players.length < 3) {
    throw new Error('Minimal 3 pemain aktif dibutuhkan untuk memulai Pelukis Gadungan.');
  }
  if (params.pool.length === 0) {
    throw new Error('Daftar tema gambar kosong.');
  }

  const candidates =
    params.pool.length > 1 && params.previousWord
      ? params.pool.filter((item) => item.word.toLowerCase() !== params.previousWord?.toLowerCase())
      : params.pool;
  const effectivePool = candidates.length > 0 ? candidates : params.pool;
  const prompt = effectivePool[Math.floor(rng() * effectivePool.length)] ?? effectivePool[0];

  // Rotate starting turn cleanly via random starting index while preserving seating rhythm
  const startOffset = Math.floor(rng() * params.players.length);
  const rotatedPlayers = [
    ...params.players.slice(startOffset),
    ...params.players.slice(0, startOffset),
  ];

  // Pick 1 or 2 Pelukis Gadungan uniformly at random
  const shuffledForRole = [...params.players].sort(() => rng() - 0.5);
  const gadunganCount = resolveGadunganCount(params.players.length, params.spyMode, rng);
  const gadunganPlayers = shuffledForRole.slice(0, gadunganCount);
  const gadunganSet = new Set(gadunganPlayers.map((p) => p.uid));

  const turnOrder: string[] = [];
  const turnNamesByUid: Record<string, string> = {};
  const turnColorsByUid: Record<string, string> = {};
  const usedColors = new Set<string>();

  rotatedPlayers.forEach((p, idx) => {
    turnOrder.push(p.uid);
    turnNamesByUid[p.uid] = p.displayName.slice(0, 40);
    const preferred = p.avatarColor?.trim();
    const chosenColor =
      preferred && !usedColors.has(preferred)
        ? preferred
        : INK_PALETTE.find((c) => !usedColors.has(c)) ?? INK_PALETTE[idx % INK_PALETTE.length];
    usedColors.add(chosenColor);
    turnColorsByUid[p.uid] = chosenColor;
  });

  // Strict secret isolation:
  // - Pelukis Asli receives `drawingCategory` + `drawingWord` (`isGadungan: false`).
  // - Pelukis Gadungan receives ONLY `drawingCategory` (`drawingWord: null`, `isGadungan: true`).
  const secretsByUid: Record<string, PlayerSecretDoc> = {};
  for (const player of params.players) {
    const isGadungan = gadunganSet.has(player.uid);
    secretsByUid[player.uid] = {
      uid: player.uid,
      roundId: params.roundId,
      gameType: 'pelukis_gadungan',
      isGadungan,
      drawingCategory: prompt.category,
      drawingWord: isGadungan ? null : prompt.word,
      playerInkColor: turnColorsByUid[player.uid],
    };
  }

  return {
    prompt,
    gadunganUids: gadunganPlayers.map((p) => p.uid),
    gadunganNames: gadunganPlayers.map((p) => p.displayName),
    turnOrder,
    turnNamesByUid,
    turnColorsByUid,
    secretsByUid,
  };
}

export function tallyPelukisVotes(params: {
  votesByUid: Record<string, string>;
  eligibleVoterUids: string[];
  gadunganUids: string[];
}): {
  voteTally: Record<string, number>;
  accusedUid: string | null;
  isTie: boolean;
  caughtGadungan: boolean;
} {
  const voteTally: Record<string, number> = {};
  for (const voterUid of params.eligibleVoterUids) {
    const targetUid = params.votesByUid[voterUid];
    if (!targetUid) continue;
    voteTally[targetUid] = (voteTally[targetUid] ?? 0) + 1;
  }

  const entries = Object.entries(voteTally);
  if (entries.length === 0) {
    return { voteTally, accusedUid: null, isTie: true, caughtGadungan: false };
  }

  let maxVotes = 0;
  for (const [, count] of entries) {
    if (count > maxVotes) maxVotes = count;
  }

  const topTargets = entries.filter(([, count]) => count === maxVotes).map(([uid]) => uid);
  const isTie = topTargets.length > 1;
  const accusedUid = isTie ? null : topTargets[0];
  const gadunganSet = new Set(params.gadunganUids);
  const caughtGadungan = Boolean(accusedUid && gadunganSet.has(accusedUid));

  return {
    voteTally,
    accusedUid,
    isTie,
    caughtGadungan,
  };
}

export function evaluatePelukisWordGuess(guess: string, secretWord: string): boolean {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const a = clean(guess);
  const b = clean(secretWord);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && (b.includes(a) || a.includes(b))) return true;
  return false;
}

export function calculatePelukisScoreDeltas(params: {
  playerUids: string[];
  gadunganUids: string[];
  winnerTeam: 'pelukis' | 'gadungan';
}): Record<string, number> {
  const gadunganSet = new Set(params.gadunganUids);
  const deltas: Record<string, number> = {};
  for (const uid of params.playerUids) {
    const isGadungan = gadunganSet.has(uid);
    if (params.winnerTeam === 'gadungan') {
      deltas[uid] = isGadungan ? 3 : 0;
    } else {
      deltas[uid] = isGadungan ? 0 : 2;
    }
  }
  return deltas;
}
