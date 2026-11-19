'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { get, ref } from 'firebase/database';
import { getFirebaseServices } from '@/lib/firebase/client';
import { handleFirestoreError, OperationType } from '@/lib/firebase/errors';
import { sanitizeCustomFact } from '@/lib/games/fakta-hari-ini/engine';
import { sanitizeCustomWordPair } from '@/lib/games/kata-kata/engine';
import { sanitizeCustomSpectrum } from '@/lib/games/satu-frekuensi/engine';
import { generateRoomCode, sanitizeCustomLocation } from '@/lib/games/spyfall/engine';
import type {
  CustomFactItem,
  CustomLocation,
  CustomSpectrum,
  CustomWordPair,
  GameType,
  PlayerSecretDoc,
  RoomDoc,
  RoomPlayerDoc,
  SpyMode,
} from '@/lib/games/types';
import { sendRoomChatMessage } from './chat-presence';
import {
  executeClientGameMaster,
  type ClientGameMasterEndpoint,
} from './client-game-master';
import { pickAvatarColor, upsertUserProfile } from './user-profile';

export { pickAvatarColor, upsertUserProfile };

interface SpyfallApiResponse {
  ok: boolean;
  error?: string;
  systemMessage?: string | null;
}

type GameMasterEndpoint = ClientGameMasterEndpoint;

async function callGameMasterApi(
  endpoint: GameMasterEndpoint,
  payload: Record<string, unknown>,
): Promise<SpyfallApiResponse> {
  const { auth } = getFirebaseServices();
  if (!auth?.currentUser) {
    throw new Error('Sesi pemain belum aktif. Silakan masuk terlebih dahulu.');
  }

  return executeClientGameMaster(endpoint, payload);
}

