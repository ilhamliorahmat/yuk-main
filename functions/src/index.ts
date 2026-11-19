import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import {
  calculateKataKataScoreDeltas,
  dealKataKataRound,
  evaluateKataKataAfterElimination,
  evaluateKataKataLastChanceGuess,
  evaluateKataKataVoteProgress,
  mergeWordPairPool,
} from './shared/kata-kata/engine';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  evaluateSpyGuess,
  evaluateVoteProgress,
  mergeLocationPool,
} from './shared/spyfall/engine';
import type {
  EliminationEntry,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from './shared/types';

const app = getApps().length > 0 ? getApp() : initializeApp();
const db = getFirestore(app);

const FUNCTION_OPTIONS = {
  region: 'asia-southeast1',
  cors: true,
  maxInstances: 20,
} as const;

function requireAuth(request: CallableRequest<unknown>): { uid: string } {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Sesi autentikasi tidak ditemukan. Silakan masuk terlebih dahulu.',
    );
  }
  const provider = request.auth.token.firebase?.sign_in_provider;
  const allowed = provider === 'anonymous' || request.auth.token.email_verified === true;
  if (!allowed) {
    throw new HttpsError('permission-denied', 'Akun belum terverifikasi untuk bermain.');
  }
  return { uid: request.auth.uid };
}

function assertRoomId(roomId: unknown): string {
  const clean = typeof roomId === 'string' ? roomId.trim() : '';
  if (!clean || !/^[a-zA-Z0-9_-]{4,64}$/.test(clean)) {
    throw new HttpsError('invalid-argument', 'ID ruang tidak valid.');
  }
  return clean;
}

export const spyfallStart = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as { roomId?: unknown };
  const roomId = assertRoomId(data.roomId);

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  const result = await db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== caller.uid) {
      throw new HttpsError('permission-denied', 'Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new HttpsError('failed-precondition', 'Ronde sedang berlangsung.');
    }

    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    if (players.length < 3) {
      throw new HttpsError(
        'failed-precondition',
        'Minimal 3 pemain dibutuhkan untuk memulai Spyfall.',
      );
    }

    const pool = mergeLocationPool(room.enabledPacks ?? ['nusantara'], room.customLocations ?? []);
    if (pool.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Paket lokasi kosong. Aktifkan minimal 1 paket lokasi.',
      );
    }

    const prevServerState = serverStateSnap.exists
      ? (serverStateSnap.data() as ServerRoundStateDoc)
      : null;
    const previousLocationName =
      prevServerState?.locationName ?? room.lastRoundResult?.locationName ?? null;

    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;

    const dealt = dealSpyfallRound({
      playerUids: players.map((p) => p.uid),
      pool,
      previousLocationName,
      spyMode: room.spyMode ?? 'single',
      roundId,
    });

    const playerMap = new Map(players.map((p) => [p.uid, p]));
    const spyNames = dealt.spyUids.map((spyUid) => playerMap.get(spyUid)?.displayName ?? 'Pemain');
    const firstSpeakerName = playerMap.get(dealt.firstSpeakerUid)?.displayName ?? 'Pemain';

    const durationSec = Math.min(1200, Math.max(120, room.roundDurationSec ?? 480));
    const roundEndsAtMs = Date.now() + durationSec * 1000;

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs,
      firstSpeakerUid: dealt.firstSpeakerUid,
      selectedLocationNames: dealt.selectedLocationNames.slice(0, 40),
      activeVote: null,
      pendingSpyGuess: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: dealt.location.name,
      spyUids: dealt.spyUids,
      spyNames,
      createdAtMs: Date.now(),
    };
    tx.set(serverStateRef, nextServerState);

    for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
      const secretRef = roomRef
        .collection('rounds')
        .doc(roundId)
        .collection('secrets')
        .doc(playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      ok: true,
      roundNumber: nextRoundNumber,
      systemMessage: `Ronde #${nextRoundNumber} dimulai! ${firstSpeakerName} mendapat giliran bertanya pertama.`,
    };
  });

  return result;
});

