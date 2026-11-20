import { describe, expect, it } from 'vitest';
import {
  buildSessionRecap,
  evaluateSuitClash,
  filterActivePlayers,
  finalizeCompletedGameRecord,
  shouldAutoResetExpiredRoom,
} from '../engine';

describe('Session Recap, Win-Count MVP, Suit Duel & 15s Reset Engine', () => {
  it('excludes BRB players cleanly via filterActivePlayers', () => {
    const players = [
      { uid: 'u1', displayName: 'Andi', isBrb: false },
      { uid: 'u2', displayName: 'Budi', isBrb: true },
      { uid: 'u3', displayName: 'Citra' },
    ];
    const active = filterActivePlayers(players);
    expect(active.map((p) => p.uid)).toEqual(['u1', 'u3']);
  });

  it('guards against accidental game switch when 0 rounds were played', () => {
    const record = finalizeCompletedGameRecord({
      matchIndex: 1,
      gameType: 'kata_kata',
      roundsPlayed: 0,
      players: [
        { uid: 'u1', displayName: 'Andi', score: 5 },
        { uid: 'u2', displayName: 'Budi', score: 0 },
      ],
    });
    expect(record).toBeNull();
  });

  it('crowns MVP by MOST GAMES WON even when runner-up has higher overall XP', () => {
    // Monsieur Matt's exact test case:
    // Budi finishes runner-up in high-scoring games and has more total XP (34 XP, 0 wins)
    // Andi wins 2 lower-scoring games (15 XP, 2 wins) -> Andi MUST be MVP!
    const players = [
      { uid: 'andi', displayName: 'Andi', avatarColor: '#DC2626' },
      { uid: 'budi', displayName: 'Budi', avatarColor: '#0284C7' },
      { uid: 'citra', displayName: 'Citra', avatarColor: '#7C3AED' },
    ];

    const match1 = finalizeCompletedGameRecord({
      matchIndex: 1,
      gameType: 'spyfall',
      roundsPlayed: 2,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 4 },
        { uid: 'budi', displayName: 'Budi', score: 3 },
        { uid: 'citra', displayName: 'Citra', score: 2 },
      ],
    })!;

    const match2 = finalizeCompletedGameRecord({
      matchIndex: 2,
      gameType: 'kata_kata',
      roundsPlayed: 2,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 5 },
        { uid: 'budi', displayName: 'Budi', score: 4 },
        { uid: 'citra', displayName: 'Citra', score: 2 },
      ],
    })!;

    const match3 = finalizeCompletedGameRecord({
      matchIndex: 3,
      gameType: 'fakta_hari_ini',
      roundsPlayed: 4,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 3 },
        { uid: 'budi', displayName: 'Budi', score: 13 },
        { uid: 'citra', displayName: 'Citra', score: 14 },
      ],
    })!;

    const match4 = finalizeCompletedGameRecord({
      matchIndex: 4,
      gameType: 'satu_frekuensi',
      roundsPlayed: 4,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 3 },
        { uid: 'budi', displayName: 'Budi', score: 14 },
        { uid: 'citra', displayName: 'Citra', score: 15 },
      ],
    })!;

    const recap = buildSessionRecap({
      completedGames: [match1, match2, match3, match4],
      players,
    });

    // Andi = 2 wins (15 XP), Citra = 2 wins (33 XP), Budi = 0 wins (34 XP)
    // Wait: Citra ALSO won 2 games! So Tier 2 (Overall XP) breaks the 2-win tie between Citra (33) & Andi (15) -> Citra wins, NOT Budi (34 XP, 0 wins)!
    expect(recap.mvpUids).toEqual(['citra']);
    expect(recap.resolvedBy).toBe('overall_xp');
    const budiRow = recap.standings.find((s) => s.uid === 'budi')!;
    expect(budiRow.overallXp).toBe(34);
    expect(budiRow.gamesWon).toBe(0);
    // Budi is ranked #3 despite highest raw XP!
    expect(recap.standings[2].uid).toBe('budi');
  });

  it('treats second visit to the same game as a separate match with its own isolated points', () => {
    const players = [
      { uid: 'andi', displayName: 'Andi', avatarColor: '#DC2626' },
      { uid: 'budi', displayName: 'Budi', avatarColor: '#0284C7' },
    ];

    const visit1 = finalizeCompletedGameRecord({
      matchIndex: 1,
      gameType: 'satu_frekuensi',
      roundsPlayed: 3,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 10 },
        { uid: 'budi', displayName: 'Budi', score: 6 },
      ],
    })!;

    const visit2 = finalizeCompletedGameRecord({
      matchIndex: 2,
      gameType: 'satu_frekuensi',
      roundsPlayed: 2,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 8 },
        { uid: 'budi', displayName: 'Budi', score: 5 },
      ],
    })!;

    const recap = buildSessionRecap({
      completedGames: [visit1, visit2],
      players,
    });

    expect(recap.completedGames).toHaveLength(2);
    expect(recap.mvpUids).toEqual(['andi']);
    expect(recap.standings[0].gamesWon).toBe(2);
    expect(recap.standings[0].overallXp).toBe(18);
    expect(recap.resolvedBy).toBe('games_won');
  });

  it('triggers Best-of-3 Suit Duel when tied on BOTH Games Won and Overall XP, and resolves cleanly', () => {
    const players = [
      { uid: 'andi', displayName: 'Andi', avatarColor: '#DC2626' },
      { uid: 'budi', displayName: 'Budi', avatarColor: '#0284C7' },
    ];

    const m1 = finalizeCompletedGameRecord({
      matchIndex: 1,
      gameType: 'satu_frekuensi',
      roundsPlayed: 2,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 10 },
        { uid: 'budi', displayName: 'Budi', score: 4 },
      ],
    })!;
    const m2 = finalizeCompletedGameRecord({
      matchIndex: 2,
      gameType: 'fakta_hari_ini',
      roundsPlayed: 2,
      players: [
        { uid: 'andi', displayName: 'Andi', score: 4 },
        { uid: 'budi', displayName: 'Budi', score: 10 },
      ],
    })!;

    const recap = buildSessionRecap({ completedGames: [m1, m2], players });
    expect(recap.resolvedBy).toBe('suit_duel');
    expect(recap.mvpUids).toEqual([]);
    expect(recap.tiebreakerDuel).not.toBeNull();
    expect(recap.tiebreakerDuel?.duelistUids).toEqual(['andi', 'budi']);
    expect(recap.tiebreakerDuel?.targetWins).toBe(2);

    // Clash 1: Draw (batu vs batu) -> neither gets a win
    let duel = evaluateSuitClash({
      duel: recap.tiebreakerDuel!,
      picksByUid: { andi: 'batu', budi: 'batu' },
    });
    expect(duel.status).toBe('clash_reveal');
    expect(duel.lastClash?.isDraw).toBe(true);
    expect(duel.winsByUid).toEqual({ andi: 0, budi: 0 });

    // Clash 2: Andi (gunting) beats Budi (kertas) -> 1-0
    duel = evaluateSuitClash({
      duel: { ...duel, status: 'picking', clashNumber: 2, submittedUids: [] },
      picksByUid: { andi: 'gunting', budi: 'kertas' },
    });
    expect(duel.status).toBe('clash_reveal');
    expect(duel.winsByUid).toEqual({ andi: 1, budi: 0 });

    // Clash 3: Budi (batu) beats Andi (gunting) -> 1-1
    duel = evaluateSuitClash({
      duel: { ...duel, status: 'picking', clashNumber: 3, submittedUids: [] },
      picksByUid: { andi: 'gunting', budi: 'batu' },
    });
    expect(duel.status).toBe('clash_reveal');
    expect(duel.winsByUid).toEqual({ andi: 1, budi: 1 });

    // Clash 4: Andi (kertas) beats Budi (batu) -> 2-1 -> Andi crowned Champion!
    duel = evaluateSuitClash({
      duel: { ...duel, status: 'picking', clashNumber: 4, submittedUids: [] },
      picksByUid: { andi: 'kertas', budi: 'batu' },
    });
    expect(duel.status).toBe('finished');
    expect(duel.winsByUid).toEqual({ andi: 2, budi: 1 });
    expect(duel.championUids).toEqual(['andi']);
  });

  it('enforces the 15-second empty-room auto-reset rule while ignoring TV stage displays', () => {
    const now = 1_000_000;

    // 1. Someone still online -> NEVER reset
    expect(
      shouldAutoResetExpiredRoom({
        presence: {
          u1: { uid: 'u1', displayName: 'Andi', online: true, lastSeen: now - 30_000 },
        },
        nowMs: now,
      }),
    ).toBe(false);

    // 2. All offline, only 10s elapsed (< 15s) -> DO NOT reset yet
    expect(
      shouldAutoResetExpiredRoom({
        presence: {
          u1: { uid: 'u1', displayName: 'Andi', online: false, lastSeen: now - 10_000 },
        },
        nowMs: now,
      }),
    ).toBe(false);

    // 3. All players offline for 16s (>= 15s), even if a TV Stage Display is still online -> RESET!
    expect(
      shouldAutoResetExpiredRoom({
        presence: {
          u1: { uid: 'u1', displayName: 'Andi', online: false, lastSeen: now - 16_000 },
          stage_tv: {
            uid: 'stage_tv',
            displayName: 'Layar Panggung',
            online: true,
            isStage: true,
            lastSeen: now,
          },
        },
        nowMs: now,
      }),
    ).toBe(true);
  });
});
