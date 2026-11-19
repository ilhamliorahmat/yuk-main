import { describe, expect, it } from 'vitest';
import {
  dealSatuFrekuensiRound,
  evaluateFrequencyGuess,
  mergeSpectrumPool,
  pickNextPsychicIndex,
  sanitizeCustomSpectrum,
  scoreSatuFrekuensiRound,
} from '../engine';
import { BUILTIN_SPECTRUMS_ID } from '../spectrums-id';

describe('Satu Frekuensi engine', () => {
  it('rotates psychic index sequentially and wraps around', () => {
    expect(pickNextPsychicIndex(4, null)).toBe(0);
    expect(pickNextPsychicIndex(4, 0)).toBe(1);
    expect(pickNextPsychicIndex(4, 2)).toBe(3);
    expect(pickNextPsychicIndex(4, 3)).toBe(0);
  });

  it('deals targetValue ONLY to the Psychic and omits it from all other secrets', () => {
    const dealt = dealSatuFrekuensiRound({
      playerUids: ['p1', 'p2', 'p3'],
      pool: BUILTIN_SPECTRUMS_ID,
      previousRotationIndex: null,
      roundId: 'round_1',
      rng: () => 0.5,
    });

    expect(dealt.psychicUid).toBe('p1');
    expect(dealt.targetValue).toBeGreaterThanOrEqual(6);
    expect(dealt.targetValue).toBeLessThanOrEqual(94);

    expect(dealt.secretsByUid.p1.isPsychic).toBe(true);
    expect(dealt.secretsByUid.p1.targetValue).toBe(dealt.targetValue);

    expect(dealt.secretsByUid.p2.isPsychic).toBe(false);
    expect('targetValue' in dealt.secretsByUid.p2).toBe(false);
    expect(dealt.secretsByUid.p3.isPsychic).toBe(false);
    expect('targetValue' in dealt.secretsByUid.p3).toBe(false);
  });

  it('allows 2-player rooms and rejects fewer than 2 players', () => {
    expect(() =>
      dealSatuFrekuensiRound({
        playerUids: ['solo'],
        pool: BUILTIN_SPECTRUMS_ID,
        roundId: 'round_1',
      }),
    ).toThrow(/Minimal 2 pemain/);

    const twoPlayer = dealSatuFrekuensiRound({
      playerUids: ['a', 'b'],
      pool: BUILTIN_SPECTRUMS_ID,
      roundId: 'round_1',
      rng: () => 0.25,
    });
    expect(twoPlayer.psychicUid).toBe('a');
    expect(Object.keys(twoPlayer.secretsByUid)).toEqual(['a', 'b']);
  });

  it('evaluates proximity tiers accurately (+4, +3, +2, 0)', () => {
    expect(evaluateFrequencyGuess(50, 50)).toEqual({ points: 4, tier: 'bullseye', distance: 0 });
    expect(evaluateFrequencyGuess(54, 50)).toEqual({ points: 4, tier: 'bullseye', distance: 4 });
    expect(evaluateFrequencyGuess(55, 50)).toEqual({ points: 3, tier: 'close', distance: 5 });
    expect(evaluateFrequencyGuess(60, 50)).toEqual({ points: 3, tier: 'close', distance: 10 });
    expect(evaluateFrequencyGuess(66, 50)).toEqual({ points: 2, tier: 'near', distance: 16 });
    expect(evaluateFrequencyGuess(67, 50)).toEqual({ points: 0, tier: 'miss', distance: 17 });
  });

  it('scores guessers and caps Psychic bonus at +4', () => {
    const players = [
      { uid: 'psy', displayName: 'Penerawang', avatarColor: '#06B6D4' },
      { uid: 'g1', displayName: 'G1', avatarColor: '#111' },
      { uid: 'g2', displayName: 'G2', avatarColor: '#222' },
      { uid: 'g3', displayName: 'G3', avatarColor: '#333' },
      { uid: 'g4', displayName: 'G4', avatarColor: '#444' },
      { uid: 'g5', displayName: 'G5', avatarColor: '#555' },
      { uid: 'g6', displayName: 'G6', avatarColor: '#666' },
    ];

    const scored = scoreSatuFrekuensiRound({
      psychicUid: 'psy',
      targetValue: 50,
      players,
      submissionsByUid: {
        g1: 50, // +4
        g2: 58, // +3
        g3: 65, // +2
        g4: 49, // +4
        g5: 48, // +4 (5th scoring guesser -> bonus capped at +4!)
        g6: 90, // 0
      },
    });

    expect(scored.deltas.g1).toBe(4);
    expect(scored.deltas.g2).toBe(3);
    expect(scored.deltas.g3).toBe(2);
    expect(scored.deltas.g6).toBe(0);
    expect(scored.psychicBonus).toBe(4);
    expect(scored.deltas.psy).toBe(4);
  });

  it('sanitizes custom spectrums and merges packs cleanly', () => {
    expect(sanitizeCustomSpectrum({ leftLabel: 'Sama', rightLabel: 'sama' })).toBeNull();
    const valid = sanitizeCustomSpectrum({
      leftLabel: '  Kopi Hitam  ',
      rightLabel: 'Es Matcha',
      category: 'Minuman',
    });
    expect(valid?.leftLabel).toBe('Kopi Hitam');
    expect(valid?.rightLabel).toBe('Es Matcha');

    const pool = mergeSpectrumPool(['kuliner'], valid ? [valid] : []);
    expect(pool.some((item) => item.leftLabel === 'Kopi Hitam')).toBe(true);
    expect(pool.some((item) => item.packId === 'kuliner')).toBe(true);
  });
});
