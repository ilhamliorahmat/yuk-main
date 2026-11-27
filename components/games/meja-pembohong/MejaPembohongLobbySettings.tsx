'use client';

import React, { useState } from 'react';
import { Flame, ShieldAlert, Zap } from 'lucide-react';
import type { MejaPembohongMode, RoomDoc } from '@/lib/games/types';
import { defaultMejaPembohongSettings } from '@/lib/games/meja-pembohong/engine';
import { updateMejaPembohongSettings } from '@/lib/platform/room-service';

interface MejaPembohongLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

export function MejaPembohongLobbySettings({
  room,
  isHost,
}: MejaPembohongLobbySettingsProps) {
  const settings = room.mejaPembohongSettings ?? defaultMejaPembohongSettings();
  const [saving, setSaving] = useState(false);

  const handleModeChange = async (mode: MejaPembohongMode) => {
    if (!isHost || saving || settings.mode === mode) return;
    setSaving(true);
    try {
      await updateMejaPembohongSettings({
        roomId: room.id,
        settings: { mode },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-400" />
            Aturan Meja Pembohong
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {isHost
              ? 'Pilih mode taruhan sebelum memulai permainan.'
              : 'Menunggu Host memilih mode permainan.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          disabled={!isHost || saving}
          onClick={() => void handleModeChange('silinder')}
          className={`text-left rounded-xl p-4 border transition-all min-h-[88px] ${
            settings.mode === 'silinder'
              ? 'bg-rose-500/15 border-rose-400/70 ring-1 ring-rose-400/30'
              : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
          } disabled:opacity-75`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>Silinder 1/6 (Klasik)</span>
          </div>
          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
            Yang gagal gertak atau salah tuduh menarik pelatuk silinder 1/6. Bertahan hingga pemain terakhir (+4 poin juara)!
          </p>
        </button>

        <button
          type="button"
          disabled={!isHost || saving}
          onClick={() => void handleModeChange('cepat')}
          className={`text-left rounded-xl p-4 border transition-all min-h-[88px] ${
            settings.mode === 'cepat'
              ? 'bg-amber-500/15 border-amber-400/70 ring-1 ring-amber-400/30'
              : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
          } disabled:opacity-75`}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Skor Cepat (5 Tangan)</span>
          </div>
          <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
            Tanpa eliminasi! Setiap duel BOHONG berhadiah +2 poin langsung selama 5 tangan. Poin tertinggi menang!
          </p>
        </button>
      </div>

      <div className="rounded-xl bg-[#0B1018] border border-slate-800/90 p-3.5 text-xs text-slate-300 space-y-1">
        <p className="font-semibold text-white">Komposisi Dek Rahasia:</p>
        <p className="text-slate-400 leading-relaxed">
          Raja (👑), Ratu (♦), As (♠), dan <strong className="text-violet-300">Joker (★)</strong> sebagai kartu bebas yang selalu cocok di meja mana pun. Setiap pemain menerima 5 kartu per tangan.
        </p>
      </div>
    </div>
  );
}