export const spyfallVote = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as {
    roomId?: unknown;
    action?: unknown;
    targetUid?: unknown;
    choice?: unknown;
  };
  const roomId = assertRoomId(data.roomId);
  const action = data.action;

  if (action !== 'initiate' && action !== 'cast' && action !== 'cancel') {
    throw new HttpsError('invalid-argument', 'Aksi voting tidak valid.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);

    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new HttpsError(
          'failed-precondition',
          'Pemungutan suara hanya bisa dimulai saat permainan berlangsung.',
        );
      }
      const targetUid = typeof data.targetUid === 'string' ? data.targetUid.trim() : '';
      const targetPlayer = players.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new HttpsError('not-found', 'Pemain tertuduh tidak ditemukan di ruang ini.');
      }
      if (targetPlayer.uid === caller.uid) {
        throw new HttpsError('invalid-argument', 'Kamu tidak bisa menuduh dirimu sendiri.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: caller.uid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [caller.uid]: 'yes' },
        },
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Mata-Mata!`,
      };
    }

    if (action === 'cancel') {
      if (room.hostUid !== caller.uid) {
        throw new HttpsError('permission-denied', 'Hanya Host yang dapat membatalkan voting.');
      }
      if (room.status !== 'voting' && room.status !== 'spy_guess') {
        throw new HttpsError('failed-precondition', 'Tidak ada voting aktif untuk dibatalkan.');
      }

      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: 'Host membatalkan voting dan melanjutkan ronde.',
      };
    }

    // action === 'cast'
    if (room.status !== 'voting' || !room.activeVote) {
      throw new HttpsError('failed-precondition', 'Tidak ada pemungutan suara yang sedang berlangsung.');
    }
    if (room.activeVote.targetUid === caller.uid) {
      throw new HttpsError('permission-denied', 'Pemain yang sedang dituduh tidak memiliki hak suara.');
    }
    const choice = data.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new HttpsError('invalid-argument', 'Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [caller.uid]: choice,
    };
    const eligibleVoters = players
      .map((p) => p.uid)
      .filter((uid) => uid !== room.activeVote?.targetUid);

    const evaluation = evaluateVoteProgress(nextVotes, eligibleVoters);

    if (evaluation.outcome === 'acquitted') {
      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Permainan berlanjut!`,
      };
    }

    if (evaluation.outcome === 'convicted') {
      if (!serverStateSnap.exists) {
        throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
      }
      const serverState = serverStateSnap.data() as ServerRoundStateDoc;
      const isTargetSpy = serverState.spyUids.includes(room.activeVote.targetUid);

      if (!isTargetSpy) {
        const deltas = calculateRoundScoreDeltas({
          playerUids: players.map((p) => p.uid),
          spyUids: serverState.spyUids,
          winnerTeam: 'mata_mata',
          initiatorUid: room.activeVote.initiatorUid,
          victoryType: 'false_accusation',
        });

        const roundResult: RoundResult = {
          roundNumber: room.roundNumber,
          winnerTeam: 'mata_mata',
          reason: `Warga salah menuduh ${room.activeVote.targetName} yang bukan Mata-Mata!`,
          locationName: serverState.locationName,
          guessedLocation: null,
          spyUids: serverState.spyUids,
          spyNames: serverState.spyNames,
          resolvedAtMs: Date.now(),
          scoresApplied: true,
        };

        tx.update(roomRef, {
          status: 'round_end',
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: roundResult,
          updatedAt: FieldValue.serverTimestamp(),
        });

        for (const player of players) {
          const delta = deltas[player.uid] ?? 0;
          if (delta > 0) {
            tx.update(playersRef.doc(player.uid), {
              score: FieldValue.increment(delta),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        return {
          ok: true,
          systemMessage: `${room.activeVote.targetName} ternyata WARGA! Tim Mata-Mata memenangkan ronde ini!`,
        };
      }

      tx.update(roomRef, {
        status: 'spy_guess',
        activeVote: {
          ...room.activeVote,
          votes: nextVotes,
        },
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `Semua pemilih sepakat menuduh ${room.activeVote.targetName}! Mata-Mata mendapat kesempatan terakhir menebak lokasi.`,
      };
    }

    tx.update(roomRef, {
      activeVote: {
        ...room.activeVote,
        votes: nextVotes,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
  });
});

export const spyfallGuess = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as { roomId?: unknown; guessedLocation?: unknown };
  const roomId = assertRoomId(data.roomId);
  const guessedLocation =
    typeof data.guessedLocation === 'string' ? data.guessedLocation.trim().slice(0, 80) : '';

  if (!guessedLocation) {
    throw new HttpsError('invalid-argument', 'Pilih lokasi tebakan terlebih dahulu.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);

    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }
    if (room.status !== 'playing' && room.status !== 'spy_guess') {
      throw new HttpsError(
        'failed-precondition',
        'Tebakan lokasi tidak dapat dikirim pada status ronde saat ini.',
      );
    }
    if (!serverStateSnap.exists) {
      throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    if (!serverState.spyUids.includes(caller.uid)) {
      throw new HttpsError('permission-denied', 'Hanya Mata-Mata yang dapat menebak lokasi.');
    }
    if (
      room.status === 'spy_guess' &&
      room.activeVote &&
      room.activeVote.targetUid !== caller.uid
    ) {
      throw new HttpsError(
        'permission-denied',
        'Hanya Mata-Mata yang sedang tertangkap yang mendapat kesempatan tebakan terakhir.',
      );
    }

    const isCorrect = evaluateSpyGuess(guessedLocation, serverState.locationName);
    const winnerTeam = isCorrect ? 'mata_mata' : 'warga';

    const deltas = calculateRoundScoreDeltas({
      playerUids: players.map((p) => p.uid),
      spyUids: serverState.spyUids,
      winnerTeam,
      initiatorUid: room.activeVote?.initiatorUid ?? null,
      victoryType: isCorrect ? 'spy_guess_correct' : 'spy_guess_wrong',
    });

    const reason = isCorrect
      ? `${callerPlayer.displayName} menebak lokasi dengan tepat (${serverState.locationName})!`
      : `Tebakan ${callerPlayer.displayName} (${guessedLocation}) meleset! Lokasi sebenarnya adalah ${serverState.locationName}.`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam,
      reason,
      locationName: serverState.locationName,
      guessedLocation,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(playersRef.doc(player.uid), {
          score: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
});

export const spyfallResolve = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as { roomId?: unknown; action?: unknown };
  const roomId = assertRoomId(data.roomId);
  const action = data.action;

  if (action !== 'timeout' && action !== 'return_lobby') {
    throw new HttpsError('invalid-argument', 'Aksi penyelesaian tidak valid.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);

    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'return_lobby') {
      if (room.hostUid !== caller.uid) {
        throw new HttpsError(
          'permission-denied',
          'Hanya Host yang dapat mengembalikan ruang ke lobi.',
        );
      }

      tx.update(roomRef, {
        status: 'lobby',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true, systemMessage: 'Host mengembalikan ruang permainan ke lobi.' };
    }

    if (room.status === 'round_end' || room.status === 'lobby') {
      return { ok: true, systemMessage: null };
    }

    const timerExpired = room.roundEndsAtMs > 0 && Date.now() >= room.roundEndsAtMs - 1500;
    if (!timerExpired && room.hostUid !== caller.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Waktu ronde belum habis. Hanya Host yang dapat mengakhiri ronde lebih awal.',
      );
    }

    if (!serverStateSnap.exists) {
      throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;

    const spyStalledOnGuess = room.status === 'spy_guess';
    const winnerTeam = spyStalledOnGuess ? 'warga' : 'mata_mata';
    const victoryType = spyStalledOnGuess ? 'caught_no_guess' : 'timeout';
    const reason = spyStalledOnGuess
      ? 'Mata-Mata tertangkap dan gagal menebak lokasi tepat waktu!'
      : 'Waktu habis! Mata-Mata berhasil bertahan tanpa terbongkar.';

    const deltas = calculateRoundScoreDeltas({
      playerUids: players.map((p) => p.uid),
      spyUids: serverState.spyUids,
      winnerTeam,
      initiatorUid: room.activeVote?.initiatorUid ?? null,
      victoryType,
    });

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam,
      reason,
      locationName: serverState.locationName,
      guessedLocation: null,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(playersRef.doc(player.uid), {
          score: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
});

// ============================================================================
// GAME #2: KATA-KATA HARI INI (Blind-Spy Word Deduction + Multi-Spy + Last Chance)
// ============================================================================

export const kataKataStart = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as { roomId?: unknown };
  const roomId = assertRoomId(data.roomId);

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new HttpsError('invalid-argument', 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }
    if (room.hostUid !== caller.uid) {
      throw new HttpsError('permission-denied', 'Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new HttpsError('failed-precondition', 'Ronde sedang berlangsung.');
    }

    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    if (players.length < 3) {
      throw new HttpsError(
        'failed-precondition',
        'Minimal 3 pemain dibutuhkan untuk memulai Kata-Kata Hari Ini.',
      );
    }

    const pool = mergeWordPairPool(
      room.enabledPacks ?? ['kuliner', 'keseharian'],
      room.customWordPairs ?? [],
    );
    if (pool.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Paket kata kosong. Aktifkan minimal 1 paket kata.',
      );
    }

    const prevServerState = serverStateSnap.exists
      ? (serverStateSnap.data() as ServerRoundStateDoc)
      : null;
    const previousCitizenWord =
      prevServerState?.citizenWord ?? room.lastRoundResult?.citizenWord ?? null;

    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;

    const dealt = dealKataKataRound({
      playerUids: players.map((p) => p.uid),
      pool,
      previousCitizenWord,
      spyMode: room.spyMode ?? 'single',
      roundId,
    });

    const playerMap = new Map(players.map((p) => [p.uid, p]));
    const spyNames = dealt.spyUids.map((spyUid) => playerMap.get(spyUid)?.displayName ?? 'Pemain');
    const firstSpeakerName = playerMap.get(dealt.firstSpeakerUid)?.displayName ?? 'Pemain';

    const durationSec = Math.min(1200, Math.max(120, room.roundDurationSec ?? 480));
    const roundEndsAtMs = Date.now() + durationSec * 1000;

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs,
      firstSpeakerUid: dealt.firstSpeakerUid,
      selectedLocationNames: [],
      eliminatedUids: [],
      eliminationLog: [],
      activeVote: null,
      pendingSpyGuess: null,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: dealt.citizenWord,
      citizenWord: dealt.citizenWord,
      spyWord: dealt.spyWord,
      spyUids: dealt.spyUids,
      spyNames,
      createdAtMs: Date.now(),
    };
    tx.set(serverStateRef, nextServerState);

    for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
      const secretRef = roomRef
        .collection('rounds')
        .doc(roundId)
        .collection('secrets')
        .doc(playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      ok: true,
      roundNumber: nextRoundNumber,
      systemMessage: `Ronde #${nextRoundNumber} Kata-Kata Hari Ini dimulai! ${firstSpeakerName} mendapat giliran memberi petunjuk pertama.`,
    };
  });
});

export const kataKataVote = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as {
    roomId?: unknown;
    action?: unknown;
    targetUid?: unknown;
    choice?: unknown;
  };
  const roomId = assertRoomId(data.roomId);
  const action = data.action;

  if (action !== 'initiate' && action !== 'cast' && action !== 'cancel') {
    throw new HttpsError('invalid-argument', 'Aksi voting tidak valid.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new HttpsError('invalid-argument', 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);
    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }

    const eliminatedUids = room.eliminatedUids ?? [];
    const eliminatedSet = new Set(eliminatedUids);

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new HttpsError(
          'failed-precondition',
          'Pemungutan suara hanya bisa dimulai saat permainan berlangsung.',
        );
      }
      if (eliminatedSet.has(caller.uid)) {
        throw new HttpsError(
          'permission-denied',
          'Pemain yang sudah tereliminasi hanya bisa menonton hingga ronde selesai.',
        );
      }

      const targetUid = typeof data.targetUid === 'string' ? data.targetUid.trim() : '';
      const targetPlayer = players.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new HttpsError('not-found', 'Pemain tertuduh tidak ditemukan di ruang ini.');
      }
      if (targetPlayer.uid === caller.uid) {
        throw new HttpsError('invalid-argument', 'Kamu tidak bisa menuduh dirimu sendiri.');
      }
      if (eliminatedSet.has(targetPlayer.uid)) {
        throw new HttpsError('invalid-argument', 'Pemain tersebut sudah tereliminasi.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: caller.uid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [caller.uid]: 'yes' },
        },
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Penyusup!`,
      };
    }

    if (action === 'cancel') {
      if (room.hostUid !== caller.uid) {
        throw new HttpsError('permission-denied', 'Hanya Host yang dapat membatalkan voting.');
      }
      if (room.status !== 'voting' && room.status !== 'spy_guess') {
        throw new HttpsError('failed-precondition', 'Tidak ada voting aktif untuk dibatalkan.');
      }

      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: 'Host membatalkan voting dan melanjutkan ronde.',
      };
    }

    // action === 'cast'
    if (room.status !== 'voting' || !room.activeVote) {
      throw new HttpsError(
        'failed-precondition',
        'Tidak ada pemungutan suara yang sedang berlangsung.',
      );
    }
    if (eliminatedSet.has(caller.uid)) {
      throw new HttpsError(
        'permission-denied',
        'Pemain yang sudah tereliminasi tidak memiliki hak suara.',
      );
    }
    if (room.activeVote.targetUid === caller.uid) {
      throw new HttpsError(
        'permission-denied',
        'Pemain yang sedang dituduh tidak memiliki hak suara.',
      );
    }

    const choice = data.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new HttpsError('invalid-argument', 'Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [caller.uid]: choice,
    };
    const eligibleAliveVoters = players
      .map((p) => p.uid)
      .filter((uid) => !eliminatedSet.has(uid) && uid !== room.activeVote?.targetUid);

    const evaluation = evaluateKataKataVoteProgress(nextVotes, eligibleAliveVoters);

    if (evaluation.outcome === 'acquitted') {
      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Diskusi berlanjut!`,
      };
    }

    if (evaluation.outcome === 'convicted') {
      if (!serverStateSnap.exists) {
        throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
      }
      const serverState = serverStateSnap.data() as ServerRoundStateDoc;
      const citizenWord = serverState.citizenWord ?? serverState.locationName;
      const spyWord = serverState.spyWord ?? '';
      const targetUid = room.activeVote.targetUid;
      const targetName = room.activeVote.targetName;

      const elimEval = evaluateKataKataAfterElimination({
        allPlayerUids: players.map((p) => p.uid),
        previouslyEliminatedUids: eliminatedUids,
        eliminatedUid: targetUid,
        spyUids: serverState.spyUids,
      });

      const nextEliminatedUids = [...eliminatedUids, targetUid];
      const nextEliminationLog: EliminationEntry[] = [
        ...(room.eliminationLog ?? []),
        {
          uid: targetUid,
          displayName: targetName,
          wasSpy: elimEval.wasSpy,
          eliminatedAtMs: Date.now(),
        },
      ];

      if (elimEval.outcome === 'final_spy_last_chance') {
        tx.update(roomRef, {
          status: 'spy_guess',
          eliminatedUids: nextEliminatedUids,
          eliminationLog: nextEliminationLog,
          activeVote: {
            ...room.activeVote,
            votes: nextVotes,
          },
          pendingSpyGuess: {
            spyUid: targetUid,
            spyName: targetName,
            guessedLocation: '',
            submittedAtMs: Date.now(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          ok: true,
          systemMessage: `${targetName} tereliminasi dan ternyata PENYUSUP TERAKHIR! ${targetName} mendapat 1 Kesempatan Terakhir menebak Kata Warga!`,
        };
      }

      if (elimEval.outcome === 'spies_outnumber') {
        const deltas = calculateKataKataScoreDeltas({
          playerUids: players.map((p) => p.uid),
          spyUids: serverState.spyUids,
          winnerTeam: 'mata_mata',
          initiatorUid: room.activeVote.initiatorUid,
          victoryType: 'spies_outnumber',
        });

        const reason = `${targetName} tereliminasi (${elimEval.wasSpy ? 'Penyusup' : 'Warga'}). Penyusup yang tersisa kini menyamai jumlah Warga!`;

        const roundResult: RoundResult = {
          roundNumber: room.roundNumber,
          winnerTeam: 'mata_mata',
          reason,
          locationName: citizenWord,
          guessedLocation: null,
          citizenWord,
          spyWord,
          guessedWord: null,
          spyUids: serverState.spyUids,
          spyNames: serverState.spyNames,
          resolvedAtMs: Date.now(),
          scoresApplied: true,
        };

        tx.update(roomRef, {
          status: 'round_end',
          eliminatedUids: nextEliminatedUids,
          eliminationLog: nextEliminationLog,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: roundResult,
          updatedAt: FieldValue.serverTimestamp(),
        });

        for (const player of players) {
          const delta = deltas[player.uid] ?? 0;
          if (delta > 0) {
            tx.update(playersRef.doc(player.uid), {
              score: FieldValue.increment(delta),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }

        return {
          ok: true,
          systemMessage: `${reason} Tim Penyusup memenangkan ronde ini!`,
        };
      }

      tx.update(roomRef, {
        status: 'playing',
        eliminatedUids: nextEliminatedUids,
        eliminationLog: nextEliminationLog,
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: elimEval.wasSpy
          ? `${targetName} tereliminasi dan ternyata PENYUSUP! Masih ada ${elimEval.remainingSpyUids.length} Penyusup tersisa—permainan berlanjut!`
          : `${targetName} tereliminasi dan ternyata WARGA! Hati-hati, Penyusup masih berkeliaran!`,
      };
    }

    tx.update(roomRef, {
      activeVote: {
        ...room.activeVote,
        votes: nextVotes,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
  });
});

export const kataKataGuess = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as {
    roomId?: unknown;
    guessedWord?: unknown;
    surrender?: unknown;
  };
  const roomId = assertRoomId(data.roomId);
  const surrender = Boolean(data.surrender);
  const guessedWord =
    typeof data.guessedWord === 'string' ? data.guessedWord.trim().slice(0, 80) : '';

  if (!surrender && !guessedWord) {
    throw new HttpsError('invalid-argument', 'Ketik tebakan Kata Warga terlebih dahulu.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new HttpsError('invalid-argument', 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);
    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }
    if (room.status !== 'spy_guess' || !room.pendingSpyGuess) {
      throw new HttpsError('failed-precondition', 'Tidak ada fase Kesempatan Terakhir yang aktif.');
    }
    if (room.pendingSpyGuess.spyUid !== caller.uid) {
      throw new HttpsError(
        'permission-denied',
        'Hanya Penyusup terakhir yang tertangkap yang dapat mengirimkan tebakan.',
      );
    }
    if (!serverStateSnap.exists) {
      throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const citizenWord = serverState.citizenWord ?? serverState.locationName;
    const spyWord = serverState.spyWord ?? '';

    const isCorrect =
      !surrender && evaluateKataKataLastChanceGuess(guessedWord, citizenWord);
    const winnerTeam = isCorrect ? 'mata_mata' : 'warga';

    const deltas = calculateKataKataScoreDeltas({
      playerUids: players.map((p) => p.uid),
      spyUids: serverState.spyUids,
      winnerTeam,
      initiatorUid: room.activeVote?.initiatorUid ?? null,
      victoryType: isCorrect ? 'last_chance_correct' : 'last_chance_wrong',
    });

    const reason = surrender
      ? `${callerPlayer.displayName} menyerah pada Kesempatan Terakhir! Tim Warga menang.`
      : isCorrect
        ? `${callerPlayer.displayName} berhasil menebak Kata Warga ("${citizenWord}") di Kesempatan Terakhir dan membalikkan kemenangan!`
        : `Tebakan ${callerPlayer.displayName} ("${guessedWord}") meleset! Kata Warga sebenarnya adalah "${citizenWord}".`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam,
      reason,
      locationName: citizenWord,
      guessedLocation: surrender ? null : guessedWord,
      citizenWord,
      spyWord,
      guessedWord: surrender ? null : guessedWord,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(playersRef.doc(player.uid), {
          score: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
});

export const kataKataResolve = onCall(FUNCTION_OPTIONS, async (request) => {
  const caller = requireAuth(request);
  const data = (request.data ?? {}) as { roomId?: unknown; action?: unknown };
  const roomId = assertRoomId(data.roomId);
  const action = data.action;

  if (action !== 'timeout' && action !== 'return_lobby') {
    throw new HttpsError('invalid-argument', 'Aksi penyelesaian tidak valid.');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  const playersRef = roomRef.collection('players');
  const serverStateRef = roomRef.collection('serverState').doc('current');

  return db.runTransaction(async (tx) => {
    const [roomSnap, playersSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(playersRef.orderBy('joinedAt', 'asc')),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists) {
      throw new HttpsError('not-found', 'Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new HttpsError('invalid-argument', 'Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const players = playersSnap.docs.map((d) => d.data() as RoomPlayerDoc);
    const callerPlayer = players.find((p) => p.uid === caller.uid);
    if (!callerPlayer) {
      throw new HttpsError('permission-denied', 'Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'return_lobby') {
      if (room.hostUid !== caller.uid) {
        throw new HttpsError(
          'permission-denied',
          'Hanya Host yang dapat mengembalikan ruang ke lobi.',
        );
      }

      tx.update(roomRef, {
        status: 'lobby',
        activeVote: null,
        pendingSpyGuess: null,
        eliminatedUids: [],
        eliminationLog: [],
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true, systemMessage: 'Host mengembalikan ruang permainan ke lobi.' };
    }

    if (room.status === 'round_end' || room.status === 'lobby') {
      return { ok: true, systemMessage: null };
    }

    const timerExpired = room.roundEndsAtMs > 0 && Date.now() >= room.roundEndsAtMs - 1500;
    if (!timerExpired && room.hostUid !== caller.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Waktu ronde belum habis. Hanya Host yang dapat mengakhiri ronde lebih awal.',
      );
    }

    if (!serverStateSnap.exists) {
      throw new HttpsError('internal', 'Status rahasia ronde pada server tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const citizenWord = serverState.citizenWord ?? serverState.locationName;
    const spyWord = serverState.spyWord ?? '';

    const spyStalledOnGuess = room.status === 'spy_guess';
    const winnerTeam = spyStalledOnGuess ? 'warga' : 'mata_mata';
    const victoryType = spyStalledOnGuess ? 'all_spies_eliminated' : 'timeout';
    const reason = spyStalledOnGuess
      ? 'Penyusup terakhir tertangkap dan tidak berhasil menebak Kata Warga tepat waktu!'
      : 'Waktu habis! Penyusup berhasil menyamar hingga akhir ronde.';

    const deltas = calculateKataKataScoreDeltas({
      playerUids: players.map((p) => p.uid),
      spyUids: serverState.spyUids,
      winnerTeam,
      initiatorUid: room.activeVote?.initiatorUid ?? null,
      victoryType,
    });

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam,
      reason,
      locationName: citizenWord,
      guessedLocation: null,
      citizenWord,
      spyWord,
      guessedWord: null,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: FieldValue.serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(playersRef.doc(player.uid), {
          score: FieldValue.increment(delta),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
});
