import type {
  CompletedGameRecord,
  GameType,
  PresenceEntry,
  RoomPlayerDoc,
  SessionPlayerStanding,
  SessionRecapDoc,
  SuitClashRecord,
  SuitDuelState,
  SuitPick,
} from '../types';

export const EMPTY_ROOM_RESET_GRACE_MS = 15_000;

/**
 * Returns only active (non-BRB) players eligible to participate in the next round.
 */
export function filterActivePlayers<T extends { isBrb?: boolean }>(players: T[]): T[] {
  return players.filter((p) => !p.isBrb);
}

/**
 * Returns default built-in pack IDs when switching room gameType.
 */
export function getDefaultPacksForGame(gameType: GameType): string[] {
  switch (gameType) {
    case 'kata_kata':
      return ['kuliner', 'keseharian'];
    case 'satu_frekuensi':
      return ['tongkrongan', 'kuliner'];
    case 'fakta_hari_ini':
      return ['hukum_sejarah', 'nusantara'];
    case 'pelukis_gadungan':
      return ['kuliner', 'tongkrongan', 'hewan_alam'];
    case 'malam_siluman':
      return ['malam_siluman'];
    case 'ular_tangga':
      return ['menara_nusantara'];
    case 'cuma_bercanda':
      return ['tongkrongan', 'kantor_kampus'];
    case 'meja_pembohong':
      return ['klasik'];
    case 'spyfall':
    default:
      return ['nusantara', 'klasik'];
  }
}

/**
 * Resolves a completed game match into an immutable ledger record with its own
 * isolated points map (`scoresByUid`) and match winner(s).
 *
 * Accidental Switch Guard: returns `null` when `roundsPlayed <= 0`.
 */
export function finalizeCompletedGameRecord(params: {
  matchIndex: number;
  gameType: GameType;
  roundsPlayed: number;
  players: Array<Pick<RoomPlayerDoc, 'uid' | 'displayName' | 'score'>>;
  finishedAtMs?: number;
}): CompletedGameRecord | null {
  if (params.roundsPlayed <= 0) {
    return null;
  }

  const scoresByUid: Record<string, number> = {};
  const playerNamesByUid: Record<string, string> = {};
  let maxScore = 0;

  for (const player of params.players) {
    const score = Math.max(0, Math.round(player.score ?? 0));
    scoresByUid[player.uid] = score;
    playerNamesByUid[player.uid] = player.displayName.slice(0, 40);
    if (score > maxScore) {
      maxScore = score;
    }
  }

  const winners =
    maxScore > 0
      ? params.players.filter((p) => Math.max(0, Math.round(p.score ?? 0)) === maxScore)
      : [];

  return {
    matchIndex: params.matchIndex,
    gameType: params.gameType,
    roundsPlayed: params.roundsPlayed,
    scoresByUid,
    playerNamesByUid,
    winnerUids: winners.map((p) => p.uid),
    winnerNames: winners.map((p) => p.displayName.slice(0, 40)),
    finishedAtMs: params.finishedAtMs ?? Date.now(),
  };
}

/**
 * Builds the Rekap Permainan standings & MVP evaluation using Monsieur Matt's 3-tier rule:
 * 1. Primary: Most Games Won across all completed matches (each visit = separate match).
 * 2. Tie-Breaker #1: Highest Overall XP (sum of points across completed matches).
 * 3. Tie-Breaker #2: Best-of-3 Batu-Gunting-Kertas (Suit) sudden-death duel!
 */
