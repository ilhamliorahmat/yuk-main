import type { CustomFactItem, FactItem, PlayerSecretDoc } from '../types';
import { BUILTIN_FACTS_ID } from './facts-id';

/**
 * Parses a convenience string like "Di Arab Saudi ... karena (tidak ada hukum korupsi)."
 * into structured { prefix, twist, suffix }.
 */
export function parseParentheticalFactText(raw: string): {
  prefix: string;
  twist: string;
  suffix: string;
} | null {
  const clean = raw.trim().replace(/\s+/g, ' ');
  const openIdx = clean.indexOf('(');
  const closeIdx = clean.lastIndexOf(')');
  if (openIdx === -1 || closeIdx <= openIdx + 1) return null;

  const prefix = clean.slice(0, openIdx).slice(0, 220);
  const twist = clean.slice(openIdx + 1, closeIdx).trim().slice(0, 220);
  const suffix = clean.slice(closeIdx + 1).slice(0, 120);

  if (!twist || (!prefix.trim() && !suffix.trim())) return null;
  return { prefix, twist, suffix };
}

export function sanitizeCustomFact(input: {
  id?: string;
  prefix: string;
  twist: string;
  suffix?: string;
  category?: string;
}): CustomFactItem | null {
  const prefix = input.prefix.replace(/\s+/g, ' ').slice(0, 220);
  const twist = input.twist.trim().replace(/\s+/g, ' ').slice(0, 220);
  const suffix = (input.suffix ?? '').replace(/\s+/g, ' ').slice(0, 120);

  if (!twist || (!prefix.trim() && !suffix.trim())) return null;

  const category = (input.category?.trim() || 'Kustom').replace(/\s+/g, ' ').slice(0, 32);
  const id =
    input.id?.trim().slice(0, 40) ||
    `custom_fact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  return { id, prefix, twist, suffix, category };
}

export function mergeFactPool(
  enabledPacks: string[],
  customFacts: CustomFactItem[] = [],
): FactItem[] {
  const packSet = new Set(enabledPacks);
  const builtIn = BUILTIN_FACTS_ID.filter((item) => packSet.has(item.packId));
  const custom: FactItem[] = customFacts
    .map((item) => sanitizeCustomFact(item))
    .filter((item): item is CustomFactItem => item !== null)
    .map((item) => ({
      ...item,
      packId: 'custom',
      packLabel: 'Fakta Kustom',
    }));

  const combined = [...builtIn, ...custom];
  return combined.length > 0 ? combined : BUILTIN_FACTS_ID.slice(0, 15);
}

/**
 * Deterministic ordered rotation so players take turns in join order as Penebak.
 */
export function pickNextGuesserIndex(
  playerCount: number,
  previousIndex: number | null,
): number {
  if (playerCount <= 0) return 0;
  if (previousIndex === null || previousIndex < 0) return 0;
  return (previousIndex + 1) % playerCount;
}

/**
 * Resolves who controls "Fase Selanjutnya" for a Fakta Hari Ini round:
 * - Normally the Host controls it.
 * - CRITICAL RULE: If the Host is currently playing as the Penebak (Guesser),
 *   the Host CANNOT press "Fase Selanjutnya" — a random non-guesser Bluffer is appointed instead.
 */
export function selectFaktaPhaseController(params: {
  playerUids: string[];
  hostUid: string;
  guesserUid: string;
  controllerByUid?: Record<string, string>;
  rng?: () => number;
}): string {
  const rng = params.rng ?? Math.random;
  if (params.hostUid !== params.guesserUid && params.playerUids.includes(params.hostUid)) {
    return params.hostUid;
  }

  const nonGuessers = params.playerUids.filter((uid) => uid !== params.guesserUid);
  if (nonGuessers.length === 0) {
    return params.hostUid;
  }

  // If Host is sharing a device via Numpang, prefer a Bluffer on a different device
  if (params.controllerByUid) {
    const hostDeviceUid = params.controllerByUid[params.hostUid] ?? params.hostUid;
    const independentDeviceBluffers = nonGuessers.filter(
      (uid) => (params.controllerByUid?.[uid] ?? uid) !== hostDeviceUid,
    );
    if (independentDeviceBluffers.length > 0) {
      const idx = Math.floor(rng() * independentDeviceBluffers.length);
      return independentDeviceBluffers[idx] ?? independentDeviceBluffers[0];
    }
  }

  const idx = Math.floor(rng() * nonGuessers.length);
  return nonGuessers[idx] ?? nonGuessers[0];
}

export function dealFaktaHariIniRound(params: {
  players: Array<{ uid: string; displayName: string; controllerUid?: string }>;
  hostUid: string;
  pool: FactItem[];
  previousFactTwist?: string | null;
  previousRotationIndex?: number | null;
  roundId: string;
  rng?: () => number;
}): {
  fact: FactItem;
  guesserUid: string;
  guesserName: string;
  rotationIndex: number;
  truthTellerUid: string;
  truthTellerName: string;
  phaseControllerUid: string;
  phaseControllerName: string;
  secretsByUid: Record<string, PlayerSecretDoc>;
} {
  const rng = params.rng ?? Math.random;
  if (params.players.length < 3) {
    throw new Error('Minimal 3 pemain dibutuhkan untuk memulai Fakta Hari Ini.');
  }
  if (params.pool.length === 0) {
    throw new Error('Daftar fakta kosong.');
  }

  const candidates =
    params.pool.length > 1 && params.previousFactTwist
      ? params.pool.filter((item) => item.twist !== params.previousFactTwist)
      : params.pool;
  const effectivePool = candidates.length > 0 ? candidates : params.pool;
  const fact = effectivePool[Math.floor(rng() * effectivePool.length)] ?? effectivePool[0];

  // 1. Ordered Guesser selection
  const rotationIndex = pickNextGuesserIndex(
    params.players.length,
    params.previousRotationIndex ?? null,
  );
  const guesser = params.players[rotationIndex] ?? params.players[0];

  // 2. Random Truth-Teller selection strictly from the non-guesser Bluffer team
  const bluffers = params.players.filter((p) => p.uid !== guesser.uid);
  const truthTeller = bluffers[Math.floor(rng() * bluffers.length)] ?? bluffers[0];

  // 3. Phase Controller selection (Host normally; random Bluffer on separate device if Host is Guesser)
  const controllerByUid: Record<string, string> = {};
  for (const p of params.players) {
    controllerByUid[p.uid] = p.controllerUid ?? p.uid;
  }

  const phaseControllerUid = selectFaktaPhaseController({
    playerUids: params.players.map((p) => p.uid),
    hostUid: params.hostUid,
    guesserUid: guesser.uid,
    controllerByUid,
    rng,
  });
  const phaseController =
    params.players.find((p) => p.uid === phaseControllerUid) ?? bluffers[0];

  // 4. Build strictly isolated per-player secret cards:
  //    - Penebak gets ONLY `{ isGuesser: true }` (zero fact text or truthTeller identity!).
  //    - ALL Bluffers receive the full fact with parenthetical twist AND team-wide awareness
  //      of who was picked as Pembawa Fakta (`truthTellerUid`, `truthTellerName`).
  const secretsByUid: Record<string, PlayerSecretDoc> = {};
  for (const player of params.players) {
    if (player.uid === guesser.uid) {
      secretsByUid[player.uid] = {
        uid: player.uid,
        roundId: params.roundId,
        gameType: 'fakta_hari_ini',
        isGuesser: true,
      };
    } else {
      secretsByUid[player.uid] = {
        uid: player.uid,
        roundId: params.roundId,
        gameType: 'fakta_hari_ini',
        isGuesser: false,
        isTruthTeller: player.uid === truthTeller.uid,
        truthTellerUid: truthTeller.uid,
        truthTellerName: truthTeller.displayName,
        factPrefix: fact.prefix,
        factTwist: fact.twist,
        factSuffix: fact.suffix,
        factCategory: fact.category,
      };
    }
  }

  return {
    fact,
    guesserUid: guesser.uid,
    guesserName: guesser.displayName,
    rotationIndex,
    truthTellerUid: truthTeller.uid,
    truthTellerName: truthTeller.displayName,
    phaseControllerUid: phaseController.uid,
    phaseControllerName: phaseController.displayName,
    secretsByUid,
  };
}

/**
 * Exact scoring rules specified by Monsieur Matt:
 * - If Penebak wins (picks the assigned Pembawa Fakta):
 *   Penebak earns +(N - 1) points (where N = total players in room); Bluffers earn 0.
 * - If Penebak loses (picks a wrong Bluffer):
 *   EVERY Bluffer (all N - 1 non-guessers, including the Pembawa Fakta!) earns +1 point; Penebak earns 0.
 */
export function calculateFaktaHariIniScoreDeltas(params: {
  playerUids: string[];
  guesserUid: string;
  truthTellerUid: string;
  pickedUid: string;
}): {
  guesserWon: boolean;
  guesserPoints: number;
  blufferPointsEach: number;
  deltas: Record<string, number>;
} {
  const totalPlayers = params.playerUids.length;
  const blufferCount = Math.max(1, totalPlayers - 1);
  const guesserWon = params.pickedUid === params.truthTellerUid;
  const deltas: Record<string, number> = {};

  if (guesserWon) {
    // Cap at 11 (matching maxPlayers = 12) for safety with Firestore rules
    const guesserPoints = Math.min(11, blufferCount);
    for (const uid of params.playerUids) {
      deltas[uid] = uid === params.guesserUid ? guesserPoints : 0;
    }
    return {
      guesserWon: true,
      guesserPoints,
      blufferPointsEach: 0,
      deltas,
    };
  }

  for (const uid of params.playerUids) {
    deltas[uid] = uid === params.guesserUid ? 0 : 1;
  }
  return {
    guesserWon: false,
    guesserPoints: 0,
    blufferPointsEach: 1,
    deltas,
  };
}
