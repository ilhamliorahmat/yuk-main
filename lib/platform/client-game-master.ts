'use client';

import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import { getFirebaseServices } from '@/lib/firebase/client';
import {
  calculateFaktaHariIniScoreDeltas,
  dealFaktaHariIniRound,
  mergeFactPool,
} from '@/lib/games/fakta-hari-ini/engine';
import {
  calculateKataKataScoreDeltas,
  dealKataKataRound,
  evaluateKataKataAfterElimination,
  evaluateKataKataLastChanceGuess,
  evaluateKataKataVoteProgress,
  mergeWordPairPool,
} from '@/lib/games/kata-kata/engine';
import {
  dealSatuFrekuensiRound,
  mergeSpectrumPool,
  scoreSatuFrekuensiRound,
} from '@/lib/games/satu-frekuensi/engine';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  evaluateSpyGuess,
  evaluateVoteProgress,
  mergeLocationPool,
} from '@/lib/games/spyfall/engine';
import type {
  EliminationEntry,
  FaktaState,
  FrequencyState,
  PlayerSubmissionDoc,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '@/lib/games/types';

export type ClientGameMasterEndpoint =
  | '/api/spyfall/start'
  | '/api/spyfall/vote'
  | '/api/spyfall/guess'
  | '/api/spyfall/resolve'
  | '/api/kata-kata/start'
  | '/api/kata-kata/vote'
  | '/api/kata-kata/guess'
  | '/api/kata-kata/resolve'
  | '/api/satu-frekuensi/start'
  | '/api/satu-frekuensi/clue'
  | '/api/satu-frekuensi/guess'
  | '/api/satu-frekuensi/next-phase'
  | '/api/satu-frekuensi/return-lobby'
  | '/api/fakta-hari-ini/start'
  | '/api/fakta-hari-ini/next-phase'
  | '/api/fakta-hari-ini/guess'
  | '/api/fakta-hari-ini/return-lobby';

export interface ClientGameMasterResponse {
  ok: boolean;
  error?: string;
  systemMessage?: string | null;
}

function getTimestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds: unknown }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
}

function assertRoomId(roomId: unknown): string {
  const clean = typeof roomId === 'string' ? roomId.trim() : '';
  if (!clean || !/^[a-zA-Z0-9_-]{4,64}$/.test(clean)) {
    throw new Error('ID ruang tidak valid.');
  }
  return clean;
}

/**
 * Fetches all room players using the security-rule-compliant `where('roomId', '==', roomId)` query
 * and sorts deterministically by `joinedAt` in JS (avoiding any Firestore composite index requirement).
 */
async function fetchOrderedRoomPlayers(db: Firestore, roomId: string): Promise<RoomPlayerDoc[]> {
  const playersQuery = query(
    collection(db, 'rooms', roomId, 'players'),
    where('roomId', '==', roomId),
  );
  const snap = await getDocs(playersQuery);
  return snap.docs
    .map((d) => d.data() as RoomPlayerDoc)
    .sort((a, b) => getTimestampMillis(a.joinedAt) - getTimestampMillis(b.joinedAt));
}

function formatClientFirestoreError(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  const msg = err instanceof Error ? err.message : String(err);
  if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
    return 'Izin Firestore ditolak. Pastikan aturan firestore.rules terbaru sudah dipublikasikan di Firebase Console.';
  }
  return msg || 'Terjadi kesalahan saat memproses aksi permainan.';
}

async function handleSpyfallStart(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }
    if (players.length < 3) {
      throw new Error('Minimal 3 pemain dibutuhkan untuk memulai Yang Bener Yang Mana.');
    }

    const pool = mergeLocationPool(room.enabledPacks ?? ['nusantara'], room.customLocations ?? []);
    if (pool.length === 0) {
      throw new Error('Paket lokasi kosong. Aktifkan minimal 1 paket lokasi.');
    }

    const prevServerState = serverStateSnap.exists()
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
      updatedAt: serverTimestamp(),
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
      const secretRef = doc(db, 'rooms', roomId, 'rounds', roundId, 'secrets', playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: serverTimestamp(),
      });
    }

    return {
      ok: true,
      systemMessage: `Ronde #${nextRoundNumber} dimulai! ${firstSpeakerName} mendapat giliran bertanya pertama.`,
    };
  });
}