export async function createRoom(params: {
  hostUid: string;
  hostName: string;
  avatarColor: string;
  gameType?: GameType;
}): Promise<{ roomId: string; code: string }> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const safeName = params.hostName.trim().slice(0, 40) || 'Host';
  const safeColor = params.avatarColor.slice(0, 24) || '#DC2626';
  const gameType: GameType = params.gameType ?? 'spyfall';

  let code = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const codeSnap = await getDoc(doc(db, 'roomCodes', code));
    if (!codeSnap.exists()) break;
    code = generateRoomCode();
  }

  const roomRef = doc(collection(db, 'rooms'));
  const roomId = roomRef.id;
  const codeRef = doc(db, 'roomCodes', code);
  const playerRef = doc(db, 'rooms', roomId, 'players', params.hostUid);

  const defaultPacks =
    gameType === 'kata_kata'
      ? ['kuliner', 'keseharian']
      : gameType === 'satu_frekuensi'
        ? ['tongkrongan', 'kuliner']
        : gameType === 'fakta_hari_ini'
          ? ['hukum_sejarah', 'nusantara']
          : ['nusantara', 'klasik'];

  const batch = writeBatch(db);
  batch.set(roomRef, {
    id: roomId,
    code,
    gameType,
    hostUid: params.hostUid,
    status: 'lobby',
    roundNumber: 0,
    currentRoundId: '',
    roundDurationSec: 480,
    roundEndsAtMs: 0,
    firstSpeakerUid: '',
    spyMode: 'single',
    enabledPacks: defaultPacks,
    selectedLocationNames: [],
    customLocations: [],
    customWordPairs: [],
    customSpectrums: [],
    customFacts: [],
    eliminatedUids: [],
    eliminationLog: [],
    frequencyState: null,
    faktaState: null,
    activeVote: null,
    pendingSpyGuess: null,
    lastRoundResult: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(codeRef, {
    code,
    roomId,
    hostUid: params.hostUid,
    gameType,
    createdAt: serverTimestamp(),
  });

  batch.set(playerRef, {
    uid: params.hostUid,
    roomId,
    displayName: safeName,
    avatarColor: safeColor,
    isHost: true,
    score: 0,
    isReady: true,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `rooms/${roomId}`, auth);
  }

  void sendRoomChatMessage({
    roomId,
    senderUid: params.hostUid,
    senderName: safeName,
    text: `${safeName} membuka ruang bermain Yuk Main (${code}).`,
    type: 'system',
  }).catch(() => {});

  return { roomId, code };
}

export async function joinRoomByCode(params: {
  code: string;
  uid: string;
  displayName: string;
  avatarColor: string;
}): Promise<string> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const normalizedCode = params.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
    throw new Error('Kode ruang harus terdiri dari 6 karakter huruf atau angka.');
  }

  let roomId = '';
  try {
    const codeSnap = await getDoc(doc(db, 'roomCodes', normalizedCode));
    if (!codeSnap.exists()) {
      throw new Error(`Ruang dengan kode "${normalizedCode}" tidak ditemukan.`);
    }
    roomId = (codeSnap.data() as { roomId: string }).roomId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('tidak ditemukan')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, `roomCodes/${normalizedCode}`, auth);
  }

  const playerRef = doc(db, 'rooms', roomId, 'players', params.uid);
  const existingPlayer = await getDoc(playerRef).catch(() => null);
  const safeName = params.displayName.trim().slice(0, 40) || 'Pemain';
  const safeColor = params.avatarColor.slice(0, 24) || pickAvatarColor(params.uid);

  if (existingPlayer?.exists()) {
    try {
      await updateDoc(playerRef, {
        displayName: safeName,
        avatarColor: safeColor,
        updatedAt: serverTimestamp(),
      });
      return roomId;
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `rooms/${roomId}/players/${params.uid}`,
        auth,
      );
    }
  }

  let roomSnap;
  try {
    roomSnap = await getDoc(doc(db, 'rooms', roomId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`, auth);
  }

  if (!roomSnap.exists()) {
    throw new Error('Ruang permainan sudah ditutup oleh Host.');
  }

  const roomData = roomSnap.data() as RoomDoc;
  if (roomData.status !== 'lobby') {
    throw new Error('Ronde sedang berlangsung. Tunggu Host kembali ke lobi untuk bergabung.');
  }

  try {
    await setDoc(playerRef, {
      uid: params.uid,
      roomId,
      displayName: safeName,
      avatarColor: safeColor,
      isHost: roomData.hostUid === params.uid,
      score: 0,
      isReady: true,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `rooms/${roomId}/players/${params.uid}`,
      auth,
    );
  }

  void sendRoomChatMessage({
    roomId,
    senderUid: params.uid,
    senderName: safeName,
    text: `${safeName} bergabung ke ruang permainan.`,
    type: 'system',
  }).catch(() => {});

  return roomId;
}

export async function leaveRoom(params: {
  room: RoomDoc;
  uid: string;
  displayName: string;
  players: RoomPlayerDoc[];
}): Promise<void> {
  const { auth, db, rtdb } = getFirebaseServices();
  if (!db) return;

  const { room, uid, displayName, players } = params;

  let onlineCount = 0;
  if (rtdb) {
    try {
      const snap = await get(ref(rtdb, `presence/${room.id}`));
      if (snap.exists()) {
        const presenceMap = snap.val() as Record<string, { online?: boolean }>;
        for (const [pUid, pVal] of Object.entries(presenceMap)) {
          if (pUid !== uid && pVal && pVal.online === true) {
            onlineCount++;
          }
        }
      }
    } catch {
      onlineCount = players.filter((p) => p.uid !== uid).length;
    }
  } else {
    onlineCount = players.filter((p) => p.uid !== uid).length;
  }

  try {
    if (onlineCount === 0) {
      await deleteDoc(doc(db, 'rooms', room.id, 'players', uid));
      await deleteDoc(doc(db, 'roomCodes', room.code)).catch(() => {});
      await deleteDoc(doc(db, 'rooms', room.id)).catch(() => {});
      return;
    }

    const others = players.filter((p) => p.uid !== uid);
    const needsFaktaControllerFailover =
      room.gameType === 'fakta_hari_ini' &&
      room.status === 'playing' &&
      room.faktaState &&
      room.faktaState.phaseControllerUid === uid;

    const pickFailoverController = (nextHostUid: string) => {
      if (!room.faktaState) return null;
      const nonGuessers = others.filter((p) => p.uid !== room.faktaState?.guesserUid);
      if (nonGuessers.length === 0) return others[0] ?? null;
      const hostCandidate = nonGuessers.find((p) => p.uid === nextHostUid);
      return hostCandidate ?? nonGuessers[0];
    };

    if (room.hostUid === uid) {
      const nextHost = others[0];
      const batch = writeBatch(db);
      batch.delete(doc(db, 'rooms', room.id, 'players', uid));
      if (needsFaktaControllerFailover && room.faktaState) {
        const nextCtrl = pickFailoverController(nextHost.uid);
        batch.update(doc(db, 'rooms', room.id), {
          hostUid: nextHost.uid,
          ...(nextCtrl
            ? {
                faktaState: {
                  ...room.faktaState,
                  phaseControllerUid: nextCtrl.uid,
                  phaseControllerName: nextCtrl.displayName.slice(0, 40),
                },
              }
            : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(doc(db, 'rooms', room.id), {
          hostUid: nextHost.uid,
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'rooms', room.id, 'players', nextHost.uid), {
        isHost: true,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      void sendRoomChatMessage({
        roomId: room.id,
        senderUid: uid,
        senderName: displayName,
        text: `${displayName} keluar. ${nextHost.displayName} kini menjadi Host.`,
        type: 'system',
      }).catch(() => {});
    } else if (needsFaktaControllerFailover && room.faktaState) {
      const nextCtrl = pickFailoverController(room.hostUid);
      const batch = writeBatch(db);
      if (nextCtrl) {
        batch.update(doc(db, 'rooms', room.id), {
          faktaState: {
            ...room.faktaState,
            phaseControllerUid: nextCtrl.uid,
            phaseControllerName: nextCtrl.displayName.slice(0, 40),
          },
          updatedAt: serverTimestamp(),
        });
      }
      batch.delete(doc(db, 'rooms', room.id, 'players', uid));
      await batch.commit();
      void sendRoomChatMessage({
        roomId: room.id,
        senderUid: uid,
        senderName: displayName,
        text: nextCtrl
          ? `${displayName} meninggalkan ruang. ${nextCtrl.displayName} kini menjadi Pengendali Fase.`
          : `${displayName} meninggalkan ruang.`,
        type: 'system',
      }).catch(() => {});
    } else {
      await deleteDoc(doc(db, 'rooms', room.id, 'players', uid));
      void sendRoomChatMessage({
        roomId: room.id,
        senderUid: uid,
        senderName: displayName,
        text: `${displayName} meninggalkan ruang.`,
        type: 'system',
      }).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `rooms/${room.id}/players/${uid}`, auth);
  }
}

export async function updateSpyfallSettings(params: {
  roomId: string;
  roundDurationSec: number;
  spyMode: SpyMode;
  enabledPacks: string[];
  customLocations: CustomLocation[];
}): Promise<void> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const clampedDuration = Math.min(1200, Math.max(120, Math.round(params.roundDurationSec)));
  const cleanPacks = params.enabledPacks.slice(0, 10);
  const cleanCustom = params.customLocations
    .map((loc) => sanitizeCustomLocation(loc))
    .filter((loc): loc is CustomLocation => loc !== null)
    .slice(0, 20);

  if (cleanPacks.length === 0 && cleanCustom.length === 0) {
    throw new Error('Pilih minimal 1 paket lokasi atau buat lokasi kustom.');
  }

  const effectivePacks = cleanPacks.length > 0 ? cleanPacks : ['nusantara'];

  try {
    await updateDoc(doc(db, 'rooms', params.roomId), {
      roundDurationSec: clampedDuration,
      spyMode: params.spyMode,
      enabledPacks: effectivePacks,
      customLocations: cleanCustom,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${params.roomId}`, auth);
  }
}

