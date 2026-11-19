'use client';

import React, { useState } from 'react';
import { Check, Plus, Sliders, Trash2 } from 'lucide-react';
import {
  parseParentheticalFactText,
  sanitizeCustomFact,
} from '@/lib/games/fakta-hari-ini/engine';
import { BUILTIN_FACTS_ID, FACT_PACKS } from '@/lib/games/fakta-hari-ini/facts-id';
import type { CustomFactItem, RoomDoc } from '@/lib/games/types';
import { updateFaktaHariIniSettings } from '@/lib/platform/room-service';

interface FaktaHariIniLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

export function FaktaHariIniLobbySettings({
  room,
  isHost,
}: FaktaHariIniLobbySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [factText, setFactText] = useState('');
  const [category, setCategory] = useState('Kustom');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledPacks = room.enabledPacks ?? ['hukum_sejarah', 'nusantara'];
  const customFacts = room.customFacts ?? [];

  const saveSettings = async (nextPacks: string[], nextCustom: CustomFactItem[]) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateFaktaHariIniSettings({
        roomId: room.id,
        enabledPacks: nextPacks,
        customFacts: nextCustom,
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
    if (next.length === 0 && customFacts.length === 0) {
      setErrorMsg('Minimal 1 paket fakta harus aktif.');
      return;
    }
    void saveSettings(next, customFacts);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost || busy) return;
    const parsed = parseParentheticalFactText(factText);
    if (!parsed) {
      setErrorMsg(
        'Tulis fakta dengan bagian inti di dalam tanda kurung, contoh: Di Swiss dilarang pelihara 1 marmut karena (hewan sosial yang gampang kesepian).',
      );
      return;
    }
    const sanitized = sanitizeCustomFact({ ...parsed, category });
    if (!sanitized) {
      setErrorMsg('Format fakta tidak valid.');
      return;
    }
    if (customFacts.length >= 30) {
      setErrorMsg('Maksimal 30 fakta kustom per ruang.');
      return;
    }
    const nextCustom = [...customFacts, sanitized];
    setFactText('');
    void saveSettings(enabledPacks, nextCustom);
  };

  const handleRemoveCustom = (id: string) => {
    if (!isHost || busy) return;
    const nextCustom = customFacts.filter((item) => item.id !== id);
    void saveSettings(enabledPacks, nextCustom);
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-violet-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Pengaturan Fakta Hari Ini</h2>
        </div>
        <span className="text-xs text-slate-400">Waktu Bebas · Kontrol Fase</span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {/* Fact Packs */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-300">Paket Fakta Unik</p>
        <div className="space-y-2">
          {FACT_PACKS.map((pack) => {
            const active = enabledPacks.includes(pack.id);
            const count = BUILTIN_FACTS_ID.filter((f) => f.packId === pack.id).length;
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!isHost || busy}
                onClick={() => togglePack(pack.id)}
                className={`w-full text-left rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors ${
                  active
                    ? 'bg-violet-950/30 border-violet-500/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{pack.label}</span>
                    <span className="text-xs font-mono-tabular text-slate-400">
                      ({count} fakta)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {pack.description}
                  </p>
                </div>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                    active
                      ? 'bg-violet-500 border-violet-400 text-white'
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

      {/* Custom Fact Builder */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Fakta Kustom Ruang Ini</p>
          <span className="text-xs font-mono-tabular text-slate-400">
            {customFacts.length}/30
          </span>
        </div>

        {isHost && (
          <form onSubmit={handleAddCustom} className="space-y-2.5">
            <textarea
              rows={2}
              maxLength={420}
              value={factText}
              onChange={(e) => setFactText(e.target.value)}
              placeholder="Contoh: Di Swiss dilarang pelihara satu marmut karena (marmut bisa kesepian jika sendirian)."
              className="w-full p-3 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none"
            />
            <p className="text-[11px] text-slate-400">
              Letakkan bagian yang akan jadi ruang kreativitas Tim Bluffer di dalam tanda kurung{' '}
              <span className="text-violet-300 font-semibold">(seperti ini)</span>.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={32}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Kategori (opsional)"
                className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
              />
              <button
                type="submit"
                disabled={busy || !factText.trim()}
                className="min-h-[42px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>
          </form>
        )}

        {customFacts.length > 0 ? (
          <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800 max-h-48 overflow-y-auto">
            {customFacts.map((item) => (
              <div
                key={item.id}
                className="px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0 leading-relaxed">
                  <p className="text-slate-200">
                    {item.prefix}
                    <span className="text-violet-300 font-semibold">({item.twist})</span>
                    {item.suffix}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.category}</p>
                </div>
                {isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemoveCustom(item.id)}
                    aria-label="Hapus fakta kustom"
                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Belum ada fakta kustom. Host dapat menambahkan fakta nyeleneh buatan sendiri.
          </p>
        )}
      </div>
    </section>
  );
}
