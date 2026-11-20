'use client';

import React, { useState } from 'react';
import { ShieldAlert, Smartphone, Trash2, UserPlus, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { RoomDoc, RoomPlayerDoc } from '@/lib/games/types';
import {
  addNumpangPlayer,
  pickAvatarColor,
  removeNumpangPlayer,
} from '@/lib/platform/room-service';

interface NumpangModalProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  hostDeviceUid: string;
  hostDeviceName: string;
  onClose: () => void;
  onSeatRemoved?: (removedUid: string) => void;
}

export function NumpangModal({
  room,
  players,
  hostDeviceUid,
  hostDeviceName,
  onClose,
  onSeatRemoved,
}: NumpangModalProps) {
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myNumpangSeats = players.filter(
    (p) => p.isNumpang && p.controllerUid === hostDeviceUid,
  );
  const canAddNow = room.status === 'lobby' && myNumpangSeats.length < 2 && players.length < 12;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const seatUid = await addNumpangPlayer({
        roomId: room.id,
        hostDeviceUid,
        hostDeviceName,
        displayName: nameInput.trim(),
        avatarColor: pickAvatarColor(`${hostDeviceUid}_${nameInput.trim()}`),
        existingPlayers: players,
      });
      if (seatUid) {
        setNameInput('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah pemain Numpang.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (seat: RoomPlayerDoc) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeNumpangPlayer({
        roomId: room.id,
        seatUid: seat.uid,
        seatName: seat.displayName,
        hostDeviceUid,
        hostDeviceName,
      });
      onSeatRemoved?.(seat.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus pemain Numpang.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="numpang-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl bg-[#131A24] border border-slate-700/80 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h2 id="numpang-modal-title" className="text-base font-bold text-white">
              Mode Numpang (Berbagi HP)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            Ada teman yang HP-nya lowbat? Tambahkan hingga <strong className="text-white">2 pemain Numpang</strong> di HP kamu. Hanya HP yang berbagi kursi yang akan memunculkan tombol pindah giliran &amp; tirai privasi anti-intip.
          </p>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Kursi di HP Ini ({1 + myNumpangSeats.length}/3)
            </p>
            <div className="rounded-xl bg-[#0B1018] border border-slate-800 divide-y divide-slate-800/80">
              <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">
                    {hostDeviceName}
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-400">Pemilik HP</span>
              </div>

              {myNumpangSeats.map((seat) => (
                <div
                  key={seat.uid}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seat.avatarColor }}
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      {seat.displayName}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy || room.status === 'playing'}
                    onClick={() => handleRemove(seat)}
                    className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-40 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          </div>

          {room.status !== 'lobby' ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2.5 text-xs text-amber-200">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>Penambahan atau penghapusan kursi Numpang hanya bisa dilakukan saat berada di lobi.</span>
            </div>
          ) : (
            <form onSubmit={handleAdd} className="space-y-2.5">
              <label
                htmlFor="numpang-name-input"
                className="block text-xs font-semibold text-slate-300"
              >
                Tambah Teman Numpang
              </label>
              <div className="flex gap-2">
                <input
                  id="numpang-name-input"
                  type="text"
                  maxLength={32}
                  value={nameInput}
                  disabled={!canAddNow || busy}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Contoh: Bima"
                  className="flex-1 min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 px-3.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="submit"
                  disabled={!canAddNow || busy || nameInput.trim().length < 2}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  Tambah
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