async function handleSpyfallVote(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const action = payload.action;
  if (action !== 'initiate' && action !== 'cast' && action !== 'cancel') {
    throw new Error('Aksi voting tidak valid.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new Error('Pemungutan suara hanya bisa dimulai saat permainan berlangsung.');
      }
      const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
      const targetPlayer = players.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new Error('Pemain tertuduh tidak ditemukan di ruang ini.');
      }
      if (targetPlayer.uid === callerUid) {
        throw new Error('Kamu tidak bisa menuduh dirimu sendiri.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: callerUid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [callerUid]: 'yes' },
        },
        pendingSpyGuess: null,
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Mata-Mata!`,
      };
    }

    if (action === 'cancel') {
      if (room.hostUid !== callerUid) {
        throw new Error('Hanya Host yang dapat membatalkan voting.');
      }
      if (room.status !== 'voting' && room.status !== 'spy_guess') {
        throw new Error('Tidak ada voting aktif untuk dibatalkan.');
      }

      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: 'Host membatalkan voting dan melanjutkan ronde.',
      };
    }

    // action === 'cast'
    if (room.status !== 'voting' || !room.activeVote) {
      throw new Error('Tidak ada pemungutan suara yang sedang berlangsung.');
    }
    if (room.activeVote.targetUid === callerUid) {
      throw new Error('Pemain yang sedang dituduh tidak memiliki hak suara.');
    }

    const choice = payload.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new Error('Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [callerUid]: choice,
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
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Ronde berlanjut!`,
      };
    }

    if (evaluation.outcome === 'convicted') {
      if (!serverStateSnap.exists()) {
        throw new Error('Status rahasia ronde tidak ditemukan.');
      }
      const serverState = serverStateSnap.data() as ServerRoundStateDoc;
      const targetIsSpy = serverState.spyUids.includes(room.activeVote.targetUid);
      const winnerTeam = targetIsSpy ? 'warga' : 'mata_mata';

      const deltas = calculateRoundScoreDeltas({
        playerUids: players.map((p) => p.uid),
        spyUids: serverState.spyUids,
        winnerTeam,
        initiatorUid: room.activeVote.initiatorUid,
        victoryType: targetIsSpy ? 'caught_no_guess' : 'false_accusation',
      });

      const reason = targetIsSpy
        ? `Tebakan tepat! ${room.activeVote.targetName} tertangkap basah sebagai Mata-Mata.`
        : `Salah tuduh! ${room.activeVote.targetName} ternyata Warga yang tidak bersalah.`;

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
        updatedAt: serverTimestamp(),
      });

      for (const player of players) {
        const delta = deltas[player.uid] ?? 0;
        if (delta > 0) {
          tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
            score: increment(delta),
            updatedAt: serverTimestamp(),
          });
        }
      }

      return { ok: true, systemMessage: reason };
    }

    tx.update(roomRef, {
      activeVote: {
        ...room.activeVote,
        votes: nextVotes,
      },
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
  });
}

