import { describe, expect, it } from 'vitest';
import type { RoomPlayerDoc } from '../../types';
import {
  dealMejaPembohongRound,
  isClaimHonest,
  playMejaCards,
  resolveMejaChallenge,
  startNextMejaSubRound,
} from '../engine';

function makePlayer(uid: string, name: string): RoomPlayerDoc {
  return {
    uid,
    roomId: 'room_meja',
    displayName: name,
    avatarColor: '#F59E0B',
    isHost: uid === 'u1',
    score: 0,
    isReady: true,
    isBrb: false,
  };
}

describe('Meja Pembohong Engine (Game #9)', () => {
  it('deals 5 private cards per player with zero card leakage on public state', () => {
    const deal = dealMejaPembohongRound({
      roundId: 'r1',
      roundNumber: 1,
      players: [makePlayer('u1', 'Andi'), makePlayer('u2', 'Budi'), makePlayer('u3', 'Citra')],
      settings: { mode: 'silinder' },
      createdAtMs: 1000,
    });

    expect(deal.mejaPembohongState.livingUids).toHaveLength(3);
    expect(deal.mejaPembohongState.handCountByUid.u1).toBe(5);
    expect(deal.mejaPembohongState.handCountByUid.u2).toBe(5);
    expect(deal.mejaPembohongState.handCountByUid.u3).toBe(5);

    // Public state must never expose trap slots or actual hand ranks
    expect(JSON.stringify(deal.mejaPembohongState)).not.toContain('mejaHandsByUid');
    expect(JSON.stringify(deal.mejaPembohongState)).not.toContain('trapSlot');

    expect(deal.playerSecrets.u1.mejaHand).toHaveLength(5);
    expect(deal.playerSecrets.u2.mejaHand).toHaveLength(5);
  });

  it('requires at least 2 active players and skips BRB players', () => {
    const p1 = makePlayer('u1', 'Andi');
    const p2 = { ...makePlayer('u2', 'Budi'), isBrb: true };
    expect(() =>
      dealMejaPembohongRound({
        roundId: 'r1',
        roundNumber: 1,
        players: [p1, p2],
      }),
    ).toThrow(/Minimal 2/i);
  });

  it('treats Joker as wild card for any table rank', () => {
    expect(
      isClaimHonest(
        [
          { id: 'c1', rank: 'raja' },
          { id: 'c2', rank: 'joker' },
        ],
        'raja',
      ),
    ).toBe(true);
    expect(
      isClaimHonest(
        [
          { id: 'c1', rank: 'raja' },
          { id: 'c2', rank: 'as' },
        ],
        'raja',
      ),
    ).toBe(false);
  });

  it('eliminates the liar on bullet match and crowns last survivor in silinder mode', () => {
    const deal = dealMejaPembohongRound({
      roundId: 'r1',
      roundNumber: 1,
      players: [makePlayer('u1', 'Andi'), makePlayer('u2', 'Budi')],
      settings: { mode: 'silinder' },
      rng: () => 0.05, // trapSlot = 1 for immediate lethal click test
    });

    const firstUid = deal.mejaPembohongState.currentTurnUid;
    const secondUid = deal.mejaPembohongState.turnOrder.find((u) => u !== firstUid)!;

    // Force a guaranteed lie on firstUid's hand
    const hands = {
      ...deal.serverState.mejaHandsByUid!,
      [firstUid]: [
        {
          id: 'lie_1',
          rank: (deal.mejaPembohongState.tableRank === 'raja' ? 'as' : 'raja') as 'as' | 'raja',
        },
        ...deal.serverState.mejaHandsByUid![firstUid].slice(1),
      ],
    };

    const played = playMejaCards({
      state: deal.mejaPembohongState,
      handsByUid: hands,
      actorUid: firstUid,
      cardIds: ['lie_1'],
      claimId: 'claim_1',
    });

    expect(played.nextState.currentTurnUid).toBe(secondUid);
    expect(played.nextState.pileCardCount).toBe(1);
    expect(played.nextHandsByUid[firstUid]).toHaveLength(4);

    const challenged = resolveMejaChallenge({
      state: played.nextState,
      challengerUid: secondUid,
      pendingClaimCards: played.playedCards,
      trapSlotByUid: deal.serverState.mejaTrapSlotByUid!,
    });

    expect(challenged.challengeReveal.wasLie).toBe(true);
    expect(challenged.challengeReveal.hitBullet).toBe(true);
    expect(challenged.challengeReveal.eliminatedUid).toBe(firstUid);
    expect(challenged.matchFinished).toBe(true);
    expect(challenged.nextState.phase).toBe('reveal');
    expect(challenged.nextState.winnerUids).toEqual([secondUid]);
    expect(challenged.scoreDeltas[secondUid]).toBe(6); // +1 survive +1 duel +4 champion
  });

  it('awards +2 points cleanly and runs next sub-round in cepat mode', () => {
    const deal = dealMejaPembohongRound({
      roundId: 'r2',
      roundNumber: 1,
      players: [makePlayer('u1', 'Andi'), makePlayer('u2', 'Budi')],
      settings: { mode: 'cepat' },
      rng: () => 0.1,
    });

    const firstUid = deal.mejaPembohongState.currentTurnUid;
    const secondUid = deal.mejaPembohongState.turnOrder.find((u) => u !== firstUid)!;
    const tableRank = deal.mejaPembohongState.tableRank;

    const hands = {
      ...deal.serverState.mejaHandsByUid!,
      [firstUid]: [{ id: 'truth_1', rank: tableRank }],
    };

    const played = playMejaCards({
      state: deal.mejaPembohongState,
      handsByUid: hands,
      actorUid: firstUid,
      cardIds: ['truth_1'],
      claimId: 'claim_truth',
    });

    const challenged = resolveMejaChallenge({
      state: played.nextState,
      challengerUid: secondUid,
      pendingClaimCards: played.playedCards,
      trapSlotByUid: deal.serverState.mejaTrapSlotByUid!,
    });

    expect(challenged.challengeReveal.wasLie).toBe(false);
    expect(challenged.challengeReveal.winnerUid).toBe(firstUid);
    expect(challenged.scoreDeltas[firstUid]).toBe(2);
    expect(challenged.nextState.phase).toBe('challenge_reveal');

    const sub2 = startNextMejaSubRound({
      state: challenged.nextState,
      trapSlotByUid: deal.serverState.mejaTrapSlotByUid!,
    });
    expect(sub2.matchFinished).toBe(false);
    expect(sub2.nextState.subRoundNumber).toBe(2);
    expect(sub2.nextHandsByUid[firstUid]).toHaveLength(5);
    expect(sub2.nextHandsByUid[secondUid]).toHaveLength(5);
  });
});
