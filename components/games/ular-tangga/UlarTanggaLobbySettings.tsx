'use client';

import React, { useState } from 'react';
import {
  Check,
  Dices,
  Flame,
  Heart,
  MapPin,
  Shield,
  Sparkles,
  Swords,
} from 'lucide-react';
import {
  getUlarScenarioPack,
  sanitizeUlarTanggaSettings,
  ULAR_HERO_CLASSES,
  ULAR_HERO_CLASS_ORDER,
  ULAR_SCENARIO_ORDER,
  ULAR_SCENARIO_PACKS,
} from '@/lib/games/ular-tangga/packs';
import type {
  RoomDoc,
  UlarBoardMode,
  UlarHeroClassId,
  UlarScenarioId,
} from '@/lib/games/types';
import {
  selectUlarTanggaClass,
  updateUlarTanggaSettings,
} from '@/lib/platform/room-service';
import { UlarHeroPawn } from './UlarHeroPawn';

interface UlarTanggaLobbySettingsProps {
  room: RoomDoc;
  isHost: boolean;
  myUid: string;
  myName: string;
}

const SCENARIO_SWATCH: Record<UlarScenarioId, string> = {
  menara_nusantara: 'from-amber-500/20 via-[#15120E] to-[#11151B] border-amber-500/40',
  distrik_neon: 'from-cyan-500/20 via-[#0E1628] to-[#0B1018] border-cyan-500/40',
  pasar_mistis: 'from-violet-500/20 via-[#191229] to-[#0F0C1A] border-violet-500/40',
};

