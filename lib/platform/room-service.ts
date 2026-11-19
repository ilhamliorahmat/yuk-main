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
import { httpsCallable } from 'firebase/functions';
import { getFirebaseServices } from '@/lib/firebase/client';
import { firebaseConfig } from '@/lib/firebase/config';
import { handleFirestoreError, OperationType } from '@/lib/firebase/errors';
import { sanitizeCustomWordPair } from '@/lib/games/kata-kata/engine';
import { generateRoomCode, sanitizeCustomLocation } from '@/lib/games/spyfall/engine';
import type {
  CustomLocation,
  CustomWordPair,
  GameType,
  PlayerSecretDoc,
  RoomDoc,
  RoomPlayerDoc,
  SpyMode,
} from '@/lib/games/types';
import { sendRoomChatMessage } from './chat-presence';
import { pickAvatarColor, upsertUserProfile } from './user-profile';

export { pickAvatarColor, upsertUserProfile };

interface SpyfallApiResponse {
  ok: boolean;
  error?: string;
  systemMessage?: string | null;
}

type GameMasterEndpoint =
  | '/api/spyfall/start'
  | '/api/spyfall/vote'
  | '/api/spyfall/guess'
  | '/api/spyfall/resolve'
  | '/api/kata-kata/start'
  | '/api/kata-kata/vote'
  | '/api/kata-kata/guess'
  | '/api/kata-kata/resolve';

const ENDPOINT_TO_FUNCTION: Record<GameMasterEndpoint, string> = {
  '/api/spyfall/start': 'spyfallStart',
  '/api/spyfall/vote': 'spyfallVote',
  '/api/spyfall/guess': 'spyfallGuess',
  '/api/spyfall/resolve': 'spyfallResolve',
  '/api/kata-kata/start': 'kataKataStart',
  '/api/kata-kata/vote': 'kataKataVote',
  '/api/kata-kata/guess': 'kataKataGuess',
  '/api/kata-kata/resolve': 'kataKataResolve',
};

async function callGameMasterApi(
  endpoint: GameMasterEndpoint,
  payload: Record<string, unknown>,
): Promise<SpyfallApiResponse> {
  const { auth, functions } = getFirebaseServices();
  const currentUser = auth?.currentUser;
  if (!currentUser) {
    throw new Error('Sesi pemain belum aktif. Silakan masuk terlebih dahulu.');
  }

  // Production InfinityFree static build uses Firebase Cloud Functions v2 (httpsCallable)
  if (firebaseConfig.gameMasterMode === 'functions') {
    if (!functions) {
      throw new Error('Layanan Firebase Cloud Functions belum terkonfigurasi.');
    }
    const fnName = ENDPOINT_TO_FUNCTION[endpoint];
    try {
      const callable = httpsCallable<Record<string, unknown>, SpyfallApiResponse>(
        functions,
        fnName,
      );
      const response = await callable(payload);
      if (!response.data?.ok) {
        throw new Error(response.data?.error || 'Permintaan Game Master gagal.');
      }
      return response.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message || 'Gagal menghubungi Firebase Cloud Functions.');
    }
  }

  // AI Studio / Node server mode uses local Next.js App Router API routes
  const sendPost = async (forceRefresh: boolean) => {
    const idToken = await currentUser.getIdToken(forceRefresh);
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-Token': idToken,
      },
      body: JSON.stringify(payload),
    });
  };

  let res = await sendPost(false);

  // If the AI Studio / Cloud Run auth proxy refreshed the session via a 302 redirect,
  // browsers downgrade POST -> GET on the redirect target, causing Next.js to return 405.
  // Retrying the POST once immediately succeeds with the refreshed session cookie.
  if (res.status === 405 || res.redirected) {
    res = await sendPost(true);
  }

  const data = (await res.json().catch(() => null)) as SpyfallApiResponse | null;
  if (!res.ok || !data?.ok) {
    if (res.status === 405) {
      throw new Error(
        'Sesi pratinjau dialihkan (HTTP 405). Muat ulang halaman lalu coba kembali.',
      );
    }
    throw new Error(data?.error || `Permintaan server gagal (HTTP ${res.status}).`);
  }
  return data;
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
    gameType === 'kata_kata' ? ['kuliner', 'keseharian'] : ['nusantara', 'klasik'];

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
    eliminatedUids: [],
    eliminationLog: [],
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
  const { auth, db } = getFirebaseServices();
  if (!db) return;

  const { room, uid, displayName, players } = params;
  const others = players.filter((p) => p.uid !== uid);

  try {
    if (others.length === 0) {
      await deleteDoc(doc(db, 'rooms', room.id, 'players', uid));
      await deleteDoc(doc(db, 'roomCodes', room.code)).catch(() => {});
      await deleteDoc(doc(db, 'rooms', room.id)).catch(() => {});
      return;
    }

    if (room.hostUid === uid) {
      const nextHost = others[0];
      const batch = writeBatch(db);
      batch.delete(doc(db, 'rooms', room.id, 'players', uid));
      batch.update(doc(db, 'rooms', room.id), {
        hostUid: nextHost.uid,
        updatedAt: serverTimestamp(),
      });
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
