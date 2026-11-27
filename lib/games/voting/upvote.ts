import type { CumaBercandaVoteKind, CumaBercandaVoteRecord } from '../types';

export interface UpvoteTargetMeta {
  entryId: string;
  authorUid: string;
}

export interface UpvoteCastResult {
  nextVotesByUid: Record<string, CumaBercandaVoteRecord>;
  nextGoldenUsedByUid: string[];
  allParticipantsVoted: boolean;
}

export interface UpvoteEntryTally {
  entryId: string;
  authorUid: string;
  standardVoterUids: string[];
  goldenVoterUids: string[];
  totalPoints: number;
}

export interface UpvoteRoundSummary {
  entryTallies: Record<string, UpvoteEntryTally>;
  scoreDeltas: Record<string, number>;
  winnerEntryIds: string[];
  winnerAuthorUids: string[];
  maxPoints: number;
}

export const STANDARD_UPVOTE_POINTS = 1;
export const GOLDEN_UPVOTE_POINTS = 3;

/**
 * Reusable session-scoped upvote ballot validator:
 * - Enforces strictly one ballot per participant per voting round.
 * - Strictly forbids self-upvotes (`voterUid === target.authorUid`).
 * - Supports optional `'golden'` (+3 pts) upvote usable ONLY once across an entire match session (`goldenUsedByUid`).
 * - Allows `'skip'` (0 pts) so participants never block rounds even in 2-player rooms or if they prefer not to upvote.
 * - Never caps how many total upvotes an author can receive (`totalPoints` scales freely).
 */
export function castUpvoteBallot(params: {
  voterUid: string;
  voterName: string;
  kind: CumaBercandaVoteKind;
  targetEntryId: string | null;
  participantUids: string[];
  entriesById: Record<string, UpvoteTargetMeta>;
  votesByUid: Record<string, CumaBercandaVoteRecord>;
  goldenUsedByUid: string[];
  allowGoldenUpvote: boolean;
}): UpvoteCastResult {
  const {
    voterUid,
    voterName,
    kind,
    targetEntryId,
    participantUids,
    entriesById,
    votesByUid,
    goldenUsedByUid,
    allowGoldenUpvote,
  } = params;

  if (!participantUids.includes(voterUid)) {
    throw new Error('Hanya pemain aktif ronde ini yang dapat memberi upvote.');
  }

  if (votesByUid[voterUid]) {
    throw new Error('Kamu sudah mengirim keputusan upvote untuk ronde ini.');
  }

  let points = 0;
  let resolvedEntryId: string | null = null;
  const nextGoldenUsed = [...goldenUsedByUid];

  if (kind === 'skip') {
    points = 0;
    resolvedEntryId = null;
  } else {
    if (!targetEntryId || !entriesById[targetEntryId]) {
      throw new Error('Komik yang dipilih untuk di-upvote tidak ditemukan.');
    }
    const target = entriesById[targetEntryId];
    if (target.authorUid === voterUid) {
      throw new Error('Dilarang meng-upvote komik milik sendiri!');
    }

    if (kind === 'golden') {
      if (!allowGoldenUpvote) {
        throw new Error('Golden Upvote sedang dinonaktifkan oleh Host.');
      }
      if (goldenUsedByUid.includes(voterUid)) {
        throw new Error('Golden Upvote hanya dapat dipakai 1 kali per seluruh sesi permainan.');
      }
      points = GOLDEN_UPVOTE_POINTS;
      nextGoldenUsed.push(voterUid);
    } else if (kind === 'standard') {
      points = STANDARD_UPVOTE_POINTS;
    } else {
      throw new Error('Jenis upvote tidak dikenali.');
    }

    resolvedEntryId = targetEntryId;
  }

  const nextVotesByUid: Record<string, CumaBercandaVoteRecord> = {
    ...votesByUid,
    [voterUid]: {
      voterUid,
      voterName,
      targetEntryId: resolvedEntryId,
      kind,
      points,
    },
  };

  const allParticipantsVoted = participantUids.every((uid) => Boolean(nextVotesByUid[uid]));

  return {
    nextVotesByUid,
    nextGoldenUsedByUid: nextGoldenUsed,
    allParticipantsVoted,
  };
}

/**
 * Aggregates all valid upvote ballots into uncapped entry totals, uncapped player score deltas,
 * and winning entry IDs (supports ties cleanly).
 */
export function evaluateUpvoteRound(params: {
  entries: UpvoteTargetMeta[];
  votesByUid: Record<string, CumaBercandaVoteRecord>;
}): UpvoteRoundSummary {
  const entryTallies: Record<string, UpvoteEntryTally> = {};
  const scoreDeltas: Record<string, number> = {};

  for (const entry of params.entries) {
    entryTallies[entry.entryId] = {
      entryId: entry.entryId,
      authorUid: entry.authorUid,
      standardVoterUids: [],
      goldenVoterUids: [],
      totalPoints: 0,
    };
  }

  for (const vote of Object.values(params.votesByUid)) {
    if (vote.kind === 'skip' || !vote.targetEntryId) continue;
    const tally = entryTallies[vote.targetEntryId];
    if (!tally) continue;
    if (tally.authorUid === vote.voterUid) continue;

    if (vote.kind === 'golden') {
      tally.goldenVoterUids.push(vote.voterUid);
      tally.totalPoints += GOLDEN_UPVOTE_POINTS;
      scoreDeltas[tally.authorUid] = (scoreDeltas[tally.authorUid] ?? 0) + GOLDEN_UPVOTE_POINTS;
    } else {
      tally.standardVoterUids.push(vote.voterUid);
      tally.totalPoints += STANDARD_UPVOTE_POINTS;
      scoreDeltas[tally.authorUid] = (scoreDeltas[tally.authorUid] ?? 0) + STANDARD_UPVOTE_POINTS;
    }
  }

  const maxPoints = Math.max(
    0,
    ...Object.values(entryTallies).map((tally) => tally.totalPoints),
  );

  const winners =
    maxPoints > 0
      ? Object.values(entryTallies).filter((tally) => tally.totalPoints === maxPoints)
      : [];

  return {
    entryTallies,
    scoreDeltas,
    winnerEntryIds: winners.map((w) => w.entryId),
    winnerAuthorUids: Array.from(new Set(winners.map((w) => w.authorUid))),
    maxPoints,
  };
}
