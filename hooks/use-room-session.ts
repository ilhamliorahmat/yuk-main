'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseServices } from '../lib/firebase/client';
import { handleFirestoreError, OperationType } from '../lib/firebase/errors';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '../lib/games/types';
import {
  attachRoomPresence,
  subscribeToRoomChat,
  subscribeToRoomPresence,
} from '../lib/platform/chat-presence';
import { fetchAllRoundSecrets } from '../lib/platform/room-service';

function getTimestampMs(val: unknown): number {
  if (val && typeof val === 'object' && 'toMillis' in val && typeof val.toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number') return val;
  return 0;
}

export function useRoomSession(params: {
  roomId: string | null;
  uid: string | null;
  displayName: string | null;
  activeSeatUid?: string | null;
  isStageDisplay?: boolean;
}) {
  const { roomId, uid, displayName, activeSeatUid, isStageDisplay = false } = params;
  const effectiveSecretUid = activeSeatUid || uid;
  const sessionKey = roomId && uid ? `${roomId}:${uid}` : '';

  const [roomState, setRoomState] = useState<{
    key: string;
    room: RoomDoc | null;
    missing: boolean;
  }>({ key: '', room: null, missing: false });

  const [playersState, setPlayersState] = useState<{
    key: string;
    players: RoomPlayerDoc[];
  }>({ key: '', players: [] });

  const [secretState, setSecretState] = useState<{
    key: string;
    secret: PlayerSecretDoc | null;
  }>({ key: '', secret: null });

  const [revealedState, setRevealedState] = useState<{
    key: string;
    secrets: Record<string, PlayerSecretDoc>;
  }>({ key: '', secrets: {} });

  const [chatState, setChatState] = useState<{
    key: string;
    messages: ChatMessage[];
  }>({ key: '', messages: [] });

  const [presenceState, setPresenceState] = useState<{
    key: string;
    presence: Record<string, PresenceEntry>;
  }>({ key: '', presence: {} });

  // 1. Subscribe to Firestore Room & Players
  useEffect(() => {
    if (!roomId || !uid) return;
    const { auth, db } = getFirebaseServices();
    if (!db) return;

    const currentKey = `${roomId}:${uid}`;
    const roomPath = `rooms/${roomId}`;
    const unsubRoom = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (!snap.exists()) {
          setRoomState({ key: currentKey, room: null, missing: true });
        } else {
          setRoomState({ key: currentKey, room: snap.data() as RoomDoc, missing: false });
        }
      },
      (error) => {
        setRoomState({ key: currentKey, room: null, missing: false });
        handleFirestoreError(error, OperationType.GET, roomPath, auth);
      },
    );

    const playersPath = `rooms/${roomId}/players`;
    const playersQuery = query(
      collection(db, 'rooms', roomId, 'players'),
      where('roomId', '==', roomId),
    );
    const unsubPlayers = onSnapshot(
      playersQuery,
      (snap) => {
        const list: RoomPlayerDoc[] = snap.docs
          .map((d) => d.data() as RoomPlayerDoc)
          .sort((a, b) => getTimestampMs(a.joinedAt) - getTimestampMs(b.joinedAt));
        setPlayersState({ key: currentKey, players: list });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, playersPath, auth);
      },
    );

    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId, uid]);

  const room = roomState.key === sessionKey ? roomState.room : null;
  const roomMissing = roomState.key === sessionKey ? roomState.missing : false;
  const loadingRoom = Boolean(sessionKey) && roomState.key !== sessionKey;
  const players = useMemo(
    () => (playersState.key === sessionKey ? playersState.players : []),
    [playersState, sessionKey],
  );

  // 2. Subscribe to isolated per-player secret for active round (NEVER on Layar Panggung)
  const activeRoundId = room?.currentRoundId ?? '';
  const activeStatus = room?.status ?? 'lobby';
  const secretKey =
    !isStageDisplay && roomId && effectiveSecretUid && activeRoundId && activeStatus !== 'lobby'
      ? `${roomId}:${activeRoundId}:${effectiveSecretUid}`
      : '';

  useEffect(() => {
    if (
      isStageDisplay ||
      !roomId ||
      !effectiveSecretUid ||
      !activeRoundId ||
      activeStatus === 'lobby'
    ) {
      return;
    }
    const { auth, db } = getFirebaseServices();
    if (!db) return;

    const currentSecretKey = `${roomId}:${activeRoundId}:${effectiveSecretUid}`;
    const secretPath = `rooms/${roomId}/rounds/${activeRoundId}/secrets/${effectiveSecretUid}`;
    const unsubSecret = onSnapshot(
      doc(db, 'rooms', roomId, 'rounds', activeRoundId, 'secrets', effectiveSecretUid),
      (snap) => {
        setSecretState({
          key: currentSecretKey,
          secret: snap.exists() ? (snap.data() as PlayerSecretDoc) : null,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, secretPath, auth);
      },
    );

    return () => unsubSecret();
  }, [isStageDisplay, roomId, effectiveSecretUid, activeRoundId, activeStatus]);

  const mySecret = secretKey && secretState.key === secretKey ? secretState.secret : null;

  // 3. Subscribe to RTDB Chat & Presence
  const presenceUid = isStageDisplay && uid ? `stage_${uid}` : uid;
  const rtdbKey = roomId && presenceUid && displayName ? `${roomId}:${presenceUid}` : '';

  useEffect(() => {
    if (!roomId || !presenceUid || !displayName) return;

    const currentRtdbKey = `${roomId}:${presenceUid}`;
    const unsubChat = subscribeToRoomChat(roomId, (msgs) => {
      setChatState({ key: currentRtdbKey, messages: msgs });
    });
    const detachPresence = attachRoomPresence({
      roomId,
      uid: presenceUid,
      displayName: isStageDisplay ? 'Layar Panggung' : displayName,
      isStage: isStageDisplay,
    });
    const unsubPresence = subscribeToRoomPresence(roomId, (entries) => {
      setPresenceState({ key: currentRtdbKey, presence: entries });
    });

    return () => {
      unsubChat();
      detachPresence();
      unsubPresence();
    };
  }, [roomId, presenceUid, displayName, isStageDisplay]);

  const messages = rtdbKey && chatState.key === rtdbKey ? chatState.messages : [];
  const presence = rtdbKey && presenceState.key === rtdbKey ? presenceState.presence : {};

  // 4. Post-round secret role reveal (read-only; server already finalized results & scores)
  const revealKey =
    room && room.status === 'round_end' && room.currentRoundId
      ? `${room.id}:${room.currentRoundId}`
      : '';

  useEffect(() => {
    if (!room || !uid || room.status !== 'round_end' || !room.currentRoundId) return;
    if (players.length === 0) return;

    const currentRevealKey = `${room.id}:${room.currentRoundId}`;
    let cancelled = false;

    void fetchAllRoundSecrets(
      room.id,
      room.currentRoundId,
      players.map((p) => p.uid),
    )
      .then((secrets) => {
        if (!cancelled) {
          setRevealedState({ key: currentRevealKey, secrets });
        }
      })
      .catch(() => {
        // Ignore transient reveal fetch errors
      });

    return () => {
      cancelled = true;
    };
  }, [room, uid, players]);

  const revealedSecrets =
    revealKey && revealedState.key === revealKey ? revealedState.secrets : {};

  return {
    room,
    players,
    mySecret,
    revealedSecrets,
    messages,
    presence,
    loadingRoom,
    roomMissing,
  };
}
