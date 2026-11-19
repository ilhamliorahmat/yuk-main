import type {
  CustomWordPair,
  PlayerSecretDoc,
  SpyMode,
  WordPairItem,
} from '../types';
import { BUILTIN_WORD_PAIRS } from './words-id';

export type RandomFn = () => number;

export function shuffleArray<T>(items: readonly T[], rng: RandomFn = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeWordForCompare(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeCustomWordPair(raw: {
  id?: string;
  citizenWord: string;
  spyWord: string;
  category?: string;
}): CustomWordPair | null {
  const citizenWord = raw.citizenWord.trim().slice(0, 60);
  const spyWord = raw.spyWord.trim().slice(0, 60);
  const category = (raw.category?.trim() || 'Kustom').slice(0, 32);

  if (!citizenWord || !spyWord) return null;
  if (normalizeWordForCompare(citizenWord) === normalizeWordForCompare(spyWord)) {
    return null;
  }

  const id =
    raw.id && /^[a-zA-Z0-9_-]{3,40}$/.test(raw.id)
      ? raw.id
      : `custom-pair-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return {
    id,
    citizenWord,
    spyWord,
    category,
  };
}

export function mergeWordPairPool(
  enabledPacks: readonly string[],
  customWordPairs: readonly CustomWordPair[],
): WordPairItem[] {
  const packSet = new Set(enabledPacks);
  const builtIns = BUILTIN_WORD_PAIRS.filter((pair) => packSet.has(pair.packId));
  const customItems: WordPairItem[] = customWordPairs
    .map((p) => sanitizeCustomWordPair(p))
    .filter((p): p is CustomWordPair => p !== null)
    .map((p) => ({
      ...p,
      packId: 'kustom',
      packLabel: 'Pasangan Kustom',
    }));

  return [...builtIns, ...customItems];
}

/**
 * Multi-Spy clamping rule for Kata-Kata Hari Ini:
 * Citizens must strictly outnumber Penyusup at round start so the round is always playable.
 * - 3–4 players -> max 1 Penyusup
 * - 5+ players -> supports 2 Penyusup (`double`) or random 1–2 (`random`)
 */
export function determineKataKataSpyCount(
  playerCount: number,
  spyMode: SpyMode,
  rng: RandomFn = Math.random,
): number {
  if (playerCount < 3) {
    throw new Error('Minimal 3 pemain dibutuhkan untuk memulai Kata-Kata Hari Ini.');
  }
  const canHaveTwoSpies = playerCount >= 5;
  if (spyMode === 'single') return 1;
  if (spyMode === 'double') return canHaveTwoSpies ? 2 : 1;
  return canHaveTwoSpies && rng() >= 0.5 ? 2 : 1;
}

export interface DealKataKataResult {
  citizenWord: string;
  spyWord: string;
  category: string;
  spyUids: string[];
  firstSpeakerUid: string;
  secretsByUid: Record<string, PlayerSecretDoc>;
}

/**
 * Deals a true Blind-Spy Kata-Kata Hari Ini round.
 * CRITICAL SECURITY INVARIANT:
 * Player secrets NEVER contain `isSpy`, `citizenWord`, or `spyWord` labels—only `secretWord`.
 */
export function dealKataKataRound(params: {
  playerUids: readonly string[];
  pool: readonly WordPairItem[];
  previousCitizenWord?: string | null;
  spyMode: SpyMode;
  roundId: string;
  rng?: RandomFn;
}): DealKataKataResult {
  const rng = params.rng ?? Math.random;
  const { playerUids, pool, previousCitizenWord, spyMode, roundId } = params;

  if (playerUids.length < 3) {
    throw new Error('Minimal 3 pemain dibutuhkan untuk memulai ronde.');
  }
  if (pool.length === 0) {
    throw new Error('Daftar pasangan kata kosong. Aktifkan minimal 1 paket kata.');
  }

  const prevNorm = previousCitizenWord ? normalizeWordForCompare(previousCitizenWord) : null;
  const candidates =
    pool.length > 1 && prevNorm
      ? pool.filter(
          (pair) =>
            normalizeWordForCompare(pair.citizenWord) !== prevNorm &&
            normalizeWordForCompare(pair.spyWord) !== prevNorm,
        )
      : [...pool];

  const effectiveCandidates = candidates.length > 0 ? candidates : [...pool];
  const chosenPair = effectiveCandidates[Math.floor(rng() * effectiveCandidates.length)];

  // Randomly swap direction 50% of the time so players cannot memorize which side is always Warga
  const flipDirection = rng() >= 0.5;
  const citizenWord = flipDirection ? chosenPair.spyWord : chosenPair.citizenWord;
  const spyWord = flipDirection ? chosenPair.citizenWord : chosenPair.spyWord;

  const spyCount = determineKataKataSpyCount(playerUids.length, spyMode, rng);
  const shuffledPlayers = shuffleArray(playerUids, rng);
  const spyUids = shuffledPlayers.slice(0, spyCount);
  const spySet = new Set(spyUids);

  const firstSpeakerUid = playerUids[Math.floor(rng() * playerUids.length)];
  const secretsByUid: Record<string, PlayerSecretDoc> = {};

  for (const uid of playerUids) {
    // Strictly omit `isSpy` so even browser DevTools inspection reveals zero role information
    secretsByUid[uid] = {
      uid,
      roundId,
      gameType: 'kata_kata',
      secretWord: spySet.has(uid) ? spyWord : citizenWord,
    };
  }

  return {
    citizenWord,
    spyWord,
    category: chosenPair.category,
    spyUids,
    firstSpeakerUid,
    secretsByUid,
  };
}

export interface KataKataVoteEvaluation {
  outcome: 'pending' | 'convicted' | 'acquitted';
  yesCount: number;
  noCount: number;
  requiredYes: number;
}

export function evaluateKataKataVoteProgress(
  votes: Record<string, 'yes' | 'no'>,
  eligibleAliveVoters: readonly string[],
): KataKataVoteEvaluation {
  let yesCount = 0;
  let noCount = 0;

  for (const uid of eligibleAliveVoters) {
    const choice = votes[uid];
    if (choice === 'yes') yesCount++;
    else if (choice === 'no') noCount++;
  }

  const requiredYes = eligibleAliveVoters.length;
  if (noCount > 0) {
    return { outcome: 'acquitted', yesCount, noCount, requiredYes };
  }
  if (requiredYes > 0 && yesCount >= requiredYes) {
    return { outcome: 'convicted', yesCount, noCount, requiredYes };
  }
  return { outcome: 'pending', yesCount, noCount, requiredYes };
}

export interface EliminationEvaluation {
  wasSpy: boolean;
  remainingAliveUids: string[];
  remainingSpyUids: string[];
  remainingCitizenUids: string[];
  outcome: 'final_spy_last_chance' | 'spies_outnumber' | 'continue';
}

/**
 * Evaluates game state immediately after an alive player is voted out.
 * - If the final remaining Penyusup is caught -> triggers `final_spy_last_chance` (`spy_guess`).
 * - If remaining Penyusup count >= remaining Warga count -> `spies_outnumber` (Tim Penyusup wins).
 * - Otherwise -> round continues with the eliminated player becoming a spectator.
 */
export function evaluateKataKataAfterElimination(params: {
  allPlayerUids: readonly string[];
  previouslyEliminatedUids: readonly string[];
  eliminatedUid: string;
  spyUids: readonly string[];
}): EliminationEvaluation {
  const spySet = new Set(params.spyUids);
  const eliminatedSet = new Set([...params.previouslyEliminatedUids, params.eliminatedUid]);

  const remainingAliveUids = params.allPlayerUids.filter((uid) => !eliminatedSet.has(uid));
  const remainingSpyUids = remainingAliveUids.filter((uid) => spySet.has(uid));
  const remainingCitizenUids = remainingAliveUids.filter((uid) => !spySet.has(uid));
  const wasSpy = spySet.has(params.eliminatedUid);

  if (wasSpy && remainingSpyUids.length === 0) {
    return {
      wasSpy,
      remainingAliveUids,
      remainingSpyUids,
      remainingCitizenUids,
      outcome: 'final_spy_last_chance',
    };
  }

  if (remainingSpyUids.length >= remainingCitizenUids.length) {
    return {
      wasSpy,
      remainingAliveUids,
      remainingSpyUids,
      remainingCitizenUids,
      outcome: 'spies_outnumber',
    };
  }

  return {
    wasSpy,
    remainingAliveUids,
    remainingSpyUids,
    remainingCitizenUids,
    outcome: 'continue',
  };
}

export function evaluateKataKataLastChanceGuess(
  guessedWord: string,
  actualCitizenWord: string,
): boolean {
  const normGuess = normalizeWordForCompare(guessedWord);
  const normActual = normalizeWordForCompare(actualCitizenWord);
  return normGuess.length > 0 && normGuess === normActual;
}

export function calculateKataKataScoreDeltas(params: {
  playerUids: readonly string[];
  spyUids: readonly string[];
  winnerTeam: 'warga' | 'mata_mata';
  initiatorUid?: string | null;
  victoryType:
    | 'all_spies_eliminated'
    | 'last_chance_wrong'
    | 'last_chance_correct'
    | 'spies_outnumber'
    | 'timeout';
}): Record<string, number> {
  const spySet = new Set(params.spyUids);
  const deltas: Record<string, number> = {};

  for (const uid of params.playerUids) {
    deltas[uid] = 0;
  }

  if (params.winnerTeam === 'warga') {
    for (const uid of params.playerUids) {
      if (!spySet.has(uid)) {
        deltas[uid] = 2;
      }
    }
    if (
      params.initiatorUid &&
      !spySet.has(params.initiatorUid) &&
      params.initiatorUid in deltas
    ) {
      deltas[params.initiatorUid] += 1;
    }
    return deltas;
  }

  const spyReward = params.victoryType === 'last_chance_correct' ? 4 : 3;
  for (const uid of params.spyUids) {
    if (uid in deltas) {
      deltas[uid] = spyReward;
    }
  }
  return deltas;
}