async function handleSpyfallGuess(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const guessedLocation =
    typeof payload.guessedLocation === 'string' ? payload.guessedLocation.trim().slice(0, 80) : '';
  if (!guessedLocation) {
    throw new Error('Pilih lokasi tebakan terlebih dahulu.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }
    if (room.status !== 'playing' && room.status !== 'voting' && room.status !== 'spy_guess') {
      throw new Error('Tebakan lokasi hanya bisa dilakukan saat ronde aktif.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    if (!serverState.spyUids.includes(callerUid)) {
      throw new Error('Hanya Mata-Mata yang dapat menebak lokasi rahasia.');
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
      ? `Mata-Mata (${callerPlayer.displayName}) berhasil menebak lokasi "${guessedLocation}" dengan tepat!`
      : `Mata-Mata (${callerPlayer.displayName}) salah menebak "${guessedLocation}". Lokasi asli: ${serverState.locationName}.`;

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
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleSpyfallResolve(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const action = payload.action;
  if (action !== 'timeout' && action !== 'return_lobby') {
    throw new Error('Aksi penyelesaian tidak valid.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'return_lobby') {
      if (room.hostUid !== callerUid) {
        throw new Error('Hanya Host yang dapat mengembalikan ruang ke lobi.');
      }

      tx.update(roomRef, {
        status: 'lobby',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: serverTimestamp(),
      });

      return { ok: true, systemMessage: 'Host mengembalikan ruang permainan ke lobi.' };
    }

    if (room.status === 'round_end' || room.status === 'lobby') {
      return { ok: true, systemMessage: null };
    }

    const timerExpired = room.roundEndsAtMs > 0 && Date.now() >= room.roundEndsAtMs - 1500;
    if (!timerExpired && room.hostUid !== callerUid) {
      throw new Error('Waktu ronde belum habis. Hanya Host yang dapat mengakhiri ronde lebih awal.');
    }

    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;

    const deltas = calculateRoundScoreDeltas({
      playerUids: players.map((p) => p.uid),
      spyUids: serverState.spyUids,
      winnerTeam: 'mata_mata',
      victoryType: 'timeout',
    });

    const reason = 'Waktu habis! Mata-Mata berhasil bertahan tanpa ketahuan.';
    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: 'mata_mata',
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
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleKataKataStart(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new Error('Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }
    if (players.length < 3) {
      throw new Error('Minimal 3 pemain dibutuhkan untuk memulai Kata-Kata Hari Ini.');
    }

    const pool = mergeWordPairPool(
      room.enabledPacks ?? ['kuliner', 'keseharian'],
      room.customWordPairs ?? [],
    );
    if (pool.length === 0) {
      throw new Error('Paket kata kosong. Aktifkan minimal 1 paket kata.');
    }

    const prevServerState = serverStateSnap.exists()
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
      updatedAt: serverTimestamp(),
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

    // Strictly omit `isSpy` from player secrets so Kata-Kata Hari Ini preserves Blind-Spy secrecy
    for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
      const secretRef = doc(db, 'rooms', roomId, 'rounds', roundId, 'secrets', playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: serverTimestamp(),
      });
    }

    return {
      ok: true,
      systemMessage: `Ronde #${nextRoundNumber} Kata-Kata Hari Ini dimulai! ${firstSpeakerName} mendapat giliran memberi petunjuk pertama.`,
    };
  });
}

async function handleKataKataVote(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const action = payload.action;
  if (action !== 'initiate' && action !== 'cast' && action !== 'cancel') {
    throw new Error('Aksi voting tidak valid.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new Error('Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }

    const eliminatedUids = room.eliminatedUids ?? [];
    const eliminatedSet = new Set(eliminatedUids);

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new Error('Pemungutan suara hanya bisa dimulai saat permainan berlangsung.');
      }
      if (eliminatedSet.has(callerUid)) {
        throw new Error('Pemain yang sudah tereliminasi hanya bisa menonton hingga ronde selesai.');
      }

      const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
      const targetPlayer = players.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new Error('Pemain tertuduh tidak ditemukan di ruang ini.');
      }
      if (targetPlayer.uid === callerUid) {
        throw new Error('Kamu tidak bisa menuduh dirimu sendiri.');
      }
      if (eliminatedSet.has(targetPlayer.uid)) {
        throw new Error('Pemain tersebut sudah tereliminasi.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: callerUid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [callerUid]: 'yes' },
        },
        pendingSpyGuess: null,
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `${callerPlayer.displayName} menuduh ${targetPlayer.displayName} sebagai Penyusup!`,
      };
    }

    if (action === 'cancel') {
      if (room.hostUid !== callerUid) {
        throw new Error('Hanya Host yang dapat membatalkan voting.');
      }
      if (room.status !== 'voting' && room.status !== 'spy_guess') {
        throw new Error('Tidak ada voting aktif untuk dibatalkan.');
      }

      tx.update(roomRef, {
        status: 'playing',
        activeVote: null,
        pendingSpyGuess: null,
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: 'Host membatalkan voting dan melanjutkan ronde.',
      };
    }

    // action === 'cast'
    if (room.status !== 'voting' || !room.activeVote) {
      throw new Error('Tidak ada pemungutan suara yang sedang berlangsung.');
    }
    if (eliminatedSet.has(callerUid)) {
      throw new Error('Pemain yang sudah tereliminasi tidak memiliki hak suara.');
    }
    if (room.activeVote.targetUid === callerUid) {
      throw new Error('Pemain yang sedang dituduh tidak memiliki hak suara.');
    }

    const choice = payload.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new Error('Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [callerUid]: choice,
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
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `Voting terhadap ${room.activeVote.targetName} ditolak (${callerPlayer.displayName} tidak setuju). Diskusi berlanjut!`,
      };
    }

    if (evaluation.outcome === 'convicted') {
      if (!serverStateSnap.exists()) {
        throw new Error('Status rahasia ronde tidak ditemukan.');
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
          updatedAt: serverTimestamp(),
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
          updatedAt: serverTimestamp(),
        });

        for (const player of players) {
          const delta = deltas[player.uid] ?? 0;
          if (delta > 0) {
            tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
              score: increment(delta),
              updatedAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
  });
}

async function handleKataKataGuess(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const surrender = Boolean(payload.surrender);
  const guessedWord =
    typeof payload.guessedWord === 'string' ? payload.guessedWord.trim().slice(0, 80) : '';

  if (!surrender && !guessedWord) {
    throw new Error('Ketik tebakan Kata Warga terlebih dahulu.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new Error('Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }
    if (room.status !== 'spy_guess' || !room.pendingSpyGuess) {
      throw new Error('Tidak ada fase Kesempatan Terakhir yang aktif.');
    }
    if (room.pendingSpyGuess.spyUid !== callerUid) {
      throw new Error('Hanya Penyusup terakhir yang tertangkap yang dapat mengirimkan tebakan.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
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
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleKataKataResolve(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const action = payload.action;
  if (action !== 'timeout' && action !== 'return_lobby') {
    throw new Error('Aksi penyelesaian tidak valid.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'kata_kata') {
      throw new Error('Ruang ini bukan permainan Kata-Kata Hari Ini.');
    }

    const callerPlayer = players.find((p) => p.uid === callerUid);
    if (!callerPlayer) {
      throw new Error('Kamu bukan anggota ruang permainan ini.');
    }

    if (action === 'return_lobby') {
      if (room.hostUid !== callerUid) {
        throw new Error('Hanya Host yang dapat mengembalikan ruang ke lobi.');
      }

      tx.update(roomRef, {
        status: 'lobby',
        activeVote: null,
        pendingSpyGuess: null,
        eliminatedUids: [],
        eliminationLog: [],
        updatedAt: serverTimestamp(),
      });

      return { ok: true, systemMessage: 'Host mengembalikan ruang permainan ke lobi.' };
    }

    if (room.status === 'round_end' || room.status === 'lobby') {
      return { ok: true, systemMessage: null };
    }

    const timerExpired = room.roundEndsAtMs > 0 && Date.now() >= room.roundEndsAtMs - 1500;
    if (!timerExpired && room.hostUid !== callerUid) {
      throw new Error('Waktu ronde belum habis. Hanya Host yang dapat mengakhiri ronde lebih awal.');
    }

    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
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
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleSatuFrekuensiStart(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'satu_frekuensi') {
      throw new Error('Ruang ini bukan permainan Satu Frekuensi.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }
    if (players.length < 2) {
      throw new Error('Minimal 2 pemain dibutuhkan untuk memulai Satu Frekuensi.');
    }

    const pool = mergeSpectrumPool(
      room.enabledPacks ?? ['tongkrongan', 'kuliner'],
      room.customSpectrums ?? [],
    );

    const prevFreq = room.frequencyState ?? null;
    const previousSpectrumKey = prevFreq ? `${prevFreq.leftLabel}|${prevFreq.rightLabel}` : null;
    const previousRotationIndex =
      prevFreq && typeof prevFreq.rotationIndex === 'number' ? prevFreq.rotationIndex : null;

    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;

    const dealt = dealSatuFrekuensiRound({
      playerUids: players.map((p) => p.uid),
      pool,
      previousSpectrumKey,
      previousRotationIndex,
      roundId,
    });

    const psychicPlayer = players.find((p) => p.uid === dealt.psychicUid) ?? players[0];

    const nextFrequencyState: FrequencyState = {
      phase: 'clue',
      psychicUid: dealt.psychicUid,
      psychicName: psychicPlayer.displayName.slice(0, 40),
      rotationIndex: dealt.rotationIndex,
      leftLabel: dealt.spectrum.leftLabel,
      rightLabel: dealt.spectrum.rightLabel,
      category: dealt.spectrum.category,
      clueText: '',
      lockedUids: [],
      revealedTarget: null,
      revealedGuesses: [],
      psychicBonus: 0,
    };

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs: 0,
      firstSpeakerUid: dealt.psychicUid,
      selectedLocationNames: [],
      frequencyState: nextFrequencyState,
      activeVote: null,
      pendingSpyGuess: null,
      updatedAt: serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: `${dealt.spectrum.leftLabel} ↔ ${dealt.spectrum.rightLabel}`.slice(0, 80),
      spyUids: [],
      spyNames: [],
      targetValue: dealt.targetValue,
      createdAtMs: Date.now(),
    };
    tx.set(serverStateRef, nextServerState);

    for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
      const secretRef = doc(db, 'rooms', roomId, 'rounds', roundId, 'secrets', playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: serverTimestamp(),
      });
    }

    return {
      ok: true,
      systemMessage: `Ronde #${nextRoundNumber} Satu Frekuensi dimulai! ${psychicPlayer.displayName} bertugas sebagai Penerawang.`,
    };
  });
}

async function handleSatuFrekuensiClue(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const rawClue = typeof payload.clueText === 'string' ? payload.clueText.trim() : '';
  const clueText = rawClue.replace(/\s+/g, ' ').slice(0, 80);
  if (!clueText) {
    throw new Error('Ketik petunjuk singkat terlebih dahulu.');
  }

  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'satu_frekuensi' || !room.frequencyState) {
      throw new Error('Ruang ini bukan permainan Satu Frekuensi.');
    }
    if (room.status !== 'playing' || room.frequencyState.phase !== 'clue') {
      throw new Error('Petunjuk hanya dapat dikirim pada fase Penerawang.');
    }
    if (room.frequencyState.psychicUid !== callerUid) {
      throw new Error('Hanya Penerawang ronde ini yang dapat mengirim petunjuk.');
    }

    tx.update(roomRef, {
      frequencyState: {
        ...room.frequencyState,
        phase: 'dialing',
        clueText,
      },
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      systemMessage: `Penerawang (${room.frequencyState.psychicName}) memberi petunjuk: "${clueText}". Silakan berdiskusi & kunci jarum!`,
    };
  });
}

async function handleSatuFrekuensiGuess(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const rawVal = Number(payload.guessValue);
  if (!Number.isFinite(rawVal)) {
    throw new Error('Nilai jarum tidak valid.');
  }
  const guessValue = Math.min(100, Math.max(0, Math.round(rawVal)));

  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'satu_frekuensi' || !room.frequencyState) {
      throw new Error('Ruang ini bukan permainan Satu Frekuensi.');
    }
    if (room.status !== 'playing' || room.frequencyState.phase !== 'dialing') {
      throw new Error('Jarum hanya bisa dikunci saat fase tebakan berlangsung.');
    }
    if (room.frequencyState.psychicUid === callerUid) {
      throw new Error('Penerawang tidak ikut menebak jarum.');
    }

    const subRef = doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', callerUid);
    const subDoc: PlayerSubmissionDoc = {
      uid: callerUid,
      roundId: room.currentRoundId,
      gameType: 'satu_frekuensi',
      guessValue,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    const existingLocked = room.frequencyState.lockedUids ?? [];
    const nextLocked = existingLocked.includes(callerUid)
      ? existingLocked
      : [...existingLocked, callerUid];

    tx.update(roomRef, {
      frequencyState: {
        ...room.frequencyState,
        lockedUids: nextLocked,
      },
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
  });
}

async function handleSatuFrekuensiNextPhase(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'satu_frekuensi' || !room.frequencyState) {
      throw new Error('Ruang ini bukan permainan Satu Frekuensi.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat menekan tombol Fase Selanjutnya di Satu Frekuensi.');
    }
    if (room.status !== 'playing') {
      throw new Error('Ronde tidak sedang berlangsung.');
    }

    const freq = room.frequencyState;

    // Phase 1 -> Phase 2 (for voice-chat tables skipping typed clue)
    if (freq.phase === 'clue') {
      tx.update(roomRef, {
        frequencyState: {
          ...freq,
          phase: 'dialing',
          clueText: freq.clueText || '(Petunjuk disampaikan lewat obrolan / suara)',
        },
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: 'Host melanjutkan ke fase Putar Jarum! Semua Penebak silakan kunci posisi jarum.',
      };
    }

    // Phase 2 -> Reveal & Score
    if (freq.phase !== 'dialing') {
      throw new Error('Ronde sudah selesai.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Target rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const targetValue =
      typeof serverState.targetValue === 'number' ? serverState.targetValue : 50;

    // Read all non-psychic submissions inside the same transaction
    const guesserPlayers = players.filter((p) => p.uid !== freq.psychicUid);
    const submissionSnaps = await Promise.all(
      guesserPlayers.map((p) =>
        tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', p.uid)),
      ),
    );

    const submissionsByUid: Record<string, number> = {};
    guesserPlayers.forEach((p, idx) => {
      const snap = submissionSnaps[idx];
      if (snap?.exists()) {
        const data = snap.data() as PlayerSubmissionDoc;
        if (typeof data.guessValue === 'number') {
          submissionsByUid[p.uid] = data.guessValue;
        }
      }
    });

    const scored = scoreSatuFrekuensiRound({
      psychicUid: freq.psychicUid,
      targetValue,
      players: players.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
      })),
      submissionsByUid,
    });

    const nextFrequencyState: FrequencyState = {
      ...freq,
      phase: 'reveal',
      revealedTarget: targetValue,
      revealedGuesses: scored.revealedGuesses,
      psychicBonus: scored.psychicBonus,
    };

    const topHit = scored.revealedGuesses[0];
    const reason =
      topHit && topHit.points > 0
        ? `Target asli berada di titik ${targetValue}. ${topHit.displayName} paling akurat (+${topHit.points} poin) & Penerawang mendapat +${scored.psychicBonus} poin!`
        : `Target asli berada di titik ${targetValue}. Belum ada jarum yang masuk zona skor ronde ini!`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: 'frekuensi',
      reason,
      locationName: `${freq.leftLabel} ↔ ${freq.rightLabel}`.slice(0, 80),
      guessedLocation: null,
      spyUids: [],
      spyNames: [],
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      frequencyState: nextFrequencyState,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = scored.deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleSatuFrekuensiReturnLobby(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }
    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat mengembalikan ruang ke lobi.');
    }

    tx.update(roomRef, {
      status: 'lobby',
      activeVote: null,
      pendingSpyGuess: null,
      frequencyState: null,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: 'Host mengembalikan ruang Satu Frekuensi ke lobi.' };
  });
}

