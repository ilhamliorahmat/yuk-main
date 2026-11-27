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
  Eye,
  Heart,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  ScrollText,
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
  activateUlarTanggaItem,
  activateUlarTanggaSkill,
  leaveRoom,
  resolveUlarTanggaEncounter,
  returnUlarTanggaToLobby,
  rollUlarTanggaDice,
  startUlarTanggaRound,
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
type DesktopRailTab = 'pemain' | 'obrolan' | 'catatan';
type DockDrawer = 'none' | 'skill' | 'bag';

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
  const [desktopRailTab, setDesktopRailTab] = useState<DesktopRailTab>('pemain');
  const [mobileDockDrawer, setMobileDockDrawer] = useState<DockDrawer>('none');
  const [showLobbyPreview, setShowLobbyPreview] = useState(false);
  const [showPrologue, setShowPrologue] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
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

  const renderSkillAndBagBody = (mode: 'mobile' | 'desktop') => {
    if (!myHero || !uts || uts.phase !== 'turn_action') return null;
    const showSkill = mode === 'desktop' || mobileDockDrawer === 'skill';
    const showBag = mode === 'desktop' || mobileDockDrawer === 'bag';
    if (!showSkill && !showBag) return null;

    return (
      <div className="space-y-3 pt-2 border-t border-slate-800/80">
        {isMyTurn && opponents.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-400 font-semibold">
              Sasaran Lawan:
            </span>
            <select
              value={effectiveTargetUid}
              onChange={(e) => setTargetUid(e.target.value)}
              className="flex-1 min-w-[160px] min-h-[38px] rounded-lg bg-[#0B1018] border border-slate-700 px-2.5 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {opponents.map((opp) => (
                <option key={opp.uid} value={opp.uid}>
                  {opp.displayName} (Petak {opp.tile} · {opp.gold}G)
                </option>
              ))}
            </select>
          </div>
        )}

        {showSkill && (
          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3 space-y-2.5">
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
            <p className="text-xs text-slate-400 leading-snug">
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
        )}

        {showBag && (
          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3 space-y-2.5">
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
                          className="min-h-[36px] px-3 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-xs shrink-0 transition-colors"
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
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col">
      {/* Slim Non-Sticky Game Sub-Bar (avoids double sticky chrome under RoomControlStrip) */}
      <header className="bg-[#0B1018] border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-white truncate">
                <span className="text-amber-400">Ular Tangga RP</span>
                <span className="text-slate-500 mx-1.5">·</span>
                <span className="text-slate-200">{scenarioPack.name}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCode}
              title="Salin Kode Ruang"
              className="min-h-[32px] px-2 rounded-lg bg-[#131A24] border border-slate-800 hover:border-slate-600 text-[11px] text-slate-300 inline-flex items-center gap-1 shrink-0 transition-colors"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="font-mono-tabular font-bold">{room.code}</span>
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="hidden sm:inline-flex min-h-[32px] px-2.5 rounded-lg bg-[#131A24] border border-slate-800 hover:border-slate-600 text-[11px] text-slate-300 items-center gap-1 shrink-0 transition-colors"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Tautan Disalin' : 'Salin Link'}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              className="min-h-[36px] px-2.5 rounded-lg bg-[#131A24] border border-slate-800 hover:border-amber-400/60 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Kisah &amp; Panduan RP</span>
              <span className="sm:hidden">Panduan</span>
              {guideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleLeave}
              className="min-h-[36px] px-2.5 rounded-lg bg-slate-800/90 hover:bg-rose-600/20 border border-slate-700 hover:border-rose-500/40 text-xs font-semibold text-slate-200 hover:text-rose-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Expandable RP Guide & Lore Drawer */}
      {guideOpen && (
        <div className="border-b border-slate-800 bg-[#111824]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <div className="space-y-1">
              <p className="font-bold text-amber-300">Prolog · {scenarioPack.name}</p>
              <p className="leading-relaxed">{scenarioPack.prologue}</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-emerald-300">Momen Roleplay</p>
              <p className="leading-relaxed">{scenarioPack.roleplayPrompt}</p>
            </div>
            <div className="space-y-1">
              <p className="font-bold text-rose-300">Aturan Pingsan (Tanpa Eliminasi)</p>
              <p className="leading-relaxed">
                Jika HP menyentuh 0, petualang tidak tersingkir! Kamu mundur -8 petak, kehilangan separuh Koin, lalu bangkit lagi dengan HP penuh.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile 3-Tab Switcher */}
      <div className="lg:hidden border-b border-slate-800 bg-[#0D131E] px-3 py-1.5 grid grid-cols-3 gap-1.5">
        {(
          [
            { id: 'papan', label: room.status === 'lobby' ? 'Lobi & Hero' : 'Papan & Aksi', icon: Dices },
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
              className={`min-h-[38px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                active
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-[#131A24] text-slate-300 border border-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3 sm:py-5">
        {error && (
          <div className="mb-3 rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-2.5 text-xs sm:text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* LOBBY VIEW */}
        {room.status === 'lobby' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div
              className={`lg:col-span-8 space-y-4 ${
                mobileTab !== 'papan' ? 'hidden lg:block' : ''
              }`}
            >
              {/* Sticky Host Start Bar at top/bottom reach */}
              <div className="sticky bottom-2 z-20 lg:static bg-[#131A24]/95 backdrop-blur-md border border-amber-500/35 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl lg:shadow-none">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-white truncate">
                    Siap Mendaki {scenarioPack.name}?
                  </h2>
                  <p className="text-xs text-slate-400">
                    {activePlayersCount < 2
                      ? 'Minimal 2 pemain aktif (tidak BRB) untuk memulai.'
                      : `${activePlayersCount} petualang siap berebut Petak 100.`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLobbyPreview((v) => !v)}
                    className="lg:hidden min-h-[44px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4 text-amber-300" />
                    <span>{showLobbyPreview ? 'Tutup Peta' : 'Lihat Peta'}</span>
                  </button>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={busy || activePlayersCount < 2}
                      onClick={() => runAction(() => startUlarTanggaRound({ roomId: room.id }))}
                      className="flex-1 sm:flex-none min-h-[44px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-45 text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Mulai Petualangan</span>
                    </button>
                  ) : (
                    <span className="text-xs font-semibold text-amber-300">
                      Menunggu Host memulai...
                    </span>
                  )}
                </div>
              </div>

              <UlarTanggaLobbySettings
                room={room}
                isHost={isHost}
                myUid={myUid}
                myName={myName}
              />

              {/* Preview Board: Collapsible on Mobile, Visible on Desktop */}
              <div className={showLobbyPreview ? 'block' : 'hidden lg:block'}>
                <UlarTanggaBoard
                  scenarioId={room.ularTanggaSettings?.scenarioId}
                  boardMode={room.ularTanggaSettings?.boardMode}
                  compact
                />
              </div>
            </div>

            <aside className="lg:col-span-4 space-y-4">
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
        )}

        {/* ACTIVE GAMEPLAY & ROUND END — TABLETOP COCKPIT */}
        {room.status !== 'lobby' && uts && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* LEFT COLUMN: Turn Strip + Interactive 10x10 Board */}
            <div
              className={`lg:col-span-7 space-y-3 ${
                mobileTab !== 'papan' ? 'hidden lg:block' : ''
              }`}
            >
              {/* Compact Turn & Last Roll Strip */}
              {room.status === 'playing' && (
                <div className="rounded-xl bg-[#131A24] border border-slate-800 px-3.5 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-mono-tabular font-bold text-slate-400">
                        Giliran #{uts.turnNumber}
                      </span>
                      <span className="text-slate-600">·</span>
                      {isMyTurn ? (
                        <span className="font-black text-amber-300">
                          Giliranmu ({myName})!
                        </span>
                      ) : ownedTurnCoSeat ? (
                        <span className="font-bold text-emerald-300">
                          Giliran {ownedTurnCoSeat.displayName} (pilih kursi di strip atas)
                        </span>
                      ) : (
                        <span className="font-semibold text-white">
                          Menunggu {uts.currentTurnName}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowPrologue((v) => !v)}
                      className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{showPrologue ? 'Tutup Prolog' : 'Prolog'}</span>
                    </button>
                  </div>

                  {uts.lastRoll && (
                    <p className="text-xs text-slate-300 leading-snug">
                      {uts.lastRoll.summary}
                    </p>
                  )}

                  {showPrologue && (
                    <p className="text-xs text-slate-300 pt-1.5 border-t border-slate-800/80 leading-relaxed">
                      {scenarioPack.prologue}
                    </p>
                  )}
                </div>
              )}

              {/* Interactive Board (tap any tile to inspect) */}
              <UlarTanggaBoard state={uts} />
            </div>

            {/* RIGHT COLUMN / MOBILE BOTTOM DOCK: Command Cockpit + Tabbed Social/Log */}
            <div className="lg:col-span-5 space-y-4">
              {/* Mobile & Desktop Gameplay Cockpit (visible on desktop OR mobile 'papan' tab) */}
              <div className={mobileTab !== 'papan' ? 'hidden lg:block space-y-4' : 'space-y-3'}>
                {/* Round End Podium Banner */}
                {room.status === 'round_end' && (
                  <section className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-[#131A24] to-[#131A24] border border-amber-400/50 p-4 sm:p-5 space-y-4">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4" />
                        <span>Petualangan Selesai</span>
                      </p>
                      <h2 className="text-xl sm:text-2xl font-black text-white">
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
                          className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black text-xs sm:text-sm inline-flex items-center justify-center gap-1.5"
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
                          Ke Lobi
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      {rankedHeroes.map((hero, idx) => {
                        const pts = idx === 0 ? 5 : idx === 1 ? 3 : idx === 2 ? 2 : 1;
                        return (
                          <div
                            key={hero.uid}
                            className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 ${
                              idx === 0
                                ? 'bg-amber-500/15 border-amber-400/50'
                                : 'bg-[#0B1018] border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs sm:text-sm font-bold text-white truncate">
                                #{idx + 1} {hero.displayName}
                              </p>
                              <p className="text-[11px] text-slate-400 font-mono-tabular">
                                Petak {hero.tile} · {hero.gold}G · {hero.monstersDefeated} Monster
                              </p>
                            </div>
                            <span className="font-mono-tabular text-xs sm:text-sm font-black text-emerald-300 shrink-0">
                              +{pts} poin
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Shared Focal Encounter Stage (visible to ALL players during Monster/Shop) */}
                {room.status === 'playing' &&
                  uts.phase === 'encounter' &&
                  uts.activeEncounter && (
                    <section className="rounded-2xl bg-[#131A24] border border-amber-500/60 p-4 space-y-3 shadow-lg">
                      {uts.activeEncounter.type === 'monster' ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
                                Duel Monster · Petak {uts.activeEncounter.tile}
                              </p>
                              <h3 className="text-lg font-black text-white mt-0.5">
                                {uts.activeEncounter.monsterName}
                              </h3>
                              <p className="text-xs text-slate-300 mt-1">
                                {uts.activeEncounter.monsterFlavor}
                              </p>
                            </div>
                            <div className="text-right font-mono-tabular text-xs shrink-0 space-y-0.5">
                              <p className="text-orange-300 font-bold">
                                Power {uts.activeEncounter.monsterPower}
                              </p>
                              <p className="text-rose-300">
                                -{uts.activeEncounter.monsterDamage} HP
                              </p>
                              <p className="text-amber-300">
                                +{uts.activeEncounter.monsterRewardGold}G
                              </p>
                            </div>
                          </div>

                          {isMyTurn ? (
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
                                Lawan! (Dadu 1–6 +{myClassMeta?.combatBonus ?? 0} Kelas)
                              </span>
                            </button>
                          ) : (
                            <p className="text-xs font-semibold text-amber-200 bg-[#0B1018] border border-slate-800 rounded-xl px-3 py-2.5 text-center">
                              {uts.currentTurnName} bersiap melawan {uts.activeEncounter.monsterName}...
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                <Store className="w-3.5 h-3.5" />
                                <span>{scenarioPack.merchantLabel} · Petak {uts.activeEncounter.tile}</span>
                              </p>
                              <p className="text-xs text-slate-300 mt-0.5">
                                {isMyTurn
                                  ? `Pilih maks. 1 item ke Tas Rahasia (${myBag.length}/3 slot) atau lewati.`
                                  : `${uts.currentTurnName} sedang berbelanja item rahasia...`}
                              </p>
                            </div>
                            {isMyTurn && myHero && (
                              <span className="font-mono-tabular text-xs font-bold text-amber-300">
                                {myHero.gold}G
                              </span>
                            )}
                          </div>

                          {isMyTurn && myHero && (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                                      className="text-left rounded-xl p-2.5 border border-slate-700 bg-[#0B1018] hover:border-cyan-400/70 disabled:opacity-40 transition-colors space-y-0.5"
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
                                className="w-full min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm transition-colors"
                              >
                                Lewati &amp; Akhiri Giliran
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </section>
                  )}

                {/* Thumb-Reach Hero Command Dock (Sticky on Mobile, Top Rail on Desktop) */}
                {myHero && room.status === 'playing' && (
                  <section className="sticky bottom-2 z-20 lg:static rounded-2xl bg-[#131A24]/95 backdrop-blur-md border border-slate-700/90 p-3 sm:p-4 space-y-3 shadow-2xl lg:shadow-none">
                    {/* Compact Hero Stats Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UlarHeroPawn
                          heroClass={myHero.heroClass}
                          displayName={myHero.displayName}
                          avatarColor={myHero.avatarColor}
                          artStyle={scenarioPack.artStyle}
                          size="sm"
                          isTurn={isMyTurn}
                          shielded={myHero.shielded}
                          bonusSteps={myHero.bonusSteps}
                          showInitialBadge={false}
                        />
                        <div className="min-w-0">
                          <p className="text-[11px] text-slate-400 truncate">
                            {myHero.displayName}
                          </p>
                          <p className={`text-sm font-black truncate ${myClassMeta?.accentClass ?? 'text-white'}`}>
                            {myClassMeta?.name} · Petak {myHero.tile}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2.5 text-xs font-mono-tabular shrink-0">
                        <span className="inline-flex items-center gap-1 text-rose-300 font-bold">
                          <Heart className="w-3.5 h-3.5" />
                          {myHero.hp}/{myHero.maxHp}
                        </span>
                        <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                          <Coins className="w-3.5 h-3.5" />
                          {myHero.gold}G
                        </span>
                        {myHero.shielded && (
                          <span className="inline-flex items-center gap-0.5 text-cyan-300 font-bold" title="Perisai Aktif">
                            <Shield className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {myHero.bonusSteps > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-emerald-300 font-bold">
                            <Zap className="w-3.5 h-3.5" />+{myHero.bonusSteps}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unified 3D Dice + Primary Roll CTA Row */}
                    {uts.phase === 'turn_action' && (
                      <div className="flex items-center gap-3">
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

                        <div className="flex-1 min-w-0 space-y-2">
                          {isMyTurn ? (
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
                              className="w-full min-h-[50px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-black text-sm sm:text-base inline-flex items-center justify-center gap-2 shadow-lg transition-colors"
                            >
                              <Dices className="w-5 h-5 shrink-0" />
                              <span className="truncate">
                                {busy ? 'Melempar...' : 'Lempar Dadu (1–6)'}
                                {myHero.bonusSteps > 0 ? ` +${myHero.bonusSteps}` : ''}
                              </span>
                            </button>
                          ) : (
                            <div className="min-h-[50px] rounded-xl bg-[#0B1018] border border-slate-800 px-3 py-2 flex items-center justify-center text-center">
                              <p className="text-xs font-semibold text-slate-300">
                                {ownedTurnCoSeat
                                  ? `Pilih kursi ${ownedTurnCoSeat.displayName} di strip atas`
                                  : `Menunggu ${uts.currentTurnName}...`}
                              </p>
                            </div>
                          )}

                          {/* Mobile Quick Toggle Buttons for Skill & Bag */}
                          <div className="lg:hidden grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setMobileDockDrawer((prev) =>
                                  prev === 'skill' ? 'none' : 'skill',
                                )
                              }
                              className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center justify-between gap-1 transition-colors ${
                                mobileDockDrawer === 'skill'
                                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                  : 'bg-[#0B1018] border-slate-800 text-slate-200'
                              }`}
                            >
                              <span className="truncate">Skill</span>
                              <span className="text-[10px] font-mono-tabular text-slate-400">
                                {myHero.skillCooldown > 0 ? `CD ${myHero.skillCooldown}` : 'Siap'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setMobileDockDrawer((prev) =>
                                  prev === 'bag' ? 'none' : 'bag',
                                )
                              }
                              className={`min-h-[38px] px-2.5 rounded-lg border text-xs font-bold inline-flex items-center justify-between gap-1 transition-colors ${
                                mobileDockDrawer === 'bag'
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                  : 'bg-[#0B1018] border-slate-800 text-slate-200'
                              }`}
                            >
                              <span className="inline-flex items-center gap-1 truncate">
                                <Backpack className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>Tas</span>
                              </span>
                              <span className="text-[10px] font-mono-tabular text-slate-400">
                                {myBag.length}/3
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mobile Expandable Skill/Bag Drawer */}
                    <div className="lg:hidden">{renderSkillAndBagBody('mobile')}</div>

                    {/* Desktop Inline Skill & Bag */}
                    <div className="hidden lg:block">{renderSkillAndBagBody('desktop')}</div>
                  </section>
                )}
              </div>

              {/* Desktop Tabbed Social / Party / Adventure Log Rail */}
              <div className="hidden lg:block space-y-3">
                <div className="grid grid-cols-3 gap-1.5 bg-[#131A24] border border-slate-800 rounded-xl p-1">
                  {(
                    [
                      { id: 'pemain', label: `Petualang (${players.length})`, icon: Users },
                      { id: 'obrolan', label: `Obrolan (${messages.length})`, icon: MessageSquare },
                      { id: 'catatan', label: 'Catatan', icon: ScrollText },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    const active = desktopRailTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDesktopRailTab(tab.id)}
                        className={`min-h-[36px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                          active
                            ? 'bg-amber-400 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {desktopRailTab === 'pemain' && (
                  <UlarTanggaPlayersPanel
                    room={room}
                    players={players}
                    presence={presence}
                    myUid={myUid}
                  />
                )}

                {desktopRailTab === 'catatan' && (
                  <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[420px] overflow-y-auto overscroll-contain">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Catatan Petualangan
                    </h3>
                    <ul className="space-y-2 text-xs text-slate-300">
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
                )}
              </div>

              {/* Mobile Players + Adventure Log Tab */}
              {mobileTab === 'pemain' && (
                <div className="lg:hidden space-y-4">
                  <UlarTanggaPlayersPanel
                    room={room}
                    players={players}
                    presence={presence}
                    myUid={myUid}
                  />

                  <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Catatan Petualangan
                    </h3>
                    <ul className="space-y-1.5 text-xs text-slate-300 max-h-60 overflow-y-auto overscroll-contain">
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
                </div>
              )}

              {/* Shared Chat Panel (kept mounted for both mobile 'obrolan' tab and desktop 'obrolan' rail tab) */}
              <div
                className={
                  mobileTab === 'obrolan'
                    ? desktopRailTab === 'obrolan'
                      ? 'block'
                      : 'block lg:hidden'
                    : desktopRailTab === 'obrolan'
                      ? 'hidden lg:block'
                      : 'hidden'
                }
              >
                <RoomChatPanel
                  roomId={room.id}
                  myUid={actualDeviceUid}
                  myName={actualDeviceName}
                  messages={messages}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
