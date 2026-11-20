'use client';

import React, { useMemo, useState } from 'react';
import { LanPairingModal } from '@/components/lan/LanPairingModal';
import { useRoomSession } from '@/hooks/use-room-session';
import type { RoomPlayerDoc } from '@/lib/games/types';
import { isLanRoomId } from '@/lib/lan/lan-protocol';
import { lanRuntime } from '@/lib/lan/lan-runtime';
import { FaktaHariIniRoomView } from './fakta-hari-ini/FaktaHariIniRoomView';
import { KataKataRoomView } from './kata-kata/KataKataRoomView';
import { SatuFrekuensiRoomView } from './satu-frekuensi/SatuFrekuensiRoomView';
import { GameSwitcherModal } from './session/GameSwitcherModal';
import { LayarPanggungView } from './session/LayarPanggungView';
import { NumpangModal } from './session/NumpangModal';
import { QrInviteModal } from './session/QrInviteModal';
import { RekapPermainanOverlay } from './session/RekapPermainanOverlay';
import { RoomControlStrip } from './session/RoomControlStrip';
import { SpyfallRoomView } from './spyfall/SpyfallRoomView';

interface ActiveRoomContainerProps {
  roomId: string;
  myUid: string;
  myName: string;
  isStageDisplay?: boolean;
  onExitToHub: () => void;
}

