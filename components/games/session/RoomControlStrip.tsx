'use client';

import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Coffee,
  Eye,
  Lock,
  QrCode,
  Smartphone,
  Trophy,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { RoomDoc, RoomPlayerDoc } from '@/lib/games/types';
import { openSessionRecap, togglePlayerBrb } from '@/lib/platform/room-service';

interface RoomControlStripProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  deviceUid: string;
  deviceName: string;
  activeSeatUid: string;
  onSelectSeat: (targetSeat: RoomPlayerDoc) => void;
  onOpenQr: () => void;
  onOpenNumpang: () => void;
  onOpenGameSwitcher: () => void;
  privacyCurtainTarget: RoomPlayerDoc | null;
  onDismissPrivacyCurtain: () => void;
}

export function RoomControlStrip({
  room,
  players,
  deviceUid,
  deviceName,
  activeSeatUid,
  onSelectSeat,
  onOpenQr,
  onOpenNumpang,
  onOpenGameSwitcher,
  privacyCurtainTarget,
  onDismissPrivacyCurtain,
}: RoomControlStripProps) {
  const [brbBusy, setBrbBusy] = useState(false);
  const [recapBusy, setRecapBusy] = useState(false);
  const [stripError, setStripError] = useState<string | null>(null);

  const isHost = room.hostUid === deviceUid;
  const deviceSeats = players.filter(
    (p) => p.uid === deviceUid || (p.isNumpang && p.controllerUid === deviceUid),
  );
  const hasSharedPhone = deviceSeats.length > 1;
  const activeSeat =
    deviceSeats.find((s) => s.uid === activeSeatUid) ??
    players.find((p) => p.uid === deviceUid) ??
    null;

  const isActiveSeatBrb = Boolean(activeSeat?.isBrb);
  const completedCount = room.completedGames?.length ?? 0;
  const hasRecapEligibleData =
    completedCount > 0 || (room.currentMatchRounds ?? 0) > 0;
  const canHostTriggerRecap =
    isHost &&
    (room.status === 'lobby' || room.status === 'round_end') &&
    hasRecapEligibleData;

  const handleToggleBrb = async () => {
    if (!activeSeat || brbBusy) return;
    setBrbBusy(true);
    setStripError(null);
    try {
      await togglePlayerBrb({
        roomId: room.id,
        targetUid: activeSeat.uid,
        targetName: activeSeat.displayName,
        actorUid: deviceUid,
        isBrb: !isActiveSeatBrb,
      });
    } catch (err) {
      setStripError(err instanceof Error ? err.message : 'Gagal mengubah status BRB.');
    } finally {
      setBrbBusy(false);
    }
  };

  const handleOpenRecap = async () => {
    if (!canHostTriggerRecap || recapBusy) return;
    setRecapBusy(true);
    setStripError(null);
    try {
      await openSessionRecap({
        roomId: room.id,
        hostUid: deviceUid,
        hostName: deviceName,
      });
    } catch (err) {
      setStripError(err instanceof Error ? err.message : 'Gagal membuka Rekap Permainan.');
    } finally {
      setRecapBusy(false);
    }
  };

  return (
    <>
      <div className="bg-[#0E141E] border-b border-slate-800/90">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2">
          {/* Selective Numpang Seat Switcher — ONLY rendered on phones with co-seat players */}
          {hasSharedPhone ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mr-1 flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                Giliran HP:
              </span>
              {deviceSeats.map((seat) => {
                const isSelected = seat.uid === activeSeat?.uid;
                return (
                  <button
                    key={seat.uid}
                    type="button"
                    onClick={() => onSelectSeat(seat)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border ${
                      isSelected
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/60'
                        : 'bg-[#131A24] text-slate-300 border-slate-700/80 hover:border-slate-500'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: seat.avatarColor }}
                    />
                    <span className="max-w-[110px] truncate">{seat.displayName}</span>
                    {seat.isBrb && (
                      <span className="text-[10px] text-amber-400 font-semibold">BRB</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-mono font-bold text-slate-200 tracking-wider">
                {room.code}
              </span>
              <span className="text-slate-600">•</span>
              <span className="tabular-nums">
                {completedCount > 0
                  ? `${completedCount} game terekap`
                  : `${room.currentMatchRounds ?? 0} ronde`}
              </span>
            </div>
          )}

          {/* Utility Controls */}
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {activeSeat && (
              <button
                type="button"
                disabled={brbBusy}
                onClick={handleToggleBrb}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                  isActiveSeatBrb
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/60 hover:bg-amber-500/30'
                    : 'bg-[#131A24] text-slate-300 border-slate-700/80 hover:text-white hover:border-slate-600'
                }`}
              >
                <Coffee className="w-3.5 h-3.5" />
                <span>{isActiveSeatBrb ? 'Sudah Balik' : 'BRB'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenNumpang}
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold bg-[#131A24] text-slate-300 border border-slate-700/80 hover:text-white hover:border-slate-600 flex items-center gap-1.5 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>Numpang{hasSharedPhone ? ` (${deviceSeats.length - 1})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={onOpenQr}
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold bg-[#131A24] text-slate-300 border border-slate-700/80 hover:text-white hover:border-slate-600 flex items-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">QR / TV</span>
            </button>

            {isHost && (
              <button
                type="button"
                disabled={room.status === 'playing'}
                onClick={onOpenGameSwitcher}
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold bg-[#131A24] text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/10 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Ganti Game</span>
              </button>
            )}

            {isHost && (
              <button
                type="button"
                disabled={!canHostTriggerRecap || recapBusy}
                onClick={handleOpenRecap}
                className="min-h-[36px] px-3 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-35 text-slate-950 flex items-center gap-1.5 transition-colors"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>{recapBusy ? 'Membuka...' : 'Rekap Permainan'}</span>
              </button>
            )}
          </div>
        </div>

        {stripError && (
          <div className="max-w-7xl mx-auto px-3 sm:px-6 pb-2">
            <p className="text-xs text-rose-400">{stripError}</p>
          </div>
        )}
      </div>

      {/* Mandatory Privacy Curtain when switching Numpang seats during active play or Suit Duel */}
      <AnimatePresence>
        {privacyCurtainTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed inset-0 z-[70] bg-[#06090F] flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="max-w-sm w-full space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-emerald-400" />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">
                  Tirai Privasi Numpang
                </p>
                <h2 className="text-2xl font-black text-white">
                  Serahkan HP ke {privacyCurtainTarget.displayName}
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Pastikan pemain sebelumnya tidak melihat layar sebelum membuka kartu rahasia atau pilihan giliran.
                </p>
              </div>

              <button
                type="button"
                onClick={onDismissPrivacyCurtain}
                className="w-full min-h-[52px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base flex items-center justify-center gap-2 transition-colors"
              >
                <Eye className="w-5 h-5" />
                Saya {privacyCurtainTarget.displayName} — Buka Layar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
