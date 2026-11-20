import { describe, expect, it } from 'vitest';
import {
  calculatePelukisScoreDeltas,
  dealPelukisGadunganRound,
  evaluatePelukisWordGuess,
  mergeDrawingPromptPool,
  normalizeAndSimplifyPoints,
  sanitizeCustomDrawingPrompt,
  tallyPelukisVotes,
} from '../engine';

describe('Pelukis Gadungan — Pure Game Engine', () => {
  it('normalizes and simplifies raw canvas strokes within 0..1000 and max 50 points', () => {
    const raw: number[] = [];
    for (let i = 0; i <= 120; i++) {
      raw.push(i * 12, i * 10);
    }
    const simplified = normalizeAndSimplifyPoints(raw, 10, 50);
    expect(simplified.length).toBeLessThanOrEqual(100);
    expect(simplified.length % 2).toBe(0);
    for (const val of simplified) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(val)).toBe(true);
    }

    // Single short tap expands to minimal 2-point visible segment
    const dot = normalizeAndSimplifyPoints([500.4, 250.2]);
    expect(dot).toHaveLength(4);
  });

  it('sanitizes custom prompts and merges with selected built-in packs', () => {
    const custom = sanitizeCustomDrawingPrompt({
      category: '  Jajanan   Sekolah ',
      word: '  Telor   Gulung ',
    });
    expect(custom).not.toBeNull();
    expect(custom?.category).toBe('Jajanan Sekolah');
    expect(custom?.word).toBe('Telor Gulung');

    const pool = mergeDrawingPromptPool(['kuliner'], custom ? [custom] : []);
    expect(pool.some((p) => p.word === 'Telor Gulung')).toBe(true);
    expect(pool.some((p) => p.packId === 'kuliner')).toBe(true);
  });

  it('strictly isolates drawingWord so Pelukis Gadungan ONLY sees drawingCategory', () => {
    const pool = mergeDrawingPromptPool(['kuliner']);
    const dealt = dealPelukisGadunganRound({
      players: [
        { uid: 'p1', displayName: 'Budi', avatarColor: '#F43F5E' },
        { uid: 'p2', displayName: 'Siti', avatarColor: '#10B981' },
        { uid: 'p3', displayName: 'Agus', avatarColor: '#06B6D4' },
      ],
      pool,
      spyMode: 'single',
      roundId: 'r1',
      rng: () => 0.25,
    });

    expect(dealt.gadunganUids).toHaveLength(1);
    const gadunganUid = dealt.gadunganUids[0];
    const gadunganSecret = dealt.secretsByUid[gadunganUid];
    expect(gadunganSecret.isGadungan).toBe(true);
    expect(gadunganSecret.drawingCategory).toBe(dealt.prompt.category);
    expect(gadunganSecret.drawingWord).toBeNull();

    for (const uid of ['p1', 'p2', 'p3']) {
      if (uid === gadunganUid) continue;
      const secret = dealt.secretsByUid[uid];
      expect(secret.isGadungan).toBe(false);
      expect(secret.drawingCategory).toBe(dealt.prompt.category);
      expect(secret.drawingWord).toBe(dealt.prompt.word);
    }
  });

  it('handles voting majority, tie, wrong accuse, word guess matching, and scoring', () => {
    const caught = tallyPelukisVotes({
      votesByUid: { p1: 'p3', p2: 'p3', p3: 'p1' },
      eligibleVoterUids: ['p1', 'p2', 'p3'],
      gadunganUids: ['p3'],
    });
    expect(caught.isTie).toBe(false);
    expect(caught.accusedUid).toBe('p3');
    expect(caught.caughtGadungan).toBe(true);

    const tied = tallyPelukisVotes({
      votesByUid: { p1: 'p2', p2: 'p3', p3: 'p1' },
      eligibleVoterUids: ['p1', 'p2', 'p3'],
      gadunganUids: ['p3'],
    });
    expect(tied.isTie).toBe(true);
    expect(tied.accusedUid).toBeNull();
    expect(tied.caughtGadungan).toBe(false);

    const wrong = tallyPelukisVotes({
      votesByUid: { p1: 'p2', p2: 'p1', p3: 'p2' },
      eligibleVoterUids: ['p1', 'p2', 'p3'],
      gadunganUids: ['p3'],
    });
    expect(wrong.isTie).toBe(false);
    expect(wrong.accusedUid).toBe('p2');
    expect(wrong.caughtGadungan).toBe(false);

    expect(evaluatePelukisWordGuess('sate ayam!', 'Sate Ayam')).toBe(true);
    expect(evaluatePelukisWordGuess('bakso', 'Sate Ayam')).toBe(false);

    const gadunganWin = calculatePelukisScoreDeltas({
      playerUids: ['p1', 'p2', 'p3'],
      gadunganUids: ['p3'],
      winnerTeam: 'gadungan',
    });
    expect(gadunganWin).toEqual({ p1: 0, p2: 0, p3: 3 });

    const pelukisWin = calculatePelukisScoreDeltas({
      playerUids: ['p1', 'p2', 'p3'],
      gadunganUids: ['p3'],
      winnerTeam: 'pelukis',
    });
    expect(pelukisWin).toEqual({ p1: 2, p2: 2, p3: 0 });
  });
});
