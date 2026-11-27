import { describe, expect, it } from 'vitest';
import type { RoomPlayerDoc } from '../../types';
import {
  BERCANDA_HAND_SIZE,
  castCumaBercandaUpvote,
  createCumaBercandaRound,
  finalizeCumaBercandaReveal,
  submitCumaBercandaPunchline,
  transitionCumaBercandaToVoting,
} from '../engine';
import { BUILTIN_BERCANDA_CARDS_ID } from '../packs';

function makePlayers(count: number): RoomPlayerDoc[] {
  return Array.from({ length: count }, (_, idx) => ({
    uid: `u${idx + 1}`,
    roomId: 'room_cb',
    displayName: `Pemain ${idx + 1}`,
    avatarColor: '#6366F1',
    isHost: idx === 0,
    score: 0,
    isReady: true,
  }));
}

describe('Cuma Bercanda Engine', () => {
  it('enforces minimum 2 active players (skipping BRB players)', () => {
    const twoPlayers = makePlayers(2);
    twoPlayers[1].isBrb = true;

    expect(() =>
      createCumaBercandaRound({
        players: twoPlayers,
        roundNumber: 1,
        enabledPacks: ['tongkrongan'],
      }),
    ).toThrow(/minimal 2 pemain/i);

    twoPlayers[1].isBrb = false;
    const round = createCumaBercandaRound({
      players: twoPlayers,
      roundNumber: 1,
      enabledPacks: ['tongkrongan'],
    });
    expect(round.cumaBercandaState.participantUids).toEqual(['u1', 'u2']);
    expect(round.secretsByUid.u1.bercandaHand).toHaveLength(BERCANDA_HAND_SIZE);
    expect(round.secretsByUid.u2.bercandaHand).toHaveLength(BERCANDA_HAND_SIZE);
    expect(round.cumaBercandaState.panel1.id).not.toBe(round.cumaBercandaState.panel2.id);
  });

  it('ships 90 built-in cards across 3 packs', () => {
    expect(BUILTIN_BERCANDA_CARDS_ID).toHaveLength(90);
    const ids = new Set(BUILTIN_BERCANDA_CARDS_ID.map((c) => c.id));
    expect(ids.size).toBe(90);
  });

  it('runs full picking -> anonymous voting -> uncapped reveal + hand carry-over & golden limit across rounds', () => {
    const players = makePlayers(4);
    const r1 = createCumaBercandaRound({
      players,
      roundNumber: 1,
      enabledPacks: ['tongkrongan', 'kantor_kampus'],
    });

    // Submit 1 card from each player and track their remaining hands
    const submissions: Record<string, typeof r1.cumaBercandaState.panel1> = {};
    const remainingHands = { ...r1.serverState.bercandaHandsByUid! };
    let state = r1.cumaBercandaState;

    for (const uid of state.participantUids) {
      const hand = remainingHands[uid];
      const res = submitCumaBercandaPunchline({
        state,
        uid,
        cardId: hand[0].id,
        currentHand: hand,
      });
      submissions[uid] = res.chosenCard;
      remainingHands[uid] = res.nextHand;
      state = { ...state, submittedUids: res.nextSubmittedUids };
      expect(remainingHands[uid]).toHaveLength(BERCANDA_HAND_SIZE - 1);
    }

    const voting = transitionCumaBercandaToVoting({
      state,
      submissionsByUid: submissions,
    });

    // Ensure strict anonymity in public entries
    for (const entry of voting.nextState.entries) {
      expect(entry.authorUid).toBeNull();
      expect(entry.authorName).toBeNull();
    }

    const u1Owned = voting.ownedEntryIdsByUid.u1;
    const u2Owned = voting.ownedEntryIdsByUid.u2;

    // Self-upvote blocked
    expect(() =>
      castCumaBercandaUpvote({
        state: voting.nextState,
        entriesMeta: voting.entriesMeta,
        voterUid: 'u1',
        voterName: 'Pemain 1',
        kind: 'standard',
        targetEntryId: u1Owned,
      }),
    ).toThrow(/sendiri/i);

    // u1 casts Golden (+3) for u2, u3 & u4 cast Standard (+1) for u2, u2 skips
    let voteState = castCumaBercandaUpvote({
      state: voting.nextState,
      entriesMeta: voting.entriesMeta,
      voterUid: 'u1',
      voterName: 'Pemain 1',
      kind: 'golden',
      targetEntryId: u2Owned,
    }).nextState;

    voteState = castCumaBercandaUpvote({
      state: voteState,
      entriesMeta: voting.entriesMeta,
      voterUid: 'u3',
      voterName: 'Pemain 3',
      kind: 'standard',
      targetEntryId: u2Owned,
    }).nextState;

    voteState = castCumaBercandaUpvote({
      state: voteState,
      entriesMeta: voting.entriesMeta,
      voterUid: 'u4',
      voterName: 'Pemain 4',
      kind: 'standard',
      targetEntryId: u2Owned,
    }).nextState;

    const finalCast = castCumaBercandaUpvote({
      state: voteState,
      entriesMeta: voting.entriesMeta,
      voterUid: 'u2',
      voterName: 'Pemain 2',
      kind: 'skip',
      targetEntryId: null,
    });
    expect(finalCast.allParticipantsVoted).toBe(true);

    const revealed = finalizeCumaBercandaReveal({
      state: finalCast.nextState,
      entriesMeta: voting.entriesMeta,
      roundNumber: 1,
    });

    // u2 gets +5 uncapped (3 + 1 + 1)
    expect(revealed.scoreDeltas).toEqual({ u2: 5 });
    expect(revealed.nextState.entries[0].authorUid).toBe('u2');
    expect(revealed.roundResult.winnerTeam).toBe('komikus');

    // Start Round 2: hands replenish from 6 back to 7 while keeping the remaining 6 cards, and u1's golden upvote remains spent
    const r2 = createCumaBercandaRound({
      players,
      roundNumber: 2,
      enabledPacks: ['tongkrongan', 'kantor_kampus'],
      previousHandsByUid: remainingHands,
      previousDeckIds: r1.serverState.bercandaDeckIds,
      previousGoldenUsedByUid: revealed.nextState.goldenUsedByUid,
    });

    expect(r2.cumaBercandaState.goldenUsedByUid).toEqual(['u1']);
    const u1HandR2 = r2.secretsByUid.u1.bercandaHand!;
    expect(u1HandR2).toHaveLength(BERCANDA_HAND_SIZE);
    // First 6 cards preserved in exact order
    expect(u1HandR2.slice(0, 6).map((c) => c.id)).toEqual(remainingHands.u1.map((c) => c.id));
  });
});