async function handleFaktaHariIniStart(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'fakta_hari_ini') {
      throw new Error('Ruang ini bukan permainan Fakta Hari Ini.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }
    if (players.length < 3) {
      throw new Error('Minimal 3 pemain dibutuhkan untuk memulai Fakta Hari Ini.');
    }

    const pool = mergeFactPool(
      room.enabledPacks ?? ['hukum_sejarah', 'nusantara'],
      room.customFacts ?? [],
    );

    const prevServerState = serverStateSnap.exists()
      ? (serverStateSnap.data() as ServerRoundStateDoc)
      : null;
    const prevFakta = room.faktaState ?? null;
    const previousFactTwist =
      prevServerState?.factTwist ?? prevFakta?.revealedFactTwist ?? null;
    const previousRotationIndex =
      prevFakta && typeof prevFakta.rotationIndex === 'number' ? prevFakta.rotationIndex : null;

    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;

    const dealt = dealFaktaHariIniRound({
      players: players.map((p) => ({ uid: p.uid, displayName: p.displayName })),
      hostUid: room.hostUid,
      pool,
      previousFactTwist,
      previousRotationIndex,
      roundId,
    });

    const nextFaktaState: FaktaState = {
      phase: 'discussion',
      guesserUid: dealt.guesserUid,
      guesserName: dealt.guesserName.slice(0, 40),
      rotationIndex: dealt.rotationIndex,
      phaseControllerUid: dealt.phaseControllerUid,
      phaseControllerName: dealt.phaseControllerName.slice(0, 40),
      pickedUid: null,
      pickedName: null,
      guesserWon: null,
    };

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs: 0,
      firstSpeakerUid: dealt.guesserUid,
      selectedLocationNames: [],
      faktaState: nextFaktaState,
      activeVote: null,
      pendingSpyGuess: null,
      updatedAt: serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: dealt.fact.category.slice(0, 80),
      spyUids: [],
      spyNames: [],
      factPrefix: dealt.fact.prefix,
      factTwist: dealt.fact.twist,
      factSuffix: dealt.fact.suffix,
      factCategory: dealt.fact.category,
      truthTellerUid: dealt.truthTellerUid,
      truthTellerName: dealt.truthTellerName.slice(0, 40),
      createdAtMs: Date.now(),
    };
    tx.set(serverStateRef, nextServerState);

    for (const [playerUid, secret] of Object.entries(dealt.secretsByUid)) {
      const secretRef = doc(db, 'rooms', roomId, 'rounds', roundId, 'secrets', playerUid);
      tx.set(secretRef, {
        ...secret,
        createdAt: serverTimestamp(),
      });
    }

    const controllerNote =
      dealt.guesserUid === room.hostUid
        ? ` Karena Host jadi Penebak, ${dealt.phaseControllerName} ditunjuk acak sebagai Pengendali Fase.`
        : '';

    return {
      ok: true,
      systemMessage: `Ronde #${nextRoundNumber} Fakta Hari Ini dimulai! ${dealt.guesserName} jadi Penebak!${controllerNote}`,
    };
  });
}

