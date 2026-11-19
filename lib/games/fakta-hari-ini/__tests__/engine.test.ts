import { describe, expect, it } from 'vitest';
import {
  calculateFaktaHariIniScoreDeltas,
  dealFaktaHariIniRound,
  parseParentheticalFactText,
  pickNextGuesserIndex,
  selectFaktaPhaseController,
} from '../engine';
import { BUILTIN_FACTS_ID } from '../facts-id';

describe('Fakta Hari Ini engine', () => {
  const samplePlayers = [
    { uid: 'host', displayName: 'Host Matt' },
    { uid: 'p2', displayName: 'Budi' },
    { uid: 'p3', displayName: 'Sari' },
    { uid: 'p4', displayName: 'Raka' },
    { uid: 'p5', displayName: 'Dina' },
    { uid: 'p6', displayName: 'Tono' },
  ];

  it('rotates Penebak sequentially in join order and wraps cleanly', () => {
    expect(pickNextGuesserIndex(6, null)).toBe(0);
    expect(pickNextGuesserIndex(6, 0)).toBe(1);
    expect(pickNextGuesserIndex(6, 4)).toBe(5);
    expect(pickNextGuesserIndex(6, 5)).toBe(0);
  });

  it('appoints Host as Phase Controller when Host is NOT the Penebak', () => {
    const controller = selectFaktaPhaseController({
      playerUids: samplePlayers.map((p) => p.uid),
      hostUid: 'host',
      guesserUid: 'p3',
      rng: () => 0.4,
    });
    expect(controller).toBe('host');
  });

  it('randomly appoints a non-guesser Bluffer as Phase Controller whenever Host IS the Penebak', () => {
    for (let i = 0; i < 20; i++) {
      const controller = selectFaktaPhaseController({
        playerUids: samplePlayers.map((p) => p.uid),
        hostUid: 'host',
        guesserUid: 'host',
        rng: () => (i % 5) / 5,
      });
      expect(controller).not.toBe('host');
      expect(samplePlayers.map((p) => p.uid)).toContain(controller);
    }
  });

  it('isolates Penebak secret (zero fact/truth leak) while giving ALL Bluffers team awareness of Pembawa Fakta', () => {
    const dealt = dealFaktaHariIniRound({
      players: samplePlayers,
      hostUid: 'host',
      pool: BUILTIN_FACTS_ID,
      previousRotationIndex: null, // picks index 0 -> 'host' as Penebak!
      roundId: 'round_1',
      rng: () => 0.25,
    });

    // Host is Penebak -> Phase Controller MUST NOT be host!
    expect(dealt.guesserUid).toBe('host');
    expect(dealt.phaseControllerUid).not.toBe('host');
    expect(dealt.truthTellerUid).not.toBe('host');

    // Penebak secret must strictly omit fact and truthTeller info
    const guesserSecret = dealt.secretsByUid.host;
    expect(guesserSecret.isGuesser).toBe(true);
    expect('factTwist' in guesserSecret).toBe(false);
    expect('truthTellerUid' in guesserSecret).toBe(false);
    expect('truthTellerName' in guesserSecret).toBe(false);

    // Every Bluffer receives the fact AND knows who is Pembawa Fakta
    const bluffers = samplePlayers.filter((p) => p.uid !== dealt.guesserUid);
    let truthCount = 0;
    for (const bluffer of bluffers) {
      const sec = dealt.secretsByUid[bluffer.uid];
      expect(sec.isGuesser).toBe(false);
      expect(sec.truthTellerUid).toBe(dealt.truthTellerUid);
      expect(sec.truthTellerName).toBe(dealt.truthTellerName);
      expect(sec.factTwist).toBe(dealt.fact.twist);
      if (sec.isTruthTeller) truthCount += 1;
    }
    expect(truthCount).toBe(1);
  });

  it('awards +(N-1) to Penebak on win and 0 to all Bluffers', () => {
    const res = calculateFaktaHariIniScoreDeltas({
      playerUids: samplePlayers.map((p) => p.uid), // N = 6 -> N-1 = 5
      guesserUid: 'p3',
      truthTellerUid: 'p5',
      pickedUid: 'p5',
    });

    expect(res.guesserWon).toBe(true);
    expect(res.guesserPoints).toBe(5);
    expect(res.blufferPointsEach).toBe(0);
    expect(res.deltas.p3).toBe(5);
    expect(res.deltas.p5).toBe(0);
    expect(res.deltas.host).toBe(0);
  });

  it('awards +1 to EVERY Bluffer (including Pembawa Fakta!) on Penebak loss', () => {
    const res = calculateFaktaHariIniScoreDeltas({
      playerUids: samplePlayers.map((p) => p.uid), // N = 6
      guesserUid: 'p3',
      truthTellerUid: 'p5',
      pickedUid: 'p2', // wrong pick!
    });

    expect(res.guesserWon).toBe(false);
    expect(res.guesserPoints).toBe(0);
    expect(res.blufferPointsEach).toBe(1);
    expect(res.deltas.p3).toBe(0);
    // All 5 bluffers—including truthTeller p5—get +1 equally!
    expect(res.deltas.host).toBe(1);
    expect(res.deltas.p2).toBe(1);
    expect(res.deltas.p4).toBe(1);
    expect(res.deltas.p5).toBe(1);
    expect(res.deltas.p6).toBe(1);
  });

  it('parses parenthetical fun fact strings cleanly', () => {
    const parsed = parseParentheticalFactText(
      'Di Arab Saudi tidak ada kasus korupsi karena (tidak ada hukum tentang korupsi itu sendiri).',
    );
    expect(parsed).toEqual({
      prefix: 'Di Arab Saudi tidak ada kasus korupsi karena ',
      twist: 'tidak ada hukum tentang korupsi itu sendiri',
      suffix: '.',
    });

    expect(parseParentheticalFactText('Tanpa tanda kurung sama sekali')).toBeNull();
  });
});
