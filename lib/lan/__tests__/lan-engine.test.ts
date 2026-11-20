import { describe, expect, it } from 'vitest';
import { LanHostAuthority } from '../lan-host-authority';
import { isLanRoomId } from '../lan-protocol';
import { compactLanSdp, decodeLanSignal, encodeLanSignal } from '../lan-signaling';

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
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=candidate:1 1 udp 2122260223 192.168.1.42 54321 typ host generation 0',
  'a=candidate:2 1 udp 2122194687 10.0.0.5 54322 typ host generation 0',
  'a=candidate:3 1 tcp 1518280447 192.168.1.42 9 typ host tcptype active',
  'a=candidate:4 1 udp 1686052607 203.0.113.5 55555 typ srflx raddr 192.168.1.42 rport 54321',
  '',
].join('\r\n');

describe('Zero-Internet WebRTC LAN Signaling Codec', () => {
  it('compacts SDP by retaining host UDP candidates and stripping srflx/tcp bloat', () => {
    const compacted = compactLanSdp(SAMPLE_SDP);
    expect(compacted).toContain('a=fingerprint:sha-256');
    expect(compacted).toContain('192.168.1.42');
    expect(compacted).toContain('10.0.0.5');
    expect(compacted).not.toContain('typ srflx');
    expect(compacted).not.toContain('tcptype active');
    expect(compacted.length).toBeLessThan(SAMPLE_SDP.length);
  });

  it('round-trips Offer and Answer signal packets via encodeLanSignal / decodeLanSignal', async () => {
    const encodedOffer = await encodeLanSignal({
      v: 1,
      t: 'O',
      s: SAMPLE_SDP,
      r: 'LAN42X',
      g: 'spyfall',
      h: 'Host Budi',
    });

    expect(encodedOffer.startsWith('YMLAN')).toBe(true);
    const decodedOffer = await decodeLanSignal(encodedOffer);
    expect(decodedOffer.t).toBe('O');
    expect(decodedOffer.r).toBe('LAN42X');
    expect(decodedOffer.g).toBe('spyfall');
    expect(decodedOffer.h).toBe('Host Budi');
    expect(decodedOffer.s).toContain('192.168.1.42');

    const encodedAnswer = await encodeLanSignal({
      v: 1,
      t: 'A',
      s: SAMPLE_SDP,
      u: 'lanp_guest1',
      n: 'Siti',
      c: '#10B981',
      st: 1,
    });
    const decodedAnswer = await decodeLanSignal(encodedAnswer);
    expect(decodedAnswer.t).toBe('A');
    expect(decodedAnswer.u).toBe('lanp_guest1');
    expect(decodedAnswer.n).toBe('Siti');
    expect(decodedAnswer.st).toBe(1);
  });
});

describe('LanHostAuthority — Zero-Leak Isolation & All 4 Games + Session Platform', () => {
  function setupThreePlayerRoom(gameType: 'spyfall' | 'kata_kata' | 'satu_frekuensi' | 'fakta_hari_ini') {
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
});
