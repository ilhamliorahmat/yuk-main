import type {
  BercandaCard,
  BercandaComicEntry,
  CumaBercandaSettings,
  CumaBercandaState,
  CumaBercandaVoteKind,
  PlayerSecretDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '../types';
import { filterActivePlayers } from '../session/engine';
import { castUpvoteBallot, evaluateUpvoteRound, type UpvoteTargetMeta } from '../voting/upvote';
import {
  BUILTIN_BERCANDA_CARDS_ID,
  mergeBercandaCardPool,
  sanitizeCumaBercandaSettings,
} from './packs';
import type { CustomBercandaCard } from '../types';

export const BERCANDA_HAND_SIZE = 7;

export interface CumaBercandaRoundSetup {
  roundId: string;
  roundNumber: number;
  cumaBercandaState: CumaBercandaState;
  serverState: ServerRoundStateDoc;
  secretsByUid: Record<string, PlayerSecretDoc>;
}

function defaultShuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawNextCard(params: {
  deckIds: string[];
  poolById: Map<string, BercandaCard>;
  allPoolIds: string[];
  excludedIds: Set<string>;
  shuffle: <T>(arr: T[]) => T[];
}): { card: BercandaCard; nextDeckIds: string[] } {
  let queue = [...params.deckIds];
  while (queue.length > 0) {
    const candidateId = queue.shift()!;
    if (params.excludedIds.has(candidateId)) continue;
    const card = params.poolById.get(candidateId);
    if (card) {
      params.excludedIds.add(candidateId);
      return { card, nextDeckIds: queue };
    }
  }

  // Reshuffle unused cards from pool if deck ran dry
  const refillIds = params.shuffle(
    params.allPoolIds.filter((id) => !params.excludedIds.has(id)),
  );
  queue = refillIds.length > 0 ? refillIds : params.shuffle([...params.allPoolIds]);

  const fallbackId = queue.shift()!;
  const card = params.poolById.get(fallbackId) ?? BUILTIN_BERCANDA_CARDS_ID[0];
  params.excludedIds.add(card.id);
  return { card, nextDeckIds: queue };
}

/**
 * Starts a Cuma Bercanda round (System + System + Player):
 * - Enforces >= 2 active (non-BRB) players.
 * - Deals Panel 1 & Panel 2 publicly to start the comic strip.
 * - Preserves unused cards in each player's hand from previous rounds and replenishes up to 7 cards.
 * - Preserves `goldenUsedByUid` across consecutive rounds in the same match session.
 */
export function createCumaBercandaRound(params: {
  players: RoomPlayerDoc[];
  roundNumber: number;
  enabledPacks: string[];
  customCards?: CustomBercandaCard[];
  settings?: Partial<CumaBercandaSettings> | null;
  previousHandsByUid?: Record<string, BercandaCard[]>;
  previousDeckIds?: string[];
  previousGoldenUsedByUid?: string[];
  roundId?: string;
  shuffle?: <T>(items: T[]) => T[];
}): CumaBercandaRoundSetup {
  const activePlayers = filterActivePlayers(params.players);
  if (activePlayers.length < 2) {
    throw new Error('Cuma Bercanda membutuhkan minimal 2 pemain aktif (tidak BRB)!');
  }

  const shuffle = params.shuffle ?? defaultShuffle;
  const settings = sanitizeCumaBercandaSettings(params.settings);
  const roundId = params.roundId ?? `round_${params.roundNumber}_${Date.now()}`;

  const pool = mergeBercandaCardPool(params.enabledPacks, params.customCards ?? []);
  const poolById = new Map<string, BercandaCard>(pool.map((c) => [c.id, c]));
  const allPoolIds = pool.map((c) => c.id);

  // Track cards already in surviving hands so we don't deal duplicates onto the table
  const excludedIds = new Set<string>();
  const handsByUid: Record<string, BercandaCard[]> = {};

  for (const player of activePlayers) {
    const prevHand = (params.previousHandsByUid?.[player.uid] ?? []).filter((c) =>
      poolById.has(c.id),
    );
    const dedupedHand: BercandaCard[] = [];
    for (const c of prevHand) {
      if (!excludedIds.has(c.id) && dedupedHand.length < BERCANDA_HAND_SIZE) {
        dedupedHand.push(c);
        excludedIds.add(c.id);
      }
    }
    handsByUid[player.uid] = dedupedHand;
  }

  let deckIds =
    Array.isArray(params.previousDeckIds) && params.previousDeckIds.length > 0
      ? params.previousDeckIds.filter((id) => poolById.has(id) && !excludedIds.has(id))
      : shuffle(allPoolIds.filter((id) => !excludedIds.has(id)));

  // System deals Panel 1 & Panel 2 publicly
  const p1 = drawNextCard({ deckIds, poolById, allPoolIds, excludedIds, shuffle });
  deckIds = p1.nextDeckIds;
  const p2 = drawNextCard({ deckIds, poolById, allPoolIds, excludedIds, shuffle });
  deckIds = p2.nextDeckIds;

  // Replenish every active player's hand up to 7 cards
  for (const player of activePlayers) {
    const hand = handsByUid[player.uid];
    while (hand.length < BERCANDA_HAND_SIZE) {
      const drawn = drawNextCard({ deckIds, poolById, allPoolIds, excludedIds, shuffle });
      deckIds = drawn.nextDeckIds;
      hand.push(drawn.card);
    }
  }

  const participantUids = activePlayers.map((p) => p.uid);
  const participantNamesByUid: Record<string, string> = {};
  for (const p of activePlayers) {
    participantNamesByUid[p.uid] = p.displayName;
  }

  const secretsByUid: Record<string, PlayerSecretDoc> = {};
  for (const p of activePlayers) {
    secretsByUid[p.uid] = {
      uid: p.uid,
      roundId,
      gameType: 'cuma_bercanda',
      bercandaHand: handsByUid[p.uid],
      bercandaOwnedEntryId: null,
      bercandaSubmittedCardId: null,
      createdAt: Date.now(),
    };
  }

  const goldenUsedByUid = Array.from(new Set(params.previousGoldenUsedByUid ?? [])).filter(
    (uid) => participantUids.includes(uid) || params.players.some((p) => p.uid === uid),
  );

  const cumaBercandaState: CumaBercandaState = {
    phase: 'picking',
    allowGoldenUpvote: settings.allowGoldenUpvote,
    panel1: p1.card,
    panel2: p2.card,
    participantUids,
    participantNamesByUid,
    submittedUids: [],
    votedUids: [],
    goldenUsedByUid,
    entries: [],
    winnerEntryIds: [],
    votesByUid: {},
  };

  const serverState: ServerRoundStateDoc = {
    roundId,
    roundNumber: params.roundNumber,
    locationName: 'Cuma Bercanda',
    spyUids: [],
    spyNames: [],
    bercandaHandsByUid: handsByUid,
    bercandaDeckIds: deckIds,
    bercandaEntriesMeta: {},
    createdAtMs: Date.now(),
  };

  return {
    roundId,
    roundNumber: params.roundNumber,
    cumaBercandaState,
    serverState,
    secretsByUid,
  };
}

/**
 * Transitions the `picking` phase into anonymous `voting`:
 * - Shuffles collected submissions so table position never hints at authorship.
 * - Strips `authorUid` & `authorName` (`null`) from public `entries` while keeping
 *   author mapping strictly inside `serverState.bercandaEntriesMeta` + `ownedEntryIdsByUid`
 *   (sent only to each player's own `PlayerSecretDoc.bercandaOwnedEntryId`).
 */
export function transitionCumaBercandaToVoting(params: {
  state: CumaBercandaState;
  submissionsByUid: Record<string, BercandaCard>;
  shuffle?: <T>(items: T[]) => T[];
}): {
  nextState: CumaBercandaState;
  entriesMeta: Record<
    string,
    { entryId: string; authorUid: string; authorName: string; panel3: BercandaCard }
  >;
  ownedEntryIdsByUid: Record<string, string>;
} {
  const { state, submissionsByUid } = params;
  const shuffle = params.shuffle ?? defaultShuffle;

  const submittedPairs = Object.entries(submissionsByUid).filter(([uid]) =>
    state.participantUids.includes(uid),
  );
  if (submittedPairs.length === 0) {
    throw new Error('Belum ada pemain yang mengirim kartu Panel 3!');
  }

  const shuffledPairs = shuffle(submittedPairs);
  const entries: BercandaComicEntry[] = [];
  const entriesMeta: Record<
    string,
    { entryId: string; authorUid: string; authorName: string; panel3: BercandaCard }
  > = {};
  const ownedEntryIdsByUid: Record<string, string> = {};

  shuffledPairs.forEach(([uid, panel3], index) => {
    const entryId = `comic_${index + 1}`;
    const authorName = state.participantNamesByUid[uid] ?? 'Pemain';
    entries.push({
      entryId,
      panel3,
      authorUid: null,
      authorName: null,
      standardVoterUids: [],
      goldenVoterUids: [],
      totalPoints: 0,
    });
    entriesMeta[entryId] = {
      entryId,
      authorUid: uid,
      authorName,
      panel3,
    };
    ownedEntryIdsByUid[uid] = entryId;
  });

  const nextState: CumaBercandaState = {
    ...state,
    phase: 'voting',
    entries,
    votedUids: [],
    winnerEntryIds: [],
    votesByUid: {},
  };

  return {
    nextState,
    entriesMeta,
    ownedEntryIdsByUid,
  };
}

/**
 * Validates and removes the chosen Panel 3 card from a player's private hand.
 */
export function submitCumaBercandaPunchline(params: {
  state: CumaBercandaState;
  uid: string;
  cardId: string;
  currentHand: BercandaCard[];
}): {
  chosenCard: BercandaCard;
  nextHand: BercandaCard[];
  nextSubmittedUids: string[];
  allSubmitted: boolean;
} {
  if (params.state.phase !== 'picking') {
    throw new Error('Fase pemilihan kartu sudah ditutup.');
  }
  if (!params.state.participantUids.includes(params.uid)) {
    throw new Error('Hanya pemain aktif ronde ini yang bisa mengirim kartu.');
  }
  if (params.state.submittedUids.includes(params.uid)) {
    throw new Error('Kamu sudah mengirim Panel 3 untuk ronde ini.');
  }

  const cardIdx = params.currentHand.findIndex((c) => c.id === params.cardId);
  if (cardIdx < 0) {
    throw new Error('Kartu pilihan tidak ditemukan di tanganmu.');
  }

  const chosenCard = params.currentHand[cardIdx];
  const nextHand = params.currentHand.filter((_, idx) => idx !== cardIdx);
  const nextSubmittedUids = [...params.state.submittedUids, params.uid];
  const allSubmitted = params.state.participantUids.every((id) =>
    nextSubmittedUids.includes(id),
  );

  return {
    chosenCard,
    nextHand,
    nextSubmittedUids,
    allSubmitted,
  };
}

/**
 * Records a player's upvote (+1 standard, +3 once-per-session golden, or skip)
 * during `voting` phase via the reusable upvote module.
 */
export function castCumaBercandaUpvote(params: {
  state: CumaBercandaState;
  entriesMeta: Record<string, UpvoteTargetMeta>;
  voterUid: string;
  voterName: string;
  kind: CumaBercandaVoteKind;
  targetEntryId: string | null;
}): {
  nextState: CumaBercandaState;
  allParticipantsVoted: boolean;
} {
  if (params.state.phase !== 'voting') {
    throw new Error('Voting upvote hanya dibuka saat semua komik siap dinilai.');
  }

  const result = castUpvoteBallot({
    voterUid: params.voterUid,
    voterName: params.voterName,
    kind: params.kind,
    targetEntryId: params.targetEntryId,
    participantUids: params.state.participantUids,
    entriesById: params.entriesMeta,
    votesByUid: params.state.votesByUid ?? {},
    goldenUsedByUid: params.state.goldenUsedByUid,
    allowGoldenUpvote: params.state.allowGoldenUpvote,
  });

  const nextState: CumaBercandaState = {
    ...params.state,
    votedUids: Object.keys(result.nextVotesByUid),
    goldenUsedByUid: result.nextGoldenUsedByUid,
    votesByUid: result.nextVotesByUid,
  };

  return {
    nextState,
    allParticipantsVoted: result.allParticipantsVoted,
  };
}

/**
 * Reveals comic authors, tallies all standard & golden upvotes, computes uncapped score deltas,
 * and builds the RoundResult banner.
 */
export function finalizeCumaBercandaReveal(params: {
  state: CumaBercandaState;
  entriesMeta: Record<
    string,
    { entryId: string; authorUid: string; authorName: string; panel3: BercandaCard }
  >;
  roundNumber: number;
  resolvedAtMs?: number;
}): {
  nextState: CumaBercandaState;
  scoreDeltas: Record<string, number>;
  roundResult: RoundResult;
} {
  const entriesList = Object.values(params.entriesMeta);
  const summary = evaluateUpvoteRound({
    entries: entriesList.map((e) => ({ entryId: e.entryId, authorUid: e.authorUid })),
    votesByUid: params.state.votesByUid ?? {},
  });

  const revealedEntries: BercandaComicEntry[] = params.state.entries
    .map((entry) => {
      const meta = params.entriesMeta[entry.entryId];
      const tally = summary.entryTallies[entry.entryId];
      return {
        entryId: entry.entryId,
        panel3: entry.panel3,
        authorUid: meta?.authorUid ?? null,
        authorName: meta?.authorName ?? 'Pemain',
        standardVoterUids: tally?.standardVoterUids ?? [],
        goldenVoterUids: tally?.goldenVoterUids ?? [],
        totalPoints: tally?.totalPoints ?? 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const winnerNames = summary.winnerAuthorUids.map(
    (uid) => params.state.participantNamesByUid[uid] ?? 'Pemain',
  );

  const reason =
    summary.maxPoints > 0 && winnerNames.length > 0
      ? `${winnerNames.join(' & ')} mencetak komik terlucu dengan +${summary.maxPoints} poin upvote!`
      : 'Ronde selesai tanpa ada poin upvote yang masuk.';

  const nextState: CumaBercandaState = {
    ...params.state,
    phase: 'reveal',
    entries: revealedEntries,
    winnerEntryIds: summary.winnerEntryIds,
  };

  const roundResult: RoundResult = {
    roundNumber: params.roundNumber,
    winnerTeam: 'komikus',
    reason,
    locationName: `${params.state.panel1.caption.slice(0, 36)}…`,
    guessedLocation: null,
    spyUids: summary.winnerAuthorUids,
    spyNames: winnerNames,
    resolvedAtMs: params.resolvedAtMs ?? Date.now(),
    scoresApplied: true,
  };

  return {
    nextState,
    scoreDeltas: summary.scoreDeltas,
    roundResult,
  };
}