export function buildSessionRecap(params: {
  completedGames: CompletedGameRecord[];
  players: Array<Pick<RoomPlayerDoc, 'uid' | 'displayName' | 'avatarColor'>>;
  recapId?: string;
  generatedAtMs?: number;
}): SessionRecapDoc {
  const generatedAtMs = params.generatedAtMs ?? Date.now();
  const recapId = params.recapId ?? `recap_${generatedAtMs}`;

  // Union of current players + any player present in completedGames (e.g. if someone left earlier)
  const standingsMap = new Map<string, SessionPlayerStanding>();

  for (const player of params.players) {
    standingsMap.set(player.uid, {
      uid: player.uid,
      displayName: player.displayName.slice(0, 40),
      avatarColor: player.avatarColor || '#6366F1',
      gamesWon: 0,
      overallXp: 0,
      wonGameTypes: [],
    });
  }

  for (const match of params.completedGames) {
    for (const [uid, score] of Object.entries(match.scoresByUid)) {
      let entry = standingsMap.get(uid);
      if (!entry) {
        entry = {
          uid,
          displayName: (match.playerNamesByUid[uid] ?? 'Pemain').slice(0, 40),
          avatarColor: '#64748B',
          gamesWon: 0,
          overallXp: 0,
          wonGameTypes: [],
        };
        standingsMap.set(uid, entry);
      }
      entry.overallXp += Math.max(0, Math.round(score ?? 0));
    }

    for (const winnerUid of match.winnerUids) {
      const entry = standingsMap.get(winnerUid);
      if (entry) {
        entry.gamesWon += 1;
        entry.wonGameTypes.push(match.gameType);
      }
    }
  }

  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    if (b.overallXp !== a.overallXp) return b.overallXp - a.overallXp;
    return a.displayName.localeCompare(b.displayName);
  });

  if (standings.length === 0 || params.completedGames.length === 0) {
    return {
      recapId,
      generatedAtMs,
      completedGames: params.completedGames,
      standings,
      mvpUids: [],
      mvpNames: [],
      resolvedBy: 'none',
      tiebreakerDuel: null,
    };
  }

  const topGamesWon = standings[0].gamesWon;
  const tiedOnWins = standings.filter((s) => s.gamesWon === topGamesWon);

  // Clean Tier-1 winner (sole leader by games won)
  if (tiedOnWins.length === 1) {
    return {
      recapId,
      generatedAtMs,
      completedGames: params.completedGames,
      standings,
      mvpUids: [tiedOnWins[0].uid],
      mvpNames: [tiedOnWins[0].displayName],
      resolvedBy: 'games_won',
      tiebreakerDuel: null,
    };
  }

  // Tier 2: Break tie using highest Overall XP
  const topXpAmongTied = Math.max(...tiedOnWins.map((s) => s.overallXp));
  const tiedOnBoth = tiedOnWins.filter((s) => s.overallXp === topXpAmongTied);

  if (tiedOnBoth.length === 1) {
    return {
      recapId,
      generatedAtMs,
      completedGames: params.completedGames,
      standings,
      mvpUids: [tiedOnBoth[0].uid],
      mvpNames: [tiedOnBoth[0].displayName],
      resolvedBy: 'overall_xp',
      tiebreakerDuel: null,
    };
  }

  // Tier 3: Still tied on BOTH Games Won and Overall XP -> Best-of-3 Suit Duel!
  // Only include finalists who are still in the room if possible; fallback to all tiedOnBoth
  const presentUids = new Set(params.players.map((p) => p.uid));
  const presentFinalists = tiedOnBoth.filter((s) => presentUids.has(s.uid));
  const finalists = presentFinalists.length >= 2 ? presentFinalists : tiedOnBoth;

  const winsByUid: Record<string, number> = {};
  const duelistNames: Record<string, string> = {};
  for (const finalist of finalists) {
    winsByUid[finalist.uid] = 0;
    duelistNames[finalist.uid] = finalist.displayName;
  }

  const tiebreakerDuel: SuitDuelState = {
    duelId: `duel_${generatedAtMs}`,
    status: 'picking',
    duelistUids: finalists.map((f) => f.uid),
    duelistNames,
    clashNumber: 1,
    targetWins: 2, // Best of 3 -> first to 2 wins
    winsByUid,
    submittedUids: [],
    lastClash: null,
    history: [],
    championUids: [],
  };

  return {
    recapId,
    generatedAtMs,
    completedGames: params.completedGames,
    standings,
    mvpUids: [],
    mvpNames: [],
    resolvedBy: 'suit_duel',
    tiebreakerDuel,
  };
}

const SUIT_BEATS: Record<SuitPick, SuitPick> = {
  batu: 'gunting',
  gunting: 'kertas',
  kertas: 'batu',
};

