import { INDONESIAN_LOCATIONS } from './locations-id';
import type {
  CustomLocation,
  PlayerSecretDoc,
  SpyMode,
  SpyfallLocation,
} from '../types';
import {
  evaluateMajorityVoteProgress,
  type MajorityVoteOutcome,
  type MajorityVoteProgress,
} from '../voting/engine';

export type RandomFn = () => number;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(rng: RandomFn = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(rng() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[idx];
  }
  return code;
}

export function shuffleArray<T>(items: readonly T[], rng: RandomFn = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sanitizeCustomLocation(input: {
  id?: string;
  name: string;
  category?: string;
  roles: string[];
}): CustomLocation | null {
  const trimmedName = input.name.trim().slice(0, 60);
  if (!trimmedName) return null;

  const trimmedCategory = (input.category || 'Kustom').trim().slice(0, 32) || 'Kustom';
  const cleanedRoles = Array.from(
    new Set(
      input.roles
        .map((r) => r.trim().slice(0, 48))
        .filter((r) => r.length > 0),
    ),
  ).slice(0, 16);

  if (cleanedRoles.length < 2) {
    return null;
  }

  const safeId =
    input.id && /^[a-zA-Z0-9_-]{2,48}$/.test(input.id)
      ? input.id
      : `kustom-${trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 32) || 'lokasi'}-${Math.floor(Math.random() * 10000)}`;

  return {
    id: safeId,
    name: trimmedName,
    category: trimmedCategory,
    roles: cleanedRoles,
  };
}

export function mergeLocationPool(
  enabledPacks: readonly string[],
  customLocations: readonly CustomLocation[],
): SpyfallLocation[] {
  const packSet = new Set(enabledPacks);
  const builtIn = INDONESIAN_LOCATIONS.filter((loc) => packSet.has(loc.packId));

  const customMapped: SpyfallLocation[] = customLocations
    .map((loc) => sanitizeCustomLocation(loc))
    .filter((loc): loc is CustomLocation => loc !== null)
    .map((loc) => ({
      ...loc,
      packId: 'kustom',
      packLabel: 'Lokasi Kustom',
    }));

  // Deduplicate by lowercase location name, preferring custom definitions if named identically
  const byName = new Map<string, SpyfallLocation>();
  for (const loc of builtIn) {
    byName.set(loc.name.toLowerCase(), loc);
  }
  for (const loc of customMapped) {
    byName.set(loc.name.toLowerCase(), loc);
  }

  return Array.from(byName.values());
}

export function pickNextLocation(
  pool: readonly SpyfallLocation[],
  previousLocationName?: string | null,
  rng: RandomFn = Math.random,
): SpyfallLocation {
  if (pool.length === 0) {
    throw new Error('Minimal harus ada 1 lokasi aktif untuk memulai ronde.');
  }

  if (pool.length === 1) {
    return pool[0];
  }

  const candidates = previousLocationName
    ? pool.filter(
        (loc) => loc.name.toLowerCase() !== previousLocationName.trim().toLowerCase(),
      )
    : pool;

  const finalPool = candidates.length > 0 ? candidates : pool;
  const idx = Math.floor(rng() * finalPool.length);
  return finalPool[idx];
}

export function determineSpyCount(
  playerCount: number,
  spyMode: SpyMode,
  rng: RandomFn = Math.random,
): number {
  if (playerCount < 3) {
    throw new Error('Spyfall membutuhkan minimal 3 pemain.');
  }
  if (spyMode === 'single') {
    return 1;
  }
  if (spyMode === 'double') {
    return playerCount >= 5 ? 2 : 1;
  }
  // 'random': strategic uncertainty when >= 5 players (65% 1 spy, 35% 2 spies)
  if (playerCount >= 5) {
    return rng() < 0.35 ? 2 : 1;
  }
  return 1;
}

export interface DealRoundInput {
  playerUids: readonly string[];
  pool: readonly SpyfallLocation[];
  previousLocationName?: string | null;
  spyMode: SpyMode;
  roundId: string;
  rng?: RandomFn;
}

export interface DealRoundOutput {
  location: SpyfallLocation;
  spyUids: string[];
  firstSpeakerUid: string;
  selectedLocationNames: string[];
  secretsByUid: Record<string, Omit<PlayerSecretDoc, 'createdAt'>>;
}

export function dealSpyfallRound(input: DealRoundInput): DealRoundOutput {
  const rng = input.rng ?? Math.random;
  const uniquePlayers = Array.from(new Set(input.playerUids));

  if (uniquePlayers.length < 3) {
    throw new Error('Minimal 3 pemain dibutuhkan untuk memulai permainan Spyfall.');
  }

  const location = pickNextLocation(input.pool, input.previousLocationName, rng);
  const spyCount = determineSpyCount(uniquePlayers.length, input.spyMode, rng);

  const shuffledPlayers = shuffleArray(uniquePlayers, rng);
  const spyUids = shuffledPlayers.slice(0, spyCount);
  const spySet = new Set(spyUids);

  const shuffledRoles = shuffleArray(location.roles, rng);
  const secretsByUid: Record<string, Omit<PlayerSecretDoc, 'createdAt'>> = {};

  let roleCursor = 0;
  for (const uid of uniquePlayers) {
    if (spySet.has(uid)) {
      secretsByUid[uid] = {
        uid,
        roundId: input.roundId,
        gameType: 'spyfall',
        isSpy: true,
        locationName: null,
        roleName: 'Mata-Mata',
      };
    } else {
      const assignedRole =
        shuffledRoles[roleCursor % shuffledRoles.length] || 'Pengunjung';
      roleCursor += 1;
      secretsByUid[uid] = {
        uid,
        roundId: input.roundId,
        gameType: 'spyfall',
        isSpy: false,
        locationName: location.name,
        roleName: assignedRole,
      };
    }
  }

  const firstSpeakerUid =
    uniquePlayers[Math.floor(rng() * uniquePlayers.length)];

  return {
    location,
    spyUids,
    firstSpeakerUid,
    selectedLocationNames: input.pool.map((loc) => loc.name).sort((a, b) => a.localeCompare(b, 'id')),
    secretsByUid,
  };
}

export type VoteOutcome = MajorityVoteOutcome;

export function evaluateVoteProgress(
  votes: Record<string, 'yes' | 'no'>,
  eligibleVoterUids: readonly string[],
): MajorityVoteProgress {
  return evaluateMajorityVoteProgress(votes, eligibleVoterUids);
}

export function evaluateSpyGuess(
  guessedLocation: string,
  actualLocation: string,
): boolean {
  return (
    guessedLocation.trim().toLowerCase() === actualLocation.trim().toLowerCase()
  );
}

export function calculateRoundScoreDeltas(params: {
  playerUids: readonly string[];
  spyUids: readonly string[];
  winnerTeam: 'warga' | 'mata_mata';
  initiatorUid?: string | null;
  victoryType: 'timeout' | 'spy_guess_correct' | 'spy_guess_wrong' | 'false_accusation' | 'caught_no_guess';
}): Record<string, number> {
  const deltas: Record<string, number> = {};
  const spySet = new Set(params.spyUids);

  for (const uid of params.playerUids) {
    deltas[uid] = 0;
  }

  if (params.winnerTeam === 'mata_mata') {
    const spyPoints = params.victoryType === 'timeout' ? 2 : 4;
    for (const spyUid of params.spyUids) {
      deltas[spyUid] = spyPoints;
    }
  } else {
    for (const uid of params.playerUids) {
      if (!spySet.has(uid)) {
        deltas[uid] = 1;
      }
    }
    if (
      params.initiatorUid &&
      !spySet.has(params.initiatorUid) &&
      deltas[params.initiatorUid] !== undefined
    ) {
      deltas[params.initiatorUid] += 1; // +1 bonus untuk pelapor yang tepat
    }
  }

  return deltas;
}