async function handleFaktaHariIniNextPhase(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const direction = payload.direction === 'back' ? 'back' : 'advance';
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'fakta_hari_ini' || !room.faktaState) {
      throw new Error('Ruang ini bukan permainan Fakta Hari Ini.');
    }
    if (room.status !== 'playing') {
      throw new Error('Ronde tidak sedang berlangsung.');
    }

    const fakta = room.faktaState;
    if (fakta.phaseControllerUid !== callerUid) {
      if (callerUid === fakta.guesserUid) {
        throw new Error(
          `Penebak tidak boleh menekan Fase Selanjutnya! Hanya ${fakta.phaseControllerName} (Pengendali Fase) yang dapat melanjutkan.`,
        );
      }
      throw new Error(
        `Hanya ${fakta.phaseControllerName} (Pengendali Fase ronde ini) yang dapat mengubah fase.`,
      );
    }

    if (direction === 'back') {
      if (fakta.phase !== 'guessing') {
        throw new Error('Tidak sedang berada di fase tebakan.');
      }
      tx.update(roomRef, {
        faktaState: {
          ...fakta,
          phase: 'discussion',
        },
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        systemMessage: `${fakta.phaseControllerName} membuka kembali sesi diskusi santai.`,
      };
    }

    if (fakta.phase !== 'discussion') {
      throw new Error('Fase tebakan sudah aktif.');
    }

    tx.update(roomRef, {
      faktaState: {
        ...fakta,
        phase: 'guessing',
      },
      updatedAt: serverTimestamp(),
    });

    return {
      ok: true,
      systemMessage: `Saatnya menebak! ${fakta.guesserName}, tunjuk siapa Pembawa Fakta Asli di antara Tim Bluffer!`,
    };
  });
}

