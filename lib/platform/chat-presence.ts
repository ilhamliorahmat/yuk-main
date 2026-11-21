'use client';

import { isLanRoomId } from '../lan/lan-protocol';
import { lanRuntime } from '../lan/lan-runtime';
import { apiFetch, buildPhpApiUrl, notifyRoomMutated } from './api-client';
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

  // System messages in Online Mode are generated authoritatively on the server
  if (params.type === 'system') return;

  await apiFetch(buildPhpApiUrl('rooms/chat'), {
    method: 'POST',
    body: JSON.stringify({ roomId: params.roomId, text: trimmedText }),
  });
  notifyRoomMutated(params.roomId);
}
