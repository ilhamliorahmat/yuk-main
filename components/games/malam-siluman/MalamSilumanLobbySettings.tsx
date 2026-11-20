'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  HeartPulse,
  Info,
  Moon,
  Shield,
  Sliders,
  Sparkles,
  Swords,
  Users,
} from 'lucide-react';
import {
  buildMalamSilumanDeck,
  sanitizeMalamSilumanSettings,
} from '@/lib/games/malam-siluman/engine';
import {
  MALAM_SILUMAN_OPTIONAL_ORDER,
  MALAM_SILUMAN_ROLES,
} from '@/lib/games/malam-siluman/roles-id';
import type {
  MalamSilumanRoleToggles,
  MalamSilumanSettings,
  MalamSilumanWolfCountMode,
  RoomDoc,
  WerewolfRoleId,
} from '@/lib/games/types';
import { updateMalamSilumanSettings } from '@/lib/platform/room-service';

interface MalamSilumanLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
  activePlayersCount: number;
}

const WOLF_COUNT_OPTIONS: Array<{
  id: MalamSilumanWolfCountMode;
  label: string;
  hint: string;
}> = [
  { id: 'auto', label: 'Otomatis', hint: '4–5p:1 · 6–8p:2 · 9+:3' },
  { id: 1, label: '1 Siluman', hint: 'Desa lebih aman' },
  { id: 2, label: '2 Siluman', hint: 'Butuh ≥6 pemain' },
  { id: 3, label: '3 Siluman', hint: 'Butuh ≥7 pemain' },
];

function getRoleIcon(roleId: WerewolfRoleId) {
  switch (roleId) {
    case 'siluman':
    case 'siluman_bayangan':
      return Moon;
    case 'penerawang':
      return Eye;
    case 'tabib':
      return HeartPulse;
    case 'pemburu':
      return Swords;
    case 'pak_rt':
      return Shield;
    case 'tumbal':
      return Sparkles;
    default:
      return Users;
  }
}

