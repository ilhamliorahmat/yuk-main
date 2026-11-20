'use client';

import {
  limitToLast,
  onDisconnect,
  onValue,
  push,
  query,
  ref,
  serverTimestamp as rtdbServerTimestamp,
  set,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseServices } from '../firebase/client';
import type { ChatMessage, PresenceEntry } from '../games/types';
import { isLanRoomId } from '../lan/lan-protocol';
import { lanRuntime } from '../lan/lan-runtime';
import { pickAvatarColor } from './user-profile';

export async function sendRoomChatMessage(params: {
  roomId: string;
  senderUid: string;
  senderName: string;
  text: string;
  type?: 'chat' | 'system';
}): Promise<void> {
  const trimmedText = params.text.trim().slice(0, 500);
  if (!trimmedText) return;

  const trimmedName = params.senderName.trim().slice(0, 40) || 'Pemain';

  if (isLanRoomId(params.roomId)) {
    if (params.type === 'system') return;
    lanRuntime.sendChat(params.roomId, {
      senderUid: params.senderUid,
      senderName: trimmedName,
      avatarColor: pickAvatarColor(params.senderUid),
      text: trimmedText,
    });
    return;
  }

  const { rtdb } = getFirebaseServices();
  if (!rtdb) return;

  const chatListRef = ref(rtdb, `chats/${params.roomId}`);
  const msgRef = push(chatListRef);

  await set(msgRef, {
    senderUid: params.senderUid,
    senderName: trimmedName,
    text: trimmedText,
    type: params.type ?? 'chat',
    createdAt: rtdbServerTimestamp(),
  });
}

export function subscribeToRoomChat(
  roomId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const { rtdb } = getFirebaseServices();
  if (!rtdb) {
    onMessages([]);
    return () => {};
  }

  const chatQuery = query(ref(rtdb, `chats/${roomId}`), limitToLast(100));
  return onValue(
    chatQuery,
    (snapshot) => {
      const list: ChatMessage[] = [];
      snapshot.forEach((child) => {
        const val = child.val() as {
          senderUid?: string;
          senderName?: string;
          text?: string;
          type?: 'chat' | 'system';
          createdAt?: number;
        } | null;
        if (val && child.key) {
          list.push({
            id: child.key,
            senderUid: val.senderUid ?? '',
            senderName: val.senderName ?? 'Pemain',
            text: val.text ?? '',
            type: val.type === 'system' ? 'system' : 'chat',
            createdAt: typeof val.createdAt === 'number' ? val.createdAt : Date.now(),
          });
        }
      });
      onMessages(list);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export function attachRoomPresence(params: {
  roomId: string;
  uid: string;
  displayName: string;
  isStage?: boolean;
}): () => void {
  const { rtdb } = getFirebaseServices();
  if (!rtdb) return () => {};

  const safeName = params.displayName.trim().slice(0, 40) || 'Pemain';
  const isStage = Boolean(params.isStage);
  const connectedRef = ref(rtdb, '.info/connected');
  const userPresenceRef = ref(rtdb, `presence/${params.roomId}/${params.uid}`);

  const unsub = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return;

    void onDisconnect(userPresenceRef)
      .set({
        online: false,
        displayName: safeName,
        isStage,
        lastSeen: rtdbServerTimestamp(),
      })
      .then(() =>
        set(userPresenceRef, {
          online: true,
          displayName: safeName,
          isStage,
          lastSeen: rtdbServerTimestamp(),
        }),
      );
  });

  return () => {
    unsub();
    void set(userPresenceRef, {
      online: false,
      displayName: safeName,
      isStage,
      lastSeen: rtdbServerTimestamp(),
    }).catch(() => {
      // Ignore cleanup errors on sign-out or leave
    });
  };
}

export function subscribeToRoomPresence(
  roomId: string,
  onPresence: (entries: Record<string, PresenceEntry>) => void,
): Unsubscribe {
  const { rtdb } = getFirebaseServices();
  if (!rtdb) {
    onPresence({});
    return () => {};
  }

  const presenceRef = ref(rtdb, `presence/${roomId}`);
  return onValue(presenceRef, (snapshot) => {
    const map: Record<string, PresenceEntry> = {};
    snapshot.forEach((child) => {
      const val = child.val() as {
        online?: boolean;
        displayName?: string;
        isStage?: boolean;
        lastSeen?: number;
      } | null;
      if (child.key && val) {
        map[child.key] = {
          uid: child.key,
          online: Boolean(val.online),
          displayName: val.displayName ?? 'Pemain',
          isStage: Boolean(val.isStage),
          lastSeen: typeof val.lastSeen === 'number' ? val.lastSeen : 0,
        };
      }
    });
    onPresence(map);
  });
}
