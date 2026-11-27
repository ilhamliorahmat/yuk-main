'use client';

import React, { useState } from 'react';
import {
  ArrowRightLeft,
  BookOpenCheck,
  Brush,
  Check,
  Dices,
  Flame,
  Moon,
  Radio,
  Search,
  SmilePlus,
  Sparkles,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { GameType, RoomDoc } from '@/lib/games/types';
import { switchRoomGameType } from '@/lib/platform/room-service';

interface GameSwitcherModalProps {
  room: RoomDoc;
  hostUid: string;
  hostName: string;
  onClose: () => void;
}

const GAME_OPTIONS: Array<{
  id: GameType;
  title: string;
  subtitle: string;
  playersHint: string;
  icon: typeof Search;
  accent: string;
}> = [
  {
    id: 'spyfall',
    title: 'Yang Bener Yang Mana',
    subtitle: 'Tebak lokasi & bongkar penyusup di tongkrongan.',
    playersHint: '3–12 pemain',
    icon: Search,
    accent: 'text-rose-400',
  },
  {
    id: 'kata_kata',
    title: 'Kata-Kata Hari Ini',
    subtitle: 'Cari siapa yang pegang kata meleset atau kosong.',
    playersHint: '3–12 pemain',
    icon: Sparkles,
    accent: 'text-amber-400',
  },
  {
    id: 'satu_frekuensi',
    title: 'Satu Frekuensi',
    subtitle: 'Satu kode rasa, semua menebak jarum spektrum.',
    playersHint: '2–12 pemain',
    icon: Radio,
    accent: 'text-cyan-400',
  },
  {
    id: 'fakta_hari_ini',
    title: 'Fakta Hari Ini',
    subtitle: 'Bongkar siapa yang pegang fakta asli di antara pembual.',
    playersHint: '3–12 pemain',
    icon: BookOpenCheck,
    accent: 'text-indigo-400',
  },
  {
    id: 'pelukis_gadungan',
    title: 'Pelukis Gadungan',
    subtitle: 'Gambar 1 garis & tebak siapa yang cuma meniru tanpa tahu kata.',
    playersHint: '3–12 pemain',
    icon: Brush,
    accent: 'text-emerald-400',
  },
  {
    id: 'malam_siluman',
    title: 'Malam Siluman',
    subtitle: 'Siluman berburu malam hari, warga berdebat & voting di siang hari.',
    playersHint: '4–12 pemain',
    icon: Moon,
    accent: 'text-rose-400',
  },
  {
    id: 'ular_tangga',
    title: 'Ular Tangga RP',
    subtitle: 'Ular tangga RPG dengan 4 kelas hero, skenario art pack & tas item rahasia.',
    playersHint: '2–12 pemain',
    icon: Dices,
    accent: 'text-amber-400',
  },
  {
    id: 'cuma_bercanda',
    title: 'Cuma Bercanda',
    subtitle: 'Komik 3-panel (Sistem + Sistem + Kamu) lalu upvote terlucu secara anonim.',
    playersHint: '2–12 pemain',
    icon: SmilePlus,
    accent: 'text-amber-300',
  },
  {
    id: 'meja_pembohong',
    title: 'Meja Pembohong',
    subtitle: 'Buang kartu tertutup, gertak meja, atau teriak BOHONG! Uji nyali silinder 1/6.',
    playersHint: '2–12 pemain',
    icon: Flame,
    accent: 'text-emerald-400',
  },
];

export function GameSwitcherModal({
  room,
  hostUid,
  hostName,
  onClose,
}: GameSwitcherModalProps) {
  const [selected, setSelected] = useState<GameType>(room.gameType);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSwitch = room.status === 'lobby' || room.status === 'round_end';
  const currentRounds = room.currentMatchRounds ?? 0;

  const handleConfirm = async () => {
    if (selected === room.gameType) {
      onClose();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await switchRoomGameType({
        roomId: room.id,
        hostUid,
        hostName,
        nextGameType: selected,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengganti permainan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-switcher-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-lg max-h-[88dvh] flex flex-col rounded-2xl bg-[#131A24] border border-slate-700/80 shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
            <h2 id="game-switcher-title" className="text-base font-bold text-white">
              Ganti Game di Ruang {room.code}
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

        <div className="p-5 flex-1 min-h-0 flex flex-col gap-4">
          {!canSwitch ? (
            <div className="shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-200 leading-relaxed">
              Selesaikan ronde aktif terlebih dahulu sebelum mengganti permainan agar skor ronde ini tidak terpotong.
            </div>
          ) : (
            <div className="shrink-0 rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 text-xs text-slate-300 leading-relaxed">
              {currentRounds > 0 ? (
                <span>
                  Game saat ini sudah memainkan <strong className="text-white tabular-nums">{currentRounds} ronde</strong>. Pemenang & poin game ini akan otomatis disimpan ke <strong className="text-amber-300">Rekap Permainan</strong>, lalu game baru dimulai dari 0 poin.
                </span>
              ) : (
                <span>
                  Belum ada ronde selesai di game ini (<strong className="text-white">0 ronde</strong>). Pindah game tidak akan mencatat pemenang atau skor kosong ke Rekap Permainan.
                </span>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 max-h-[44dvh] sm:max-h-[300px] overflow-y-auto overscroll-contain p-0.5 pr-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GAME_OPTIONS.map((item) => {
                const Icon = item.icon;
                const isCurrent = item.id === room.gameType;
                const isSelected = item.id === selected;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canSwitch || submitting}
                    onClick={() => setSelected(item.id)}
                    className={`text-left p-3.5 rounded-xl border transition-all min-h-[84px] ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-400/70 ring-1 ring-cyan-400/30'
                        : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
                    } disabled:opacity-50`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 shrink-0 ${item.accent}`} />
                        <span className="text-sm font-bold text-white leading-tight">
                          {item.title}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-cyan-400 shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5 leading-snug">{item.subtitle}</p>
                    <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                      <span>{item.playersHint}</span>
                      {isCurrent && <span className="text-amber-400 font-semibold">Aktif</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="shrink-0 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="shrink-0 flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={!canSwitch || submitting || selected === room.gameType}
              onClick={handleConfirm}
              className="min-h-[44px] px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-sm transition-colors"
            >
              {submitting ? 'Memindahkan Ruang...' : 'Pindah Game'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
