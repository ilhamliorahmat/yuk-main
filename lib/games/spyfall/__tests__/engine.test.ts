import { describe, expect, it } from 'vitest';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  determineSpyCount,
  evaluateSpyGuess,
  evaluateVoteProgress,
  generateRoomCode,
  mergeLocationPool,
  pickNextLocation,
  sanitizeCustomLocation,
} from '../engine';
import { INDONESIAN_LOCATIONS } from '../locations-id';

function makeSeededRng(seed = 42): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('Spyfall Core Game Engine', () => {
  it('generates valid 6-character unambiguous room codes', () => {
    const rng = makeSeededRng(123);
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode(rng);
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it('sanitizes custom locations and rejects fewer than 2 valid roles', () => {
    expect(
      sanitizeCustomLocation({
        name: '   ',
        roles: ['A', 'B'],
      }),
    ).toBeNull();

    expect(
      sanitizeCustomLocation({
        name: 'Kafe Kemang',
        roles: ['Barista', '   '],
      }),
    ).toBeNull();

    const valid = sanitizeCustomLocation({
      name: '  Kafe Kemang  ',
      category: '  Kuliner ',
      roles: ['Barista', 'Barista', 'Kasir', 'Pelanggan'],
    });

    expect(valid).not.toBeNull();
    expect(valid?.name).toBe('Kafe Kemang');
    expect(valid?.category).toBe('Kuliner');
    expect(valid?.roles).toEqual(['Barista', 'Kasir', 'Pelanggan']);
  });

  it('merges enabled built-in packs with custom locations and avoids duplicate names', () => {
    const pool = mergeLocationPool(['nusantara'], [
      {
        id: 'custom-1',
        name: 'Stasiun Gambir',
        category: 'Kustom',
        roles: ['Masinis Kustom', 'Penumpang Kustom'],
      },
      {
        id: 'custom-2',
        name: 'Gedung Sate',
        category: 'Sejarah',
        roles: ['Gubernur', 'Pemandu', 'Pengunjung'],
      },
    ]);

    const gambir = pool.find((l) => l.name === 'Stasiun Gambir');
    const gedungSate = pool.find((l) => l.name === 'Gedung Sate');

    expect(gambir?.packId).toBe('kustom');
    expect(gambir?.roles).toEqual(['Masinis Kustom', 'Penumpang Kustom']);
    expect(gedungSate?.packId).toBe('kustom');
    expect(pool.some((l) => l.packId === 'klasik')).toBe(false);
  });

  it('avoids repeating the immediate previous location when pool has >= 2 items', () => {
    const twoLocations = INDONESIAN_LOCATIONS.slice(0, 2);
    const rng = makeSeededRng(7);
    for (let i = 0; i < 15; i++) {
      const picked = pickNextLocation(twoLocations, twoLocations[0].name, rng);
      expect(picked.name).toBe(twoLocations[1].name);
    }
  });

  it('determines spy counts according to player count and spyMode', () => {
    expect(() => determineSpyCount(2, 'single')).toThrow();
    expect(determineSpyCount(3, 'single')).toBe(1);
    expect(determineSpyCount(4, 'double')).toBe(1);
    expect(determineSpyCount(5, 'double')).toBe(2);
    expect(determineSpyCount(6, 'random', () => 0.1)).toBe(2);
    expect(determineSpyCount(6, 'random', () => 0.8)).toBe(1);
  });

  it('deals isolated secrets, cycles roles gracefully for large lobbies, and picks valid speaker', () => {
    const players = Array.from({ length: 10 }, (_, i) => `player_${i + 1}`);
    const smallRoleLocation = {
      id: 'kafe-mini',
      name: 'Kafe Mini',
      category: 'Kustom',
      packId: 'kustom',
      packLabel: 'Lokasi Kustom',
      roles: ['Barista', 'Kasir', 'Pelanggan'],
    };

    const dealt = dealSpyfallRound({
      playerUids: players,
      pool: [smallRoleLocation],
      spyMode: 'double',
      roundId: 'round_1',
      rng: makeSeededRng(99),
    });

    expect(dealt.spyUids).toHaveLength(2);
    expect(players).toContain(dealt.firstSpeakerUid);
    expect(Object.keys(dealt.secretsByUid)).toHaveLength(10);

    let spyCount = 0;
    let wargaCount = 0;
    for (const uid of players) {
      const secret = dealt.secretsByUid[uid];
      if (secret.isSpy) {
        spyCount += 1;
        expect(secret.locationName).toBeNull();
        expect(secret.roleName).toBe('Mata-Mata');
      } else {
        wargaCount += 1;
        expect(secret.locationName).toBe('Kafe Mini');
        expect(smallRoleLocation.roles).toContain(secret.roleName);
      }
    }

    expect(spyCount).toBe(2);
    expect(wargaCount).toBe(8);
  });

  it('evaluates 50% + 1 majority accusation voting without dropping immediately on a single no vote', () => {
    const voters = ['u1', 'u2', 'u3']; // requiredYes = 2

    expect(evaluateVoteProgress({ u1: 'yes' }, voters).outcome).toBe('pending');
    expect(evaluateVoteProgress({ u1: 'yes', u2: 'no' }, voters).outcome).toBe('pending');
    expect(evaluateVoteProgress({ u1: 'yes', u2: 'no', u3: 'yes' }, voters).outcome).toBe('convicted');
    expect(evaluateVoteProgress({ u1: 'yes', u2: 'no', u3: 'no' }, voters).outcome).toBe('acquitted');
  });

  it('evaluates Spy location guesses case-insensitively', () => {
    expect(evaluateSpyGuess('  stasiun gambir ', 'Stasiun Gambir')).toBe(true);
    expect(evaluateSpyGuess('Pantai Kuta', 'Stasiun Gambir')).toBe(false);
  });

  it('computes round score deltas accurately for both teams', () => {
    const playerUids = ['u1', 'u2', 'u3', 'u4'];
    const spyUids = ['u2'];

    const wargaWin = calculateRoundScoreDeltas({
      playerUids,
      spyUids,
      winnerTeam: 'warga',
      initiatorUid: 'u1',
      victoryType: 'spy_guess_wrong',
    });
    expect(wargaWin).toEqual({ u1: 2, u2: 0, u3: 1, u4: 1 });

    const spyWinGuess = calculateRoundScoreDeltas({
      playerUids,
      spyUids,
      winnerTeam: 'mata_mata',
      victoryType: 'spy_guess_correct',
    });
    expect(spyWinGuess).toEqual({ u1: 0, u2: 4, u3: 0, u4: 0 });

    const spyWinTimeout = calculateRoundScoreDeltas({
      playerUids,
      spyUids,
      winnerTeam: 'mata_mata',
      victoryType: 'timeout',
    });
    expect(spyWinTimeout).toEqual({ u1: 0, u2: 2, u3: 0, u4: 0 });
  });
});
