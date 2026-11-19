'use client';

import React, { useState } from 'react';
import { useRoomSession } from '@/hooks/use-room-session';
import { KataKataRoomView } from './kata-kata/KataKataRoomView';
import { SpyfallRoomView } from './spyfall/SpyfallRoomView';

interface ActiveRoomContainerProps {
  roomId: string;
  myUid: string;
  myName: string;
  onExitToHub: () => void;
}

export function ActiveRoomContainer({
  roomId,
  myUid,
  myName,
  onExitToHub,
}: ActiveRoomContainerProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  const {
    room,
    players,
    mySecret,
    revealedSecrets,
    messages,
    presence,
    loadingRoom,
    roomMissing,
  } = useRoomSession({
    roomId: isLeaving ? null : roomId,
    uid: myUid,
    displayName: myName,
  });

  if (isLeaving) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Keluar dari ruang permainan...</p>
      </div>
    );
  }

  if (loadingRoom) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Memuat ruang permainan Yuk Main...</p>
      </div>
    );
  }

  if (roomMissing || !room) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#131A24] border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Ruang Tidak Ditemukan</h2>
          <p className="text-sm text-slate-400">
            Ruang permainan ini telah ditutup atau kode undangan sudah kedaluwarsa.
          </p>
          <button
            type="button"
            onClick={onExitToHub}
            className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors"
          >
            Kembali ke Beranda Yuk Main
          </button>
        </div>
      </div>
    );
  }

  if (room.gameType === 'kata_kata') {
    return (
      <KataKataRoomView
        room={room}
        players={players}
        mySecret={mySecret}
        revealedSecrets={revealedSecrets}
        messages={messages}
        presence={presence}
        myUid={myUid}
        myName={myName}
        onBeforeLeave={() => setIsLeaving(true)}
        onExitToHub={onExitToHub}
      />
    );
  }

  return (
    <SpyfallRoomView
      room={room}
      players={players}
      mySecret={mySecret}
      revealedSecrets={revealedSecrets}
      messages={messages}
      presence={presence}
      myUid={myUid}
      myName={myName}
      onBeforeLeave={() => setIsLeaving(true)}
      onExitToHub={onExitToHub}
    />
  );
}
