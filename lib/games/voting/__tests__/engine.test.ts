import { describe, expect, it } from 'vitest';
import {
  evaluateMajorityVoteProgress,
  getEligibleMajorityVoterUids,
  getMajorityThreshold,
} from '../engine';

describe('Shared 50% + 1 Majority Voting Module', () => {
  it('computes strict 50% + 1 majority threshold accurately for every voter pool size', () => {
    expect(getMajorityThreshold(0)).toBe(0);
    expect(getMajorityThreshold(-2)).toBe(0);
    expect(getMajorityThreshold(1)).toBe(1);
    expect(getMajorityThreshold(2)).toBe(2);
    expect(getMajorityThreshold(3)).toBe(2);
    expect(getMajorityThreshold(4)).toBe(3);
    expect(getMajorityThreshold(5)).toBe(3);
    expect(getMajorityThreshold(6)).toBe(4);
    expect(getMajorityThreshold(7)).toBe(4);
    expect(getMajorityThreshold(11)).toBe(6);
  });

  it('keeps voting pending on a single no vote when 50% + 1 is still reachable', () => {
    const voters = ['u1', 'u2', 'u3']; // requiredYes = 2

    const afterInitiator = evaluateMajorityVoteProgress({ u1: 'yes' }, voters);
    expect(afterInitiator).toEqual({
      outcome: 'pending',
      yesCount: 1,
      noCount: 0,
      requiredYes: 2,
      totalEligible: 3,
      remainingCount: 2,
    });

    const afterOneNo = evaluateMajorityVoteProgress({ u1: 'yes', u2: 'no' }, voters);
    expect(afterOneNo).toEqual({
      outcome: 'pending',
      yesCount: 1,
      noCount: 1,
      requiredYes: 2,
      totalEligible: 3,
      remainingCount: 1,
    });

    const afterMajorityYes = evaluateMajorityVoteProgress(
      { u1: 'yes', u2: 'no', u3: 'yes' },
      voters,
    );
    expect(afterMajorityYes.outcome).toBe('convicted');
    expect(afterMajorityYes.yesCount).toBe(2);
    expect(afterMajorityYes.noCount).toBe(1);
    expect(afterMajorityYes.remainingCount).toBe(0);
  });

  it('acquits early once enough no votes make 50% + 1 mathematically impossible', () => {
    const fourVoters = ['u1', 'u2', 'u3', 'u4']; // requiredYes = 3
    expect(evaluateMajorityVoteProgress({ u1: 'yes', u2: 'no' }, fourVoters).outcome).toBe(
      'pending',
    );
    expect(
      evaluateMajorityVoteProgress({ u1: 'yes', u2: 'no', u3: 'no' }, fourVoters).outcome,
    ).toBe('acquitted');

    const fiveVoters = ['u1', 'u2', 'u3', 'u4', 'u5']; // requiredYes = 3
    expect(
      evaluateMajorityVoteProgress({ u1: 'yes', u2: 'no', u3: 'no' }, fiveVoters).outcome,
    ).toBe('pending');
    expect(
      evaluateMajorityVoteProgress(
        { u1: 'yes', u2: 'no', u3: 'no', u4: 'no' },
        fiveVoters,
      ).outcome,
    ).toBe('acquitted');
  });

  it('convicts early as soon as 50% + 1 yes votes are reached without waiting for stragglers', () => {
    const fiveVoters = ['u1', 'u2', 'u3', 'u4', 'u5']; // requiredYes = 3
    const result = evaluateMajorityVoteProgress(
      { u1: 'yes', u2: 'yes', u3: 'yes' },
      fiveVoters,
    );
    expect(result.outcome).toBe('convicted');
    expect(result.remainingCount).toBe(2);
  });

  it('handles 2-voter pools, empty pools, duplicate UIDs, and ignores ineligible voters', () => {
    // 2 eligible voters -> requiredYes = 2
    expect(evaluateMajorityVoteProgress({ u1: 'yes' }, ['u1', 'u2']).outcome).toBe('pending');
    expect(evaluateMajorityVoteProgress({ u1: 'yes', u2: 'no' }, ['u1', 'u2']).outcome).toBe(
      'acquitted',
    );
    expect(evaluateMajorityVoteProgress({ u1: 'yes', u2: 'yes' }, ['u1', 'u2']).outcome).toBe(
      'convicted',
    );

    // Empty eligible pool safely acquits instead of hanging
    expect(evaluateMajorityVoteProgress({ u1: 'yes' }, []).outcome).toBe('acquitted');

    // Ignores votes from non-eligible users (e.g. target/BRB/eliminated) and deduplicates UIDs
    const filtered = evaluateMajorityVoteProgress(
      { u1: 'yes', target: 'no', brb_user: 'no', eliminated: 'no' },
      ['u1', 'u1', 'u2', 'u3'],
    );
    expect(filtered.totalEligible).toBe(3);
    expect(filtered.yesCount).toBe(1);
    expect(filtered.noCount).toBe(0);
    expect(filtered.outcome).toBe('pending');
  });

  it('filters eligible voter UIDs excluding target, BRB, and eliminated seats', () => {
    const eligible = getEligibleMajorityVoterUids({
      players: [
        { uid: 'p1', isBrb: false },
        { uid: 'p2', isBrb: true },
        { uid: 'p3', isBrb: false },
        { uid: 'p4', isBrb: false },
        { uid: 'p5', isBrb: false },
      ],
      targetUid: 'p3',
      excludedUids: ['p5'],
    });

    expect(eligible).toEqual(['p1', 'p4']);
  });
});