export async function updateKataKataSettings(params: {
  roomId: string;
  roundDurationSec: number;
  spyMode: SpyMode;
  enabledPacks: string[];
  customWordPairs: CustomWordPair[];
}): Promise<void> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const clampedDuration = Math.min(1200, Math.max(120, Math.round(params.roundDurationSec)));
  const cleanPacks = params.enabledPacks.slice(0, 10);
  const cleanCustom = params.customWordPairs
    .map((pair) => sanitizeCustomWordPair(pair))
    .filter((pair): pair is CustomWordPair => pair !== null)
    .slice(0, 30);

  if (cleanPacks.length === 0 && cleanCustom.length === 0) {
    throw new Error('Pilih minimal 1 paket kata atau buat pasangan kata kustom.');
  }

  const effectivePacks = cleanPacks.length > 0 ? cleanPacks : ['kuliner'];

  try {
    await updateDoc(doc(db, 'rooms', params.roomId), {
      roundDurationSec: clampedDuration,
      spyMode: params.spyMode,
      enabledPacks: effectivePacks,
      customWordPairs: cleanCustom,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${params.roomId}`, auth);
  }
}

export async function togglePlayerReady(params: {
  roomId: string;
  uid: string;
  isReady: boolean;
}): Promise<void> {
  const { auth, db } = getFirebaseServices();
  if (!db) return;

  try {
    await updateDoc(doc(db, 'rooms', params.roomId, 'players', params.uid), {
      isReady: params.isReady,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `rooms/${params.roomId}/players/${params.uid}`,
      auth,
    );
  }
}

// --- Server Game Master Actions: Game #1 (Yang Bener Yang Mana / spyfall) ---

export async function startSpyfallRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/start', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function initiateAccusationVote(params: {
  roomId: string;
  initiatorUid: string;
  initiatorName: string;
  targetUid: string;
  targetName?: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/vote', {
    roomId: params.roomId,
    action: 'initiate',
    targetUid: params.targetUid,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.initiatorUid,
      senderName: params.initiatorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function castAccusationVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  choice: 'yes' | 'no';
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/vote', {
    roomId: params.roomId,
    action: 'cast',
    choice: params.choice,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.voterUid,
      senderName: params.voterName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function cancelActiveVoteOrSpyGuess(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/vote', {
    roomId: params.roomId,
    action: 'cancel',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function submitSpyLocationGuess(params: {
  roomId: string;
  spyUid: string;
  spyName: string;
  guessedLocation: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/guess', {
    roomId: params.roomId,
    guessedLocation: params.guessedLocation,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.spyUid,
      senderName: params.spyName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function resolveRoundTimeout(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/resolve', {
    roomId: params.roomId,
    action: 'timeout',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function returnRoomToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/spyfall/resolve', {
    roomId: params.roomId,
    action: 'return_lobby',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

// --- Server Game Master Actions: Game #2 (Kata-Kata Hari Ini / kata_kata) ---

export async function startKataKataRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/start', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function initiateKataKataVote(params: {
  roomId: string;
  initiatorUid: string;
  initiatorName: string;
  targetUid: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/vote', {
    roomId: params.roomId,
    action: 'initiate',
    targetUid: params.targetUid,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.initiatorUid,
      senderName: params.initiatorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function castKataKataVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  choice: 'yes' | 'no';
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/vote', {
    roomId: params.roomId,
    action: 'cast',
    choice: params.choice,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.voterUid,
      senderName: params.voterName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function cancelKataKataVote(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/vote', {
    roomId: params.roomId,
    action: 'cancel',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function submitKataKataLastChanceGuess(params: {
  roomId: string;
  spyUid: string;
  spyName: string;
  guessedWord?: string;
  surrender?: boolean;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/guess', {
    roomId: params.roomId,
    guessedWord: params.guessedWord ?? '',
    surrender: Boolean(params.surrender),
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.spyUid,
      senderName: params.spyName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function resolveKataKataTimeout(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/resolve', {
    roomId: params.roomId,
    action: 'timeout',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function returnKataKataToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/kata-kata/resolve', {
    roomId: params.roomId,
    action: 'return_lobby',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

// --- Settings & Actions: Game #3 (Satu Frekuensi / satu_frekuensi) ---

export async function updateSatuFrekuensiSettings(params: {
  roomId: string;
  enabledPacks: string[];
  customSpectrums: CustomSpectrum[];
}): Promise<void> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const cleanPacks = params.enabledPacks.slice(0, 10);
  const cleanCustom = params.customSpectrums
    .map((item) => sanitizeCustomSpectrum(item))
    .filter((item): item is CustomSpectrum => item !== null)
    .slice(0, 25);

  if (cleanPacks.length === 0 && cleanCustom.length === 0) {
    throw new Error('Pilih minimal 1 paket spektrum atau buat spektrum kustom.');
  }

  const effectivePacks = cleanPacks.length > 0 ? cleanPacks : ['tongkrongan'];

  try {
    await updateDoc(doc(db, 'rooms', params.roomId), {
      enabledPacks: effectivePacks,
      customSpectrums: cleanCustom,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${params.roomId}`, auth);
  }
}

