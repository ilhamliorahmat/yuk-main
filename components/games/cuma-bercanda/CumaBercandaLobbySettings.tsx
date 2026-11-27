'use client';

import { useState } from 'react';
import { BookOpen, CheckSquare, Plus, Sparkles, Square, Trash2 } from 'lucide-react';
import {
  BERCANDA_PACKS,
  BERCANDA_SCENE_META,
  BERCANDA_SCENES_LIST,
  defaultCumaBercandaSettings,
  sanitizeCumaBercandaSettings,
  sanitizeCustomBercandaCard,
} from '@/lib/games/cuma-bercanda/packs';
import type { BercandaPanelScene, CustomBercandaCard, RoomDoc } from '@/lib/games/types';
import { updateCumaBercandaSettings } from '@/lib/platform/room-service';

interface CumaBercandaLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
}

export function CumaBercandaLobbySettings({
  room,
  isHost,
}: CumaBercandaLobbySettingsProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [speaker, setSpeaker] = useState('');
  const [caption, setCaption] = useState('');
  const [subtext, setSubtext] = useState('');
  const [scene, setScene] = useState<BercandaPanelScene>('ngobrol_santai');

  const enabledPacks =
    room.enabledPacks && room.enabledPacks.length > 0
      ? room.enabledPacks
      : ['tongkrongan', 'kantor_kampus'];
  const customCards = room.customBercandaCards ?? [];
  const settings = sanitizeCumaBercandaSettings(
    room.cumaBercandaSettings ?? defaultCumaBercandaSettings(),
  );

  const persist = async (
    nextPacks: string[],
    nextCustom: CustomBercandaCard[],
    nextGolden: boolean,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await updateCumaBercandaSettings({
        roomId: room.id,
        enabledPacks: nextPacks,
        customCards: nextCustom,
        settings: { allowGoldenUpvote: nextGolden },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  const togglePack = (packId: string) => {
    if (!isHost || saving) return;
    const exists = enabledPacks.includes(packId);
    const next = exists
      ? enabledPacks.filter((p) => p !== packId)
      : [...enabledPacks, packId];
    if (next.length === 0) return;
    void persist(next, customCards, settings.allowGoldenUpvote);
  };

  const toggleGolden = () => {
    if (!isHost || saving) return;
    void persist(enabledPacks, customCards, !settings.allowGoldenUpvote);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHost || saving) return;
    const newCard = sanitizeCustomBercandaCard(
      {
        scene,
        speaker,
        caption,
        subtext,
      },
      customCards.length + 1,
    );
    if (!newCard) {
      setError('Dialog komik minimal 3 karakter.');
      return;
    }
    const nextCustom = [newCard, ...customCards].slice(0, 30);
    setSpeaker('');
    setCaption('');
    setSubtext('');
    void persist(enabledPacks, nextCustom, settings.allowGoldenUpvote);
  };

  const handleDeleteCustom = (id: string) => {
    if (!isHost || saving) return;
    const nextCustom = customCards.filter((c) => c.id !== id);
    void persist(enabledPacks, nextCustom, settings.allowGoldenUpvote);
  };

  return (
    <div className="space-y-4">
      {/* Golden Upvote Rule Toggle */}
      <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Golden Upvote (+3 Poin · 1x Per Sesi)
            </h4>
            <p className="text-xs text-slate-400">
              Setiap pemain mendapat tepat 1 Golden Upvote bernilai +3 poin sepanjang satu sesi permainan sebelum kembali ke lobi.
            </p>
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={toggleGolden}
              disabled={saving}
              className={`min-h-[44px] px-4 rounded-xl border text-xs font-bold transition-colors shrink-0 ${
                settings.allowGoldenUpvote
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : 'bg-[#0B1018] border-slate-700 text-slate-400'
              }`}
            >
              {settings.allowGoldenUpvote ? 'Aktif' : 'Nonaktif'}
            </button>
          ) : (
            <span className="text-xs font-bold text-amber-300 shrink-0">
              {settings.allowGoldenUpvote ? 'Aktif' : 'Nonaktif'}
            </span>
          )}
        </div>
      </div>

      {/* Pack Selection */}
      <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-400" />
            Paket Kartu Komik (90 Kartu)
          </h4>
          <span className="text-xs text-slate-400 tabular-nums">
            {enabledPacks.length} / {BERCANDA_PACKS.length} paket
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {BERCANDA_PACKS.map((pack) => {
            const active = enabledPacks.includes(pack.id);
            return (
              <button
                key={pack.id}
                type="button"
                disabled={!isHost || saving}
                onClick={() => togglePack(pack.id)}
                className={`min-h-[52px] text-left rounded-xl p-3 border transition-colors ${
                  active
                    ? 'bg-sky-500/15 border-sky-400/60 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400'
                } ${isHost ? 'hover:border-slate-600' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{pack.label}</span>
                  {active ? (
                    <CheckSquare className="w-4 h-4 text-sky-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-600 shrink-0" />
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400 leading-snug">
                  {pack.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Host Custom Card Builder */}
      {(isHost || customCards.length > 0) && (
        <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white">
              Kartu Kustom Tongkrongan ({customCards.length}/30)
            </h4>
          </div>

          {isHost && (
            <form onSubmit={handleAddCustom} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={speaker}
                  onChange={(e) => setSpeaker(e.target.value)}
                  maxLength={28}
                  placeholder="Nama Tokoh (mis. Si Ujang)"
                  className="min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
                <select
                  value={scene}
                  onChange={(e) => setScene(e.target.value as BercandaPanelScene)}
                  className="min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 px-3 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  {BERCANDA_SCENES_LIST.map((s) => (
                    <option key={s} value={s}>
                      Ekspresi: {BERCANDA_SCENE_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={120}
                placeholder="Dialog punchline komik..."
                className="w-full min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={subtext}
                  onChange={(e) => setSubtext(e.target.value)}
                  maxLength={60}
                  placeholder="Catatan tambahan (opsional)"
                  className="flex-1 min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 px-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={saving || customCards.length >= 30}
                  className="min-h-[44px] px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Tambah Kartu
                </button>
              </div>
            </form>
          )}

          {customCards.length > 0 && (
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {customCards.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#0B1018] border border-slate-800 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-sky-300">{c.speaker}: </span>
                    <span className="text-slate-200">“{c.caption}”</span>
                  </div>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustom(c.id)}
                      className="p-2 rounded-lg text-rose-400 hover:bg-rose-500/15 shrink-0"
                      title="Hapus kartu"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs font-semibold text-rose-400 px-1">{error}</p>
      )}
    </div>
  );
}
