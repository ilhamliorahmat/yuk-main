'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import { isLanRoomId, type LanRoomSnapshot } from '@/lib/lan/lan-protocol';
import { lanRuntime } from '@/lib/lan/lan-runtime';
import {
  ApiRequestError,
  apiFetch,
  buildPhpApiUrl,
  subscribeRoomMutation,
} from '@/lib/platform/api-client';

interface OnlineRoomSnapshotPayload {
  unchanged?: boolean;
  version?: number;
  room?: RoomDoc;
  players?: RoomPlayerDoc[];
  mySecretsBySeat?: Record<string, PlayerSecretDoc | null>;
  revealedSecrets?: Record<string, PlayerSecretDoc>;
  messages?: ChatMessage[];
  presence?: Record<string, PresenceEntry>;
}

interface OnlineSessionState {
  key: string;
  loaded: boolean;
  missing: boolean;
  room: RoomDoc | null;
  players: RoomPlayerDoc[];
  mySecretsBySeat: Record<string, PlayerSecretDoc | null>;
  revealedSecrets: Record<string, PlayerSecretDoc>;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
}

const EMPTY_ONLINE_STATE: OnlineSessionState = {
  key: '',
  loaded: false,
  missing: false,
  room: null,
  players: [],
  mySecretsBySeat: {},
  revealedSecrets: {},
  messages: [],
  presence: {},
};

const HEARTBEAT_INTERVAL_MS = 7000;