export function MalamSilumanLobbySettings({
  room,
  isHost,
  activePlayersCount,
}: MalamSilumanLobbySettingsProps) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedGuides, setExpandedGuides] = useState<Record<string, boolean>>({
    siluman_bayangan: true,
    tumbal: true,
  });

  const settings = useMemo(
    () => sanitizeMalamSilumanSettings(room.malamSilumanSettings),
    [room.malamSilumanSettings],
  );

  const deckPreview = useMemo(
    () => buildMalamSilumanDeck(Math.max(4, activePlayersCount), settings),
    [activePlayersCount, settings],
  );

  const deckCounts = useMemo(() => {
    const counts: Array<{ roleId: WerewolfRoleId; count: number }> = [];
    const seen = new Map<WerewolfRoleId, number>();
    for (const r of deckPreview.deck) {
      seen.set(r, (seen.get(r) ?? 0) + 1);
    }
    for (const [roleId, count] of seen.entries()) {
      counts.push({ roleId, count });
    }
    return counts;
  }, [deckPreview.deck]);

  const anyOptionalEnabled = Object.values(settings.enabledRoles).some(Boolean);

  const saveSettings = async (next: MalamSilumanSettings) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateMalamSilumanSettings({
        roomId: room.id,
        settings: next,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRole = (key: keyof MalamSilumanRoleToggles) => {
    if (!isHost || busy) return;
    void saveSettings({
      ...settings,
      enabledRoles: {
        ...settings.enabledRoles,
        [key]: !settings.enabledRoles[key],
      },
    });
  };

  const toggleGuideOpen = (roleId: string) => {
    setExpandedGuides((prev) => ({ ...prev, [roleId]: !prev[roleId] }));
  };

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Pengaturan Malam Siluman</h2>
        </div>
        <span className="text-xs text-slate-400">Narator Otomatis</span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {/* Wolf Count Mode */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-300">Jumlah Kawanan Siluman</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {WOLF_COUNT_OPTIONS.map((opt) => {
            const active = settings.wolfCountMode === opt.id;
            return (
              <button
                key={String(opt.id)}
                type="button"
                disabled={!isHost || busy}
                onClick={() =>
                  void saveSettings({
                    ...settings,
                    wolfCountMode: opt.id,
                  })
                }
                className={`min-h-[48px] px-2.5 py-2 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-rose-950/40 border-rose-500/70 text-white'
                    : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
                } disabled:opacity-75`}
              >
                <span className="text-xs font-bold block">{opt.label}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reveal Role On Death */}
      <button
        type="button"
        disabled={!isHost || busy}
        onClick={() =>
          void saveSettings({
            ...settings,
            revealRoleOnDeath: !settings.revealRoleOnDeath,
          })
        }
        className={`w-full text-left rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-colors ${
          settings.revealRoleOnDeath
            ? 'bg-amber-950/25 border-amber-500/50 text-white'
            : 'bg-[#0B1018] border-slate-800 text-slate-300 hover:border-slate-700'
        } disabled:opacity-75`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold">Buka Peran Saat Gugur</p>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            Jika aktif, peran pemain yang gugur diumumkan ke seluruh desa (lebih cepat terdeduksi).
          </p>
        </div>
        <span
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
            settings.revealRoleOnDeath
              ? 'bg-amber-500 border-amber-400 text-slate-950'
              : 'border-slate-700 bg-[#131A24]'
          }`}
        >
          {settings.revealRoleOnDeath && <Check className="w-3.5 h-3.5" />}
        </span>
      </button>

      {/* Mandatory Base Roles (Always ON) */}
      <div className="space-y-2 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Peran Wajib (Selalu Aktif)</p>
          <span className="text-[11px] text-slate-500">Dasar Permainan</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(['siluman', 'warga'] as const).map((roleId) => {
            const role = MALAM_SILUMAN_ROLES[roleId];
            const isWolf = roleId === 'siluman';
            return (
              <div
                key={roleId}
                className={`rounded-xl border p-3.5 space-y-1 ${
                  isWolf
                    ? 'bg-rose-950/20 border-rose-500/35'
                    : 'bg-emerald-950/20 border-emerald-500/35'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white">{role.name}</span>
                  <span
                    className={`text-[11px] font-semibold ${
                      isWolf ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                  >
                    Wajib
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{role.summary}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optional Toggleable Roles */}
      <div className="space-y-2.5 pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-300">Peran Opsional (Bisa Diaktifkan Host)</p>
          <span className="text-[11px] text-slate-500">Matikan semua = Klasik</span>
        </div>

        <div className="space-y-2.5">
          {MALAM_SILUMAN_OPTIONAL_ORDER.map(({ roleId, toggleKey }) => {
            const role = MALAM_SILUMAN_ROLES[roleId];
            const enabled = settings.enabledRoles[toggleKey];
            const isDetailed = role.explanationTier === 'detailed' && Boolean(role.detailedGuide);
            const isGuideOpen = Boolean(expandedGuides[roleId]);
            const Icon = getRoleIcon(roleId);

            const accentColor =
              role.team === 'siluman'
                ? 'text-rose-400'
                : role.team === 'netral'
                  ? 'text-amber-400'
                  : 'text-cyan-400';

            const activeBorder =
              role.team === 'siluman'
                ? 'bg-rose-950/25 border-rose-500/55'
                : role.team === 'netral'
                  ? 'bg-amber-950/25 border-amber-500/55'
                  : 'bg-cyan-950/20 border-cyan-500/50';

            return (
              <div
                key={roleId}
                className={`rounded-xl border transition-colors ${
                  enabled ? activeBorder : 'bg-[#0B1018] border-slate-800'
                }`}
              >
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    disabled={!isHost || busy}
                    onClick={() => handleToggleRole(toggleKey)}
                    className="flex-1 text-left flex items-start gap-2.5 min-w-0 disabled:cursor-default"
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${accentColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold text-white">{role.name}</span>
                        <span className="text-[11px] text-slate-400">· {role.teamLabel}</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{role.summary}</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!isHost || busy}
                    onClick={() => handleToggleRole(toggleKey)}
                    aria-label={`Aktifkan peran ${role.name}`}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      enabled
                        ? role.team === 'siluman'
                          ? 'bg-rose-500 border-rose-400 text-white'
                          : role.team === 'netral'
                            ? 'bg-amber-500 border-amber-400 text-slate-950'
                            : 'bg-cyan-500 border-cyan-400 text-slate-950'
                        : 'border-slate-700 bg-[#131A24]'
                    } disabled:opacity-65`}
                  >
                    {enabled && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Extra Detailed Explanation ONLY for Siluman Bayangan & Tumbal */}
                {isDetailed && role.detailedGuide && (
                  <div className="border-t border-slate-800/80 px-3.5 py-2.5 bg-[#0A0F17]/70 rounded-b-xl space-y-2.5">
                    <button
                      type="button"
                      onClick={() => toggleGuideOpen(roleId)}
                      className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-slate-200 hover:text-white transition-colors"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <BookOpen className={`w-3.5 h-3.5 ${accentColor}`} />
                        <span>Panduan Lengkap: {role.detailedGuide.tagline}</span>
                      </span>
                      {isGuideOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isGuideOpen && (
                      <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed pt-1">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Cara Kerja Peran
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            {role.detailedGuide.mechanics.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="rounded-lg bg-[#131A24] border border-slate-800 px-3 py-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                            Syarat Menang
                          </span>
                          <span className="text-slate-200">{role.detailedGuide.winCondition}</span>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 mb-1">
                            Tips Bermain
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            {role.detailedGuide.tips.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-300 mb-1">
                            Cara Menghadapi (Counterplay)
                          </p>
                          <ul className="list-disc pl-4 space-y-1">
                            {role.detailedGuide.counterplay.map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Deck Composition Preview */}
      <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-200">
            Komposisi Peran Aktif ({Math.max(4, activePlayersCount)} Pemain)
          </p>
          <span className="text-[11px] font-mono-tabular text-slate-400">
            {deckPreview.wolfTotal} Siluman
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {deckCounts.map(({ roleId, count }) => {
            const meta = MALAM_SILUMAN_ROLES[roleId];
            return (
              <span
                key={roleId}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                  meta.team === 'siluman'
                    ? 'bg-rose-950/35 border-rose-500/40 text-rose-200'
                    : meta.team === 'netral'
                      ? 'bg-amber-950/35 border-amber-500/40 text-amber-200'
                      : 'bg-[#131A24] border-slate-700 text-slate-200'
                }`}
              >
                {count}x {meta.name}
              </span>
            );
          })}
        </div>

        {!anyOptionalEnabled && (
          <div className="flex items-start gap-2 text-[11px] text-emerald-300 pt-1">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Mode Klasik Murni: hanya peran <strong>Siluman</strong> dan <strong>Warga</strong> yang aktif.
            </span>
          </div>
        )}

        {settings.enabledRoles.stealthWolf && !deckPreview.stealthWolfApplied && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300 pt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Siluman Bayangan butuh minimal <strong>2 Siluman</strong> (saat ini hanya 1 Siluman untuk {Math.max(4, activePlayersCount)} pemain), sehingga slot otomatis menjadi Siluman biasa.
            </span>
          </div>
        )}

        {deckPreview.droppedOptionalRoles.length > 0 && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300 pt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Karena jumlah pemain saat ini {Math.max(4, activePlayersCount)}, peran berikut tidak mendapat slot (minimal 1 Warga tetap dijaga):{' '}
              <strong>
                {deckPreview.droppedOptionalRoles.map((r) => MALAM_SILUMAN_ROLES[r].name).join(', ')}
              </strong>
              .
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
