'use client';

import React, { useMemo, useState } from 'react';
import {
  Backpack,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Dices,
  Heart,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Store,
  Swords,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import {
  getUlarScenarioPack,
  ULAR_HERO_CLASSES,
  ULAR_ITEM_IDS,
  ULAR_RPG_ITEMS,
} from '@/lib/games/ular-tangga/packs';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
  UlarItemId,
} from '@/lib/games/types';
import {
  leaveRoom,
  resolveUlarTanggaEncounter,
  returnUlarTanggaToLobby,
  rollUlarTanggaDice,
  startUlarTanggaRound,
  activateUlarTanggaItem,
  activateUlarTanggaSkill,
} from '@/lib/platform/room-service';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { UlarDice3D } from './UlarDice3D';
import { UlarHeroPawn } from './UlarHeroPawn';
import { UlarTanggaBoard } from './UlarTanggaBoard';
import { UlarTanggaLobbySettings } from './UlarTanggaLobbySettings';
import { UlarTanggaPlayersPanel } from './UlarTanggaPlayersPanel';

interface UlarTanggaRoomViewProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  mySecret: PlayerSecretDoc | null;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
  deviceUid?: string;
  deviceName?: string;
  onBeforeLeave: () => void;
  onExitToHub: () => void;
}

type MobileTab = 'papan' | 'obrolan' | 'pemain';