export function useRoomSession(params: {
  roomId: string | null;
  uid: string | null;
  displayName: string | null;
  activeSeatUid?: string | null;
  isStageDisplay?: boolean;
}) {
  const { roomId, uid, activeSeatUid, isStageDisplay = false } = params;
  const isLan = isLanRoomId(roomId);
  const effectiveSecretUid = activeSeatUid || uid;
  const sessionKey = roomId && uid ? `${roomId}:${uid}:${isStageDisplay ? '1' : '0'}` : '';

  const [lanTick, setLanTick] = useState(0);
  const [onlineState, setOnlineState] = useState<OnlineSessionState>(EMPTY_ONLINE_STATE);

  // 0. Subscribe to Zero-Internet WebRTC LAN Runtime when roomId starts with `lan_`
  useEffect(() => {
    if (!isLan || !roomId) return;
    return lanRuntime.subscribe(() => {
      setLanTick((t) => t + 1);
    });
  }, [isLan, roomId]);

  const lanSnapshot: LanRoomSnapshot | null = useMemo(() => {
    if (!isLan || !roomId) return null;
    void lanTick;
    return lanRuntime.getSnapshot(roomId);
  }, [isLan, roomId, lanTick]);

  const lanMissing = useMemo(() => {
    if (!isLan || !roomId) return false;
    void lanTick;
    return lanRuntime.isRoomMissing(roomId);
  }, [isLan, roomId, lanTick]);

  // 1. Subscribe to PHP 8 + MySQL Adaptive Polling Session (Online Mode)
  useEffect(() => {
    if (isLan || !roomId || !uid) return;

    const currentKey = `${roomId}:${uid}:${isStageDisplay ? '1' : '0'}`;
    let closed = false;
    let pollTimer: number | null = null;
    let inFlight = false;
    let pendingImmediate = false;
    let latestVersion = 0;
    let lastHeartbeatAtMs = 0;
    let currentStatus: string = 'lobby';
    let consecutiveErrors = 0;

    const nextPollDelayMs = (): number => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return 8000;
      }
      if (consecutiveErrors > 0) {
        return Math.min(8000, 1500 * Math.pow(1.6, consecutiveErrors));
      }
      return currentStatus === 'lobby' || currentStatus === 'round_end' ? 2200 : 1400;
    };

    const scheduleNext = () => {
      if (closed) return;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = window.setTimeout(() => {
        void pollOnce(false);
      }, nextPollDelayMs());
    };

    const pollOnce = async (forceFullSnapshot: boolean) => {
      if (closed) return;
      if (inFlight) {
        if (forceFullSnapshot) {
          pendingImmediate = true;
        }
        return;
      }

      inFlight = true;
      const now = Date.now();
      const sendHeartbeat = forceFullSnapshot || now - lastHeartbeatAtMs >= HEARTBEAT_INTERVAL_MS;
      if (sendHeartbeat) {
        lastHeartbeatAtMs = now;
      }

      try {
        const snap = await apiFetch<OnlineRoomSnapshotPayload>(
          buildPhpApiUrl('rooms/snapshot', {
            roomId,
            stage: isStageDisplay ? 1 : 0,
            heartbeat: sendHeartbeat ? 1 : 0,
            sinceVersion: forceFullSnapshot ? 0 : latestVersion,
          }),
        );
        if (closed) return;
        consecutiveErrors = 0;

        if (typeof snap.version === 'number' && snap.version > 0) {
          latestVersion = snap.version;
        }

        if (snap.unchanged) {
          if (snap.presence) {
            const nextPresence = snap.presence;
            setOnlineState((prev) =>
              prev.key === currentKey ? { ...prev, presence: nextPresence } : prev,
            );
          }
        } else if (snap.room) {
          currentStatus = snap.room.status;
          setOnlineState({
            key: currentKey,
            loaded: true,
            missing: false,
            room: snap.room,
            players: snap.players ?? [],
            mySecretsBySeat: snap.mySecretsBySeat ?? {},
            revealedSecrets: snap.revealedSecrets ?? {},
            messages: snap.messages ?? [],
            presence: snap.presence ?? {},
          });
        }
      } catch (err) {
        if (closed) return;
        if (
          err instanceof ApiRequestError &&
          (err.status === 404 || err.status === 403 || err.status === 401)
        ) {
          setOnlineState({
            ...EMPTY_ONLINE_STATE,
            key: currentKey,
            loaded: true,
            missing: true,
          });
          return;
        }
        consecutiveErrors = Math.min(5, consecutiveErrors + 1);
      } finally {
        inFlight = false;
        if (!closed) {
          if (pendingImmediate) {
            pendingImmediate = false;
            void pollOnce(true);
          } else {
            scheduleNext();
          }
        }
      }
    };

    const unsubMutation = subscribeRoomMutation(roomId, () => {
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      void pollOnce(true);
    });

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        if (pollTimer !== null) window.clearTimeout(pollTimer);
        void pollOnce(true);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    void pollOnce(true);

    return () => {
      closed = true;
      unsubMutation();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [isLan, roomId, uid, isStageDisplay]);

  const activeOnline = onlineState.key === sessionKey ? onlineState : EMPTY_ONLINE_STATE;

  const room = isLan ? (lanSnapshot?.room ?? null) : activeOnline.room;
  const roomMissing = isLan ? lanMissing : activeOnline.missing;
  const loadingRoom = isLan
    ? Boolean(roomId) && !lanSnapshot && !lanMissing
    : Boolean(sessionKey) && !activeOnline.loaded;

  const players = useMemo(() => {
    if (isLan) return lanSnapshot?.players ?? [];
    return activeOnline.players;
  }, [isLan, lanSnapshot, activeOnline.players]);

  const mySecret = isLan
    ? !isStageDisplay && effectiveSecretUid
      ? (lanSnapshot?.secretsByOwnedSeat[effectiveSecretUid] ?? null)
      : null
    : !isStageDisplay && effectiveSecretUid && room?.status !== 'lobby'
      ? (activeOnline.mySecretsBySeat[effectiveSecretUid] ?? null)
      : null;

  const revealedSecrets = isLan
    ? (lanSnapshot?.revealedSecrets ?? {})
    : room?.status === 'round_end'
      ? activeOnline.revealedSecrets
      : {};

  const messages = isLan ? (lanSnapshot?.messages ?? []) : activeOnline.messages;
  const presence = isLan ? (lanSnapshot?.presence ?? {}) : activeOnline.presence;

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