export function UlarTanggaLobbySettings({
  room,
  isHost,
  myUid,
  myName,
}: UlarTanggaLobbySettingsProps) {
  const settings = sanitizeUlarTanggaSettings(room.ularTanggaSettings);
  const activeScenario = getUlarScenarioPack(settings.scenarioId);
  const mySelectedClass = settings.classSelectionByUid[myUid] ?? 'acak';

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lobbySection, setLobbySection] = useState<'scenario' | 'hero'>('hero');

  const handleUpdateScenario = async (scenarioId: UlarScenarioId) => {
    if (!isHost || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateUlarTanggaSettings({
        roomId: room.id,
        settings: { ...settings, scenarioId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui skenario.');
    } finally {
      setSaving(false);
    }
  };

  const handleBoardMode = async (boardMode: UlarBoardMode) => {
    if (!isHost || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateUlarTanggaSettings({
        roomId: room.id,
        settings: { ...settings, boardMode },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah mode papan.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBounce = async () => {
    if (!isHost || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateUlarTanggaSettings({
        roomId: room.id,
        settings: { ...settings, exactFinishBounce: !settings.exactFinishBounce },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui aturan Petak 100.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickClass = async (heroClass: UlarHeroClassId | 'acak') => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await selectUlarTanggaClass({
        roomId: room.id,
        actorUid: myUid,
        heroClass,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memilih kelas hero.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mobile Section Toggle so Lobby fits comfortably without heavy scroll */}
      <div className="md:hidden grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setLobbySection('hero')}
          className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
            lobbySection === 'hero'
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
              : 'bg-[#131A24] border-slate-800 text-slate-300'
          }`}
        >
          1. Kelas Hero ({mySelectedClass === 'acak' ? 'Acak' : ULAR_HERO_CLASSES[mySelectedClass]?.name})
        </button>
        <button
          type="button"
          onClick={() => setLobbySection('scenario')}
          className={`min-h-[42px] rounded-xl text-xs font-bold border transition-colors ${
            lobbySection === 'scenario'
              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
              : 'bg-[#131A24] border-slate-800 text-slate-300'
          }`}
        >
          2. Skenario ({activeScenario.name})
        </button>
      </div>

      {/* 1. Bundle Pack Skenario & Art Style */}
      <section
        className={`bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 ${
          lobbySection === 'scenario' ? 'block' : 'hidden md:block'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              Skenario &amp; Aturan Papan
            </h2>
          </div>
          {!isHost && (
            <span className="text-xs text-slate-400">Diatur oleh Host</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {ULAR_SCENARIO_ORDER.map((id) => {
            const pack = ULAR_SCENARIO_PACKS[id];
            const isSelected = settings.scenarioId === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!isHost || saving}
                onClick={() => handleUpdateScenario(id)}
                className={`text-left rounded-xl p-3.5 border transition-all space-y-1.5 ${
                  isSelected
                    ? `bg-gradient-to-br ${SCENARIO_SWATCH[id]} ring-1 ring-amber-400/35`
                    : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
                } disabled:cursor-default`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-white">{pack.name}</p>
                    <p className="text-[11px] font-medium text-amber-300/90 mt-0.5">
                      {pack.genre}
                    </p>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-slate-300 leading-snug line-clamp-2">
                  {pack.prologue}
                </p>
              </button>
            );
          })}
        </div>

        {/* Selected Scenario Lore & RP Prompt Preview */}
        <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-amber-300">
              {activeScenario.name}
            </span>
            <span className="text-slate-400 text-[11px]">
              {activeScenario.ladderLabel} · {activeScenario.snakeLabel}
            </span>
          </div>
          <p className="text-xs text-cyan-300/90 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              <strong>Momen RP:</strong> {activeScenario.roleplayPrompt}
            </span>
          </p>
        </div>

        {/* Board Mode & Petak 100 Rule */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <span>Kesulitan Papan</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['standar', 'brutal'] as UlarBoardMode[]).map((mode) => {
                const active = settings.boardMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!isHost || saving}
                    onClick={() => handleBoardMode(mode)}
                    className={`min-h-[40px] rounded-lg border px-2.5 text-xs font-bold transition-colors ${
                      active
                        ? mode === 'brutal'
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200'
                          : 'bg-amber-500/20 border-amber-400 text-amber-200'
                        : 'bg-[#131A24] border-slate-800 text-slate-400 hover:text-white'
                    } disabled:cursor-default`}
                  >
                    {mode === 'standar' ? 'Standar (7 Ular)' : 'Brutal (9 Ular +1)'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-200">Pantul Balik Petak 100</p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {settings.exactFinishBounce
                  ? 'Aktif: Dadu berlebih memantul mundur.'
                  : 'Mati: Lewat 100 langsung finish.'}
              </p>
            </div>
            <button
              type="button"
              disabled={!isHost || saving}
              onClick={handleToggleBounce}
              className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-bold shrink-0 transition-colors ${
                settings.exactFinishBounce
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              } disabled:opacity-60`}
            >
              {settings.exactFinishBounce ? 'Aktif' : 'Mati'}
            </button>
          </div>
        </div>
      </section>

      {/* 2. Per-Seat Hero Class Picker */}
      <section
        className={`bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5 ${
          lobbySection === 'hero' ? 'block' : 'hidden md:block'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swords className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm sm:text-base font-bold text-white">
              Pilih Kelas Hero ({myName})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Atau ganti kursi Numpang di strip atas
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => handlePickClass('acak')}
            className={`sm:col-span-2 text-left rounded-xl p-3.5 border flex items-center justify-between gap-3 transition-all ${
              mySelectedClass === 'acak'
                ? 'bg-slate-800/90 border-amber-400/70'
                : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Dices className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Acak Saat Mulai (Default)</p>
                <p className="text-xs text-slate-400">
                  Biarkan takdir menentukan kelas petualangmu saat ronde dimulai.
                </p>
              </div>
            </div>
            {mySelectedClass === 'acak' && <Check className="w-4 h-4 text-amber-400 shrink-0" />}
          </button>

          {ULAR_HERO_CLASS_ORDER.map((cid) => {
            const cls = ULAR_HERO_CLASSES[cid];
            const isSelected = mySelectedClass === cid;
            return (
              <button
                key={cid}
                type="button"
                disabled={saving}
                onClick={() => handlePickClass(cid)}
                className={`text-left rounded-xl p-4 border space-y-2 transition-all ${
                  isSelected
                    ? 'bg-slate-800/90 border-amber-400/80 ring-1 ring-amber-400/30'
                    : 'bg-[#0B1018] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <UlarHeroPawn
                      heroClass={cid}
                      artStyle={activeScenario.artStyle}
                      size="sm"
                      showInitialBadge={false}
                      avatarColor={
                        cid === 'ksatria'
                          ? '#F59E0B'
                          : cid === 'pencuri'
                            ? '#10B981'
                            : cid === 'penyihir'
                              ? '#8B5CF6'
                              : '#06B6D4'
                      }
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${cls.accentClass}`}>
                        {cls.name}
                      </p>
                      <p className="text-[11px] text-slate-400">{cls.archetype}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono-tabular text-rose-300 shrink-0">
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5" />
                      {cls.maxHp}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-snug">
                  <strong className="text-white">{cls.skillName}:</strong> {cls.skillDescription}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                  {cls.combatBonus > 0 && (
                    <span className="inline-flex items-center gap-1 text-orange-300">
                      <Swords className="w-3 h-3" />+{cls.combatBonus} Duel
                    </span>
                  )}
                  {cls.damageReduction > 0 && (
                    <span className="inline-flex items-center gap-1 text-cyan-300">
                      <Shield className="w-3 h-3" />-{cls.damageReduction} Damage
                    </span>
                  )}
                  {cls.chestGoldBonus > 0 && <span>+{cls.chestGoldBonus}G Peti</span>}
                  {cls.ladderHealBonus > 0 && <span>+{cls.ladderHealBonus} HP Tangga</span>}
                  <span>Cooldown {cls.skillCooldown} giliran</span>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
