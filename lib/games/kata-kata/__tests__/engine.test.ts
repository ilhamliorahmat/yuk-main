import { describe, expect, it } from 'vitest';
import {
  calculateKataKataScoreDeltas,
  dealKataKataRound,
  determineKataKataSpyCount,
  evaluateKataKataAfterElimination,
  evaluateKataKataLastChanceGuess,
  evaluateKataKataVoteProgress,
  mergeWordPairPool,
  sanitizeCustomWordPair,
} from '../engine';
import { BUILTIN_WORD_PAIRS } from '../words-id';

function makeSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('Kata-Kata Hari Ini pure engine', () => {
  it('deals true blind secrets with zero isSpy leakage and distinct spy/citizen words', () => {
    const playerUids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const dealt = dealKataKataRound({
      playerUids,
      pool: BUILTIN_WORD_PAIRS,
      spyMode: 'single',
      roundId: 'round_1',
      rng: makeSeededRng(42),
    });

    expect(dealt.spyUids).toHaveLength(1);
    expect(dealt.citizenWord).not.toBe(dealt.spyWord);

    let spyWordCount = 0;
    let citizenWordCount = 0;

    for (const uid of playerUids) {
      const secret = dealt.secretsByUid[uid];
      expect(secret.gameType).toBe('kata_kata');
      // Critical security invariant: isSpy must NEVER be present on player secrets
      expect('isSpy' in secret).toBe(false);
      expect(secret.isSpy).toBeUndefined();
      expect(secret.secretWord).toBeTruthy();

      if (dealt.spyUids.includes(uid)) {
        expect(secret.secretWord).toBe(dealt.spyWord);
        spyWordCount++;
      } else {
        expect(secret.secretWord).toBe(dealt.citizenWord);
        citizenWordCount++;
      }
    }

    expect(spyWordCount).toBe(1);
    expect(citizenWordCount).toBe(4);
  });

  it('clamps multi-spy count safely based on player count', () => {
    expect(determineKataKataSpyCount(3, 'double')).toBe(1);
    expect(determineKataKataSpyCount(4, 'double')).toBe(1);
    expect(determineKataKataSpyCount(5, 'double')).toBe(2);
    expect(determineKataKataSpyCount(8, 'double')).toBe(2);
    expect(determineKataKataSpyCount(4, 'random', () => 0.99)).toBe(1);
    expect(determineKataKataSpyCount(6, 'random', () => 0.99)).toBe(2);
    expect(determineKataKataSpyCount(6, 'random', () => 0.1)).toBe(1);
  });

  it('deals 2 spies sharing the exact same decoy word in multi-spy mode', () => {
    const playerUids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const dealt = dealKataKataRound({
      playerUids,
      pool: BUILTIN_WORD_PAIRS,
      spyMode: 'double',
      roundId: 'round_2',
      rng: makeSeededRng(101),
    });

    expect(dealt.spyUids).toHaveLength(2);
    const spyWords = dealt.spyUids.map((uid) => dealt.secretsByUid[uid].secretWord);
    expect(spyWords[0]).toBe(dealt.spyWord);
    expect(spyWords[1]).toBe(dealt.spyWord);
  });

  it('handles multi-round elimination chains and triggers last-chance guess only on final spy', () => {
    const allPlayerUids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const spyUids = ['p2', 'p5'];

    // Catch spy #1 -> game continues because spy #2 is still undercover
    const step1 = evaluateKataKataAfterElimination({
      allPlayerUids,
      previouslyEliminatedUids: [],
      eliminatedUid: 'p2',
      spyUids,
    });
    expect(step1.wasSpy).toBe(true);
    expect(step1.outcome).toBe('continue');
    expect(step1.remainingSpyUids).toEqual(['p5']);

    // Accidentally vote out a citizen -> still 3 citizens vs 1 spy -> continue
    const step2 = evaluateKataKataAfterElimination({
      allPlayerUids,
      previouslyEliminatedUids: ['p2'],
      eliminatedUid: 'p1',
      spyUids,
    });
    expect(step2.wasSpy).toBe(false);
    expect(step2.outcome).toBe('continue');

    // Catch final spy #2 -> triggers final_spy_last_chance
    const step3 = evaluateKataKataAfterElimination({
      allPlayerUids,
      previouslyEliminatedUids: ['p2', 'p1'],
      eliminatedUid: 'p5',
      spyUids,
    });
    expect(step3.wasSpy).toBe(true);
    expect(step3.outcome).toBe('final_spy_last_chance');
  });

  it('grants immediate victory to Penyusup when surviving spies equal or outnumber citizens', () => {
    const res = evaluateKataKataAfterElimination({
      allPlayerUids: ['p1', 'p2', 'p3'],
      previouslyEliminatedUids: [],
      eliminatedUid: 'p1',
      spyUids: ['p3'],
    });
    expect(res.wasSpy).toBe(false);
    expect(res.remainingCitizenUids).toEqual(['p2']);
    expect(res.remainingSpyUids).toEqual(['p3']);
    expect(res.outcome).toBe('spies_outnumber');
  });

  it('evaluates last-chance word guesses with normalization for case, spaces, and punctuation', () => {
    expect(evaluateKataKataLastChanceGuess('  mie   ayam! ', 'Mie Ayam')).toBe(true);
    expect(evaluateKataKataLastChanceGuess('es kopi susu', 'Es Kopi Susu')).toBe(true);
    expect(evaluateKataKataLastChanceGuess('Bakso', 'Mie Ayam')).toBe(false);
    expect(evaluateKataKataLastChanceGuess('   ', 'Mie Ayam')).toBe(false);
  });

  it('evaluates 50% + 1 majority accusation votes strictly over eligible alive voters', () => {
    // 3 eligible alive voters -> requiredYes = 2
    expect(
      evaluateKataKataVoteProgress({ p1: 'yes' }, ['p1', 'p2', 'p3']).outcome,
    ).toBe('pending');
    expect(
      evaluateKataKataVoteProgress({ p1: 'yes', p2: 'no', eliminated: 'no' }, ['p1', 'p2', 'p3'])
        .outcome,
    ).toBe('pending');
    expect(
      evaluateKataKataVoteProgress({ p1: 'yes', p2: 'yes' }, ['p1', 'p2', 'p3']).outcome,
    ).toBe('convicted');
    expect(
      evaluateKataKataVoteProgress({ p1: 'yes', p2: 'no', p3: 'no' }, ['p1', 'p2', 'p3']).outcome,
    ).toBe('acquitted');
  });

  it('sanitizes custom word pairs and rejects identical words', () => {
    expect(
      sanitizeCustomWordPair({ citizenWord: 'Bakso', spyWord: '  bakso!! ', category: 'Test' }),
    ).toBeNull();

    const valid = sanitizeCustomWordPair({
      citizenWord: '  Nasi Padang ',
      spyWord: ' Warteg ',
      category: 'Kuliner',
    });
    expect(valid).not.toBeNull();
    expect(valid?.citizenWord).toBe('Nasi Padang');
    expect(valid?.spyWord).toBe('Warteg');

    const pool = mergeWordPairPool(['kuliner'], valid ? [valid] : []);
    expect(pool.some((p) => p.citizenWord === 'Nasi Padang')).toBe(true);
  });

  it('calculates score deltas accurately for both teams and last-chance steals', () => {
    const wargaWin = calculateKataKataScoreDeltas({
      playerUids: ['p1', 'p2', 'p3', 'p4'],
      spyUids: ['p4'],
      winnerTeam: 'warga',
      initiatorUid: 'p1',
      victoryType: 'last_chance_wrong',
    });
    expect(wargaWin).toEqual({ p1: 3, p2: 2, p3: 2, p4: 0 });

    const spySteal = calculateKataKataScoreDeltas({
      playerUids: ['p1', 'p2', 'p3', 'p4'],
      spyUids: ['p4'],
      winnerTeam: 'mata_mata',
      victoryType: 'last_chance_correct',
    });
    expect(spySteal).toEqual({ p1: 0, p2: 0, p3: 0, p4: 4 });
  });
});
