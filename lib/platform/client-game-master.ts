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
  calculateKataKataScoreDeltas,
  dealKataKataRound,
  evaluateKataKataAfterElimination,
  evaluateKataKataLastChanceGuess,
  evaluateKataKataVoteProgress,
  mergeWordPairPool,
} from '@/lib/games/kata-kata/engine';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  evaluateSpyGuess,
  evaluateVoteProgress,
  mergeLocationPool,
} from '@/lib/games/spyfall/engine';
import type {
  EliminationEntry,
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
  | '/api/kata-kata/resolve';

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
      default:
        throw new Error('Aksi permainan tidak dikenali.');
    }
  } catch (err) {
    throw new Error(formatClientFirestoreError(err));
  }
}
