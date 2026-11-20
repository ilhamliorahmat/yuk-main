import { describe, expect, it } from 'vitest';
import {
  buildMalamSilumanDeck,
  calculateMalamSilumanScoreDeltas,
  dealMalamSilumanRound,
  DEFAULT_MALAM_SILUMAN_SETTINGS,
  evaluateMalamSilumanVictory,
  resolveMalamSilumanNight,
  tallyMalamSilumanDayVotes,
} from '../engine';
import { MALAM_SILUMAN_ROLES } from '../roles-id';
import type { MalamSilumanSettings, WerewolfRoleId } from '../../types';

describe('Malam Siluman — Roles & Explanation Tiers', () => {
  it('assigns simple explanation to base & standard roles and extra detailed guide ONLY to Siluman Bayangan & Tumbal', () => {
    expect(MALAM_SILUMAN_ROLES.siluman.explanationTier).toBe('simple');
    expect(MALAM_SILUMAN_ROLES.warga.explanationTier).toBe('simple');
    expect(MALAM_SILUMAN_ROLES.penerawang.explanationTier).toBe('simple');
    expect(MALAM_SILUMAN_ROLES.tabib.explanationTier).toBe('simple');
    expect(MALAM_SILUMAN_ROLES.pemburu.explanationTier).toBe('simple');
    expect(MALAM_SILUMAN_ROLES.pak_rt.explanationTier).toBe('simple');

    expect(MALAM_SILUMAN_ROLES.siluman_bayangan.explanationTier).toBe('detailed');
    expect(MALAM_SILUMAN_ROLES.siluman_bayangan.detailedGuide?.mechanics.length).toBeGreaterThanOrEqual(3);
    expect(MALAM_SILUMAN_ROLES.tumbal.explanationTier).toBe('detailed');
    expect(MALAM_SILUMAN_ROLES.tumbal.detailedGuide?.mechanics.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Malam Siluman — Deck Builder & Safeguards', () => {
  it('supports pure Siluman + Warga mode when all 6 optional roles are toggled OFF', () => {
    const pureSettings: MalamSilumanSettings = {
      wolfCountMode: 'auto',
      revealRoleOnDeath: true,
      enabledRoles: {
        seer: false,
        doctor: false,
        hunter: false,
        mayor: false,
        stealthWolf: false,
        jester: false,
      },
    };

    const result = buildMalamSilumanDeck(6, pureSettings);
    expect(result.wolfTotal).toBe(2);
    expect(result.stealthWolfApplied).toBe(false);
    expect(result.droppedOptionalRoles).toEqual([]);
    expect(result.deck.filter((r) => r === 'siluman')).toHaveLength(2);
    expect(result.deck.filter((r) => r === 'warga')).toHaveLength(4);
  });

  it('guards 4-player rooms by reserving >= 1 Warga and reporting dropped optional roles', () => {
    const crowdedSettings: MalamSilumanSettings = {
      wolfCountMode: 'auto',
      revealRoleOnDeath: true,
      enabledRoles: {
        seer: true,
        doctor: true,
        hunter: true,
        mayor: true,
        stealthWolf: true,
        jester: true,
      },
    };

    const result = buildMalamSilumanDeck(4, crowdedSettings);
    // 4 players -> 1 wolf + at least 1 Warga -> max 2 optional power roles
    expect(result.wolfTotal).toBe(1);
    expect(result.stealthWolfApplied).toBe(false);
    expect(result.deck.filter((r) => r === 'warga').length).toBeGreaterThanOrEqual(1);
    expect(result.droppedOptionalRoles.length).toBeGreaterThanOrEqual(3);
  });

  it('applies Siluman Bayangan ONLY when wolfTotal >= 2 and keeps fellow wolf visibility', () => {
    const stealthSettings: MalamSilumanSettings = {
      wolfCountMode: 'auto',
      revealRoleOnDeath: true,
      enabledRoles: {
        seer: true,
        doctor: true,
        hunter: false,
        mayor: false,
        stealthWolf: true,
        jester: false,
      },
    };

    // 4 players -> auto wolves = 1 -> falls back to regular Siluman
    const fourPlayerDeck = buildMalamSilumanDeck(4, stealthSettings);
    expect(fourPlayerDeck.stealthWolfApplied).toBe(false);
    expect(fourPlayerDeck.deck).not.toContain('siluman_bayangan');

    // 6 players -> auto wolves = 2 -> swaps 1 Siluman into Siluman Bayangan
    const sixPlayerDeck = buildMalamSilumanDeck(6, stealthSettings);
    expect(sixPlayerDeck.wolfTotal).toBe(2);
    expect(sixPlayerDeck.stealthWolfApplied).toBe(true);
    expect(sixPlayerDeck.deck.filter((r) => r === 'siluman_bayangan')).toHaveLength(1);
    expect(sixPlayerDeck.deck.filter((r) => r === 'siluman')).toHaveLength(1);

    const dealt = dealMalamSilumanRound({
      playerUids: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
      playerNamesByUid: { u1: 'A', u2: 'B', u3: 'C', u4: 'D', u5: 'E', u6: 'F' },
      settings: stealthSettings,
      roundId: 'test_stealth',
    });
    expect(dealt.wolfUids).toHaveLength(2);
    for (const wUid of dealt.wolfUids) {
      expect(dealt.secretsByUid[wUid].fellowWolves).toHaveLength(2);
    }
    const citizenUid = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].find(
      (u) => !dealt.wolfUids.includes(u),
    )!;
    expect(dealt.secretsByUid[citizenUid].fellowWolves).toEqual([]);
  });
});

describe('Malam Siluman — Night Resolution, Stealth Wolf Aura & Doctor Cooldown', () => {
  const rolesByUid: Record<string, WerewolfRoleId> = {
    wolf1: 'siluman',
    stealth1: 'siluman_bayangan',
    seer1: 'penerawang',
    doc1: 'tabib',
    warga1: 'warga',
    jester1: 'tumbal',
  };
  const namesByUid: Record<string, string> = {
    wolf1: 'Andi',
    stealth1: 'Budi',
    seer1: 'Citra',
    doc1: 'Dewi',
    warga1: 'Eka',
    jester1: 'Fajar',
  };
  const livingUids = Object.keys(rolesByUid);

  it('shows Siluman Bayangan as "warga" (Aura Warga) and regular Siluman as "siluman" to Penerawang', () => {
    const peekStealth = resolveMalamSilumanNight({
      nightNumber: 1,
      livingUids,
      rolesByUid,
      namesByUid,
      nightTargetsByUid: {
        wolf1: 'warga1',
        stealth1: 'warga1',
        seer1: 'stealth1',
        doc1: 'seer1',
        warga1: 'decoy',
        jester1: 'decoy',
      },
    });
    expect(peekStealth.seerPeek?.record.targetUid).toBe('stealth1');
    expect(peekStealth.seerPeek?.record.apparentTeam).toBe('warga');
    expect(peekStealth.eliminatedUid).toBe('warga1');

    const peekRegularWolf = resolveMalamSilumanNight({
      nightNumber: 2,
      livingUids,
      rolesByUid,
      namesByUid,
      nightTargetsByUid: {
        wolf1: 'jester1',
        stealth1: 'jester1',
        seer1: 'wolf1',
        doc1: 'warga1',
        warga1: 'decoy',
        jester1: 'decoy',
      },
    });
    expect(peekRegularWolf.seerPeek?.record.apparentTeam).toBe('siluman');
  });

  it('prevents elimination when Tabib protects the Siluman target and blocks consecutive repeat heals', () => {
    const savedNight = resolveMalamSilumanNight({
      nightNumber: 1,
      livingUids,
      rolesByUid,
      namesByUid,
      nightTargetsByUid: {
        wolf1: 'seer1',
        stealth1: 'seer1',
        doc1: 'seer1',
        seer1: 'wolf1',
        warga1: 'decoy',
        jester1: 'decoy',
      },
      previousDoctorProtectedUid: null,
    });
    expect(savedNight.savedByDoctor).toBe(true);
    expect(savedNight.eliminatedUid).toBeNull();
    expect(savedNight.nextDoctorLastProtectedUid).toBe('seer1');

    // Night 2: even if Doctor tries targeting seer1 again, engine ignores invalid repeat target
    const blockedCooldownNight = resolveMalamSilumanNight({
      nightNumber: 2,
      livingUids,
      rolesByUid,
      namesByUid,
      nightTargetsByUid: {
        wolf1: 'seer1',
        stealth1: 'seer1',
        doc1: 'seer1',
        seer1: 'doc1',
        warga1: 'decoy',
        jester1: 'decoy',
      },
      previousDoctorProtectedUid: savedNight.nextDoctorLastProtectedUid,
    });
    expect(blockedCooldownNight.savedByDoctor).toBe(false);
    expect(blockedCooldownNight.eliminatedUid).toBe('seer1');
  });
});

describe('Malam Siluman — Day Vote (Pak RT 2x), Tumbal Solo Win & Scoring', () => {
  it('applies 2x vote weight for Pak RT to swing execution', () => {
    const rolesByUid: Record<string, WerewolfRoleId> = {
      mayor1: 'pak_rt',
      w1: 'warga',
      s1: 'siluman',
      s2: 'siluman',
    };
    // mayor1 (weight 2) votes s1; s1 + s2 (weight 2 total) vote w1 -> mayor breaks tie if another warga votes s1!
    const tally = tallyMalamSilumanDayVotes({
      livingUids: ['mayor1', 'w1', 's1', 's2'],
      rolesByUid,
      votesByUid: {
        mayor1: 's1', // +2
        w1: 's1', // +1 => total 3 on s1
        s1: 'w1', // +1
        s2: 'w1', // +1 => total 2 on w1
      },
    });
    expect(tally.executedUid).toBe('s1');
    expect(tally.voteTally['s1']).toBe(3);
    expect(tally.voteTally['w1']).toBe(2);
  });

  it('grants Tumbal immediate solo +4 victory ONLY on Day execution, not Night kill', () => {
    const rolesByUid: Record<string, WerewolfRoleId> = {
      u1: 'siluman',
      u2: 'warga',
      u3: 'warga',
      u4: 'tumbal',
    };
    const namesByUid = { u1: 'A', u2: 'B', u3: 'C', u4: 'Jester' };

    // Night kill eliminates Tumbal without triggering Tumbal victory
    const afterNightKill = evaluateMalamSilumanVictory({
      livingUids: ['u1', 'u2', 'u3'],
      rolesByUid,
      namesByUid,
    });
    expect(afterNightKill.winnerTeam).toBeNull();

    // Day vote executes Tumbal -> immediate solo upset!
    const afterDayVote = evaluateMalamSilumanVictory({
      livingUids: ['u1', 'u2', 'u3'],
      rolesByUid,
      namesByUid,
      dayExecutedUid: 'u4',
    });
    expect(afterDayVote.winnerTeam).toBe('tumbal');
    expect(afterDayVote.tumbalWinnerUid).toBe('u4');

    const jesterScores = calculateMalamSilumanScoreDeltas({
      participantUids: ['u1', 'u2', 'u3', 'u4'],
      livingUids: ['u1', 'u2', 'u3'],
      rolesByUid,
      winnerTeam: 'tumbal',
      tumbalWinnerUid: 'u4',
    });
    expect(jesterScores).toEqual({ u1: 0, u2: 0, u3: 0, u4: 4 });
  });

  it('scores +3 for surviving team winners and +2 for eliminated teammates', () => {
    const rolesByUid: Record<string, WerewolfRoleId> = {
      u1: 'siluman',
      u2: 'penerawang',
      u3: 'tabib',
      u4: 'warga',
    };
    const deltas = calculateMalamSilumanScoreDeltas({
      participantUids: ['u1', 'u2', 'u3', 'u4'],
      livingUids: ['u2', 'u3'],
      rolesByUid,
      winnerTeam: 'warga',
    });
    expect(deltas).toEqual({ u1: 0, u2: 3, u3: 3, u4: 2 });
    expect(DEFAULT_MALAM_SILUMAN_SETTINGS.wolfCountMode).toBe('auto');
  });
});
