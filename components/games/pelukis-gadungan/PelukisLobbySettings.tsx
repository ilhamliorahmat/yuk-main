'use client';

import React, { useState } from 'react';
import { Check, Plus, Sliders, Trash2 } from 'lucide-react';
import { sanitizeCustomDrawingPrompt } from '@/lib/games/pelukis-gadungan/engine';
import {
  BUILTIN_DRAWING_PROMPTS_ID,
  DRAWING_PROMPT_PACKS,
} from '@/lib/games/pelukis-gadungan/prompts-id';
import type { CustomDrawingPrompt, RoomDoc, SpyMode } from '@/lib/games/types';
import { updatePelukisGadunganSettings } from '@/lib/platform/room-service';

interface PelukisLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

const SPY_MODE_OPTIONS: Array<{ id: SpyMode; label: string; hint: string }> = [
  { id: 'single', label: '1 Gadungan', hint: 'Selalu 1 peniru' },
  { id: 'double', label: '2 Gadungan', hint: 'Jika ≥6 pemain' },
  { id: 'random', label: 'Acak', hint: '1–2 jika ≥6 pemain' },
];

export function PelukisLobbySettings({ room, isHost }: PelukisLobbySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const [wordInput, setWordInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const enabledPacks = room.enabledPacks ?? ['kuliner', 'tongkrongan', 'hewan_alam'];
  const strokeRounds: 1 | 2 = room.pelukisStrokeRounds === 1 ? 1 : 2;
  const spyMode: SpyMode = room.spyMode ?? 'single';
  const customPrompts = room.customDrawingPrompts ?? [];

  const saveSettings = async (next: {
    enabledPacks?: string[];
    spyMode?: SpyMode;
    pelukisStrokeRounds?: 1 | 2;
    customDrawingPrompts?: CustomDrawingPrompt[];
  }) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await updatePelukisGadunganSettings({
        roomId: room.id,
        enabledPacks: next.enabledPacks ?? enabledPacks,
        spyMode: next.spyMode ?? spyMode,
        pelukisStrokeRounds: next.pelukisStrokeRounds ?? strokeRounds,
        customDrawingPrompts: next.customDrawingPrompts ?? customPrompts,
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
    if (next.length === 0 && customPrompts.length === 0) {
      setErrorMsg('Minimal 1 paket tema gambar harus aktif.');
      return;
    }
    void saveSettings({ enabledPacks: next });
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost || busy) return;
    const sanitized = sanitizeCustomDrawingPrompt({
      category: categoryInput,
      word: wordInput,
    });
    if (!sanitized) {
      setErrorMsg('Isi Tema (mis. Kuliner) dan Kata Rahasia (mis. Sate Padang).');
      return;
    }
    if (customPrompts.length >= 30) {
      setErrorMsg('Maksimal 30 tema gambar kustom per ruang.');
      return;
    }
    setCategoryInput('');
    setWordInput('');
    void saveSettings({ customDrawingPrompts: [...customPrompts, sanitized] });
  };

  const handleRemoveCustom = (id: string) => {
    if (!isHost || busy) return;
    const nextCustom = customPrompts.filter((item) => item.id !== id);
    void saveSettings({ customDrawingPrompts: nextCustom });
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Pengaturan Pelukis Gadungan</h2>
        </div>
        <span className="text-xs text-slate-400">Tanpa Timer</span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {/* Stroke Rounds Per Game */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-300">Jumlah Putaran Goresan</p>
        <div className="grid grid-cols-2 gap-2">
          {([1, 2] as const).map((rounds) => {
            const active = strokeRounds === rounds;
            return (
              <button
                key={rounds}
                type="button"
                disabled={!isHost || busy}
                onClick={() => void saveSettings({ pelukisStrokeRounds: rounds })}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-emerald-950/35 border-emerald-500/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <span className="text-xs font-bold block">{rounds} Putaran</span>
                <span className="text-[11px] text-slate-400 block">
                  {rounds === 1 ? 'Cepat (1 garis/orang)' : 'Klasik (2 garis/orang)'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Gadungan Count Mode */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-300">Jumlah Pelukis Gadungan</p>
        <div className="grid grid-cols-3 gap-2">
          {SPY_MODE_OPTIONS.map((opt) => {
            const active = spyMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={!isHost || busy}
                onClick={() => void saveSettings({ spyMode: opt.id })}
                className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-emerald-950/35 border-emerald-500/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <span className="text-xs font-bold block">{opt.label}</span>
                <span className="text-[10px] text-slate-400 block">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Packs */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-300">Paket Tema Gambar</p>
        <div className="space-y-2">
          {DRAWING_PROMPT_PACKS.map((pack) => {
            const active = enabledPacks.includes(pack.id);
            const count = BUILTIN_DRAWING_PROMPTS_ID.filter((p) => p.packId === pack.id).length;
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!isHost || busy}
                onClick={() => togglePack(pack.id)}
                className={`w-full text-left rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors ${
                  active
                    ? 'bg-emerald-950/30 border-emerald-500/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{pack.label}</span>
                    <span className="text-xs font-mono-tabular text-slate-400">
                      ({count} kata)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {pack.description}
                  </p>
                </div>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                    active
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950'
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

      {/* Custom Drawing Prompts */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Tema Gambar Kustom</p>
          <span className="text-xs font-mono-tabular text-slate-400">
            {customPrompts.length}/30
          </span>
        </div>

        {isHost && (
          <form onSubmit={handleAddCustom} className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                maxLength={40}
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="Tema (mis. Kuliner)"
                className="min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                maxLength={60}
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value)}
                placeholder="Kata Rahasia (mis. Sate Padang)"
                className="min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !categoryInput.trim() || !wordInput.trim()}
              className="w-full min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Tema Kustom</span>
            </button>
          </form>
        )}

        {customPrompts.length > 0 ? (
          <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800 max-h-44 overflow-y-auto">
            {customPrompts.map((item) => (
              <div
                key={item.id}
                className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-slate-100 font-semibold truncate">{item.word}</p>
                  <p className="text-[11px] text-emerald-300 truncate">Tema: {item.category}</p>
                </div>
                {isHost && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleRemoveCustom(item.id)}
                    aria-label="Hapus tema gambar kustom"
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
            Belum ada tema kustom. Host dapat menambahkan Tema &amp; Kata Rahasia sendiri.
          </p>
        )}
      </div>
    </section>
  );
}