export function ActiveRoomContainer({
  roomId,
  myUid,
  myName,
  isStageDisplay = false,
  onExitToHub,
}: ActiveRoomContainerProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [selectedSeatUid, setSelectedSeatUid] = useState<string>(myUid);
  const [privacyCurtainTarget, setPrivacyCurtainTarget] = useState<RoomPlayerDoc | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [numpangModalOpen, setNumpangModalOpen] = useState(false);
  const [gameSwitcherOpen, setGameSwitcherOpen] = useState(false);

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
    activeSeatUid: isStageDisplay ? null : selectedSeatUid,
    isStageDisplay,
  });

  // Resolve effective active seat (always fall back cleanly to device owner if a Numpang seat was removed)
  const activeSeat = useMemo(() => {
    const ownedSeats = players.filter(
      (p) => p.uid === myUid || (p.isNumpang && p.controllerUid === myUid),
    );
    return (
      ownedSeats.find((s) => s.uid === selectedSeatUid) ??
      ownedSeats.find((s) => s.uid === myUid) ??
      null
    );
  }, [players, myUid, selectedSeatUid]);

  const effectiveSeatUid = activeSeat?.uid ?? myUid;
  const effectiveSeatName = activeSeat?.displayName ?? myName;

  const handleSelectSeat = (targetSeat: RoomPlayerDoc) => {
    if (targetSeat.uid === effectiveSeatUid) return;
    const isSensitivePhase =
      Boolean(room && (room.status === 'playing' || room.status === 'voting' || room.status === 'spy_guess')) ||
      Boolean(room?.activeRecap?.tiebreakerDuel && room.activeRecap.tiebreakerDuel.status === 'picking');

    setSelectedSeatUid(targetSeat.uid);
    if (isSensitivePhase) {
      setPrivacyCurtainTarget(targetSeat);
    }
  };

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
        <p className="text-sm text-slate-300">
          {isStageDisplay ? 'Menghubungkan Layar Panggung...' : 'Memuat ruang permainan Yuk Main...'}
        </p>
      </div>
    );
  }

  const isLanRoom = isLanRoomId(roomId);

  const handleSafeExit = () => {
    if (isLanRoom) {
      lanRuntime.teardown();
    }
    onExitToHub();
  };

  if (roomMissing || !room) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#131A24] border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">
            {isLanRoom ? 'Koneksi LAN Terputus' : 'Ruang Tidak Ditemukan'}
          </h2>
          <p className="text-sm text-slate-400">
            {isLanRoom
              ? 'Host menutup ruang LAN Party atau sinyal Wi-Fi lokal terputus.'
              : 'Ruang permainan ini telah ditutup atau kode undangan sudah kedaluwarsa.'}
          </p>
          <button
            type="button"
            onClick={handleSafeExit}
            className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors"
          >
            Kembali ke Beranda Yuk Main
          </button>
        </div>
      </div>
    );
  }

  // Hybrid Table + Cast View (Layar Panggung): Zero secrets, big-screen TV/Laptop stage
  if (isStageDisplay) {
    return (
      <LayarPanggungView
        room={room}
        players={players}
        revealedSecrets={revealedSecrets}
        presence={presence}
        onExitStage={handleSafeExit}
      />
    );
  }

  const renderGameView = () => {
    if (room.gameType === 'kata_kata') {
      return (
        <KataKataRoomView
          room={room}
          players={players}
          mySecret={mySecret}
          revealedSecrets={revealedSecrets}
          messages={messages}
          presence={presence}
          myUid={effectiveSeatUid}
          myName={effectiveSeatName}
          deviceUid={myUid}
          deviceName={myName}
          onBeforeLeave={() => setIsLeaving(true)}
          onExitToHub={onExitToHub}
        />
      );
    }

    if (room.gameType === 'satu_frekuensi') {
      return (
        <SatuFrekuensiRoomView
          room={room}
          players={players}
          mySecret={mySecret}
          messages={messages}
          presence={presence}
          myUid={effectiveSeatUid}
          myName={effectiveSeatName}
          deviceUid={myUid}
          deviceName={myName}
          onBeforeLeave={() => setIsLeaving(true)}
          onExitToHub={onExitToHub}
        />
      );
    }

    if (room.gameType === 'fakta_hari_ini') {
      return (
        <FaktaHariIniRoomView
          room={room}
          players={players}
          mySecret={mySecret}
          messages={messages}
          presence={presence}
          myUid={effectiveSeatUid}
          myName={effectiveSeatName}
          deviceUid={myUid}
          deviceName={myName}
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
        myUid={effectiveSeatUid}
        myName={effectiveSeatName}
        deviceUid={myUid}
        deviceName={myName}
        onBeforeLeave={() => setIsLeaving(true)}
        onExitToHub={onExitToHub}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[#0B1018]">
      <RoomControlStrip
        room={room}
        players={players}
        deviceUid={myUid}
        deviceName={myName}
        activeSeatUid={effectiveSeatUid}
        onSelectSeat={handleSelectSeat}
        onOpenQr={() => setQrModalOpen(true)}
        onOpenNumpang={() => setNumpangModalOpen(true)}
        onOpenGameSwitcher={() => setGameSwitcherOpen(true)}
        privacyCurtainTarget={privacyCurtainTarget}
        onDismissPrivacyCurtain={() => setPrivacyCurtainTarget(null)}
      />

      {renderGameView()}

      {qrModalOpen &&
        (isLanRoom ? (
          room.hostUid === myUid ? (
            <LanPairingModal
              mode="host"
              roomCode={room.code}
              onClose={() => setQrModalOpen(false)}
            />
          ) : null
        ) : (
          <QrInviteModal roomCode={room.code} onClose={() => setQrModalOpen(false)} />
        ))}

      {numpangModalOpen && (
        <NumpangModal
          room={room}
          players={players}
          hostDeviceUid={myUid}
          hostDeviceName={myName}
          onClose={() => setNumpangModalOpen(false)}
          onSeatRemoved={(removedUid) => {
            if (removedUid === selectedSeatUid) {
              setSelectedSeatUid(myUid);
            }
          }}
        />
      )}

      {gameSwitcherOpen && (
        <GameSwitcherModal
          room={room}
          hostUid={myUid}
          hostName={myName}
          onClose={() => setGameSwitcherOpen(false)}
        />
      )}

      {room.activeRecap && (
        <RekapPermainanOverlay
          room={room}
          recap={room.activeRecap}
          players={players}
          deviceUid={myUid}
          deviceName={myName}
          activeSeatUid={effectiveSeatUid}
          onSelectSeat={handleSelectSeat}
        />
      )}
    </div>
  );
}
