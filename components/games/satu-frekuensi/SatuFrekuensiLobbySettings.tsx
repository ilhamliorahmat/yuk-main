'use client';

import React, { useState } from 'react';
import { Check, Plus, Sliders, Trash2 } from 'lucide-react';
import { sanitizeCustomSpectrum } from '@/lib/games/satu-frekuensi/engine';
import { BUILTIN_SPECTRUMS_ID, SPECTRUM_PACKS } from '@/lib/games/satu-frekuensi/spectrums-id';
import type { CustomSpectrum, RoomDoc } from '@/lib/games/types';
import { updateSatuFrekuensiSettings } from '@/lib/platform/room-service';

interface SatuFrekuensiLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

export function SatuFrekuensiLobbySettings({
  room,
  isHost,
}: SatuFrekuensiLobbySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [leftLabel, setLeftLabel] = useState('');
  const [rightLabel, setRightLabel] = useState('');
  const [category, setCategory] = useState('Kustom');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledPacks = room.enabledPacks ?? ['tongkrongan', 'kuliner'];
  const customSpectrums = room.customSpectrums ?? [];

  const saveSettings = async (nextPacks: string[], nextCustom: CustomSpectrum[]) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateSatuFrekuensiSettings({
        roomId: room.id,
        enabledPacks: nextPacks,
        customSpectrums: nextCustom,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy(false);
    }
  };

  const togglePack = (packId: string) => {
    if (!isHost || busy) return;
    const exists = enabledPacks.includes(packId);
    const next = exists
      ? enabledPacks.filter((id) => id !== packId)
      : [...enabledPacks, packId];
    if (next.length === 0 && customSpectrums.length === 0) {
      setErrorMsg('Minimal 1 paket spektrum harus aktif.');
      return;
    }
    void saveSettings(next, customSpectrums);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost || busy) return;
    const sanitized = sanitizeCustomSpectrum({ leftLabel, rightLabel, category });
    if (!sanitized) {
      setErrorMsg('Isi kedua kutub spektrum dengan teks berbeda.');
      return;
    }
    if (customSpectrums.length >= 25) {
      setErrorMsg('Maksimal 25 spektrum kustom per ruang.');
      return;
    }
    const nextCustom = [...customSpectrums, sanitized];
    setLeftLabel('');
    setRightLabel('');
    void saveSettings(enabledPacks, nextCustom);
  };

  const handleRemoveCustom = (id: string) => {
    if (!isHost || busy) return;
    const nextCustom = customSpectrums.filter((item) => item.id !== id);
    void saveSettings(enabledPacks, nextCustom);
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Pengaturan Satu Frekuensi</h2>
        </div>
        <span className="text-xs text-slate-400">Waktu Bebas · Kontrol Host</span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Spectrum Packs */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-300">Paket Spektrum Indonesia</p>
        <div className="space-y-2">
          {SPECTRUM_PACKS.map((pack) => {
            const active = enabledPacks.includes(pack.id);
            const count = BUILTIN_SPECTRUMS_ID.filter((s) => s.packId === pack.id).length;
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!isHost || busy}
                onClick={() => togglePack(pack.id)}
                className={`w-full text-left rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors ${
                  active
                    ? 'bg-cyan-950/30 border-cyan-500/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{pack.label}</span>
                    <span className="text-xs font-mono-tabular text-slate-400">
                      ({count} spektrum)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {pack.description}
                  </p>
                </div>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                    active
                      ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                      : 'border-slate-700 bg-[#131A24]'
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Spectrum Builder */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Spektrum Kustom Ruang Ini</p>
          <span className="text-xs font-mono-tabular text-slate-400">
            {customSpectrums.length}/25
          </span>
        </div>

        {isHost && (
          <form onSubmit={handleAddCustom} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                maxLength={42}
                value={leftLabel}
                onChange={(e) => setLeftLabel(e.target.value)}
                placeholder="Kutub Kiri (mis. Anak Rumahan)"
                className="min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                maxLength={42}
                value={rightLabel}
                onChange={(e) => setRightLabel(e.target.value)}
                placeholder="Kutub Kanan (mis. Anak Nongkrong)"
                className="min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={32}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Kategori (opsional)"
                className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={busy || !leftLabel.trim() || !rightLabel.trim()}
                className="min-h-[42px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>
          </form>
        )}

        {customSpectrums.length > 0 ? (
          <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800 max-h-44 overflow-y-auto">
            {customSpectrums.map((item) => (
              <div
                key={item.id}
                className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">
                    {item.leftLabel} ↔ {item.rightLabel}
                  </p>
                  <p className="text-[11px] text-slate-400">{item.category}</p>
                </div>
                {isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemoveCustom(item.id)}
                    aria-label={`Hapus spektrum ${item.leftLabel}`}
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Belum ada spektrum kustom. Host dapat menambahkan topik khas tongkronganmu sendiri.
          </p>
        )}
      </div>
    </section>
  );
}
