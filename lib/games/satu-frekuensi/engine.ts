import type {
  CustomSpectrum,
  FrequencyGuessReveal,
  FrequencyTier,
  PlayerSecretDoc,
  SpectrumItem,
} from '../types';
import { BUILTIN_SPECTRUMS_ID } from './spectrums-id';

export function sanitizeCustomSpectrum(input: {
  id?: string;
  leftLabel: string;
  rightLabel: string;
  category?: string;
}): CustomSpectrum | null {
  const leftLabel = input.leftLabel.trim().replace(/\s+/g, ' ').slice(0, 42);
  const rightLabel = input.rightLabel.trim().replace(/\s+/g, ' ').slice(0, 42);
  if (!leftLabel || !rightLabel) return null;
  if (leftLabel.toLowerCase() === rightLabel.toLowerCase()) return null;

  const category = (input.category?.trim() || 'Kustom').replace(/\s+/g, ' ').slice(0, 32);
  const id =
    input.id?.trim().slice(0, 40) ||
    `custom_spec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  return { id, leftLabel, rightLabel, category };
}

export function mergeSpectrumPool(
  enabledPacks: string[],
  customSpectrums: CustomSpectrum[] = [],
): SpectrumItem[] {
  const packSet = new Set(enabledPacks);
  const builtIn = BUILTIN_SPECTRUMS_ID.filter((item) => packSet.has(item.packId));
  const custom: SpectrumItem[] = customSpectrums
    .map((item) => sanitizeCustomSpectrum(item))
    .filter((item): item is CustomSpectrum => item !== null)
    .map((item) => ({
      ...item,
      packId: 'custom',
      packLabel: 'Spektrum Kustom',
    }));

  const combined = [...builtIn, ...custom];
  return combined.length > 0 ? combined : BUILTIN_SPECTRUMS_ID.slice(0, 15);
}

export function pickNextPsychicIndex(
  playerCount: number,
  previousIndex: number | null,
): number {
  if (playerCount <= 0) return 0;
  if (previousIndex === null || previousIndex < 0) return 0;
  return (previousIndex + 1) % playerCount;
}

export function dealSatuFrekuensiRound(params: {
  playerUids: string[];
  pool: SpectrumItem[];
  previousSpectrumKey?: string | null;
  previousRotationIndex?: number | null;
  roundId: string;
  rng?: () => number;
}): {
  spectrum: SpectrumItem;
  psychicUid: string;
  rotationIndex: number;
  targetValue: number;
  secretsByUid: Record<string, PlayerSecretDoc>;
} {
  const rng = params.rng ?? Math.random;
  if (params.playerUids.length < 2) {
    throw new Error('Minimal 2 pemain dibutuhkan untuk memulai Satu Frekuensi.');
  }
  if (params.pool.length === 0) {
    throw new Error('Daftar spektrum kosong.');
  }

  const candidates =
    params.pool.length > 1 && params.previousSpectrumKey
      ? params.pool.filter(
          (item) => `${item.leftLabel}|${item.rightLabel}` !== params.previousSpectrumKey,
        )
      : params.pool;
  const effectivePool = candidates.length > 0 ? candidates : params.pool;
  const spectrum = effectivePool[Math.floor(rng() * effectivePool.length)] ?? effectivePool[0];

  const rotationIndex = pickNextPsychicIndex(
    params.playerUids.length,
    params.previousRotationIndex ?? null,
  );
  const psychicUid = params.playerUids[rotationIndex] ?? params.playerUids[0];

  // Keep target inside [6, 94] so the bullseye wedge (±4) is always comfortably visible on the 0..100 arc
  const targetValue = 6 + Math.floor(rng() * 89);

  const secretsByUid: Record<string, PlayerSecretDoc> = {};
  for (const uid of params.playerUids) {
    if (uid === psychicUid) {
      secretsByUid[uid] = {
        uid,
        roundId: params.roundId,
        gameType: 'satu_frekuensi',
        isPsychic: true,
        targetValue,
      };
    } else {
      // Strictly omit targetValue from all non-psychic players
      secretsByUid[uid] = {
        uid,
        roundId: params.roundId,
        gameType: 'satu_frekuensi',
        isPsychic: false,
      };
    }
  }

  return {
    spectrum,
    psychicUid,
    rotationIndex,
    targetValue,
    secretsByUid,
  };
}

export function evaluateFrequencyGuess(
  guessValue: number,
  targetValue: number,
): { points: number; tier: FrequencyTier; distance: number } {
  const clampedGuess = Math.min(100, Math.max(0, Math.round(guessValue)));
  const clampedTarget = Math.min(100, Math.max(0, Math.round(targetValue)));
  const distance = Math.abs(clampedGuess - clampedTarget);

  if (distance <= 4) {
    return { points: 4, tier: 'bullseye', distance };
  }
  if (distance <= 10) {
    return { points: 3, tier: 'close', distance };
  }
  if (distance <= 16) {
    return { points: 2, tier: 'near', distance };
  }
  return { points: 0, tier: 'miss', distance };
}

export function scoreSatuFrekuensiRound(params: {
  psychicUid: string;
  targetValue: number;
  players: Array<{ uid: string; displayName: string; avatarColor: string }>;
  submissionsByUid: Record<string, number>;
}): {
  revealedGuesses: FrequencyGuessReveal[];
  psychicBonus: number;
  deltas: Record<string, number>;
} {
  const deltas: Record<string, number> = {};
  const revealedGuesses: FrequencyGuessReveal[] = [];
  let scoringGuessersCount = 0;

  for (const player of params.players) {
    deltas[player.uid] = 0;
    if (player.uid === params.psychicUid) continue;

    const rawGuess = params.submissionsByUid[player.uid];
    if (typeof rawGuess !== 'number' || Number.isNaN(rawGuess)) continue;

    const clamped = Math.min(100, Math.max(0, Math.round(rawGuess)));
    const evalResult = evaluateFrequencyGuess(clamped, params.targetValue);
    deltas[player.uid] = evalResult.points;
    if (evalResult.points >= 2) {
      scoringGuessersCount += 1;
    }

    revealedGuesses.push({
      uid: player.uid,
      displayName: player.displayName,
      avatarColor: player.avatarColor,
      value: clamped,
      points: evalResult.points,
      tier: evalResult.tier,
    });
  }

  // Psychic earns +1 per scoring guesser, capped at +4 (respecting Firestore +6 score delta cap)
  const psychicBonus = Math.min(4, scoringGuessersCount);
  deltas[params.psychicUid] = psychicBonus;

  revealedGuesses.sort((a, b) => b.points - a.points || Math.abs(a.value - params.targetValue) - Math.abs(b.value - params.targetValue));

  return {
    revealedGuesses,
    psychicBonus,
    deltas,
  };
}