export async function startSatuFrekuensiRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/satu-frekuensi/start', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function submitSatuFrekuensiClue(params: {
  roomId: string;
  psychicUid: string;
  psychicName: string;
  clueText: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/satu-frekuensi/clue', {
    roomId: params.roomId,
    clueText: params.clueText,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.psychicUid,
      senderName: params.psychicName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function submitSatuFrekuensiGuess(params: {
  roomId: string;
  guessValue: number;
}): Promise<void> {
  await callGameMasterApi('/api/satu-frekuensi/guess', {
    roomId: params.roomId,
    guessValue: params.guessValue,
  });
}

export async function advanceSatuFrekuensiPhase(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/satu-frekuensi/next-phase', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function returnSatuFrekuensiToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/satu-frekuensi/return-lobby', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

// --- Settings & Actions: Game #4 (Fakta Hari Ini / fakta_hari_ini) ---

export async function updateFaktaHariIniSettings(params: {
  roomId: string;
  enabledPacks: string[];
  customFacts: CustomFactItem[];
}): Promise<void> {
  const { auth, db } = getFirebaseServices();
  if (!db) throw new Error('Firebase belum terkonfigurasi.');

  const cleanPacks = params.enabledPacks.slice(0, 10);
  const cleanCustom = params.customFacts
    .map((item) => sanitizeCustomFact(item))
    .filter((item): item is CustomFactItem => item !== null)
    .slice(0, 30);

  if (cleanPacks.length === 0 && cleanCustom.length === 0) {
    throw new Error('Pilih minimal 1 paket fakta atau buat fakta kustom.');
  }

  const effectivePacks = cleanPacks.length > 0 ? cleanPacks : ['hukum_sejarah'];

  try {
    await updateDoc(doc(db, 'rooms', params.roomId), {
      enabledPacks: effectivePacks,
      customFacts: cleanCustom,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${params.roomId}`, auth);
  }
}

export async function startFaktaHariIniRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/fakta-hari-ini/start', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function advanceFaktaHariIniPhase(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  direction?: 'advance' | 'back';
}): Promise<void> {
  const data = await callGameMasterApi('/api/fakta-hari-ini/next-phase', {
    roomId: params.roomId,
    direction: params.direction ?? 'advance',
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.actorUid,
      senderName: params.actorName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function submitFaktaHariIniGuess(params: {
  roomId: string;
  guesserUid: string;
  guesserName: string;
  pickedUid: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/fakta-hari-ini/guess', {
    roomId: params.roomId,
    pickedUid: params.pickedUid,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.guesserUid,
      senderName: params.guesserName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function returnFaktaHariIniToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  const data = await callGameMasterApi('/api/fakta-hari-ini/return-lobby', {
    roomId: params.roomId,
  });

  if (data.systemMessage) {
    void sendRoomChatMessage({
      roomId: params.roomId,
      senderUid: params.hostUid,
      senderName: params.hostName,
      text: data.systemMessage,
      type: 'system',
    }).catch(() => {});
  }
}

export async function fetchAllRoundSecrets(
  roomId: string,
  roundId: string,
  playerUids: string[],
): Promise<Record<string, PlayerSecretDoc>> {
  const { auth, db } = getFirebaseServices();
  if (!db || !roundId) return {};

  const result: Record<string, PlayerSecretDoc> = {};
  await Promise.all(
    playerUids.map(async (uid) => {
      try {
        const snap = await getDoc(
          doc(db, 'rooms', roomId, 'rounds', roundId, 'secrets', uid),
        );
        if (snap.exists()) {
          result[uid] = snap.data() as PlayerSecretDoc;
        }
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.GET,
          `rooms/${roomId}/rounds/${roundId}/secrets/${uid}`,
          auth,
        );
      }
    }),
  );
  return result;
}
