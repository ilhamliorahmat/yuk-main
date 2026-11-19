'use client';

import React, { useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';
import { LOCATION_PACKS } from '@/lib/games/spyfall/locations-id';
import { mergeLocationPool, sanitizeCustomLocation } from '@/lib/games/spyfall/engine';
import type { CustomLocation, RoomDoc, SpyMode } from '@/lib/games/types';
import { updateSpyfallSettings } from '@/lib/platform/room-service';

interface LobbySettingsPanelProps {
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
  { id: 'single', label: '1 Mata-Mata', hint: 'Klasik untuk 3–8 pemain' },
  { id: 'double', label: '2 Mata-Mata', hint: 'Aktif otomatis jika ≥5 pemain' },
  { id: 'random', label: 'Acak (1–2)', hint: 'Tegang: jumlah mata-mata tak terduga' },
];

export function LobbySettingsPanel({ room, isHost }: LobbySettingsPanelProps) {
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState('Kustom');
  const [customRolesText, setCustomRolesText] = useState('');

  const activePool = mergeLocationPool(room.enabledPacks, room.customLocations);

  const persistUpdate = async (patch: {
    roundDurationSec?: number;
    spyMode?: SpyMode;
    enabledPacks?: string[];
    customLocations?: CustomLocation[];
  }) => {
    if (!isHost) return;
    setSaving(true);
    setFeedback(null);
    try {
      await updateSpyfallSettings({
        roomId: room.id,
        roundDurationSec: patch.roundDurationSec ?? room.roundDurationSec,
        spyMode: patch.spyMode ?? room.spyMode,
        enabledPacks: patch.enabledPacks ?? room.enabledPacks,
        customLocations: patch.customLocations ?? room.customLocations,
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

    if (next.length === 0 && room.customLocations.length === 0) {
      setFeedback('Minimal 1 paket lokasi atau 1 lokasi kustom harus aktif.');
      return;
    }
    void persistUpdate({ enabledPacks: next.length > 0 ? next : room.enabledPacks });
  };

  const handleAddCustomLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost) return;
    setFeedback(null);

    const parsedRoles = customRolesText
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const sanitized = sanitizeCustomLocation({
      name: customName,
      category: customCategory,
      roles: parsedRoles,
    });

    if (!sanitized) {
      setFeedback('Isi nama lokasi dan minimal 2 peran yang dipisahkan tanda koma.');
      return;
    }

    if (room.customLocations.length >= 20) {
      setFeedback('Maksimal 20 lokasi kustom per ruang.');
      return;
    }

    const nextCustom = [...room.customLocations, sanitized];
    await persistUpdate({ customLocations: nextCustom });
    setCustomName('');
    setCustomRolesText('');
  };

  const handleRemoveCustom = (id: string) => {
    if (!isHost) return;
    const nextCustom = room.customLocations.filter((loc) => loc.id !== id);
    void persistUpdate({ customLocations: nextCustom });
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Settings2 className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <h2 className="text-base font-bold text-white">Pengaturan Ronde & Peran Kustom</h2>
            <p className="text-xs text-slate-400">
              {isHost
                ? 'Atur durasi, jumlah mata-mata, dan lokasi sebelum memulai.'
                : 'Hanya Host yang dapat mengubah pengaturan permainan.'}
            </p>
          </div>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap shrink-0">
          {activePool.length} Lokasi Aktif
        </span>
      </div>

      {feedback && (
        <div className="rounded-xl bg-rose-950/50 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200">
          {feedback}
        </div>
      )}

      {/* Duration & Spy Mode */}
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
                      ? 'bg-rose-600 border-rose-500 text-white'
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
          <p className="text-xs font-semibold text-slate-300">Mode Mata-Mata</p>
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
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                  } disabled:opacity-60`}
                >
                  <span className="block truncate">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Location Packs */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-slate-300">Paket Lokasi Indonesia</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {LOCATION_PACKS.map((pack) => {
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

      {/* Custom Role & Location Generator */}
      <div className="pt-4 border-t border-slate-800 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Pembuat Lokasi & Peran Kustom</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Tambahkan tempat tongkrongan atau tema khusus beserta daftar perannya (dipisah koma).
          </p>
        </div>

        {isHost && (
          <form onSubmit={handleAddCustomLocation} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                maxLength={60}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nama Lokasi (mis. Kantor Startup)"
                className="sm:col-span-2 min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
              <input
                type="text"
                maxLength={32}
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Kategori"
                className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                maxLength={300}
                value={customRolesText}
                onChange={(e) => setCustomRolesText(e.target.value)}
                placeholder="Daftar Peran (mis. CEO, Programmer, Desainer, Magang, Barista)"
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] px-4 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Lokasi</span>
              </button>
            </div>
          </form>
        )}

        {room.customLocations.length > 0 && (
          <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
            {room.customLocations.map((loc) => (
              <div key={loc.id} className="p-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span>{loc.name}</span>
                    <span className="text-xs font-normal text-slate-400">· {loc.category}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 break-words">
                    Peran: {loc.roles.join(', ')}
                  </p>
                </div>
                {isHost && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustom(loc.id)}
                    aria-label={`Hapus lokasi ${loc.name}`}
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
