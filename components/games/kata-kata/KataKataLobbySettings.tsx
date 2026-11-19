'use client';

import React, { useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { mergeWordPairPool, sanitizeCustomWordPair } from '@/lib/games/kata-kata/engine';
import { WORD_PACKS } from '@/lib/games/kata-kata/words-id';
import type { CustomWordPair, RoomDoc, SpyMode } from '@/lib/games/types';
import { updateKataKataSettings } from '@/lib/platform/room-service';

interface KataKataLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

const DURATION_OPTIONS = [
  { label: '4 Menit', sec: 240 },
  { label: '6 Menit', sec: 360 },
  { label: '8 Menit', sec: 480 },
  { label: '10 Menit', sec: 600 },
];

const SPY_MODE_OPTIONS: { id: SpyMode; label: string; hint: string }[] = [
  { id: 'single', label: '1 Penyusup', hint: 'Klasik untuk 3–8 pemain' },
  { id: 'double', label: '2 Penyusup', hint: 'Aktif otomatis jika ≥5 pemain' },
  { id: 'random', label: 'Acak (1–2)', hint: 'Jumlah penyusup rahasia (≥5 pemain bisa 2)' },
];

export function KataKataLobbySettings({ room, isHost }: KataKataLobbySettingsProps) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [citizenWord, setCitizenWord] = useState('');
  const [spyWord, setSpyWord] = useState('');
  const [category, setCategory] = useState('Kustom');

  const customWordPairs = room.customWordPairs ?? [];
  const activePool = mergeWordPairPool(room.enabledPacks, customWordPairs);

  const persistUpdate = async (patch: {
    roundDurationSec?: number;
    spyMode?: SpyMode;
    enabledPacks?: string[];
    customWordPairs?: CustomWordPair[];
  }) => {
    if (!isHost) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateKataKataSettings({
        roomId: room.id,
        roundDurationSec: patch.roundDurationSec ?? room.roundDurationSec,
        spyMode: patch.spyMode ?? room.spyMode,
        enabledPacks: patch.enabledPacks ?? room.enabledPacks,
        customWordPairs: patch.customWordPairs ?? customWordPairs,
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePack = (packId: string) => {
    if (!isHost) return;
    const exists = room.enabledPacks.includes(packId);
    const next = exists
      ? room.enabledPacks.filter((p) => p !== packId)
      : [...room.enabledPacks, packId];

    if (next.length === 0 && customWordPairs.length === 0) {
      setFeedback('Minimal 1 paket kata atau 1 pasangan kata kustom harus aktif.');
      return;
    }
    void persistUpdate({ enabledPacks: next.length > 0 ? next : room.enabledPacks });
  };

  const handleAddCustomPair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost) return;
    setFeedback(null);

    const sanitized = sanitizeCustomWordPair({
      citizenWord,
      spyWord,
      category,
    });

    if (!sanitized) {
      setFeedback('Isi Kata Warga dan Kata Penyusup yang berbeda satu sama lain.');
      return;
    }

    if (customWordPairs.length >= 30) {
      setFeedback('Maksimal 30 pasangan kata kustom per ruang.');
      return;
    }

    await persistUpdate({ customWordPairs: [...customWordPairs, sanitized] });
    setCitizenWord('');
    setSpyWord('');
  };

  const handleRemoveCustomPair = (id: string) => {
    if (!isHost) return;
    const next = customWordPairs.filter((pair) => pair.id !== id);
    void persistUpdate({ customWordPairs: next });
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Settings2 className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-white">Pengaturan Kata-Kata Hari Ini</h2>
            <p className="text-xs text-slate-400">
              {isHost
                ? 'Atur durasi, mode Multi-Spy, paket kata, atau tambah pasangan kata kustom.'
                : 'Hanya Host yang dapat mengubah pengaturan permainan.'}
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
          {activePool.length} Pasang Kata
        </span>
      </div>

      {feedback && (
        <div className="rounded-xl bg-rose-950/50 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200">
          {feedback}
        </div>
      )}

      {/* Duration & Multi-Spy Mode */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">Durasi Ronde</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((opt) => {
              const active = room.roundDurationSec === opt.sec;
              return (
                <button
                  key={opt.sec}
                  type="button"
                  disabled={!isHost || saving}
                  onClick={() => void persistUpdate({ roundDurationSec: opt.sec })}
                  className={`min-h-[44px] px-3 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-amber-500 border-amber-400 text-slate-950 font-semibold'
                      : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                  } disabled:opacity-60`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">Mode Multi-Spy (Penyusup)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {SPY_MODE_OPTIONS.map((opt) => {
              const active = room.spyMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!isHost || saving}
                  onClick={() => void persistUpdate({ spyMode: opt.id })}
                  title={opt.hint}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors ${
                    active
                      ? 'bg-amber-500 border-amber-400 text-slate-950 font-semibold'
                      : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                  } disabled:opacity-60`}
                >
                  <span className="block truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            Mode 2 Penyusup otomatis aktif saat pemain berjumlah minimal 5 orang.
          </p>
        </div>
      </div>

      {/* Built-in Word Packs */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-300">Paket Kata Indonesia</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {WORD_PACKS.map((pack) => {
            const active = room.enabledPacks.includes(pack.id);
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!isHost || saving}
                onClick={() => handleTogglePack(pack.id)}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-emerald-950/30 border-emerald-600/70 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400 hover:border-slate-700'
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{pack.label}</span>
                  <span className="text-[11px] font-medium text-emerald-400">
                    {active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-snug">{pack.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Word-Pair Builder */}
      <div className="pt-4 border-t border-slate-800 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Pembuat Pasangan Kata Kustom</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Buat pasangan dua kata mirip versi tongkronganmu. Server akan mengacak secara adil kata mana yang menjadi milik Warga.
          </p>
        </div>

        {isHost && (
          <form onSubmit={handleAddCustomPair} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                maxLength={60}
                value={citizenWord}
                onChange={(e) => setCitizenWord(e.target.value)}
                placeholder="Kata A (mis. Nasi Padang)"
                className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                maxLength={60}
                value={spyWord}
                onChange={(e) => setSpyWord(e.target.value)}
                placeholder="Kata B (mis. Warteg)"
                className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
              <input
                type="text"
                maxLength={32}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Kategori"
                className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pasangan Kata</span>
            </button>
          </form>
        )}

        {customWordPairs.length > 0 && (
          <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
            {customWordPairs.map((pair) => (
              <div key={pair.id} className="p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    <span>{pair.citizenWord}</span>
                    <span className="text-xs text-slate-500">↔</span>
                    <span>{pair.spyWord}</span>
                    <span className="text-xs font-normal text-slate-400">· {pair.category}</span>
                  </div>
                </div>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomPair(pair.id)}
                    aria-label={`Hapus pasangan ${pair.citizenWord} dan ${pair.spyWord}`}
                    className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 shrink-0 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
