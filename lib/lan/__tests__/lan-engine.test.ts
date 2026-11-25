import { describe, expect, it } from 'vitest';
import type { GameType, WerewolfRoleId } from '../../games/types';
import { LanHostAuthority } from '../lan-host-authority';
import { isLanRoomId } from '../lan-protocol';
import {
  compactLanSdp,
  decodeLanSignal,
  encodeLanSignal,
  inspectLanSdpCandidates,
} from '../lan-signaling';

const REAL_FP =
  'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

const SAMPLE_SDP = [
  'v=0',
  'o=- 524321123456 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'm=application 54321 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 192.168.1.42',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:supersecretpassword123456',
  'a=ice-options:trickle',
  `a=fingerprint:sha-256 ${REAL_FP}`,
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=candidate:1 1 udp 2122260223 fe80::1234 54300 typ host generation 0',
  'a=candidate:2 1 udp 2122250000 2001:db8::1 54301 typ host generation 0',
  'a=candidate:3 1 udp 2122240000 2001:db8::2 54302 typ host generation 0',
  'a=candidate:4 1 udp 2122230000 2001:db8::3 54303 typ host generation 0',
  'a=candidate:5 1 udp 2122220000 2001:db8::4 54304 typ host generation 0',
  'a=candidate:6 1 udp 2122194687 192.168.1.42 54321 typ host generation 0',
  'a=candidate:7 1 udp 2122184687 10.0.0.5 54322 typ host generation 0',
  'a=candidate:8 1 tcp 1518280447 192.168.1.42 9 typ host tcptype active generation 0',
  'a=candidate:9 1 udp 1686052607 203.0.113.5 55555 typ srflx raddr 192.168.1.42 rport 54321',
  '',
].join('\r\n');

describe('WebRTC LAN Signaling Codec & Diagnostics', () => {
  it('compacts SDP by prioritizing private LAN IPv4 ahead of IPv6 bloat and stripping srflx/tcp by default', () => {
    const compacted = compactLanSdp(SAMPLE_SDP);
    expect(compacted).toContain('a=fingerprint:sha-256');
    expect(compacted).toContain('192.168.1.42');
    expect(compacted).toContain('10.0.0.5');
    expect(compacted).not.toContain('fe80::1234');
    expect(compacted).not.toContain('typ srflx');
    expect(compacted).not.toContain('tcptype active');
    expect(compacted.length).toBeLessThan(SAMPLE_SDP.length);
  });

  it('round-trips compact v2 minimal SDP Offer & Answer packets without deadlocking', async () => {
    const encodedOffer = await encodeLanSignal({
      v: 1,
      t: 'O',
      s: SAMPLE_SDP,
      r: 'LAN42X',
      g: 'spyfall',
      h: 'Host Budi',
    });

    expect(encodedOffer.startsWith('YMLAN')).toBe(true);
    // Compact minimal SDP v2 stays small enough for crisp phone QR scanning
    expect(encodedOffer.length).toBeLessThan(480);

    const decodedOffer = await decodeLanSignal(encodedOffer);
    expect(decodedOffer.t).toBe('O');
    expect(decodedOffer.r).toBe('LAN42X');
    expect(decodedOffer.g).toBe('spyfall');
    expect(decodedOffer.h).toBe('Host Budi');
    expect(decodedOffer.s).toContain(`a=fingerprint:sha-256 ${REAL_FP}`);
    expect(decodedOffer.s).toContain('192.168.1.42');
    expect(decodedOffer.s).toContain('10.0.0.5');
    expect(decodedOffer.s).toContain('tcptype active');
    expect(decodedOffer.s).not.toContain('typ srflx');

    // Quick-code mode with STUN enabled preserves RFC-compliant raddr/rport on srflx
    const encodedStun = await encodeLanSignal(
      {
        v: 1,
        t: 'A',
        s: SAMPLE_SDP,
        u: 'lanp_guest1',
        n: 'Siti',
        c: '#10B981',
        st: 1,
      },
      { allowStun: true },
    );
    const decodedAnswer = await decodeLanSignal(encodedStun);
    expect(decodedAnswer.t).toBe('A');
    expect(decodedAnswer.u).toBe('lanp_guest1');
    expect(decodedAnswer.n).toBe('Siti');
    expect(decodedAnswer.st).toBe(1);
    expect(decodedAnswer.s).toContain('typ srflx raddr 0.0.0.0 rport 0');
  });

  it('reports live SDP diagnostics accurately for IPv4 LAN, mDNS-only, and empty states', () => {
    const okDiag = inspectLanSdpCandidates(SAMPLE_SDP);
    expect(okDiag.tone).toBe('ok');
    expect(okDiag.sampleIpv4s).toContain('192.168.1.42');
    expect(okDiag.summary).toContain('192.168.1.42');

    const mdnsOnlySdp = [
      'v=0',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
      'a=candidate:1 1 udp 2122260223 abcd1234.local 54321 typ host generation 0',
    ].join('\r\n');
    const warnDiag = inspectLanSdpCandidates(mdnsOnlySdp);
    expect(warnDiag.tone).toBe('warn');
    expect(warnDiag.mdnsCount).toBe(1);

    const emptyDiag = inspectLanSdpCandidates('v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n');
    expect(emptyDiag.tone).toBe('error');
    expect(emptyDiag.totalCandidates).toBe(0);
  });
});

