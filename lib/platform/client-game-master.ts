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
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
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
  buildDeadPlayerEntry,
  calculateMalamSilumanScoreDeltas,
  dealMalamSilumanRound,
  DEFAULT_MALAM_SILUMAN_SETTINGS,
  evaluateMalamSilumanVictory,
  isSilumanRole,
  resolveMalamSilumanNight,
  sanitizeMalamSilumanSettings,
  tallyMalamSilumanDayVotes,
} from '@/lib/games/malam-siluman/engine';
import { MALAM_SILUMAN_ROLES } from '@/lib/games/malam-siluman/roles-id';
import {
  calculatePelukisScoreDeltas,
  dealPelukisGadunganRound,
  evaluatePelukisWordGuess,
  mergeDrawingPromptPool,
  normalizeAndSimplifyPoints,
  tallyPelukisVotes,
} from '@/lib/games/pelukis-gadungan/engine';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  evaluateSpyGuess,
  evaluateVoteProgress,
  mergeLocationPool,
} from '@/lib/games/spyfall/engine';
import {
  buildSessionRecap,
  evaluateSuitClash,
  filterActivePlayers,
  finalizeCompletedGameRecord,
  getDefaultPacksForGame,
} from '@/lib/games/session/engine';
import type {
  CompletedGameRecord,
  EliminationEntry,
  FaktaState,
  FrequencyState,
  GameType,
  LukisanPhase,
  LukisanState,
  LukisanStroke,
  MalamSilumanDeadPlayer,
  MalamSilumanState,
  PlayerSecretDoc,
  PlayerSubmissionDoc,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
  SuitPick,
  WerewolfRoleId,
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
  | '/api/fakta-hari-ini/return-lobby'
  | '/api/pelukis-gadungan/start'
  | '/api/pelukis-gadungan/stroke'
  | '/api/pelukis-gadungan/vote'
  | '/api/pelukis-gadungan/guess'
  | '/api/pelukis-gadungan/resolve'
  | '/api/pelukis-gadungan/return-lobby'
  | '/api/malam-siluman/start'
  | '/api/malam-siluman/night'
  | '/api/malam-siluman/resolve-night'
  | '/api/malam-siluman/phase'
  | '/api/malam-siluman/vote'
  | '/api/malam-siluman/resolve-vote'
  | '/api/malam-siluman/hunter'
  | '/api/malam-siluman/return-lobby'
  | '/api/session/switch-game'
  | '/api/session/open-recap'
  | '/api/session/close-recap'
  | '/api/session/suit-pick'
  | '/api/session/suit-next';

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

function resolveActorPlayer(
  players: RoomPlayerDoc[],
  callerUid: string,
  rawActAsUid?: unknown,
): RoomPlayerDoc {
  const actAsUid =
    typeof rawActAsUid === 'string' && rawActAsUid.trim() ? rawActAsUid.trim() : callerUid;
  const target = players.find((p) => p.uid === actAsUid);
  if (!target) {
    throw new Error('Pemain tidak ditemukan di ruang permainan ini.');
  }
  const ownerDeviceUid = target.controllerUid ?? target.uid;
  if (target.uid !== callerUid && ownerDeviceUid !== callerUid) {
    throw new Error('Perangkat ini tidak memiliki izin mengendalikan kursi pemain tersebut.');
  }
  return target;
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
    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 3) {
      throw new Error(
        'Minimal 3 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Yang Bener Yang Mana.',
      );
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
      playerUids: activePlayers.map((p) => p.uid),
      pool,
      previousLocationName,
      spyMode: room.spyMode ?? 'single',
      roundId,
    });

    const playerMap = new Map(activePlayers.map((p) => [p.uid, p]));
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
    const callerPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
    const actorUid = callerPlayer.uid;
    const activePlayers = filterActivePlayers(players);

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new Error('Pemungutan suara hanya bisa dimulai saat permainan berlangsung.');
      }
      if (callerPlayer.isBrb) {
        throw new Error('Pemain yang sedang BRB tidak dapat memulai voting ronde ini.');
      }
      const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
      const targetPlayer = activePlayers.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new Error('Pemain tertuduh tidak ditemukan atau sedang BRB.');
      }
      if (targetPlayer.uid === actorUid) {
        throw new Error('Kamu tidak bisa menuduh dirimu sendiri.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: actorUid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [actorUid]: 'yes' },
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
    if (callerPlayer.isBrb) {
      throw new Error('Pemain yang sedang BRB tidak memiliki hak suara di ronde ini.');
    }
    if (room.activeVote.targetUid === actorUid) {
      throw new Error('Pemain yang sedang dituduh tidak memiliki hak suara.');
    }

    const choice = payload.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new Error('Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [actorUid]: choice,
    };
    const eligibleVoters = activePlayers
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
        playerUids: activePlayers.map((p) => p.uid),
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
        currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
        activeVote: null,
        pendingSpyGuess: null,
        lastRoundResult: roundResult,
        updatedAt: serverTimestamp(),
      });

      for (const player of activePlayers) {
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
    const callerPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
    const actorUid = callerPlayer.uid;
    const activePlayers = filterActivePlayers(players);

    if (room.status !== 'playing' && room.status !== 'voting' && room.status !== 'spy_guess') {
      throw new Error('Tebakan lokasi hanya bisa dilakukan saat ronde aktif.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    if (!serverState.spyUids.includes(actorUid)) {
      throw new Error('Hanya Mata-Mata yang dapat menebak lokasi rahasia.');
    }

    const isCorrect = evaluateSpyGuess(guessedLocation, serverState.locationName);
    const winnerTeam = isCorrect ? 'mata_mata' : 'warga';

    const deltas = calculateRoundScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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
    const activePlayers = filterActivePlayers(players);

    const deltas = calculateRoundScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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
    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 3) {
      throw new Error(
        'Minimal 3 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Kata-Kata Hari Ini.',
      );
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
      playerUids: activePlayers.map((p) => p.uid),
      pool,
      previousCitizenWord,
      spyMode: room.spyMode ?? 'single',
      roundId,
    });

    const playerMap = new Map(activePlayers.map((p) => [p.uid, p]));
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

    const callerPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
    const actorUid = callerPlayer.uid;
    const activePlayers = filterActivePlayers(players);

    const eliminatedUids = room.eliminatedUids ?? [];
    const eliminatedSet = new Set(eliminatedUids);

    if (action === 'initiate') {
      if (room.status !== 'playing') {
        throw new Error('Pemungutan suara hanya bisa dimulai saat permainan berlangsung.');
      }
      if (callerPlayer.isBrb) {
        throw new Error('Pemain yang sedang BRB tidak dapat memulai voting ronde ini.');
      }
      if (eliminatedSet.has(actorUid)) {
        throw new Error('Pemain yang sudah tereliminasi hanya bisa menonton hingga ronde selesai.');
      }

      const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
      const targetPlayer = activePlayers.find((p) => p.uid === targetUid);
      if (!targetPlayer) {
        throw new Error('Pemain tertuduh tidak ditemukan atau sedang BRB.');
      }
      if (targetPlayer.uid === actorUid) {
        throw new Error('Kamu tidak bisa menuduh dirimu sendiri.');
      }
      if (eliminatedSet.has(targetPlayer.uid)) {
        throw new Error('Pemain tersebut sudah tereliminasi.');
      }

      tx.update(roomRef, {
        status: 'voting',
        activeVote: {
          initiatorUid: actorUid,
          initiatorName: callerPlayer.displayName.slice(0, 40),
          targetUid: targetPlayer.uid,
          targetName: targetPlayer.displayName.slice(0, 40),
          startedAtMs: Date.now(),
          votes: { [actorUid]: 'yes' },
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
    if (callerPlayer.isBrb) {
      throw new Error('Pemain yang sedang BRB tidak memiliki hak suara di ronde ini.');
    }
    if (eliminatedSet.has(actorUid)) {
      throw new Error('Pemain yang sudah tereliminasi tidak memiliki hak suara.');
    }
    if (room.activeVote.targetUid === actorUid) {
      throw new Error('Pemain yang sedang dituduh tidak memiliki hak suara.');
    }

    const choice = payload.choice;
    if (choice !== 'yes' && choice !== 'no') {
      throw new Error('Pilihan suara harus "yes" atau "no".');
    }

    const nextVotes: Record<string, 'yes' | 'no'> = {
      ...room.activeVote.votes,
      [actorUid]: choice,
    };
    const eligibleAliveVoters = activePlayers
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
        allPlayerUids: activePlayers.map((p) => p.uid),
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
          playerUids: activePlayers.map((p) => p.uid),
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
          currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
          eliminatedUids: nextEliminatedUids,
          eliminationLog: nextEliminationLog,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: roundResult,
          updatedAt: serverTimestamp(),
        });

        for (const player of activePlayers) {
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

    const callerPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
    const actorUid = callerPlayer.uid;
    const activePlayers = filterActivePlayers(players);

    if (room.status !== 'spy_guess' || !room.pendingSpyGuess) {
      throw new Error('Tidak ada fase Kesempatan Terakhir yang aktif.');
    }
    if (room.pendingSpyGuess.spyUid !== actorUid) {
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
      playerUids: activePlayers.map((p) => p.uid),
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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

    const activePlayers = filterActivePlayers(players);
    const deltas = calculateKataKataScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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
    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 2) {
      throw new Error(
        'Minimal 2 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Satu Frekuensi.',
      );
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
      playerUids: activePlayers.map((p) => p.uid),
      pool,
      previousSpectrumKey,
      previousRotationIndex,
      roundId,
    });

    const psychicPlayer =
      activePlayers.find((p) => p.uid === dealt.psychicUid) ?? activePlayers[0];

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

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
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
    if (room.frequencyState.psychicUid !== actorUid) {
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

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
  if (actorPlayer.isBrb) {
    throw new Error('Pemain yang sedang BRB tidak ikut menebak di ronde ini.');
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
    if (room.status !== 'playing' || room.frequencyState.phase !== 'dialing') {
      throw new Error('Jarum hanya bisa dikunci saat fase tebakan berlangsung.');
    }
    if (room.frequencyState.psychicUid === actorUid) {
      throw new Error('Penerawang tidak ikut menebak jarum.');
    }

    const subRef = doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', actorUid);
    const subDoc: PlayerSubmissionDoc = {
      uid: actorUid,
      roundId: room.currentRoundId,
      gameType: 'satu_frekuensi',
      guessValue,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    const existingLocked = room.frequencyState.lockedUids ?? [];
    const nextLocked = existingLocked.includes(actorUid)
      ? existingLocked
      : [...existingLocked, actorUid];

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

    // Read all non-psychic active submissions inside the same transaction
    const activePlayers = filterActivePlayers(players);
    const guesserPlayers = activePlayers.filter((p) => p.uid !== freq.psychicUid);
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
      players: activePlayers.map((p) => ({
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      frequencyState: nextFrequencyState,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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
    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 3) {
      throw new Error(
        'Minimal 3 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Fakta Hari Ini.',
      );
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
      players: activePlayers.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        controllerUid: p.controllerUid ?? p.uid,
      })),
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
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
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
    if (fakta.phaseControllerUid !== actorUid) {
      if (actorUid === fakta.guesserUid) {
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
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
  const activePlayers = filterActivePlayers(players);

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
    if (room.faktaState.guesserUid !== actorUid) {
      throw new Error('Hanya Penebak ronde ini yang dapat memilih tersangka.');
    }
    if (pickedUid === actorUid) {
      throw new Error('Kamu tidak bisa memilih dirimu sendiri.');
    }

    const pickedPlayer = activePlayers.find((p) => p.uid === pickedUid);
    if (!pickedPlayer) {
      throw new Error('Pemain yang dipilih tidak ditemukan atau sedang BRB.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia fakta ronde tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const truthTellerUid = serverState.truthTellerUid ?? '';
    const truthTellerName = serverState.truthTellerName ?? 'Pemain';

    const scoring = calculateFaktaHariIniScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
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
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      faktaState: nextFaktaState,
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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

// --- Game #5: Pelukis Gadungan (pelukis_gadungan) ---

async function handlePelukisStart(
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
    if (room.gameType !== 'pelukis_gadungan') {
      throw new Error('Ruang ini bukan permainan Pelukis Gadungan.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde baru.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }

    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 3) {
      throw new Error(
        'Minimal 3 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Pelukis Gadungan.',
      );
    }

    const pool = mergeDrawingPromptPool(
      room.enabledPacks ?? ['kuliner', 'tongkrongan', 'hewan_alam'],
      room.customDrawingPrompts ?? [],
    );

    const prevServerState = serverStateSnap.exists()
      ? (serverStateSnap.data() as ServerRoundStateDoc)
      : null;
    const previousWord =
      prevServerState?.drawingWord ?? room.lukisanState?.revealedWord ?? null;

    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;
    const totalStrokeRounds: 1 | 2 = room.pelukisStrokeRounds === 1 ? 1 : 2;

    const dealt = dealPelukisGadunganRound({
      players: activePlayers.map((p) => ({
        uid: p.uid,
        displayName: p.displayName,
        avatarColor: p.avatarColor,
      })),
      pool,
      spyMode: room.spyMode ?? 'single',
      previousWord,
      roundId,
    });

    const firstTurnUid = dealt.turnOrder[0];
    const firstTurnName = dealt.turnNamesByUid[firstTurnUid] ?? 'Pemain';

    const nextLukisanState: LukisanState = {
      phase: 'drawing',
      category: dealt.prompt.category,
      totalStrokeRounds,
      strokeRound: 1,
      turnOrder: dealt.turnOrder,
      turnNamesByUid: dealt.turnNamesByUid,
      turnColorsByUid: dealt.turnColorsByUid,
      currentTurnIndex: 0,
      currentTurnUid: firstTurnUid,
      currentTurnName: firstTurnName,
      strokes: [],
      submittedVoteUids: [],
      accusedUid: null,
      accusedName: null,
    };

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs: 0,
      firstSpeakerUid: firstTurnUid,
      selectedLocationNames: [],
      lukisanState: nextLukisanState,
      activeVote: null,
      pendingSpyGuess: null,
      activeRecap: null,
      updatedAt: serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: dealt.prompt.category.slice(0, 80),
      drawingCategory: dealt.prompt.category.slice(0, 60),
      drawingWord: dealt.prompt.word.slice(0, 80),
      spyUids: dealt.gadunganUids,
      spyNames: dealt.gadunganNames,
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
      systemMessage: `Ronde #${nextRoundNumber} Pelukis Gadungan dimulai! Tema: ${dealt.prompt.category}. Giliran pertama: ${firstTurnName}.`,
    };
  });
}

async function handlePelukisStroke(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const action = payload.action === 'skip' ? 'skip' : 'draw';
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'pelukis_gadungan' || !room.lukisanState) {
      throw new Error('Ruang ini bukan permainan Pelukis Gadungan.');
    }
    const lukisan = room.lukisanState;
    if (room.status !== 'playing' || lukisan.phase !== 'drawing') {
      throw new Error('Fase menggambar sedang tidak aktif.');
    }

    const isHost = room.hostUid === callerUid;
    if (action === 'draw') {
      const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
      if (actorPlayer.uid !== lukisan.currentTurnUid) {
        throw new Error(`Sekarang giliran ${lukisan.currentTurnName} untuk menggambar.`);
      }
    } else if (!isHost) {
      const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
      if (actorPlayer.uid !== lukisan.currentTurnUid) {
        throw new Error('Hanya pemain yang sedang mendapat giliran atau Host yang dapat melewati giliran.');
      }
    }

    let nextStrokes: LukisanStroke[] = [...lukisan.strokes];
    const currentDrawerName =
      lukisan.turnNamesByUid[lukisan.currentTurnUid] ?? lukisan.currentTurnName;

    if (action === 'draw') {
      const rawPoints = Array.isArray(payload.points) ? (payload.points as number[]) : [];
      const cleanPoints = normalizeAndSimplifyPoints(rawPoints, 10, 50);
      if (cleanPoints.length < 4) {
        throw new Error('Buat minimal 1 tarikan garis pada kanvas sebelum mengirim.');
      }
      nextStrokes.push({
        strokeIndex: nextStrokes.length + 1,
        strokeRound: lukisan.strokeRound,
        uid: lukisan.currentTurnUid,
        displayName: currentDrawerName,
        color: lukisan.turnColorsByUid[lukisan.currentTurnUid] ?? '#F43F5E',
        points: cleanPoints,
      });
    }

    const nextIndex = lukisan.currentTurnIndex + 1;
    let nextPhase: LukisanPhase = lukisan.phase;
    let nextStrokeRound = lukisan.strokeRound;
    let nextTurnIndex = nextIndex;
    let nextTurnUid = '';
    let nextTurnName = '';
    let systemMessage: string | null = null;

    if (nextIndex < lukisan.turnOrder.length) {
      nextTurnUid = lukisan.turnOrder[nextIndex];
      nextTurnName = lukisan.turnNamesByUid[nextTurnUid] ?? 'Pemain';
    } else if (lukisan.strokeRound < lukisan.totalStrokeRounds) {
      nextStrokeRound = lukisan.strokeRound + 1;
      nextTurnIndex = 0;
      nextTurnUid = lukisan.turnOrder[0];
      nextTurnName = lukisan.turnNamesByUid[nextTurnUid] ?? 'Pemain';
      systemMessage = `Putaran #${nextStrokeRound} dimulai! Giliran ${nextTurnName} menambah 1 goresan.`;
    } else {
      nextPhase = 'voting';
      nextTurnIndex = 0;
      nextTurnUid = '';
      nextTurnName = '';
      systemMessage =
        'Semua goresan selesai! Waktunya berdiskusi lalu memilih siapa Pelukis Gadungan secara rahasia.';
    }

    tx.update(roomRef, {
      lukisanState: {
        ...lukisan,
        phase: nextPhase,
        strokeRound: nextStrokeRound,
        currentTurnIndex: nextTurnIndex,
        currentTurnUid: nextTurnUid,
        currentTurnName: nextTurnName,
        strokes: nextStrokes,
      },
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage };
  });
}

async function handlePelukisVote(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
  if (!targetUid) {
    throw new Error('Pilih salah satu pelukis yang dicurigai.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
  const activePlayers = filterActivePlayers(players);

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'pelukis_gadungan' || !room.lukisanState) {
      throw new Error('Ruang ini bukan permainan Pelukis Gadungan.');
    }
    const lukisan = room.lukisanState;
    if (room.status !== 'playing' || lukisan.phase !== 'voting') {
      throw new Error('Pemungutan suara sedang tidak aktif.');
    }
    if (!lukisan.turnOrder.includes(actorUid)) {
      throw new Error('Hanya peserta aktif ronde ini yang memiliki hak suara.');
    }
    if (!lukisan.turnOrder.includes(targetUid)) {
      throw new Error('Target yang dipilih bukan peserta ronde ini.');
    }
    if (targetUid === actorUid) {
      throw new Error('Kamu tidak bisa memilih dirimu sendiri.');
    }

    const isHostDevice = room.hostUid === callerUid;
    const otherVoters = lukisan.turnOrder.filter((uid) => uid !== actorUid);

    // If Host device is voting, read serverState + other voter submissions BEFORE writes
    let serverState: ServerRoundStateDoc | null = null;
    const votesByUid: Record<string, string> = { [actorUid]: targetUid };

    if (isHostDevice) {
      const [serverStateSnap, ...otherSubSnaps] = await Promise.all([
        tx.get(serverStateRef),
        ...otherVoters.map((uid) =>
          tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
        ),
      ]);
      serverState = serverStateSnap.exists()
        ? (serverStateSnap.data() as ServerRoundStateDoc)
        : null;
      otherVoters.forEach((uid, idx) => {
        const snap = otherSubSnaps[idx];
        if (snap?.exists()) {
          const data = snap.data() as PlayerSubmissionDoc;
          if (data.votedUid) {
            votesByUid[uid] = data.votedUid;
          }
        }
      });
    }

    const subRef = doc(
      db,
      'rooms',
      roomId,
      'rounds',
      room.currentRoundId,
      'submissions',
      actorUid,
    );
    const subDoc: PlayerSubmissionDoc = {
      uid: actorUid,
      roundId: room.currentRoundId,
      gameType: 'pelukis_gadungan',
      votedUid: targetUid,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    const submittedSet = new Set(lukisan.submittedVoteUids);
    submittedSet.add(actorUid);
    const nextSubmittedUids = lukisan.turnOrder.filter((uid) => submittedSet.has(uid));
    const allVotesIn = nextSubmittedUids.length >= lukisan.turnOrder.length;

    // Non-host devices only register their own secret vote receipt; Host resolves tally
    if (!isHostDevice || !allVotesIn || !serverState) {
      tx.update(roomRef, {
        lukisanState: {
          ...lukisan,
          submittedVoteUids: nextSubmittedUids,
        },
        updatedAt: serverTimestamp(),
      });
      return { ok: true, systemMessage: null };
    }

    // Host cast the final vote -> resolve immediately inside transaction
    const tally = tallyPelukisVotes({
      votesByUid,
      eligibleVoterUids: lukisan.turnOrder,
      gadunganUids: serverState.spyUids,
    });
    const accusedName = tally.accusedUid
      ? lukisan.turnNamesByUid[tally.accusedUid] ?? 'Pemain'
      : null;

    if (tally.caughtGadungan && tally.accusedUid) {
      tx.update(roomRef, {
        lukisanState: {
          ...lukisan,
          phase: 'gadungan_guess',
          submittedVoteUids: nextSubmittedUids,
          accusedUid: tally.accusedUid,
          accusedName,
          voteTally: tally.voteTally,
          votesByUid,
        },
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        systemMessage: `${accusedName} tertuduh sebagai Pelukis Gadungan! Dia punya 1 Kesempatan Terakhir menebak Kata Rahasia!`,
      };
    }

    const secretWord = serverState.drawingWord ?? serverState.locationName;
    const category = serverState.drawingCategory ?? lukisan.category;
    const deltas = calculatePelukisScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
      gadunganUids: serverState.spyUids,
      winnerTeam: 'gadungan',
    });

    const reason = tally.isTie || !tally.accusedUid
      ? `Suara voting seri! Pelukis Gadungan (${serverState.spyNames.join(', ')}) lolos dan meraih +3 poin!`
      : `Salah tuduh! ${accusedName} ternyata Pelukis Asli! Pelukis Gadungan (${serverState.spyNames.join(', ')}) menang +3 poin!`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: 'gadungan',
      reason,
      locationName: secretWord,
      guessedLocation: null,
      drawingCategory: category,
      drawingWord: secretWord,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      lukisanState: {
        ...lukisan,
        phase: 'reveal',
        submittedVoteUids: nextSubmittedUids,
        accusedUid: tally.accusedUid,
        accusedName,
        voteTally: tally.voteTally,
        votesByUid,
        revealedWord: secretWord,
        gadunganUids: serverState.spyUids,
        gadunganNames: serverState.spyNames,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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

async function handlePelukisResolve(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const activePlayers = filterActivePlayers(players);

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
    if (room.gameType !== 'pelukis_gadungan' || !room.lukisanState) {
      throw new Error('Ruang ini bukan permainan Pelukis Gadungan.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat membuka hasil voting.');
    }
    if (room.status === 'round_end' || room.lukisanState.phase === 'reveal' || room.lukisanState.phase === 'gadungan_guess') {
      return { ok: true, systemMessage: null };
    }
    if (room.lukisanState.phase !== 'voting') {
      throw new Error('Voting belum aktif.');
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }

    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const lukisan = room.lukisanState;
    const subSnaps = await Promise.all(
      lukisan.turnOrder.map((uid) =>
        tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
      ),
    );

    const votesByUid: Record<string, string> = {};
    lukisan.turnOrder.forEach((uid, idx) => {
      const snap = subSnaps[idx];
      if (snap?.exists()) {
        const data = snap.data() as PlayerSubmissionDoc;
        if (data.votedUid) {
          votesByUid[uid] = data.votedUid;
        }
      }
    });

    const tally = tallyPelukisVotes({
      votesByUid,
      eligibleVoterUids: lukisan.turnOrder,
      gadunganUids: serverState.spyUids,
    });
    const accusedName = tally.accusedUid
      ? lukisan.turnNamesByUid[tally.accusedUid] ?? 'Pemain'
      : null;

    if (tally.caughtGadungan && tally.accusedUid) {
      tx.update(roomRef, {
        lukisanState: {
          ...lukisan,
          phase: 'gadungan_guess',
          accusedUid: tally.accusedUid,
          accusedName,
          voteTally: tally.voteTally,
          votesByUid,
        },
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        systemMessage: `${accusedName} tertuduh sebagai Pelukis Gadungan! Dia punya 1 Kesempatan Terakhir menebak Kata Rahasia!`,
      };
    }

    const secretWord = serverState.drawingWord ?? serverState.locationName;
    const category = serverState.drawingCategory ?? lukisan.category;
    const deltas = calculatePelukisScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
      gadunganUids: serverState.spyUids,
      winnerTeam: 'gadungan',
    });

    const reason = tally.isTie || !tally.accusedUid
      ? `Suara voting seri! Pelukis Gadungan (${serverState.spyNames.join(', ')}) lolos dan meraih +3 poin!`
      : `Salah tuduh! ${accusedName} ternyata Pelukis Asli! Pelukis Gadungan (${serverState.spyNames.join(', ')}) menang +3 poin!`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: 'gadungan',
      reason,
      locationName: secretWord,
      guessedLocation: null,
      drawingCategory: category,
      drawingWord: secretWord,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      lukisanState: {
        ...lukisan,
        phase: 'reveal',
        accusedUid: tally.accusedUid,
        accusedName,
        voteTally: tally.voteTally,
        votesByUid,
        revealedWord: secretWord,
        gadunganUids: serverState.spyUids,
        gadunganNames: serverState.spyNames,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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

async function handlePelukisGuess(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const surrender = Boolean(payload.surrender);
  const guessedWord =
    typeof payload.guessedWord === 'string' ? payload.guessedWord.trim().slice(0, 60) : '';

  if (!surrender && !guessedWord) {
    throw new Error('Ketik tebakan Kata Rahasia terlebih dahulu.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const activePlayers = filterActivePlayers(players);
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
    if (room.gameType !== 'pelukis_gadungan' || !room.lukisanState) {
      throw new Error('Ruang ini bukan permainan Pelukis Gadungan.');
    }
    const lukisan = room.lukisanState;
    if (room.status !== 'playing' || lukisan.phase !== 'gadungan_guess') {
      throw new Error('Tidak ada fase tebakan terakhir Pelukis Gadungan.');
    }

    const isHost = room.hostUid === callerUid;
    let actorName = lukisan.accusedName ?? 'Pelukis Gadungan';
    if (!surrender || !isHost) {
      const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
      if (actorPlayer.uid !== lukisan.accusedUid) {
        throw new Error('Hanya Pelukis Gadungan yang tertangkap yang dapat menebak kata rahasia.');
      }
      actorName = actorPlayer.displayName;
    }

    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const secretWord = serverState.drawingWord ?? serverState.locationName;
    const category = serverState.drawingCategory ?? lukisan.category;

    const isCorrect = !surrender && evaluatePelukisWordGuess(guessedWord, secretWord);
    const winnerTeam: 'pelukis' | 'gadungan' = isCorrect ? 'gadungan' : 'pelukis';

    const deltas = calculatePelukisScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
      gadunganUids: serverState.spyUids,
      winnerTeam,
    });

    const reason = surrender
      ? `${actorName} menyerah menebak! Tim Pelukis Asli menangkap Pelukis Gadungan (${secretWord}) dan meraih +2 poin!`
      : isCorrect
        ? `Luar biasa! ${actorName} menebak "${guessedWord}" dengan TEPAT dan mencuri kemenangan Pelukis Gadungan (+3 poin)!`
        : `Tebakan ${actorName} ("${guessedWord}") meleset! Kata aslinya "${secretWord}". Semua Pelukis Asli meraih +2 poin!`;

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam,
      reason,
      locationName: secretWord,
      guessedLocation: surrender ? null : guessedWord,
      guessedWord: surrender ? null : guessedWord,
      drawingCategory: category,
      drawingWord: secretWord,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(roomRef, {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      lukisanState: {
        ...lukisan,
        phase: 'reveal',
        revealedWord: secretWord,
        gadunganUids: serverState.spyUids,
        gadunganNames: serverState.spyNames,
        guessedWord: surrender ? null : guessedWord,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const player of activePlayers) {
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

async function handlePelukisReturnLobby(
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
      lukisanState: null,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: 'Host mengembalikan ruang Pelukis Gadungan ke lobi.' };
  });
}

// --- Server Game Master Actions: Game #6 (Malam Siluman / malam_siluman) ---

async function handleMalamSilumanStart(
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
    if (room.gameType !== 'malam_siluman') {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host ruang yang dapat memulai ronde Malam Siluman.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Ronde sedang berlangsung.');
    }

    const activePlayers = filterActivePlayers(players);
    if (activePlayers.length < 4) {
      throw new Error('Minimal 4 pemain aktif (tidak sedang BRB) dibutuhkan untuk Malam Siluman.');
    }

    const settings = sanitizeMalamSilumanSettings(
      room.malamSilumanSettings ?? DEFAULT_MALAM_SILUMAN_SETTINGS,
    );
    const nextRoundNumber = (room.roundNumber ?? 0) + 1;
    const roundId = `round_${nextRoundNumber}_${Date.now()}`;

    const participantUids = activePlayers.map((p) => p.uid);
    const participantNamesByUid: Record<string, string> = {};
    for (const p of activePlayers) {
      participantNamesByUid[p.uid] = p.displayName.slice(0, 40);
    }

    const dealt = dealMalamSilumanRound({
      playerUids: participantUids,
      playerNamesByUid: participantNamesByUid,
      settings,
      roundId,
    });

    const nextState: MalamSilumanState = {
      phase: 'night',
      nightNumber: 1,
      dayNumber: 0,
      participantUids,
      participantNamesByUid,
      livingUids: participantUids,
      deadPlayers: [],
      submittedNightUids: [],
      submittedVoteUids: [],
      lastNightSummary: null,
      lastDaySummary: null,
      lastHunterSummary: null,
      pendingHunterUid: null,
      pendingHunterName: null,
      hunterTrigger: null,
      activeDeckComposition: dealt.deckComposition,
    };

    tx.update(roomRef, {
      status: 'playing',
      roundNumber: nextRoundNumber,
      currentRoundId: roundId,
      roundEndsAtMs: 0,
      firstSpeakerUid: '',
      selectedLocationNames: [],
      eliminatedUids: [],
      eliminationLog: [],
      malamSilumanSettings: settings,
      malamSilumanState: nextState,
      activeVote: null,
      pendingSpyGuess: null,
      updatedAt: serverTimestamp(),
    });

    const nextServerState: ServerRoundStateDoc = {
      roundId,
      roundNumber: nextRoundNumber,
      locationName: 'Desa Malam Siluman',
      spyUids: dealt.wolfUids,
      spyNames: dealt.wolfNames,
      wolfRolesByUid: dealt.rolesByUid,
      wolfNamesByUid: participantNamesByUid,
      lastProtectedByDoctor: null,
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
      systemMessage: `Malam #1 turun di desa (${activePlayers.length} warga, ${dealt.wolfUids.length} Siluman). Semua pemain hidup silakan kirim aksi malamnya!`,
    };
  });
}

function finalizeMalamSilumanNightInTx(params: {
  tx: Transaction;
  db: Firestore;
  roomId: string;
  room: RoomDoc;
  ms: MalamSilumanState;
  serverState: ServerRoundStateDoc;
  nightTargetsByUid: Record<string, string>;
  seerSecretSnap: DocumentSnapshot<unknown> | null;
  doctorSecretSnap: DocumentSnapshot<unknown> | null;
  seerUid: string | null;
  doctorUid: string | null;
}): ClientGameMasterResponse {
  const { tx, db, roomId, room, ms, serverState, nightTargetsByUid, seerSecretSnap, doctorSecretSnap, seerUid, doctorUid } = params;
  const rolesByUid = serverState.wolfRolesByUid ?? {};
  const namesByUid = ms.participantNamesByUid;
  const settings = sanitizeMalamSilumanSettings(room.malamSilumanSettings);

  const nightRes = resolveMalamSilumanNight({
    nightNumber: ms.nightNumber,
    livingUids: ms.livingUids,
    rolesByUid,
    namesByUid,
    nightTargetsByUid,
    previousDoctorProtectedUid: serverState.lastProtectedByDoctor ?? null,
    seed: room.currentRoundId,
  });

  // Update Seer peekHistory privately in secrets/{seerUid}
  if (nightRes.seerPeek && seerUid && seerSecretSnap?.exists()) {
    const existingSeer = seerSecretSnap.data() as PlayerSecretDoc;
    const nextHistory = [...(existingSeer.peekHistory ?? []), nightRes.seerPeek.record];
    tx.update(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', seerUid), {
      peekHistory: nextHistory,
    });
  }

  // Update Doctor cooldown in serverState + Doctor private secret
  const nextDoctorProtected = nightRes.nextDoctorLastProtectedUid ?? null;
  tx.update(doc(db, 'rooms', roomId, 'serverState', 'current'), {
    lastProtectedByDoctor: nextDoctorProtected,
  });
  if (doctorUid && doctorSecretSnap?.exists()) {
    tx.update(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', doctorUid), {
      lastProtectedUid: nextDoctorProtected,
    });
  }

  const nextLivingUids = nightRes.eliminatedUid
    ? ms.livingUids.filter((u) => u !== nightRes.eliminatedUid)
    : [...ms.livingUids];

  const nextDeadPlayers: MalamSilumanDeadPlayer[] = [...ms.deadPlayers];
  let killedHunter = false;
  if (nightRes.eliminatedUid) {
    const victimRole: WerewolfRoleId = rolesByUid[nightRes.eliminatedUid] ?? 'warga';
    if (victimRole === 'pemburu') {
      killedHunter = true;
    }
    nextDeadPlayers.push(
      buildDeadPlayerEntry({
        uid: nightRes.eliminatedUid,
        displayName: namesByUid[nightRes.eliminatedUid] ?? 'Pemain',
        cause: 'night_kill',
        dayOrNightNumber: ms.nightNumber,
        role: victimRole,
        revealRoleOnDeath: settings.revealRoleOnDeath,
      }),
    );
  }

  // If Hunter died at Night, Hunter immediately takes Tembakan Terakhir BEFORE ending/day
  if (killedHunter && nightRes.eliminatedUid && nextLivingUids.length > 0) {
    const hunterName = namesByUid[nightRes.eliminatedUid] ?? 'Pemburu';
    tx.update(doc(db, 'rooms', roomId), {
      malamSilumanState: {
        ...ms,
        phase: 'hunter_revenge',
        dayNumber: ms.nightNumber,
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastNightSummary: nightRes.dawnMessage,
        lastHunterSummary: null,
        pendingHunterUid: nightRes.eliminatedUid,
        pendingHunterName: hunterName,
        hunterTrigger: 'night',
      },
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      systemMessage: `${nightRes.dawnMessage} ${hunterName} adalah PEMBURU dan langsung membidik Tembakan Terakhir!`,
    };
  }

  const victory = evaluateMalamSilumanVictory({
    livingUids: nextLivingUids,
    rolesByUid,
    namesByUid,
  });

  if (victory.winnerTeam && victory.reason) {
    const deltas = calculateMalamSilumanScoreDeltas({
      participantUids: ms.participantUids,
      livingUids: nextLivingUids,
      rolesByUid,
      winnerTeam: victory.winnerTeam,
      tumbalWinnerUid: victory.tumbalWinnerUid,
    });

    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: victory.winnerTeam,
      reason: `${nightRes.dawnMessage} ${victory.reason}`,
      locationName: 'Desa Malam Siluman',
      guessedLocation: null,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(doc(db, 'rooms', roomId), {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      malamSilumanState: {
        ...ms,
        phase: 'reveal',
        dayNumber: ms.nightNumber,
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastNightSummary: nightRes.dawnMessage,
        revealedRolesByUid: rolesByUid,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const uid of ms.participantUids) {
      const delta = deltas[uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: roundResult.reason };
  }

  tx.update(doc(db, 'rooms', roomId), {
    malamSilumanState: {
      ...ms,
      phase: 'dawn',
      dayNumber: ms.nightNumber,
      livingUids: nextLivingUids,
      deadPlayers: nextDeadPlayers,
      submittedNightUids: [],
      submittedVoteUids: [],
      lastNightSummary: nightRes.dawnMessage,
      lastHunterSummary: null,
      pendingHunterUid: null,
      pendingHunterName: null,
      hunterTrigger: null,
    },
    updatedAt: serverTimestamp(),
  });

  return { ok: true, systemMessage: nightRes.dawnMessage };
}

async function handleMalamSilumanNightAction(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const rawTargetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
  if (!rawTargetUid) {
    throw new Error('Pilih target atau kirim aksi Ronda Malam terlebih dahulu.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }
    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    const ms = room.malamSilumanState;
    if (room.status !== 'playing' || ms.phase !== 'night') {
      throw new Error('Fase Malam sedang tidak aktif.');
    }
    if (!ms.livingUids.includes(actorUid)) {
      throw new Error('Hanya pemain yang masih hidup yang dapat beraksi di malam hari.');
    }

    const isHostDevice = room.hostUid === callerUid;
    const otherLiving = ms.livingUids.filter((u) => u !== actorUid);

    let serverState: ServerRoundStateDoc | null = null;
    const nightTargetsByUid: Record<string, string> = { [actorUid]: rawTargetUid };
    let seerUid: string | null = null;
    let doctorUid: string | null = null;
    let seerSecretSnap: DocumentSnapshot<unknown> | null = null;
    let doctorSecretSnap: DocumentSnapshot<unknown> | null = null;

    const submittedSet = new Set(ms.submittedNightUids);
    submittedSet.add(actorUid);
    const nextSubmittedUids = ms.livingUids.filter((u) => submittedSet.has(u));
    const allNightIn = nextSubmittedUids.length >= ms.livingUids.length;

    // Read actor secret (to validate doctor cooldown / self-check) AND if Host & all in, read everything BEFORE writes
    if (isHostDevice && allNightIn) {
      const [ssSnap, ...subSnaps] = await Promise.all([
        tx.get(serverStateRef),
        ...otherLiving.map((uid) =>
          tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
        ),
      ]);
      serverState = ssSnap.exists() ? (ssSnap.data() as ServerRoundStateDoc) : null;
      otherLiving.forEach((uid, idx) => {
        const snap = subSnaps[idx];
        if (snap?.exists()) {
          const data = snap.data() as PlayerSubmissionDoc;
          if (data.nightNumber === ms.nightNumber && data.nightTargetUid) {
            nightTargetsByUid[uid] = data.nightTargetUid;
          }
        }
      });

      const rolesByUid = serverState?.wolfRolesByUid ?? {};
      seerUid = ms.livingUids.find((u) => rolesByUid[u] === 'penerawang') ?? null;
      doctorUid = ms.livingUids.find((u) => rolesByUid[u] === 'tabib') ?? null;
      const secretReads = await Promise.all([
        seerUid
          ? tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', seerUid))
          : Promise.resolve(null),
        doctorUid
          ? tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', doctorUid))
          : Promise.resolve(null),
      ]);
      seerSecretSnap = secretReads[0];
      doctorSecretSnap = secretReads[1];
    } else {
      // Non-host or partial check: validate actor's own secret if Doctor/Seer
      const actorSecretSnap = await tx.get(
        doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', actorUid),
      );
      if (actorSecretSnap.exists()) {
        const sec = actorSecretSnap.data() as PlayerSecretDoc;
        if (sec.wolfRole === 'tabib' && sec.lastProtectedUid && rawTargetUid === sec.lastProtectedUid) {
          throw new Error('Tabib tidak boleh melindungi orang yang sama 2 malam berturut-turut.');
        }
      }
    }

    if (serverState && serverState.wolfRolesByUid?.[actorUid] === 'tabib') {
      if (serverState.lastProtectedByDoctor && rawTargetUid === serverState.lastProtectedByDoctor) {
        throw new Error('Tabib tidak boleh melindungi orang yang sama 2 malam berturut-turut.');
      }
    }

    const subRef = doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', actorUid);
    const subDoc: PlayerSubmissionDoc = {
      uid: actorUid,
      roundId: room.currentRoundId,
      gameType: 'malam_siluman',
      nightNumber: ms.nightNumber,
      nightTargetUid: rawTargetUid,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    if (!isHostDevice || !allNightIn || !serverState) {
      tx.update(roomRef, {
        malamSilumanState: {
          ...ms,
          submittedNightUids: nextSubmittedUids,
        },
        updatedAt: serverTimestamp(),
      });
      return { ok: true, systemMessage: null };
    }

    return finalizeMalamSilumanNightInTx({
      tx,
      db,
      roomId,
      room,
      ms: { ...ms, submittedNightUids: nextSubmittedUids },
      serverState,
      nightTargetsByUid,
      seerSecretSnap,
      doctorSecretSnap,
      seerUid,
      doctorUid,
    });
  });
}

async function handleMalamSilumanResolveNight(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
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
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat menyelesaikan fase Malam.');
    }
    const ms = room.malamSilumanState;
    if (room.status !== 'playing' || ms.phase !== 'night') {
      return { ok: true, systemMessage: null };
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const rolesByUid = serverState.wolfRolesByUid ?? {};
    const seerUid = ms.livingUids.find((u) => rolesByUid[u] === 'penerawang') ?? null;
    const doctorUid = ms.livingUids.find((u) => rolesByUid[u] === 'tabib') ?? null;

    const [subSnaps, seerSecretSnap, doctorSecretSnap] = await Promise.all([
      Promise.all(
        ms.livingUids.map((uid) =>
          tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
        ),
      ),
      seerUid
        ? tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', seerUid))
        : Promise.resolve(null),
      doctorUid
        ? tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'secrets', doctorUid))
        : Promise.resolve(null),
    ]);

    const nightTargetsByUid: Record<string, string> = {};
    ms.livingUids.forEach((uid, idx) => {
      const snap = subSnaps[idx];
      if (snap?.exists()) {
        const data = snap.data() as PlayerSubmissionDoc;
        if (data.nightNumber === ms.nightNumber && data.nightTargetUid) {
          nightTargetsByUid[uid] = data.nightTargetUid;
        }
      }
    });

    return finalizeMalamSilumanNightInTx({
      tx,
      db,
      roomId,
      room,
      ms,
      serverState,
      nightTargetsByUid,
      seerSecretSnap,
      doctorSecretSnap,
      seerUid,
      doctorUid,
    });
  });
}

async function handleMalamSilumanPhase(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const nextPhase = payload.nextPhase;
  if (nextPhase !== 'day_discussion' && nextPhase !== 'day_voting') {
    throw new Error('Transisi fase tidak valid.');
  }

  const roomRef = doc(db, 'rooms', roomId);
  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }
    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat memindahkan fase.');
    }
    if (room.status !== 'playing') {
      throw new Error('Permainan sedang tidak berlangsung.');
    }

    const ms = room.malamSilumanState;
    if (nextPhase === 'day_discussion' && ms.phase === 'dawn') {
      tx.update(roomRef, {
        malamSilumanState: {
          ...ms,
          phase: 'day_discussion',
        },
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        systemMessage: `Siang #${ms.dayNumber} dimulai! Warga desa berdiskusi mencari siapa Siluman.`,
      };
    }

    if (nextPhase === 'day_voting' && (ms.phase === 'day_discussion' || ms.phase === 'dawn')) {
      tx.update(roomRef, {
        malamSilumanState: {
          ...ms,
          phase: 'day_voting',
          submittedVoteUids: [],
        },
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        systemMessage: `Voting Eksekusi Siang #${ms.dayNumber} dibuka! Setiap warga hidup memilih secara rahasia.`,
      };
    }

    return { ok: true, systemMessage: null };
  });
}

function finalizeMalamSilumanVoteInTx(params: {
  tx: Transaction;
  db: Firestore;
  roomId: string;
  room: RoomDoc;
  ms: MalamSilumanState;
  serverState: ServerRoundStateDoc;
  votesByUid: Record<string, string>;
}): ClientGameMasterResponse {
  const { tx, db, roomId, room, ms, serverState, votesByUid } = params;
  const rolesByUid = serverState.wolfRolesByUid ?? {};
  const namesByUid = ms.participantNamesByUid;
  const settings = sanitizeMalamSilumanSettings(room.malamSilumanSettings);

  const tally = tallyMalamSilumanDayVotes({
    votesByUid,
    livingUids: ms.livingUids,
    rolesByUid,
  });

  if (!tally.executedUid) {
    const reason = tally.isTie
      ? `Suara voting Siang #${ms.dayNumber} seri! Tidak ada warga yang dieksekusi.`
      : `Desa sepakat melewati eksekusi Siang #${ms.dayNumber}. Tidak ada yang dihukum.`;

    const nextNightNumber = ms.nightNumber + 1;
    tx.update(doc(db, 'rooms', roomId), {
      malamSilumanState: {
        ...ms,
        phase: 'night',
        nightNumber: nextNightNumber,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastDaySummary: reason,
        lastHunterSummary: null,
        lastVoteTally: tally.voteTally,
      },
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      systemMessage: `${reason} Malam #${nextNightNumber} segera tiba...`,
    };
  }

  const executedUid = tally.executedUid;
  const executedName = namesByUid[executedUid] ?? 'Pemain';
  const executedRole: WerewolfRoleId = rolesByUid[executedUid] ?? 'warga';
  const nextLivingUids = ms.livingUids.filter((u) => u !== executedUid);
  const nextDeadPlayers: MalamSilumanDeadPlayer[] = [
    ...ms.deadPlayers,
    buildDeadPlayerEntry({
      uid: executedUid,
      displayName: executedName,
      cause: 'day_vote',
      dayOrNightNumber: ms.dayNumber,
      role: executedRole,
      revealRoleOnDeath: settings.revealRoleOnDeath,
    }),
  ];
  const daySummary = `${executedName} dieksekusi oleh keputusan voting desa pada Siang #${ms.dayNumber}${
    settings.revealRoleOnDeath ? ` (ternyata ${MALAM_SILUMAN_ROLES[executedRole].name})` : ''
  }.`;

  // 1. Check Tumbal Solo Upset FIRST (takes immediate precedence over anything else!)
  const victoryAfterVote = evaluateMalamSilumanVictory({
    livingUids: nextLivingUids,
    rolesByUid,
    namesByUid,
    dayExecutedUid: executedUid,
  });

  if (victoryAfterVote.winnerTeam === 'tumbal' && victoryAfterVote.reason) {
    const deltas = calculateMalamSilumanScoreDeltas({
      participantUids: ms.participantUids,
      livingUids: nextLivingUids,
      rolesByUid,
      winnerTeam: 'tumbal',
      tumbalWinnerUid: victoryAfterVote.tumbalWinnerUid,
    });
    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: 'tumbal',
      reason: victoryAfterVote.reason,
      locationName: 'Desa Malam Siluman',
      guessedLocation: null,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(doc(db, 'rooms', roomId), {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      malamSilumanState: {
        ...ms,
        phase: 'reveal',
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastDaySummary: daySummary,
        lastVoteTally: tally.voteTally,
        revealedRolesByUid: rolesByUid,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const uid of ms.participantUids) {
      const delta = deltas[uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: victoryAfterVote.reason };
  }

  // 2. If executed player was Pemburu, trigger Tembakan Terakhir BEFORE ending/night
  if (executedRole === 'pemburu' && nextLivingUids.length > 0) {
    tx.update(doc(db, 'rooms', roomId), {
      malamSilumanState: {
        ...ms,
        phase: 'hunter_revenge',
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastDaySummary: daySummary,
        lastHunterSummary: null,
        lastVoteTally: tally.voteTally,
        pendingHunterUid: executedUid,
        pendingHunterName: executedName,
        hunterTrigger: 'day',
      },
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      systemMessage: `${daySummary} Sebagai PEMBURU, ${executedName} berhak melepaskan Tembakan Terakhir!`,
    };
  }

  // 3. Evaluate Warga / Siluman victory after execution
  if (victoryAfterVote.winnerTeam && victoryAfterVote.reason) {
    const deltas = calculateMalamSilumanScoreDeltas({
      participantUids: ms.participantUids,
      livingUids: nextLivingUids,
      rolesByUid,
      winnerTeam: victoryAfterVote.winnerTeam,
      tumbalWinnerUid: null,
    });
    const roundResult: RoundResult = {
      roundNumber: room.roundNumber,
      winnerTeam: victoryAfterVote.winnerTeam,
      reason: `${daySummary} ${victoryAfterVote.reason}`,
      locationName: 'Desa Malam Siluman',
      guessedLocation: null,
      spyUids: serverState.spyUids,
      spyNames: serverState.spyNames,
      resolvedAtMs: Date.now(),
      scoresApplied: true,
    };

    tx.update(doc(db, 'rooms', roomId), {
      status: 'round_end',
      currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
      malamSilumanState: {
        ...ms,
        phase: 'reveal',
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastDaySummary: daySummary,
        lastVoteTally: tally.voteTally,
        revealedRolesByUid: rolesByUid,
      },
      lastRoundResult: roundResult,
      updatedAt: serverTimestamp(),
    });

    for (const uid of ms.participantUids) {
      const delta = deltas[uid] ?? 0;
      if (delta > 0) {
        tx.update(doc(db, 'rooms', roomId, 'players', uid), {
          score: increment(delta),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return { ok: true, systemMessage: roundResult.reason };
  }

  const nextNightNumber = ms.nightNumber + 1;
  tx.update(doc(db, 'rooms', roomId), {
    malamSilumanState: {
      ...ms,
      phase: 'night',
      nightNumber: nextNightNumber,
      livingUids: nextLivingUids,
      deadPlayers: nextDeadPlayers,
      submittedNightUids: [],
      submittedVoteUids: [],
      lastDaySummary: daySummary,
      lastHunterSummary: null,
      lastVoteTally: tally.voteTally,
    },
    updatedAt: serverTimestamp(),
  });

  return {
    ok: true,
    systemMessage: `${daySummary} Malam #${nextNightNumber} pun turun kembali...`,
  };
}

async function handleMalamSilumanVote(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
  if (!targetUid) {
    throw new Error('Pilih salah satu tersangka atau "Lewati Eksekusi".');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;

  const roomRef = doc(db, 'rooms', roomId);
  const serverStateRef = doc(db, 'rooms', roomId, 'serverState', 'current');

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }
    const room = roomSnap.data() as RoomDoc;
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    const ms = room.malamSilumanState;
    if (room.status !== 'playing' || ms.phase !== 'day_voting') {
      throw new Error('Voting eksekusi sedang tidak aktif.');
    }
    if (!ms.livingUids.includes(actorUid)) {
      throw new Error('Pemain yang sudah gugur tidak memiliki hak suara.');
    }
    if (targetUid === actorUid) {
      throw new Error('Kamu tidak dapat memilih dirimu sendiri.');
    }
    if (targetUid !== 'skip' && !ms.livingUids.includes(targetUid)) {
      throw new Error('Target yang dipilih tidak valid atau sudah gugur.');
    }

    const isHostDevice = room.hostUid === callerUid;
    const otherVoters = ms.livingUids.filter((u) => u !== actorUid);
    const submittedSet = new Set(ms.submittedVoteUids);
    submittedSet.add(actorUid);
    const nextSubmittedUids = ms.livingUids.filter((u) => submittedSet.has(u));
    const allVotesIn = nextSubmittedUids.length >= ms.livingUids.length;

    let serverState: ServerRoundStateDoc | null = null;
    const votesByUid: Record<string, string> = { [actorUid]: targetUid };

    if (isHostDevice && allVotesIn) {
      const [ssSnap, ...otherSubSnaps] = await Promise.all([
        tx.get(serverStateRef),
        ...otherVoters.map((uid) =>
          tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
        ),
      ]);
      serverState = ssSnap.exists() ? (ssSnap.data() as ServerRoundStateDoc) : null;
      otherVoters.forEach((uid, idx) => {
        const snap = otherSubSnaps[idx];
        if (snap?.exists()) {
          const data = snap.data() as PlayerSubmissionDoc;
          if (data.dayNumber === ms.dayNumber && data.votedUid) {
            votesByUid[uid] = data.votedUid;
          }
        }
      });
    }

    const subRef = doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', actorUid);
    const subDoc: PlayerSubmissionDoc = {
      uid: actorUid,
      roundId: room.currentRoundId,
      gameType: 'malam_siluman',
      dayNumber: ms.dayNumber,
      votedUid: targetUid,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    if (!isHostDevice || !allVotesIn || !serverState) {
      tx.update(roomRef, {
        malamSilumanState: {
          ...ms,
          submittedVoteUids: nextSubmittedUids,
        },
        updatedAt: serverTimestamp(),
      });
      return { ok: true, systemMessage: null };
    }

    return finalizeMalamSilumanVoteInTx({
      tx,
      db,
      roomId,
      room,
      ms: { ...ms, submittedVoteUids: nextSubmittedUids },
      serverState,
      votesByUid,
    });
  });
}

async function handleMalamSilumanResolveVote(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
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
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat menutup dan menghitung voting siang.');
    }
    const ms = room.malamSilumanState;
    if (room.status !== 'playing' || ms.phase !== 'day_voting') {
      return { ok: true, systemMessage: null };
    }
    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const subSnaps = await Promise.all(
      ms.livingUids.map((uid) =>
        tx.get(doc(db, 'rooms', roomId, 'rounds', room.currentRoundId, 'submissions', uid)),
      ),
    );

    const votesByUid: Record<string, string> = {};
    ms.livingUids.forEach((uid, idx) => {
      const snap = subSnaps[idx];
      if (snap?.exists()) {
        const data = snap.data() as PlayerSubmissionDoc;
        if (data.dayNumber === ms.dayNumber && data.votedUid) {
          votesByUid[uid] = data.votedUid;
        }
      }
    });

    return finalizeMalamSilumanVoteInTx({
      tx,
      db,
      roomId,
      room,
      ms,
      serverState,
      votesByUid,
    });
  });
}

async function handleMalamSilumanHunterShot(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const skip = Boolean(payload.skip);
  const targetUid = typeof payload.targetUid === 'string' ? payload.targetUid.trim() : '';
  if (!skip && !targetUid) {
    throw new Error('Pilih 1 pemain hidup untuk ditembak atau lewati.');
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
    if (room.gameType !== 'malam_siluman' || !room.malamSilumanState) {
      throw new Error('Ruang ini bukan permainan Malam Siluman.');
    }
    const ms = room.malamSilumanState;
    if (room.status !== 'playing' || ms.phase !== 'hunter_revenge' || !ms.pendingHunterUid) {
      throw new Error('Tidak ada fase Tembakan Terakhir Pemburu yang aktif.');
    }

    const isHost = room.hostUid === callerUid;
    if (!skip || !isHost) {
      const actor = resolveActorPlayer(players, callerUid, payload.actAsUid);
      if (actor.uid !== ms.pendingHunterUid) {
        throw new Error('Hanya Pemburu yang baru gugur yang dapat menembak.');
      }
    }

    if (!serverStateSnap.exists()) {
      throw new Error('Status rahasia ronde tidak ditemukan.');
    }
    const serverState = serverStateSnap.data() as ServerRoundStateDoc;
    const rolesByUid = serverState.wolfRolesByUid ?? {};
    const namesByUid = ms.participantNamesByUid;
    const settings = sanitizeMalamSilumanSettings(room.malamSilumanSettings);

    let nextLivingUids = [...ms.livingUids];
    const nextDeadPlayers = [...ms.deadPlayers];
    let hunterSummary: string;

    if (!skip) {
      if (!ms.livingUids.includes(targetUid)) {
        throw new Error('Target tembakan bukan pemain yang masih hidup.');
      }
      const targetName = namesByUid[targetUid] ?? 'Pemain';
      const targetRole: WerewolfRoleId = rolesByUid[targetUid] ?? 'warga';
      nextLivingUids = nextLivingUids.filter((u) => u !== targetUid);
      nextDeadPlayers.push(
        buildDeadPlayerEntry({
          uid: targetUid,
          displayName: targetName,
          cause: 'hunter_shot',
          dayOrNightNumber: ms.dayNumber,
          role: targetRole,
          revealRoleOnDeath: settings.revealRoleOnDeath,
        }),
      );
      hunterSummary = `${ms.pendingHunterName ?? 'Pemburu'} menembak ${targetName} dengan Tembakan Terakhir${
        settings.revealRoleOnDeath ? ` (${MALAM_SILUMAN_ROLES[targetRole].name})` : ''
      }!`;
    } else {
      hunterSummary = `${ms.pendingHunterName ?? 'Pemburu'} menahan Tembakan Terakhirnya.`;
    }

    // Re-evaluate victory after Hunter shot (Tumbal shot by Hunter does NOT grant Tumbal victory!)
    const victory = evaluateMalamSilumanVictory({
      livingUids: nextLivingUids,
      rolesByUid,
      namesByUid,
    });

    if (victory.winnerTeam && victory.reason) {
      const deltas = calculateMalamSilumanScoreDeltas({
        participantUids: ms.participantUids,
        livingUids: nextLivingUids,
        rolesByUid,
        winnerTeam: victory.winnerTeam,
        tumbalWinnerUid: null,
      });

      const roundResult: RoundResult = {
        roundNumber: room.roundNumber,
        winnerTeam: victory.winnerTeam,
        reason: `${hunterSummary} ${victory.reason}`,
        locationName: 'Desa Malam Siluman',
        guessedLocation: null,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: Date.now(),
        scoresApplied: true,
      };

      tx.update(roomRef, {
        status: 'round_end',
        currentMatchRounds: (room.currentMatchRounds ?? 0) + 1,
        malamSilumanState: {
          ...ms,
          phase: 'reveal',
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          lastHunterSummary: hunterSummary,
          pendingHunterUid: null,
          pendingHunterName: null,
          hunterTrigger: null,
          revealedRolesByUid: rolesByUid,
        },
        lastRoundResult: roundResult,
        updatedAt: serverTimestamp(),
      });

      for (const uid of ms.participantUids) {
        const delta = deltas[uid] ?? 0;
        if (delta > 0) {
          tx.update(doc(db, 'rooms', roomId, 'players', uid), {
            score: increment(delta),
            updatedAt: serverTimestamp(),
          });
        }
      }

      return { ok: true, systemMessage: roundResult.reason };
    }

    if (ms.hunterTrigger === 'night') {
      tx.update(roomRef, {
        malamSilumanState: {
          ...ms,
          phase: 'day_discussion',
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          lastHunterSummary: hunterSummary,
          pendingHunterUid: null,
          pendingHunterName: null,
          hunterTrigger: null,
        },
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        systemMessage: `${hunterSummary} Diskusi Siang #${ms.dayNumber} dimulai!`,
      };
    }

    const nextNightNumber = ms.nightNumber + 1;
    tx.update(roomRef, {
      malamSilumanState: {
        ...ms,
        phase: 'night',
        nightNumber: nextNightNumber,
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids: [],
        lastHunterSummary: hunterSummary,
        pendingHunterUid: null,
        pendingHunterName: null,
        hunterTrigger: null,
      },
      updatedAt: serverTimestamp(),
    });
    return {
      ok: true,
      systemMessage: `${hunterSummary} Malam #${nextNightNumber} pun turun...`,
    };
  });
}

async function handleMalamSilumanReturnLobby(
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
      malamSilumanState: null,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: 'Host mengembalikan ruang Malam Siluman ke lobi.' };
  });
}

// --- v3.1.0 Session Actions (Game Switcher, Rekap Permainan, Best-of-3 Suit Duel) ---

const VALID_GAME_TYPES: GameType[] = [
  'spyfall',
  'kata_kata',
  'satu_frekuensi',
  'fakta_hari_ini',
  'pelukis_gadungan',
  'malam_siluman',
];
const GAME_TITLE_MAP: Record<GameType, string> = {
  spyfall: 'Yang Bener Yang Mana',
  kata_kata: 'Kata-Kata Hari Ini',
  satu_frekuensi: 'Satu Frekuensi',
  fakta_hari_ini: 'Fakta Hari Ini',
  pelukis_gadungan: 'Pelukis Gadungan',
  malam_siluman: 'Malam Siluman',
};

async function handleSessionSwitchGame(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const targetGameType = (payload.targetGameType ?? payload.nextGameType) as GameType;
  if (!VALID_GAME_TYPES.includes(targetGameType)) {
    throw new Error('Jenis permainan tujuan tidak valid.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat mengganti permainan di dalam ruang.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Selesaikan atau akhiri ronde berjalan sebelum mengganti permainan.');
    }

    const existingCompleted: CompletedGameRecord[] = room.completedGames ?? [];
    const roundsPlayed = room.currentMatchRounds ?? 0;

    // Accidental switch guard: only archive match if >=1 round was completed
    const archivedMatch = finalizeCompletedGameRecord({
      matchIndex: existingCompleted.length + 1,
      gameType: room.gameType,
      roundsPlayed,
      players,
    });

    const nextCompletedGames = archivedMatch
      ? [...existingCompleted, archivedMatch].slice(-25)
      : existingCompleted;

    tx.update(roomRef, {
      gameType: targetGameType,
      status: 'lobby',
      roundNumber: 0,
      currentRoundId: '',
      currentMatchRounds: 0,
      roundEndsAtMs: 0,
      firstSpeakerUid: '',
      enabledPacks: getDefaultPacksForGame(targetGameType),
      selectedLocationNames: [],
      eliminatedUids: [],
      eliminationLog: [],
      frequencyState: null,
      faktaState: null,
      lukisanState: null,
      malamSilumanState: null,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: null,
      completedGames: nextCompletedGames,
      updatedAt: serverTimestamp(),
    });

    // Reset active game score to 0 for the new visit/game so each game keeps its own points
    if (archivedMatch || room.gameType !== targetGameType) {
      for (const player of players) {
        if ((player.score ?? 0) !== 0) {
          tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
            score: 0,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const archiveNote = archivedMatch
      ? ` Hasil ${GAME_TITLE_MAP[room.gameType]} disimpan ke Rekap Permainan (${archivedMatch.winnerNames.length > 0 ? `Juara: ${archivedMatch.winnerNames.join(', ')}` : 'tanpa pemenang'}).`
      : '';

    return {
      ok: true,
      systemMessage: `Host mengganti permainan ke ${GAME_TITLE_MAP[targetGameType]}.${archiveNote}`,
    };
  });
}

async function handleSessionOpenRecap(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    if (room.hostUid !== callerUid) {
      throw new Error('Hanya Host yang dapat membuka Rekap Permainan.');
    }
    if (room.status !== 'lobby' && room.status !== 'round_end') {
      throw new Error('Selesaikan ronde yang sedang berjalan sebelum membuka Rekap Permainan.');
    }

    const existingCompleted: CompletedGameRecord[] = room.completedGames ?? [];
    const roundsPlayed = room.currentMatchRounds ?? 0;

    const archivedMatch = finalizeCompletedGameRecord({
      matchIndex: existingCompleted.length + 1,
      gameType: room.gameType,
      roundsPlayed,
      players,
    });

    const nextCompletedGames = archivedMatch
      ? [...existingCompleted, archivedMatch].slice(-25)
      : existingCompleted;

    if (nextCompletedGames.length === 0) {
      throw new Error('Selesaikan minimal 1 ronde permainan sebelum membuka Rekap Permainan.');
    }

    const recap = buildSessionRecap({
      completedGames: nextCompletedGames,
      players,
    });

    tx.update(roomRef, {
      status: 'lobby',
      currentMatchRounds: 0,
      eliminatedUids: [],
      eliminationLog: [],
      frequencyState: null,
      faktaState: null,
      lukisanState: null,
      malamSilumanState: null,
      activeVote: null,
      pendingSpyGuess: null,
      completedGames: nextCompletedGames,
      activeRecap: recap,
      updatedAt: serverTimestamp(),
    });

    // Clear active-game score after archiving into completedGames so returning to play starts clean
    if (archivedMatch) {
      for (const player of players) {
        if ((player.score ?? 0) !== 0) {
          tx.update(doc(db, 'rooms', roomId, 'players', player.uid), {
            score: 0,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    const msg =
      recap.resolvedBy === 'suit_duel' && recap.tiebreakerDuel
        ? `Rekap Permainan dibuka! Skor seri — Duel Penentuan MVP (Suit Best of 3) dimulai antara ${Object.values(recap.tiebreakerDuel.duelistNames).join(' vs ')}!`
        : `Rekap Permainan dibuka! MVP sesi ini: ${recap.mvpNames.join(', ') || 'Belum ada'}.`;

    return { ok: true, systemMessage: msg };
  });
}

async function handleSessionCloseRecap(
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
      throw new Error('Hanya Host yang dapat menutup layar Rekap Permainan.');
    }

    tx.update(roomRef, {
      activeRecap: null,
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: 'Host menutup layar Rekap Permainan.' };
  });
}

async function handleSessionSuitPick(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const suitPick = (payload.suitPick ?? payload.pick) as SuitPick;
  if (suitPick !== 'batu' && suitPick !== 'gunting' && suitPick !== 'kertas') {
    throw new Error('Pilihan suit harus Batu, Gunting, atau Kertas.');
  }

  const players = await fetchOrderedRoomPlayers(db, roomId);
  const actorPlayer = resolveActorPlayer(players, callerUid, payload.actAsUid);
  const actorUid = actorPlayer.uid;
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const recap = room.activeRecap;
    const duel = recap?.tiebreakerDuel;
    if (!recap || !duel || duel.status !== 'picking') {
      throw new Error('Duel Penentuan Suit sedang tidak menerima pilihan.');
    }
    if (!duel.duelistUids.includes(actorUid)) {
      throw new Error('Hanya finalis yang seri yang dapat memilih di Duel Suit.');
    }

    const clashRoundId = `${duel.duelId}_c${duel.clashNumber}`;
    const existingSubSnaps = await Promise.all(
      duel.duelistUids.map((uid) =>
        tx.get(doc(db, 'rooms', roomId, 'rounds', clashRoundId, 'submissions', uid)),
      ),
    );

    const subRef = doc(db, 'rooms', roomId, 'rounds', clashRoundId, 'submissions', actorUid);
    const subDoc: PlayerSubmissionDoc = {
      uid: actorUid,
      roundId: clashRoundId,
      gameType: 'suit_duel',
      suitPick,
      updatedAt: serverTimestamp(),
    };
    tx.set(subRef, subDoc);

    const picksByUid: Record<string, SuitPick> = {};
    duel.duelistUids.forEach((uid, idx) => {
      if (uid === actorUid) {
        picksByUid[uid] = suitPick;
      } else {
        const snap = existingSubSnaps[idx];
        if (snap?.exists()) {
          const data = snap.data() as PlayerSubmissionDoc;
          if (
            data.suitPick === 'batu' ||
            data.suitPick === 'gunting' ||
            data.suitPick === 'kertas'
          ) {
            picksByUid[uid] = data.suitPick;
          }
        }
      }
    });

    const submittedUids = Object.keys(picksByUid);
    const allSubmitted = duel.duelistUids.every((uid) => Boolean(picksByUid[uid]));

    if (!allSubmitted) {
      tx.update(roomRef, {
        activeRecap: {
          ...recap,
          tiebreakerDuel: {
            ...duel,
            submittedUids,
          },
        },
        updatedAt: serverTimestamp(),
      });
      return { ok: true, systemMessage: null };
    }

    const evaluated = evaluateSuitClash({ duel, picksByUid });
    const nextMvpUids =
      evaluated.status === 'finished' ? evaluated.championUids : recap.mvpUids;
    const nextMvpNames =
      evaluated.status === 'finished'
        ? evaluated.championUids.map((uid) => duel.duelistNames[uid] ?? 'Pemain')
        : recap.mvpNames;

    tx.update(roomRef, {
      activeRecap: {
        ...recap,
        mvpUids: nextMvpUids,
        mvpNames: nextMvpNames,
        tiebreakerDuel: evaluated,
      },
      updatedAt: serverTimestamp(),
    });

    if (evaluated.status === 'finished') {
      return {
        ok: true,
        systemMessage: `Duel Suit Best of 3 selesai! ${nextMvpNames.join(', ')} resmi dinobatkan sebagai MVP Malam Ini!`,
      };
    }

    const clashMsg = evaluated.lastClash?.isDraw
      ? `Suit Ronde #${duel.clashNumber} SERI! Siap tanding ulang!`
      : `Suit Ronde #${duel.clashNumber} dimenangkan oleh ${evaluated.lastClash?.winnerUids.map((u) => duel.duelistNames[u] ?? 'Pemain').join(', ')}!`;

    return { ok: true, systemMessage: clashMsg };
  });
}

async function handleSessionSuitNext(
  db: Firestore,
  callerUid: string,
  payload: Record<string, unknown>,
): Promise<ClientGameMasterResponse> {
  const roomId = assertRoomId(payload.roomId);
  const players = await fetchOrderedRoomPlayers(db, roomId);
  const roomRef = doc(db, 'rooms', roomId);

  return runTransaction(db, async (tx) => {
    const roomSnap = await tx.get(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Ruang permainan tidak ditemukan.');
    }

    const room = roomSnap.data() as RoomDoc;
    const recap = room.activeRecap;
    const duel = recap?.tiebreakerDuel;
    if (!recap || !duel || duel.status !== 'clash_reveal') {
      throw new Error('Duel Suit tidak berada pada fase hasil ronde.');
    }

    const controlledUids = players
      .filter((p) => p.uid === callerUid || p.controllerUid === callerUid)
      .map((p) => p.uid);
    const isAuthorized =
      room.hostUid === callerUid ||
      controlledUids.some((uid) => duel.duelistUids.includes(uid));

    if (!isAuthorized) {
      throw new Error('Hanya Host atau finalis yang dapat melanjutkan ronde Suit berikutnya.');
    }

    tx.update(roomRef, {
      activeRecap: {
        ...recap,
        tiebreakerDuel: {
          ...duel,
          status: 'picking',
          clashNumber: duel.clashNumber + 1,
          submittedUids: [],
        },
      },
      updatedAt: serverTimestamp(),
    });

    return { ok: true, systemMessage: null };
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
      case '/api/pelukis-gadungan/start':
        return await handlePelukisStart(db, currentUser.uid, payload);
      case '/api/pelukis-gadungan/stroke':
        return await handlePelukisStroke(db, currentUser.uid, payload);
      case '/api/pelukis-gadungan/vote':
        return await handlePelukisVote(db, currentUser.uid, payload);
      case '/api/pelukis-gadungan/guess':
        return await handlePelukisGuess(db, currentUser.uid, payload);
      case '/api/pelukis-gadungan/resolve':
        return await handlePelukisResolve(db, currentUser.uid, payload);
      case '/api/pelukis-gadungan/return-lobby':
        return await handlePelukisReturnLobby(db, currentUser.uid, payload);
      case '/api/malam-siluman/start':
        return await handleMalamSilumanStart(db, currentUser.uid, payload);
      case '/api/malam-siluman/night':
        return await handleMalamSilumanNightAction(db, currentUser.uid, payload);
      case '/api/malam-siluman/resolve-night':
        return await handleMalamSilumanResolveNight(db, currentUser.uid, payload);
      case '/api/malam-siluman/phase':
        return await handleMalamSilumanPhase(db, currentUser.uid, payload);
      case '/api/malam-siluman/vote':
        return await handleMalamSilumanVote(db, currentUser.uid, payload);
      case '/api/malam-siluman/resolve-vote':
        return await handleMalamSilumanResolveVote(db, currentUser.uid, payload);
      case '/api/malam-siluman/hunter':
        return await handleMalamSilumanHunterShot(db, currentUser.uid, payload);
      case '/api/malam-siluman/return-lobby':
        return await handleMalamSilumanReturnLobby(db, currentUser.uid, payload);
      case '/api/session/switch-game':
        return await handleSessionSwitchGame(db, currentUser.uid, payload);
      case '/api/session/open-recap':
        return await handleSessionOpenRecap(db, currentUser.uid, payload);
      case '/api/session/close-recap':
        return await handleSessionCloseRecap(db, currentUser.uid, payload);
      case '/api/session/suit-pick':
        return await handleSessionSuitPick(db, currentUser.uid, payload);
      case '/api/session/suit-next':
        return await handleSessionSuitNext(db, currentUser.uid, payload);
      default:
        throw new Error('Aksi permainan tidak dikenali.');
    }
  } catch (err) {
    throw new Error(formatClientFirestoreError(err));
  }
}