/**
 * Evaluates a single simultaneous Batu-Gunting-Kertas clash for 2 or more duelists.
 * - 2 distinct symbols thrown -> everyone with the beating symbol scores +1 clash win.
 * - 1 symbol (all same) or all 3 symbols -> Draw (Seri), replay clash.
 * - First duelist(s) to reach `targetWins` (2 in Best of 3) with a strict lead takes MVP!
 */
export function evaluateSuitClash(params: {
  duel: SuitDuelState;
  picksByUid: Record<string, SuitPick>;
}): SuitDuelState {
  const { duel, picksByUid } = params;
  const distinctPicks = Array.from(
    new Set(
      duel.duelistUids
        .map((uid) => picksByUid[uid])
        .filter((pick): pick is SuitPick => Boolean(pick)),
    ),
  );

  let winnerUids: string[] = [];
  let isDraw = true;

  if (distinctPicks.length === 2) {
    const [a, b] = distinctPicks;
    const winningPick = SUIT_BEATS[a] === b ? a : b;
    winnerUids = duel.duelistUids.filter((uid) => picksByUid[uid] === winningPick);
    isDraw = false;
  }

  const nextWinsByUid: Record<string, number> = { ...duel.winsByUid };
  for (const uid of winnerUids) {
    nextWinsByUid[uid] = (nextWinsByUid[uid] ?? 0) + 1;
  }

  const clashRecord: SuitClashRecord = {
    clashNumber: duel.clashNumber,
    picksByUid: { ...picksByUid },
    winnerUids,
    isDraw,
  };

  const nextHistory = [...duel.history, clashRecord].slice(-20);

  // Determine if anyone won the Best-of-3 match (reached targetWins and leads)
  const maxWins = Math.max(...duel.duelistUids.map((uid) => nextWinsByUid[uid] ?? 0), 0);
  const leaders = duel.duelistUids.filter((uid) => (nextWinsByUid[uid] ?? 0) === maxWins);
  const hasSoleChampion = maxWins >= duel.targetWins && leaders.length === 1;

  // If 3+ players are dueling and 2 players simultaneously hit targetWins, narrow to sudden death between leaders
  const nextDuelistUids =
    maxWins >= duel.targetWins && leaders.length > 1 ? leaders : duel.duelistUids;

  return {
    ...duel,
    duelistUids: nextDuelistUids,
    status: hasSoleChampion ? 'finished' : 'clash_reveal',
    winsByUid: nextWinsByUid,
    submittedUids: [...duel.duelistUids],
    lastClash: clashRecord,
    history: nextHistory,
    championUids: hasSoleChampion ? leaders : [],
  };
}

/**
 * Determines whether an inactive room should automatically reset its session stats
 * based on Monsieur Matt's 15-second empty-room rule (zero Cloud Functions required).
 *
 * Returns `true` ONLY when:
 * 1. No real player (ignoring `isStage` TV displays) is currently `online: true` in RTDB.
 * 2. At least `graceMs` (15,000ms) have elapsed since the most recent player went offline/left.
 */
export function shouldAutoResetExpiredRoom(params: {
  presence: Record<string, PresenceEntry>;
  lastEmptyAtMs?: number | null;
  nowMs?: number;
  graceMs?: number;
  excludeUid?: string;
}): boolean {
  const nowMs = params.nowMs ?? Date.now();
  const graceMs = params.graceMs ?? EMPTY_ROOM_RESET_GRACE_MS;

  const playerEntries = Object.values(params.presence).filter(
    (entry) => !entry.isStage && entry.uid !== params.excludeUid,
  );

  // If ANY real player is still online, NEVER reset!
  if (playerEntries.some((entry) => entry.online === true)) {
    return false;
  }

  let latestOfflineMs = typeof params.lastEmptyAtMs === 'number' ? params.lastEmptyAtMs : 0;
  for (const entry of playerEntries) {
    if (typeof entry.lastSeen === 'number' && entry.lastSeen > latestOfflineMs) {
      latestOfflineMs = entry.lastSeen;
    }
  }

  if (latestOfflineMs <= 0) {
    return false;
  }

  return nowMs - latestOfflineMs >= graceMs;
}