export function UlarTanggaRoomView({
  room,
  players,
  mySecret,
  messages,
  presence,
  myUid,
  myName,
  deviceUid,
  deviceName,
  onBeforeLeave,
  onExitToHub,
}: UlarTanggaRoomViewProps) {
  const actualDeviceUid = deviceUid ?? myUid;
  const actualDeviceName = deviceName ?? myName;

  const [mobileTab, setMobileTab] = useState<MobileTab>('papan');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loreDismissed, setLoreDismissed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [targetUid, setTargetUid] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = room.hostUid === actualDeviceUid;
  const activePlayersCount = players.filter((p) => !p.isBrb).length;
  const uts = room.ularTanggaState;
  const scenarioPack = getUlarScenarioPack(
    uts?.scenarioId ?? room.ularTanggaSettings?.scenarioId,
  );

  const myHero = uts?.heroesByUid[myUid] ?? null;
  const myClassMeta = myHero ? ULAR_HERO_CLASSES[myHero.heroClass] : null;
  const myBag: UlarItemId[] = mySecret?.ularBag ?? [];
  const isMyTurn = Boolean(
    room.status === 'playing' && uts && uts.currentTurnUid === myUid,
  );

  const opponents = useMemo(() => {
    if (!uts) return [];
    return Object.values(uts.heroesByUid).filter((h) => h.uid !== myUid);
  }, [uts, myUid]);

  const effectiveTargetUid = useMemo(() => {
    if (targetUid && opponents.some((o) => o.uid === targetUid)) {
      return targetUid;
    }
    return opponents[0]?.uid ?? '';
  }, [targetUid, opponents]);

  const ownedTurnCoSeat = useMemo(() => {
    if (!uts || room.status !== 'playing' || uts.currentTurnUid === myUid) {
      return null;
    }
    return (
      players.find(
        (p) =>
          p.uid === uts.currentTurnUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid,
      ) ?? null
    );
  }, [uts, room.status, myUid, players, actualDeviceUid]);

  const rankedHeroes = useMemo(() => {
    if (!uts) return [];
    return Object.values(uts.heroesByUid).sort((a, b) => {
      if (b.tile !== a.tile) return b.tile - a.tile;
      if (b.gold !== a.gold) return b.gold - a.gold;
      return b.hp - a.hp;
    });
  }, [uts]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}?room=${room.code}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const runAction = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal diproses.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    onBeforeLeave();
    try {
      await leaveRoom({
        room,
        uid: actualDeviceUid,
        displayName: actualDeviceName,
        players,
      });
    } finally {
      onExitToHub();
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col">
      {/* Top Room Header */}
      <header className="sticky top-0 z-20 bg-[#0B1018]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Ular Tangga RP · {scenarioPack.name}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono-tabular text-lg sm:text-xl font-black tracking-[0.18em] text-white">
                  {room.code}
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#131A24] border border-slate-700 hover:border-slate-500 text-xs text-slate-300 inline-flex items-center gap-1 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Tersalin' : 'Kode'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="hidden sm:inline-flex min-h-[36px] px-2.5 rounded-lg bg-[#131A24] border border-slate-700 hover:border-slate-500 text-xs text-slate-300 items-center gap-1 transition-colors"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Tautan Disalin' : 'Salin Link'}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className="min-h-[40px] px-3 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400/60 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Kisah &amp; Panduan RP</span>
              <span className="sm:hidden">Panduan</span>
              {guideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleLeave}
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-rose-600/20 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold text-slate-200 hover:text-rose-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Expandable RP Guide & Lore Drawer */}
      {guideOpen && (
        <div className="border-b border-slate-800 bg-[#111824]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="space-y-1">
              <p className="font-bold text-amber-300">Di Balik Ular Tangga RP</p>
              <p className="leading-relaxed">
                Menggabungkan keseruan klasik ular tangga Indonesia dengan petualangan RPG ringan. Setiap giliran bukan cuma soal dadu—ada HP, Koin, Skill Kelas, Item Tas rahasia, dan pilihan Roleplay bersama teman.
              </p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-emerald-300">Momen Roleplay · {scenarioPack.name}</p>
              <p className="leading-relaxed">{scenarioPack.roleplayPrompt}</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-rose-300">Aturan Pingsan (Tanpa Eliminasi)</p>
              <p className="leading-relaxed">
                Jika HP menyentuh 0, petualang tidak tersingkir dari meja! Kamu hanya mundur -8 petak, kehilangan separuh Koin, lalu langsung bangkit lagi dengan HP penuh.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden border-b border-slate-800 bg-[#0D131E] px-4 py-2 grid grid-cols-3 gap-2">
        {(
          [
            { id: 'papan', label: 'Papan & Aksi', icon: Dices },
            { id: 'pemain', label: `Petualang (${players.length})`, icon: Users },
            { id: 'obrolan', label: 'Obrolan', icon: MessageSquare },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = mobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                active
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-[#131A24] text-slate-300 border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 sm:py-6">
        {error && (
          <div className="mb-4 rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left / Main Area (8 cols) */}
          <div
            className={`lg:col-span-8 space-y-5 ${
              mobileTab !== 'papan' ? 'hidden lg:block' : ''
            }`}
          >
            {room.status === 'lobby' && (
              <>
                <UlarTanggaLobbySettings
                  room={room}
                  isHost={isHost}
                  myUid={myUid}
                  myName={myName}
                />

                {/* Preview Board in Lobby */}
                <UlarTanggaBoard
                  scenarioId={room.ularTanggaSettings?.scenarioId}
                  boardMode={room.ularTanggaSettings?.boardMode}
                  compact
                />

                {/* Host Start CTA */}
                <div className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Siap Mendaki {scenarioPack.name}?
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activePlayersCount < 2
                        ? 'Minimal 2 pemain aktif (tidak BRB) untuk memulai petualangan.'
                        : `${activePlayersCount} petualang aktif siap berebut Petak 100.`}
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={busy || activePlayersCount < 2}
                      onClick={() => runAction(() => startUlarTanggaRound({ roomId: room.id }))}
                      className="min-h-[48px] px-6 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-45 text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Mulai Petualangan</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-amber-300">
                      Menunggu Host memulai petualangan...
                    </span>
                  )}
                </div>
              </>
            )}

            {room.status !== 'lobby' && uts && (
              <>
                {/* Dismissible Scenario Prologue Banner */}
                {!loreDismissed && room.status === 'playing' && (
                  <div className="rounded-2xl bg-[#131A24] border border-amber-500/30 p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Prolog {scenarioPack.name}</span>
                      </p>
                      <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                        {scenarioPack.prologue}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLoreDismissed(true)}
                      className="shrink-0 text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg bg-[#0B1018] border border-slate-800"
                    >
                      Tutup
                    </button>
                  </div>
                )}

                {/* Round End Podium Banner */}
                {room.status === 'round_end' && (
                  <section className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-[#131A24] to-[#131A24] border border-amber-400/50 p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                          <Trophy className="w-4 h-4" />
                          <span>Petualangan Selesai · {scenarioPack.name}</span>
                        </p>
                        <h2 className="text-2xl sm:text-3xl font-black text-white">
                          {uts.winnerName ?? 'Juara'} Menaklukkan Petak 100!
                        </h2>
                      </div>

                      {isHost && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(() => startUlarTanggaRound({ roomId: room.id }))
                            }
                            className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm inline-flex items-center gap-1.5"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>Main Ronde Baru</span>
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(() => returnUlarTanggaToLobby({ roomId: room.id }))
                            }
                            className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm"
                          >
                            Kembali ke Lobi
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {rankedHeroes.map((hero, idx) => {
                        const pts = idx === 0 ? 5 : idx === 1 ? 3 : idx === 2 ? 2 : 1;
                        return (
                          <div
                            key={hero.uid}
                            className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-2 ${
                              idx === 0
                                ? 'bg-amber-500/15 border-amber-400/50'
                                : 'bg-[#0B1018] border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate">
                                #{idx + 1} {hero.displayName}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono-tabular">
                                Petak {hero.tile} · {hero.gold}G · {hero.monstersDefeated} Monster
                              </p>
                            </div>
                            <span className="font-mono-tabular text-sm font-black text-emerald-300 shrink-0">
                              +{pts} poin
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Active Turn Status, 3D Dice Stage & Latest Log */}
                {room.status === 'playing' && (
                  <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-400">
                        Giliran #{uts.turnNumber} · {uts.boardMode === 'brutal' ? 'Mode Brutal' : 'Mode Standar'}
                      </p>
                      <p className="text-base font-bold text-white">
                        {isMyTurn ? (
                          <span className="text-amber-300">
                            Giliranmu ({myName})! Pilih Skill/Item atau Lempar Dadu
                          </span>
                        ) : ownedTurnCoSeat ? (
                          <span className="text-emerald-300">
                            Giliran {ownedTurnCoSeat.displayName} (Numpang di HP ini — pilih kursinya di strip atas)
                          </span>
                        ) : (
                          <span>Menunggu langkah {uts.currentTurnName}...</span>
                        )}
                      </p>
                      {uts.lastRoll && (
                        <p className="text-xs text-slate-300 leading-snug">
                          {uts.lastRoll.summary}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      <UlarDice3D
                        value={uts.lastRoll?.dice ?? null}
                        bonus={uts.lastRoll?.bonus ?? 0}
                        rollKey={
                          uts.lastRoll
                            ? `${uts.turnNumber}-${uts.lastRoll.uid}-${uts.lastRoll.dice}-${uts.lastRoll.fromTile}`
                            : 'initial'
                        }
                        rollerName={uts.lastRoll?.displayName ?? null}
                        artStyle={scenarioPack.artStyle}
                        compact
                      />
                    </div>
                  </div>
                )}

                {/* Board */}
                <UlarTanggaBoard state={uts} />

                {/* Player Hero HUD & Turn Controls */}
                {myHero && room.status === 'playing' && (
                  <section className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-5">
                    {/* Hero Stats Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <UlarHeroPawn
                          heroClass={myHero.heroClass}
                          displayName={myHero.displayName}
                          avatarColor={myHero.avatarColor}
                          artStyle={scenarioPack.artStyle}
                          size="md"
                          isTurn={isMyTurn}
                          shielded={myHero.shielded}
                          bonusSteps={myHero.bonusSteps}
                          showInitialBadge={false}
                        />
                        <div>
                          <p className="text-xs text-slate-400">
                            Hero {myHero.displayName}
                          </p>
                          <h3 className={`text-lg font-black ${myClassMeta?.accentClass ?? 'text-white'}`}>
                            {myClassMeta?.name} · Petak {myHero.tile}
                          </h3>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-sm font-mono-tabular">
                        <span className="inline-flex items-center gap-1.5 text-rose-300 font-bold">
                          <Heart className="w-4 h-4" />
                          {myHero.hp}/{myHero.maxHp}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-amber-300 font-bold">
                          <Coins className="w-4 h-4" />
                          {myHero.gold}G
                        </span>
                        {myHero.shielded && (
                          <span className="inline-flex items-center gap-1 text-cyan-300 text-xs font-bold">
                            <Shield className="w-4 h-4" />
                            Perisai Aktif
                          </span>
                        )}
                        {myHero.bonusSteps > 0 && (
                          <span className="inline-flex items-center gap-1 text-emerald-300 text-xs font-bold">
                            <Zap className="w-4 h-4" />
                            +{myHero.bonusSteps} Langkah
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Encounter Prompt */}
                    {isMyTurn && uts.phase === 'encounter' && uts.activeEncounter && (
                      <div className="rounded-xl bg-[#0B1018] border border-amber-500/45 p-4 sm:p-5 space-y-4">
                        {uts.activeEncounter.type === 'monster' ? (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-orange-400">
                                  Hadangan Monster · Petak {uts.activeEncounter.tile}
                                </p>
                                <h4 className="text-xl font-black text-white mt-0.5">
                                  {uts.activeEncounter.monsterName}
                                </h4>
                                <p className="text-xs text-slate-300 mt-1">
                                  {uts.activeEncounter.monsterFlavor}
                                </p>
                              </div>
                              <div className="text-right font-mono-tabular text-xs shrink-0 space-y-0.5">
                                <p className="text-orange-300 font-bold">
                                  Power: {uts.activeEncounter.monsterPower}
                                </p>
                                <p className="text-rose-300">
                                  Damage: {uts.activeEncounter.monsterDamage} HP
                                </p>
                                <p className="text-amber-300">
                                  Hadiah: +{uts.activeEncounter.monsterRewardGold}G &amp; +2 Petak
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(() =>
                                  resolveUlarTanggaEncounter({
                                    roomId: room.id,
                                    actorUid: myUid,
                                    decision: 'attack',
                                  }),
                                )
                              }
                              className="w-full min-h-[48px] rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 transition-colors"
                            >
                              <Swords className="w-4 h-4" />
                              <span>
                                Lawan Monster! (Dadu 1–6 + Bonus Kelas +{myClassMeta?.combatBonus ?? 0})
                              </span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                  <Store className="w-3.5 h-3.5" />
                                  <span>{scenarioPack.merchantLabel} · Petak {uts.activeEncounter.tile}</span>
                                </p>
                                <p className="text-xs text-slate-300 mt-0.5">
                                  Beli maksimal 1 item ke Tas Rahasiamu ({myBag.length}/3 slot) atau lewati.
                                </p>
                              </div>
                              <span className="font-mono-tabular text-sm font-bold text-amber-300">
                                Koinmu: {myHero.gold}G
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {ULAR_ITEM_IDS.map((itemId) => {
                                const item = ULAR_RPG_ITEMS[itemId];
                                const canBuy = myBag.length < 3 && myHero.gold >= item.price;
                                return (
                                  <button
                                    key={itemId}
                                    type="button"
                                    disabled={busy || !canBuy}
                                    onClick={() =>
                                      runAction(() =>
                                        resolveUlarTanggaEncounter({
                                          roomId: room.id,
                                          actorUid: myUid,
                                          decision: 'buy',
                                          buyItemId: itemId,
                                        }),
                                      )
                                    }
                                    className="text-left rounded-xl p-3 border border-slate-700 bg-[#131A24] hover:border-cyan-400/70 disabled:opacity-40 transition-colors space-y-1"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-white">{item.name}</span>
                                      <span className="font-mono-tabular text-xs font-bold text-amber-300">
                                        {item.price}G
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-snug">
                                      {item.description}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                runAction(() =>
                                  resolveUlarTanggaEncounter({
                                    roomId: room.id,
                                    actorUid: myUid,
                                    decision: 'skip',
                                  }),
                                )
                              }
                              className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-colors"
                            >
                              Lewati &amp; Akhiri Giliran
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* Standard Turn Action Controls */}
                    {uts.phase === 'turn_action' && (
                      <div className="space-y-4">
                        {/* Target Selector when it's my turn & there are opponents */}
                        {isMyTurn && opponents.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-slate-400 font-semibold">
                              Sasaran Skill/Item Serang:
                            </span>
                            <select
                              value={effectiveTargetUid}
                              onChange={(e) => setTargetUid(e.target.value)}
                              className="min-h-[38px] rounded-lg bg-[#0B1018] border border-slate-700 px-3 text-xs text-white focus:outline-none focus:border-amber-400"
                            >
                              {opponents.map((opp) => (
                                <option key={opp.uid} value={opp.uid}>
                                  {opp.displayName} (Petak {opp.tile} · {opp.gold}G)
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Class Skill Card */}
                          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-white">
                                Skill: {myClassMeta?.skillName}
                              </span>
                              <span className="text-[11px] font-mono-tabular text-slate-400">
                                {myHero.skillCooldown > 0
                                  ? `Cooldown ${myHero.skillCooldown}`
                                  : 'Siap'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {myClassMeta?.skillDescription}
                            </p>
                            {isMyTurn && (
                              <div className="flex flex-wrap gap-2">
                                {myClassMeta?.needsTarget && opponents.length > 0 && (
                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      uts.usedSkillThisTurn ||
                                      myHero.skillCooldown > 0 ||
                                      !effectiveTargetUid
                                    }
                                    onClick={() =>
                                      runAction(() =>
                                        activateUlarTanggaSkill({
                                          roomId: room.id,
                                          actorUid: myUid,
                                          targetUid: effectiveTargetUid,
                                        }),
                                      )
                                    }
                                    className="flex-1 min-h-[40px] px-3 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/50 disabled:opacity-40 text-xs font-bold text-violet-200 transition-colors"
                                  >
                                    Target Lawan
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    busy || uts.usedSkillThisTurn || myHero.skillCooldown > 0
                                  }
                                  onClick={() =>
                                    runAction(() =>
                                      activateUlarTanggaSkill({
                                        roomId: room.id,
                                        actorUid: myUid,
                                        targetUid: null,
                                      }),
                                    )
                                  }
                                  className="flex-1 min-h-[40px] px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 disabled:opacity-40 text-xs font-bold text-emerald-200 transition-colors"
                                >
                                  {myClassMeta?.needsTarget ? 'Pakai ke Diri Sendiri' : 'Aktifkan Skill'}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Secret Bag (Strictly Only Visible to Owned Seat) */}
                          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-white inline-flex items-center gap-1.5">
                                <Backpack className="w-3.5 h-3.5 text-amber-400" />
                                <span>Tas Rahasia ({myBag.length}/3)</span>
                              </span>
                              <span className="text-[11px] text-slate-500">Hanya kamu yang lihat</span>
                            </div>

                            {myBag.length === 0 ? (
                              <p className="text-xs text-slate-500">
                                Tas kosong. Mampir ke Peti Harta atau Kedai untuk isi item.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {myBag.map((itemId, idx) => {
                                  const meta = ULAR_RPG_ITEMS[itemId];
                                  return (
                                    <div
                                      key={`${itemId}-${idx}`}
                                      className="flex items-center justify-between gap-2 rounded-lg bg-[#131A24] border border-slate-800 px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-white truncate">
                                          {meta.name}
                                        </p>
                                        <p className="text-[11px] text-slate-400 truncate">
                                          {meta.description}
                                        </p>
                                      </div>
                                      {isMyTurn && (
                                        <button
                                          type="button"
                                          disabled={busy || uts.usedItemThisTurn}
                                          onClick={() =>
                                            runAction(() =>
                                              activateUlarTanggaItem({
                                                roomId: room.id,
                                                actorUid: myUid,
                                                itemId,
                                                targetUid: meta.needsTarget ? effectiveTargetUid : null,
                                              }),
                                            )
                                          }
                                          className="min-h-[34px] px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs shrink-0 transition-colors"
                                        >
                                          Pakai
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Primary Roll Dice Button */}
                        {isMyTurn && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction(() =>
                                rollUlarTanggaDice({
                                  roomId: room.id,
                                  actorUid: myUid,
                                }),
                              )
                            }
                            className="w-full min-h-[52px] rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black text-base inline-flex items-center justify-center gap-2.5 shadow-lg transition-colors"
                          >
                            <Dices className="w-5 h-5" />
                            <span>
                              {busy ? 'Melempar Dadu...' : 'Lempar Dadu (1–6)'}
                              {myHero.bonusSteps > 0 ? ` + ${myHero.bonusSteps} Bonus` : ''}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Adventure Log */}
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Catatan Petualangan
                  </h3>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-slate-300">
                    {uts.eventLog.map((line, i) => (
                      <li
                        key={i}
                        className={i === 0 ? 'text-white font-semibold' : 'text-slate-400'}
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>

          {/* Right Sidebar: Players + Chat (4 cols) */}
          <aside className="lg:col-span-4 space-y-5">
            <div className={mobileTab !== 'pemain' ? 'hidden lg:block' : ''}>
              <UlarTanggaPlayersPanel
                room={room}
                players={players}
                presence={presence}
                myUid={myUid}
              />
            </div>

            <div className={mobileTab !== 'obrolan' ? 'hidden lg:block' : ''}>
              <RoomChatPanel
                roomId={room.id}
                myUid={actualDeviceUid}
                myName={actualDeviceName}
                messages={messages}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