describe('LanHostAuthority — Zero-Leak Isolation & All 5 Games + Session Platform', () => {
  function setupThreePlayerRoom(
    gameType: GameType,
  ) {
    const auth = new LanHostAuthority({
      hostUid: 'host_1',
      hostName: 'Budi',
      avatarColor: '#DC2626',
      gameType,
      code: 'TST123',
    });
    auth.registerPeer({
      uid: 'guest_2',
      displayName: 'Siti',
      avatarColor: '#10B981',
      isStageDisplay: false,
    });
    auth.registerPeer({
      uid: 'guest_3',
      displayName: 'Agus',
      avatarColor: '#0EA5E9',
      isStageDisplay: false,
    });
    auth.registerPeer({
      uid: 'tv_stage',
      displayName: 'Layar Panggung',
      avatarColor: '#F59E0B',
      isStageDisplay: true,
    });
    return auth;
  }

  function setupFourPlayerRoom(gameType: GameType) {
    const auth = setupThreePlayerRoom(gameType);
    auth.registerPeer({
      uid: 'guest_4',
      displayName: 'Rina',
      avatarColor: '#8B5CF6',
      isStageDisplay: false,
    });
    return auth;
  }

  it('enforces strict per-peer secret isolation and zero secrets on Layar Panggung', () => {
    const auth = setupThreePlayerRoom('spyfall');
    expect(isLanRoomId(auth.getRoomId())).toBe(true);

    auth.handleAction('host_1', 'startSpyfallRound', {});

    const snapHost = auth.getSnapshotForPeer('host_1', false);
    const snapGuest2 = auth.getSnapshotForPeer('guest_2', false);
    const snapStage = auth.getSnapshotForPeer('tv_stage', true);

    expect(Object.keys(snapHost.secretsByOwnedSeat)).toEqual(['host_1']);
    expect(Object.keys(snapGuest2.secretsByOwnedSeat)).toEqual(['guest_2']);
    expect(snapGuest2.secretsByOwnedSeat['host_1']).toBeUndefined();
    expect(snapStage.secretsByOwnedSeat).toEqual({});
    expect(snapStage.revealedSecrets).toEqual({});
  });

  it('runs Kata-Kata Hari Ini including voting, last chance surrender, and round_end reveal', () => {
    const auth = setupThreePlayerRoom('kata_kata');
    auth.handleAction('host_1', 'startKataKataRound', {});

    // Identify spy from host perspective via round end test after finding who is eliminated
    const spyUid =
      (['host_1', 'guest_2', 'guest_3'] as const).find((uid) => {
        const s = auth.getSnapshotForPeer(uid, false).secretsByOwnedSeat[uid];
        const otherWords = (['host_1', 'guest_2', 'guest_3'] as const)
          .filter((id) => id !== uid)
          .map((id) => auth.getSnapshotForPeer(id, false).secretsByOwnedSeat[id]?.secretWord);
        return otherWords[0] === otherWords[1] && s?.secretWord !== otherWords[0];
      }) ?? 'guest_3';

    const accuser = spyUid === 'host_1' ? 'guest_2' : 'host_1';
    const otherVoter = (['host_1', 'guest_2', 'guest_3'] as const).find(
      (id) => id !== spyUid && id !== accuser,
    )!;

    auth.handleAction(accuser, 'initiateKataKataVote', { targetUid: spyUid, actAsUid: accuser });
    auth.handleAction(otherVoter, 'castKataKataVote', { choice: 'yes', actAsUid: otherVoter });

    expect(auth.getRoom().status).toBe('spy_guess');
    auth.handleAction(spyUid, 'submitKataKataLastChanceGuess', {
      surrender: true,
      actAsUid: spyUid,
    });

    expect(auth.getRoom().status).toBe('round_end');
    expect(auth.getRoom().lastRoundResult?.winnerTeam).toBe('warga');
    const stageSnap = auth.getSnapshotForPeer('tv_stage', true);
    expect(Object.keys(stageSnap.revealedSecrets)).toHaveLength(3);
  });

  it('runs Satu Frekuensi clue -> dialing -> reveal scoring', () => {
    const auth = setupThreePlayerRoom('satu_frekuensi');
    auth.handleAction('host_1', 'startSatuFrekuensiRound', {});

    const psychicUid = auth.getRoom().frequencyState!.psychicUid;
    const guessers = ['host_1', 'guest_2', 'guest_3'].filter((u) => u !== psychicUid);

    auth.handleAction(psychicUid, 'submitSatuFrekuensiClue', {
      clueText: 'Kopi Susu Gula Aren',
      actAsUid: psychicUid,
    });
    expect(auth.getRoom().frequencyState?.phase).toBe('dialing');

    for (const g of guessers) {
      auth.handleAction(g, 'submitSatuFrekuensiGuess', { guessValue: 55, actAsUid: g });
    }
    auth.handleAction('host_1', 'advanceSatuFrekuensiPhase', {});

    expect(auth.getRoom().status).toBe('round_end');
    expect(auth.getRoom().frequencyState?.phase).toBe('reveal');
    expect(auth.getRoom().frequencyState?.revealedGuesses).toHaveLength(2);
  });

  it('runs Fakta Hari Ini discussion -> guessing -> reveal and blocks non-controller phase advance', () => {
    const auth = setupThreePlayerRoom('fakta_hari_ini');
    auth.handleAction('host_1', 'startFaktaHariIniRound', {});

    const fs = auth.getRoom().faktaState!;
    // Guesser must NOT receive fact twist in their secret
    const guesserSecret = auth.getSnapshotForPeer(fs.guesserUid, false).secretsByOwnedSeat[fs.guesserUid];
    expect(guesserSecret?.isGuesser).toBe(true);
    expect(guesserSecret?.factTwist).toBeUndefined();

    // Guesser cannot advance phase
    expect(() =>
      auth.handleAction(fs.guesserUid, 'advanceFaktaHariIniPhase', { direction: 'advance' }),
    ).toThrow();

    // Phase controller advances to guessing
    auth.handleAction(fs.phaseControllerUid, 'advanceFaktaHariIniPhase', { direction: 'advance' });
    expect(auth.getRoom().faktaState?.phase).toBe('guessing');

    const candidate = ['host_1', 'guest_2', 'guest_3'].find((u) => u !== fs.guesserUid)!;
    auth.handleAction(fs.guesserUid, 'submitFaktaHariIniGuess', {
      pickedUid: candidate,
      actAsUid: fs.guesserUid,
    });
    expect(auth.getRoom().status).toBe('round_end');
    expect(auth.getRoom().faktaState?.revealedFactTwist).toBeTruthy();
  });

  it('supports Numpang seat ownership, BRB exclusion, Game Switcher, and Rekap Permainan', () => {
    const auth = setupThreePlayerRoom('spyfall');

    // Add Numpang on guest_2's phone
    const { numpangUid } = auth.handleAction('guest_2', 'addNumpangPlayer', {
      displayName: 'Rina Numpang',
    });
    expect(typeof numpangUid).toBe('string');

    // Mark guest_3 as BRB
    auth.handleAction('guest_3', 'togglePlayerBrb', { targetUid: 'guest_3', isBrb: true });
    auth.handleAction('host_1', 'startSpyfallRound', {});

    // guest_2 receives BOTH guest_2 and Rina Numpang secrets, while guest_3 (BRB) has no secret
    const guest2Snap = auth.getSnapshotForPeer('guest_2', false);
    expect(guest2Snap.secretsByOwnedSeat['guest_2']).toBeTruthy();
    expect(guest2Snap.secretsByOwnedSeat[String(numpangUid)]).toBeTruthy();

    const guest3Snap = auth.getSnapshotForPeer('guest_3', false);
    expect(guest3Snap.secretsByOwnedSeat['guest_3']).toBeNull();

    // Resolve round via timeout, then switch game and open Rekap
    auth.handleAction('host_1', 'resolveRoundTimeout', {});
    expect(auth.getRoom().status).toBe('round_end');

    auth.handleAction('host_1', 'switchRoomGameType', { nextGameType: 'satu_frekuensi' });
    expect(auth.getRoom().gameType).toBe('satu_frekuensi');
    expect(auth.getRoom().completedGames).toHaveLength(1);

    auth.handleAction('host_1', 'openSessionRecap', {});
    expect(auth.getRoom().activeRecap).not.toBeNull();
    expect(auth.getRoom().activeRecap?.completedGames).toHaveLength(1);
  });

  it('runs Pelukis Gadungan drawing turns -> voting -> gadungan_guess -> reveal & stage isolation', () => {
    const auth = setupThreePlayerRoom('pelukis_gadungan');
    auth.handleAction('host_1', 'updatePelukisSettings', {
      enabledPacks: ['kuliner'],
      spyMode: 'single',
      pelukisStrokeRounds: 1,
      customDrawingPrompts: [],
    });
    auth.handleAction('host_1', 'startPelukisRound', {});

    const stageStart = auth.getSnapshotForPeer('tv_stage', true);
    expect(stageStart.secretsByOwnedSeat).toEqual({});
    expect(stageStart.revealedSecrets).toEqual({});

    const lukisanStart = auth.getRoom().lukisanState!;
    expect(lukisanStart.phase).toBe('drawing');
    expect(lukisanStart.turnOrder).toHaveLength(3);

    // Find Gadungan vs Pelukis Asli from peer snapshots
    const uids = ['host_1', 'guest_2', 'guest_3'] as const;
    const gadunganUid = uids.find(
      (uid) => auth.getSnapshotForPeer(uid, false).secretsByOwnedSeat[uid]?.isGadungan === true,
    )!;
    const pelukisUid = uids.find((uid) => uid !== gadunganUid)!;

    const gadunganSecret = auth.getSnapshotForPeer(gadunganUid, false).secretsByOwnedSeat[gadunganUid];
    const pelukisSecret = auth.getSnapshotForPeer(pelukisUid, false).secretsByOwnedSeat[pelukisUid];
    expect(gadunganSecret?.drawingCategory).toBe(lukisanStart.category);
    expect(gadunganSecret?.drawingWord).toBeNull();
    expect(typeof pelukisSecret?.drawingWord).toBe('string');

    // Execute 1 stroke per turn in exact turnOrder
    for (const drawerUid of lukisanStart.turnOrder) {
      auth.handleAction(drawerUid, 'submitPelukisStroke', {
        points: [100, 100, 300, 300, 500, 200],
        actAsUid: drawerUid,
      });
    }

    expect(auth.getRoom().lukisanState?.phase).toBe('voting');
    expect(auth.getRoom().lukisanState?.strokes).toHaveLength(3);

    // All Pelukis Asli vote for Gadungan; Gadungan votes for someone else
    for (const voterUid of uids) {
      const targetUid = voterUid === gadunganUid ? pelukisUid : gadunganUid;
      auth.handleAction(voterUid, 'castPelukisVote', { targetUid, actAsUid: voterUid });
    }

    expect(auth.getRoom().lukisanState?.phase).toBe('gadungan_guess');
    expect(auth.getRoom().lukisanState?.accusedUid).toBe(gadunganUid);

    // Gadungan surrenders -> Pelukis Asli win (+2 each)
    auth.handleAction(gadunganUid, 'submitPelukisGuess', {
      surrender: true,
      actAsUid: gadunganUid,
    });

    expect(auth.getRoom().status).toBe('round_end');
    expect(auth.getRoom().lastRoundResult?.winnerTeam).toBe('pelukis');
    expect(auth.getRoom().lukisanState?.revealedWord).toBe(pelukisSecret?.drawingWord);

    const pelukisPlayer = auth.getPlayersList().find((p) => p.uid === pelukisUid);
    const gadunganPlayer = auth.getPlayersList().find((p) => p.uid === gadunganUid);
    expect(pelukisPlayer?.score).toBe(2);
    expect(gadunganPlayer?.score).toBe(0);

    // Game switcher cleans up lukisanState and archives match
    auth.handleAction('host_1', 'switchRoomGameType', { nextGameType: 'spyfall' });
    expect(auth.getRoom().gameType).toBe('spyfall');
    expect(auth.getRoom().lukisanState).toBeNull();
    expect(auth.getRoom().completedGames).toHaveLength(1);
  });

  it('runs Malam Siluman Night -> Dawn -> Discussion -> Day Vote -> Reveal with strict peer & stage isolation', () => {
    const auth = setupFourPlayerRoom('malam_siluman');
    auth.handleAction('host_1', 'updateMalamSilumanSettings', {
      wolfCountMode: 1,
      revealRoleOnDeath: true,
      enabledRoles: {
        seer: true,
        doctor: true,
        hunter: false,
        mayor: false,
        stealthWolf: false,
        jester: false,
      },
    });
    auth.handleAction('host_1', 'startMalamSilumanRound', {});

    const roomStart = auth.getRoom();
    expect(roomStart.status).toBe('playing');
    expect(roomStart.malamSilumanState?.phase).toBe('night');
    expect(roomStart.malamSilumanState?.livingUids).toHaveLength(4);

    // Layar Panggung receives zero secrets
    const stageNight = auth.getSnapshotForPeer('tv_stage', true);
    expect(stageNight.secretsByOwnedSeat).toEqual({});
    expect(stageNight.revealedSecrets).toEqual({});

    const uids = ['host_1', 'guest_2', 'guest_3', 'guest_4'] as const;
    const rolesByUid: Record<string, WerewolfRoleId> = {};
    for (const uid of uids) {
      const snap = auth.getSnapshotForPeer(uid, false);
      expect(Object.keys(snap.secretsByOwnedSeat)).toEqual([uid]);
      rolesByUid[uid] = snap.secretsByOwnedSeat[uid]!.wolfRole!;
    }

    const wolfUid = uids.find((u) => rolesByUid[u] === 'siluman')!;
    const seerUid = uids.find((u) => rolesByUid[u] === 'penerawang')!;
    const docUid = uids.find((u) => rolesByUid[u] === 'tabib')!;
    const wargaUid = uids.find((u) => rolesByUid[u] === 'warga')!;

    // Doctor protects wargaUid so everyone survives Night 1 and we can run Day Vote
    auth.handleAction(wolfUid, 'submitMalamSilumanNightAction', {
      targetUid: wargaUid,
      actAsUid: wolfUid,
    });
    auth.handleAction(seerUid, 'submitMalamSilumanNightAction', {
      targetUid: wolfUid,
      actAsUid: seerUid,
    });
    auth.handleAction(docUid, 'submitMalamSilumanNightAction', {
      targetUid: wargaUid,
      actAsUid: docUid,
    });
    auth.handleAction(wargaUid, 'submitMalamSilumanNightAction', {
      targetUid: 'decoy',
      actAsUid: wargaUid,
    });

    // Night auto-resolves into dawn; Doctor saved wargaUid, Seer got Aura Siluman!
    expect(auth.getRoom().malamSilumanState?.phase).toBe('dawn');
    expect(auth.getRoom().malamSilumanState?.livingUids).toHaveLength(4);

    const seerSnap = auth.getSnapshotForPeer(seerUid, false).secretsByOwnedSeat[seerUid]!;
    expect(seerSnap.peekHistory).toHaveLength(1);
    expect(seerSnap.peekHistory?.[0].apparentTeam).toBe('siluman');

    const wargaSnap = auth.getSnapshotForPeer(wargaUid, false).secretsByOwnedSeat[wargaUid]!;
    expect(wargaSnap.peekHistory).toEqual([]);

    // Host advances Dawn -> Day Discussion -> Day Voting
    auth.handleAction('host_1', 'advanceMalamSilumanDayPhase', { nextPhase: 'day_discussion' });
    expect(auth.getRoom().malamSilumanState?.phase).toBe('day_discussion');

    auth.handleAction('host_1', 'advanceMalamSilumanDayPhase', { nextPhase: 'day_voting' });
    expect(auth.getRoom().malamSilumanState?.phase).toBe('day_voting');

    // All citizens vote out the wolf; wolf votes wargaUid
    for (const uid of uids) {
      const targetUid = uid === wolfUid ? wargaUid : wolfUid;
      auth.handleAction(uid, 'castMalamSilumanVote', { targetUid, actAsUid: uid });
    }

    // Citizens win (+3 each living citizen, 0 for wolf)
    const roomEnd = auth.getRoom();
    expect(roomEnd.status).toBe('round_end');
    expect(roomEnd.lastRoundResult?.winnerTeam).toBe('warga');
    expect(roomEnd.malamSilumanState?.revealedRolesByUid?.[wolfUid]).toBe('siluman');

    const playersList = auth.getPlayersList();
    expect(playersList.find((p) => p.uid === wargaUid)?.score).toBe(3);
    expect(playersList.find((p) => p.uid === wolfUid)?.score).toBe(0);

    // Switch game cleans up malamSilumanState and archives match
    auth.handleAction('host_1', 'switchRoomGameType', { nextGameType: 'spyfall' });
    expect(auth.getRoom().malamSilumanState).toBeNull();
    expect(auth.getRoom().completedGames).toHaveLength(1);
  });

  it('runs Ular Tangga RP with Scenario Packs, strict bag isolation, skill/dice turns, and BRB turn advance', () => {
    const auth = setupFourPlayerRoom('ular_tangga');

    auth.handleAction('host_1', 'updateUlarTanggaSettings', {
      scenarioId: 'distrik_neon',
      boardMode: 'brutal',
      exactFinishBounce: true,
    });
    auth.handleAction('guest_2', 'selectUlarTanggaClass', {
      heroClass: 'penyihir',
      actAsUid: 'guest_2',
    });
    auth.handleAction('host_1', 'selectUlarTanggaClass', {
      heroClass: 'tabib',
      actAsUid: 'host_1',
    });

    auth.handleAction('host_1', 'startUlarTanggaRound', {});
    const started = auth.getRoom();
    expect(started.status).toBe('playing');
    expect(started.ularTanggaState?.scenarioId).toBe('distrik_neon');
    expect(started.ularTanggaState?.boardMode).toBe('brutal');

    // Stage display receives zero secret bags
    const stageSnap = auth.getSnapshotForPeer('tv_stage', true);
    expect(stageSnap.secretsByOwnedSeat).toEqual({});

    // Each peer ONLY sees their own starter bag item
    for (const uid of ['host_1', 'guest_2', 'guest_3', 'guest_4']) {
      const peerSnap = auth.getSnapshotForPeer(uid, false);
      expect(Object.keys(peerSnap.secretsByOwnedSeat)).toEqual([uid]);
      expect(peerSnap.secretsByOwnedSeat[uid]?.ularBag).toHaveLength(1);
    }

    const activeUid = started.ularTanggaState!.currentTurnUid;
    const starterItem = auth.getSnapshotForPeer(activeUid, false).secretsByOwnedSeat[activeUid]!
      .ularBag![0];

    // Active player uses class skill & starter item, then rolls dice
    auth.handleAction(activeUid, 'useUlarTanggaSkill', {
      actAsUid: activeUid,
      targetUid: null,
    });
    auth.handleAction(activeUid, 'useUlarTanggaItem', {
      actAsUid: activeUid,
      itemId: starterItem,
      targetUid: null,
    });
    expect(auth.getSnapshotForPeer(activeUid, false).secretsByOwnedSeat[activeUid]?.ularBag).toEqual(
      [],
    );

    const rollRes = auth.handleAction(activeUid, 'rollUlarTanggaDice', {
      actAsUid: activeUid,
    }) as { finished: boolean };
    expect(rollRes.finished).toBe(false);

    // If an encounter was triggered, resolve it to advance turn
    if (auth.getRoom().ularTanggaState?.phase === 'encounter') {
      const encType = auth.getRoom().ularTanggaState!.activeEncounter!.type;
      auth.handleAction(activeUid, 'resolveUlarTanggaEncounter', {
        actAsUid: activeUid,
        decision: encType === 'monster' ? 'attack' : 'skip',
      });
    }

    // Next player toggles BRB -> turn automatically skips forward!
    const nextTurnUid = auth.getRoom().ularTanggaState!.currentTurnUid;
    auth.handleAction(nextTurnUid, 'togglePlayerBrb', {
      uid: nextTurnUid,
      isBrb: true,
    });
    expect(auth.getRoom().ularTanggaState!.currentTurnUid).not.toBe(nextTurnUid);

    // Return to lobby & switch game resets ularTanggaState
    auth.handleAction('host_1', 'returnUlarTanggaToLobby', {});
    expect(auth.getRoom().status).toBe('lobby');
    expect(auth.getRoom().ularTanggaState).toBeNull();

    auth.handleAction('host_1', 'switchRoomGameType', { nextGameType: 'spyfall' });
    expect(auth.getRoom().gameType).toBe('spyfall');
    expect(auth.getRoom().ularTanggaState).toBeNull();
  });

  it('enforces 50% + 1 majority voting in Spyfall and reconciles mid-vote BRB/leave changes', () => {
    const auth = setupFourPlayerRoom('spyfall');
    auth.handleAction('host_1', 'startSpyfallRound', {});

    // 4 active players -> accuse guest_4 -> 3 eligible voters (host_1, guest_2, guest_3) -> requiredYes = 2
    auth.handleAction('host_1', 'initiateAccusationVote', {
      targetUid: 'guest_4',
      actAsUid: 'host_1',
    });
    expect(auth.getRoom().status).toBe('voting');

    // Target cannot vote
    expect(() =>
      auth.handleAction('guest_4', 'castAccusationVote', { choice: 'no', actAsUid: 'guest_4' }),
    ).toThrow();

    // 1 'no' vote must NOT immediately drop the vote (still 1 yes, 1 no, 1 pending -> 2 yes still possible)
    const afterOneNo = auth.handleAction('guest_2', 'castAccusationVote', {
      choice: 'no',
      actAsUid: 'guest_2',
    }) as { outcome: string };
    expect(afterOneNo.outcome).toBe('pending');
    expect(auth.getRoom().status).toBe('voting');

    // 2nd 'no' vote makes 50% + 1 impossible -> acquitted back to playing
    const afterTwoNo = auth.handleAction('guest_3', 'castAccusationVote', {
      choice: 'no',
      actAsUid: 'guest_3',
    }) as { outcome: string };
    expect(afterTwoNo.outcome).toBe('acquitted');
    expect(auth.getRoom().status).toBe('playing');
    expect(auth.getRoom().activeVote).toBeNull();

    // Start another vote against guest_4: 1 yes (host_1), 1 no (guest_2), then guest_3 votes yes -> 2/3 convicted!
    auth.handleAction('host_1', 'initiateAccusationVote', {
      targetUid: 'guest_4',
      actAsUid: 'host_1',
    });
    auth.handleAction('guest_2', 'castAccusationVote', { choice: 'no', actAsUid: 'guest_2' });
    expect(auth.getRoom().status).toBe('voting');

    const convicted = auth.handleAction('guest_3', 'castAccusationVote', {
      choice: 'yes',
      actAsUid: 'guest_3',
    }) as { outcome: string };
    expect(convicted.outcome).toBe('convicted');
    expect(auth.getRoom().status).toBe('round_end');

    // Mid-vote BRB reconciliation: start next round, initiate vote, 1 no, then remaining voter goes BRB -> auto-acquitted!
    auth.handleAction('host_1', 'startSpyfallRound', {});
    auth.handleAction('host_1', 'initiateAccusationVote', {
      targetUid: 'guest_4',
      actAsUid: 'host_1',
    });
    auth.handleAction('guest_2', 'castAccusationVote', { choice: 'no', actAsUid: 'guest_2' });
    expect(auth.getRoom().status).toBe('voting');

    // guest_3 goes BRB -> eligible drops to [host_1, guest_2] (requiredYes = 2), 1 no makes majority impossible
    auth.handleAction('guest_3', 'togglePlayerBrb', { uid: 'guest_3', isBrb: true });
    expect(auth.getRoom().status).toBe('playing');
    expect(auth.getRoom().activeVote).toBeNull();
  });
});