async function handleFaktaHariIniGuess(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const pickedUid = typeof payload.pickedUid === 'string' ? payload.pickedUid.trim() : '';
  if (!pickedUid) {
    throw new Error('Pilih salah satu pemain dari Tim Bluffer terlebih dahulu.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const [roomSnap, serverStateSnap] = await Promise.all([
      tx.get(roomRef),
      tx.get(serverStateRef),
    ]);

    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'fakta_hari_ini' || !room.faktaState) {
      throw new Error('Ruang ini bukan permainan Fakta Hari Ini.');
    }
    if (room.status !== 'playing' || room.faktaState.phase !== 'guessing') {
      throw new Error('Tebakan Penebak hanya bisa dikirim saat fase tebakan aktif.');
    }
    if (room.faktaState.guesserUid !== callerUid) {
      throw new Error('Hanya Penebak ronde ini yang dapat memilih tersangka.');
    }
    if (pickedUid === callerUid) {
      throw new Error('Kamu tidak bisa memilih dirimu sendiri.');
    }

    const pickedPlayer = players.find((p) => p.uid === pickedUid);
    if (!pickedPlayer) {
      throw new Error('Pemain yang dipilih tidak ditemukan di ruang ini.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia fakta ronde tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const truthTellerUid = serverState.truthTellerUid ?? '';
    const truthTellerName = serverState.truthTellerName ?? 'Pemain';

    const scoring = calculateFaktaHariIniScoreDeltas({
      playerUids: players.map((p) => p.uid),
      guesserUid: room.faktaState.guesserUid,
      truthTellerUid,
      pickedUid,
    });

    const reason = scoring.guesserWon
      ? `Tebakan jitu! ${room.faktaState.guesserName} berhasil menemukan ${truthTellerName} sebagai Pembawa Fakta Asli (+${scoring.guesserPoints} poin)!`
      : `Terkecoh! ${room.faktaState.guesserName} memilih ${pickedPlayer.displayName}, padahal Pembawa Fakta Asli adalah ${truthTellerName}. Semua Tim Bluffer meraih +1 poin!`;

    const nextFaktaState: FaktaState = {
      ...room.faktaState,
      phase: 'reveal',
      pickedUid: pickedPlayer.uid,
      pickedName: pickedPlayer.displayName.slice(0, 40),
      guesserWon: scoring.guesserWon,
      revealedFactPrefix: serverState.factPrefix ?? '',
      revealedFactTwist: serverState.factTwist ?? '',
      revealedFactSuffix: serverState.factSuffix ?? '',
      revealedCategory: serverState.factCategory ?? 'Fakta Unik',
      revealedTruthTellerUid: truthTellerUid,
      revealedTruthTellerName: truthTellerName,
      guesserPoints: scoring.guesserPoints,
      blufferPointsEach: scoring.blufferPointsEach,
    };

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: scoring.guesserWon ? 'penebak' : 'bluffer',
      reason,
      locationName: serverState.factCategory ?? 'Fakta Hari Ini',
      guessedLocation: pickedPlayer.displayName,
      spyUids: truthTellerUid ? [truthTellerUid] : [],
      spyNames: [truthTellerName],
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      faktaState: nextFaktaState,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of players) {
      const delta = scoring.deltas[player.uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: reason };
  });
}

