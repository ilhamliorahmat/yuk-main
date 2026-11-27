import { describe, expect, it } from 'vitest';
import { castUpvoteBallot, evaluateUpvoteRound } from '../upvote';

describe('Reusable Upvote Voting Evaluator', () => {
  const entries = [
    { entryId: 'e1', authorUid: 'u1' },
    { entryId: 'e2', authorUid: 'u2' },
    { entryId: 'e3', authorUid: 'u3' },
  ];
  const entriesById = Object.fromEntries(entries.map((e) => [e.entryId, e]));
  const participants = ['u1', 'u2', 'u3'];

  it('rejects self-upvotes and duplicate votes in the same round', () => {
    expect(() =>
      castUpvoteBallot({
        voterUid: 'u1',
        voterName: 'Budi',
        kind: 'standard',
        targetEntryId: 'e1',
        participantUids: participants,
        entriesById,
        votesByUid: {},
        goldenUsedByUid: [],
        allowGoldenUpvote: true,
      }),
    ).toThrow(/sendiri/i);

    const first = castUpvoteBallot({
      voterUid: 'u1',
      voterName: 'Budi',
      kind: 'standard',
      targetEntryId: 'e2',
      participantUids: participants,
      entriesById,
      votesByUid: {},
      goldenUsedByUid: [],
      allowGoldenUpvote: true,
    });

    expect(() =>
      castUpvoteBallot({
        voterUid: 'u1',
        voterName: 'Budi',
        kind: 'standard',
        targetEntryId: 'e3',
        participantUids: participants,
        entriesById,
        votesByUid: first.nextVotesByUid,
        goldenUsedByUid: first.nextGoldenUsedByUid,
        allowGoldenUpvote: true,
      }),
    ).toThrow(/sudah mengirim/i);
  });

  it('enforces once-per-session Golden Upvote (+3) and unlimited cumulative incoming points', () => {
    const step1 = castUpvoteBallot({
      voterUid: 'u1',
      voterName: 'Budi',
      kind: 'golden',
      targetEntryId: 'e2',
      participantUids: participants,
      entriesById,
      votesByUid: {},
      goldenUsedByUid: [],
      allowGoldenUpvote: true,
    });
    expect(step1.nextGoldenUsedByUid).toEqual(['u1']);
    expect(step1.allParticipantsVoted).toBe(false);

    // u1 cannot use golden upvote again later in the same session (round 2)
    expect(() =>
      castUpvoteBallot({
        voterUid: 'u1',
        voterName: 'Budi',
        kind: 'golden',
        targetEntryId: 'e3',
        participantUids: participants,
        entriesById,
        votesByUid: {},
        goldenUsedByUid: step1.nextGoldenUsedByUid,
        allowGoldenUpvote: true,
      }),
    ).toThrow(/1 kali per seluruh sesi/i);

    const step2 = castUpvoteBallot({
      voterUid: 'u3',
      voterName: 'Cici',
      kind: 'golden',
      targetEntryId: 'e2',
      participantUids: participants,
      entriesById,
      votesByUid: step1.nextVotesByUid,
      goldenUsedByUid: step1.nextGoldenUsedByUid,
      allowGoldenUpvote: true,
    });

    const step3 = castUpvoteBallot({
      voterUid: 'u2',
      voterName: 'Ani',
      kind: 'skip',
      targetEntryId: null,
      participantUids: participants,
      entriesById,
      votesByUid: step2.nextVotesByUid,
      goldenUsedByUid: step2.nextGoldenUsedByUid,
      allowGoldenUpvote: true,
    });

    expect(step3.allParticipantsVoted).toBe(true);

    const summary = evaluateUpvoteRound({ entries, votesByUid: step3.nextVotesByUid });
    expect(summary.scoreDeltas).toEqual({ u2: 6 }); // 2 golden upvotes = +6 uncapped!
    expect(summary.winnerEntryIds).toEqual(['e2']);
    expect(summary.winnerAuthorUids).toEqual(['u2']);
    expect(summary.entryTallies.e2.goldenVoterUids).toEqual(['u1', 'u3']);
  });
});