async function handleFaktaHariIniReturnLobby(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }
    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat mengembalikan ruang ke lobi.');
    }

    tx.update(roomRef, {
      status: 'lobby',
      activeVote: null,
      pendingSpyGuess: null,
      faktaState: null,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: 'Host mengembalikan ruang Fakta Hari Ini ke lobi.' };
  });
}

export async function executeClientGameMaster(
  endpoint: ClientGameMasterEndpoint,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const { auth, db } = getFirebaseServices();
  const currentUser = auth?.currentUser;
  if (!currentUser || !db) {
    throw new Error('Sesi Firebase belum siap. Muat ulang halaman lalu coba lagi.');
  }

  try {
    switch (endpoint) {
      case '/api/spyfall/start':
        return await handleSpyfallStart(db, currentUser.uid, payload);
      case '/api/spyfall/vote':
        return await handleSpyfallVote(db, currentUser.uid, payload);
      case '/api/spyfall/guess':
        return await handleSpyfallGuess(db, currentUser.uid, payload);
      case '/api/spyfall/resolve':
        return await handleSpyfallResolve(db, currentUser.uid, payload);
      case '/api/kata-kata/start':
        return await handleKataKataStart(db, currentUser.uid, payload);
      case '/api/kata-kata/vote':
        return await handleKataKataVote(db, currentUser.uid, payload);
      case '/api/kata-kata/guess':
        return await handleKataKataGuess(db, currentUser.uid, payload);
      case '/api/kata-kata/resolve':
        return await handleKataKataResolve(db, currentUser.uid, payload);
      case '/api/satu-frekuensi/start':
        return await handleSatuFrekuensiStart(db, currentUser.uid, payload);
      case '/api/satu-frekuensi/clue':
        return await handleSatuFrekuensiClue(db, currentUser.uid, payload);
      case '/api/satu-frekuensi/guess':
        return await handleSatuFrekuensiGuess(db, currentUser.uid, payload);
      case '/api/satu-frekuensi/next-phase':
        return await handleSatuFrekuensiNextPhase(db, currentUser.uid, payload);
      case '/api/satu-frekuensi/return-lobby':
        return await handleSatuFrekuensiReturnLobby(db, currentUser.uid, payload);
      case '/api/fakta-hari-ini/start':
        return await handleFaktaHariIniStart(db, currentUser.uid, payload);
      case '/api/fakta-hari-ini/next-phase':
        return await handleFaktaHariIniNextPhase(db, currentUser.uid, payload);
      case '/api/fakta-hari-ini/guess':
        return await handleFaktaHariIniGuess(db, currentUser.uid, payload);
      case '/api/fakta-hari-ini/return-lobby':
        return await handleFaktaHariIniReturnLobby(db, currentUser.uid, payload);
      default:
        throw new Error('Aksi permainan tidak dikenali.');
    }
  } catch (err) {
    throw new Error(formatClientFirestoreError(err));
  }
}
