'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  HeartPulse,
  LogOut,
  MessageSquare,
  Moon,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Sun,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import { MALAM_SILUMAN_ROLES, MALAM_SILUMAN_QUICK_PROMPTS_ID } from '@/lib/games/malam-siluman/roles-id';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
  WerewolfRoleId,
} from '@/lib/games/types';
import {
  advanceMalamSilumanDayPhase,
  castMalamSilumanVote,
  leaveRoom,
  resolveMalamSilumanNight,
  resolveMalamSilumanVote,
  returnMalamSilumanToLobby,
  startMalamSilumanRound,
  submitMalamSilumanHunterShot,
  submitMalamSilumanNightAction,
} from '@/lib/platform/room-service';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { MalamSilumanLobbySettings } from './MalamSilumanLobbySettings';
import { MalamSilumanPlayersPanel } from './MalamSilumanPlayersPanel';

interface MalamSilumanRoomViewProps {
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

type MobileTab = 'desa' | 'obrolan' | 'pemain';

export function MalamSilumanRoomView({
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
}: MalamSilumanRoomViewProps) {
  const actualDeviceUid = deviceUid ?? myUid;
  const actualDeviceName = deviceName ?? myName;
  const [mobileTab, setMobileTab] = useState<MobileTab>('desa');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [hiddenCardKey, setHiddenCardKey] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedNightTarget, setSelectedNightTarget] = useState<string | null>(null);
  const [selectedVoteTarget, setSelectedVoteTarget] = useState<string | null>(null);
  const [selectedHunterTarget, setSelectedHunterTarget] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const autoResolvedNightRef = useRef<string | null>(null);
  const autoResolvedVoteRef = useRef<string | null>(null);

  const isHost = room.hostUid === actualDeviceUid;
  const activePlayers = players.filter((p) => !p.isBrb);
  const activePlayersCount = activePlayers.length;
  const ms = room.malamSilumanState;
  const roundKey = `${room.id}:${room.currentRoundId}:${myUid}`;
  const isCardHidden = hiddenCardKey === roundKey;

  const myRole: WerewolfRoleId | null = mySecret?.wolfRole ?? null;
  const myRoleMeta = myRole ? MALAM_SILUMAN_ROLES[myRole] : null;
  const isMyAlive = Boolean(ms && ms.livingUids.includes(myUid));
  const isParticipant = Boolean(ms && ms.participantUids.includes(myUid));
  const hasSubmittedNight = Boolean(ms && ms.submittedNightUids.includes(myUid));
  const hasSubmittedVote = Boolean(ms && ms.submittedVoteUids.includes(myUid));

  const fellowWolfUidSet = useMemo(() => {
    const set = new Set<string>();
    for (const fw of mySecret?.fellowWolves ?? []) {
      set.add(fw.uid);
    }
    return set;
  }, [mySecret?.fellowWolves]);

  const livingPlayers = useMemo(() => {
    if (!ms) return [];
    const livingSet = new Set(ms.livingUids);
    return players.filter((p) => livingSet.has(p.uid));
  }, [ms, players]);

  const pendingCoSeatNight = useMemo(() => {
    if (!ms || room.status !== 'playing' || ms.phase !== 'night') return null;
    const submitted = new Set(ms.submittedNightUids);
    return (
      players.find(
        (p) =>
          p.uid !== myUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid &&
          ms.livingUids.includes(p.uid) &&
          !submitted.has(p.uid),
      ) ?? null
    );
  }, [ms, room.status, myUid, players, actualDeviceUid]);

  const pendingCoSeatVote = useMemo(() => {
    if (!ms || room.status !== 'playing' || ms.phase !== 'day_voting') return null;
    const submitted = new Set(ms.submittedVoteUids);
    return (
      players.find(
        (p) =>
          p.uid !== myUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid &&
          ms.livingUids.includes(p.uid) &&
          !submitted.has(p.uid),
      ) ?? null
    );
  }, [ms, room.status, myUid, players, actualDeviceUid]);

  const ownedPendingHunterSeat = useMemo(() => {
    if (!ms || room.status !== 'playing' || ms.phase !== 'hunter_revenge' || !ms.pendingHunterUid) {
      return null;
    }
    if (ms.pendingHunterUid === myUid) return null;
    return (
      players.find(
        (p) =>
          p.uid === ms.pendingHunterUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid,
      ) ?? null
    );
  }, [ms, room.status, myUid, players, actualDeviceUid]);

  // Host auto-resolves Night once all living players have submitted
  useEffect(() => {
    if (
      !isHost ||
      room.status !== 'playing' ||
      !ms ||
      ms.phase !== 'night' ||
      ms.livingUids.length === 0 ||
      ms.submittedNightUids.length < ms.livingUids.length
    ) {
      return;
    }

    const resolveKey = `${room.id}:${room.currentRoundId}:n${ms.nightNumber}`;
    if (autoResolvedNightRef.current === resolveKey) return;
    autoResolvedNightRef.current = resolveKey;

    void resolveMalamSilumanNight({
      roomId: room.id,
      hostUid: actualDeviceUid,
      hostName: actualDeviceName,
    }).catch((err) => {
      autoResolvedNightRef.current = null;
      setActionError(err instanceof Error ? err.message : 'Gagal menyelesaikan fase Malam.');
    });
  }, [isHost, room.status, room.id, room.currentRoundId, ms, actualDeviceUid, actualDeviceName]);

  // Host auto-resolves Day Vote once all living players have voted
  useEffect(() => {
    if (
      !isHost ||
      room.status !== 'playing' ||
      !ms ||
      ms.phase !== 'day_voting' ||
      ms.livingUids.length === 0 ||
      ms.submittedVoteUids.length < ms.livingUids.length
    ) {
      return;
    }

    const resolveKey = `${room.id}:${room.currentRoundId}:d${ms.dayNumber}`;
    if (autoResolvedVoteRef.current === resolveKey) return;
    autoResolvedVoteRef.current = resolveKey;

    void resolveMalamSilumanVote({
      roomId: room.id,
      hostUid: actualDeviceUid,
      hostName: actualDeviceName,
    }).catch((err) => {
      autoResolvedVoteRef.current = null;
      setActionError(err instanceof Error ? err.message : 'Gagal menghitung voting siang.');
    });
  }, [isHost, room.status, room.id, room.currentRoundId, ms, actualDeviceUid, actualDeviceName]);

  const phaseLabel =
    room.status === 'lobby'
      ? 'Lobi Desa'
      : room.status === 'round_end'
        ? 'Pengungkapan'
        : ms?.phase === 'night'
          ? `Malam #${ms.nightNumber}`
          : ms?.phase === 'dawn'
            ? `Fajar #${ms.dayNumber}`
            : ms?.phase === 'day_discussion'
              ? `Diskusi Siang #${ms.dayNumber}`
              : ms?.phase === 'day_voting'
                ? `Voting Siang #${ms.dayNumber}`
                : ms?.phase === 'hunter_revenge'
                  ? 'Tembakan Terakhir'
                  : 'Berlangsung';

  const handleCopyCode = async () => {
    await navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1600);
  };

  const handleCopyInviteLink = async () => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const url = `${baseUrl}?room=${room.code}`;
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  const handleLeave = async () => {
    onBeforeLeave();
    setActionBusy(true);
    try {
      await leaveRoom({ room, uid: actualDeviceUid, displayName: actualDeviceName, players });
    } finally {
      setActionBusy(false);
      onExitToHub();
    }
  };

  const handleStartRound = async () => {
    setActionBusy(true);
    setActionError(null);
    setSelectedNightTarget(null);
    setSelectedVoteTarget(null);
    setSelectedHunterTarget(null);
    autoResolvedNightRef.current = null;
    autoResolvedVoteRef.current = null;
    try {
      await startMalamSilumanRound({
        roomId: room.id,
        actorUid: actualDeviceUid,
        actorName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulai Malam Siluman.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitNight = async (overrideTarget?: string) => {
    const target = overrideTarget ?? selectedNightTarget;
    if (!target || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitMalamSilumanNightAction({
        roomId: room.id,
        actorUid: myUid,
        actorName: myName,
        targetUid: target,
      });
      setSelectedNightTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim aksi malam.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualResolveNight = async () => {
    if (!isHost || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await resolveMalamSilumanNight({
        roomId: room.id,
        hostUid: actualDeviceUid,
        hostName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menutup fase Malam.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdvancePhase = async (nextPhase: 'day_discussion' | 'day_voting') => {
    if (!isHost || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await advanceMalamSilumanDayPhase({
        roomId: room.id,
        hostUid: actualDeviceUid,
        hostName: actualDeviceName,
        nextPhase,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memindahkan fase.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCastVote = async (overrideTarget?: string) => {
    const target = overrideTarget ?? selectedVoteTarget;
    if (!target || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await castMalamSilumanVote({
        roomId: room.id,
        voterUid: myUid,
        voterName: myName,
        targetUid: target,
      });
      setSelectedVoteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim suara voting.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualResolveVote = async () => {
    if (!isHost || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await resolveMalamSilumanVote({
        roomId: room.id,
        hostUid: actualDeviceUid,
        hostName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghitung voting.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleHunterShot = async (skip = false) => {
    if (actionBusy) return;
    if (!skip && !selectedHunterTarget) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitMalamSilumanHunterShot({
        roomId: room.id,
        actorUid: skip && isHost && ms?.pendingHunterUid !== myUid ? actualDeviceUid : myUid,
        actorName: skip && isHost && ms?.pendingHunterUid !== myUid ? actualDeviceName : myName,
        targetUid: skip ? '' : selectedHunterTarget ?? '',
        skip,
      });
      setSelectedHunterTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal melepaskan tembakan.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnLobby = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await returnMalamSilumanToLobby({
        roomId: room.id,
        hostUid: actualDeviceUid,
        hostName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal kembali ke lobi.');
    } finally {
      setActionBusy(false);
    }
  };

  // Determine available targets during Night based on active player's secret role
  const isWolfActor = myRole === 'siluman' || myRole === 'siluman_bayangan';
  const isPowerNightRole = isWolfActor || myRole === 'penerawang' || myRole === 'tabib';
  const nightTargetCandidates = useMemo(() => {
    if (!ms) return [];
    if (isWolfActor) {
      return livingPlayers.filter((p) => !fellowWolfUidSet.has(p.uid));
    }
    if (myRole === 'penerawang') {
      return livingPlayers.filter((p) => p.uid !== myUid);
    }
    if (myRole === 'tabib') {
      return livingPlayers;
    }
    return [];
  }, [ms, isWolfActor, livingPlayers, fellowWolfUidSet, myRole, myUid]);

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col pb-20 lg:pb-8">
      {/* Compact Sticky Top HUD */}
      <header className="sticky top-0 z-30 h-14 bg-[#0B1018]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleLeave}
              aria-label="Keluar dari ruang"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl bg-[#131A24] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white shrink-0 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleCopyCode}
              className="min-h-[40px] px-3 rounded-xl bg-[#131A24] border border-slate-800 hover:border-slate-700 inline-flex items-center gap-2 shrink-0 transition-colors"
              title="Salin kode ruang"
            >
              <span className="font-mono-tabular text-sm font-bold tracking-wider text-white">
                {room.code}
              </span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            <span className="hidden sm:inline text-xs text-slate-400 whitespace-nowrap truncate">
              Yuk Main · Malam Siluman · Ronde #{room.roundNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {room.status !== 'lobby' && (
              <div className="hidden md:inline-flex min-h-[38px] px-3 rounded-xl bg-[#131A24] border border-slate-800 items-center gap-1.5 text-xs font-medium text-rose-300 whitespace-nowrap">
                <Moon className="w-3.5 h-3.5" />
                <span>{phaseLabel}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="min-h-[40px] px-3 rounded-xl bg-slate-100 hover:bg-white text-slate-900 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              {copiedLink ? 'Tersalin!' : 'Salin Tautan'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {actionError && (
          <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-4 py-3 text-xs text-rose-200">
            {actionError}
          </div>
        )}

        {ownedPendingHunterSeat && (
          <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 px-4 py-3 text-xs text-amber-200 leading-relaxed">
            <strong className="text-white">{ownedPendingHunterSeat.displayName}</strong> (kursi Numpang di HP ini) gugur sebagai <strong>Pemburu</strong>! Ketuk namanya di bilah atas untuk melepaskan Tembakan Terakhir.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Lobby / Secret Role + Night/Dawn/Day/Vote/Hunter/Reveal */}
          <div
            className={`lg:col-span-6 space-y-5 ${
              mobileTab === 'desa' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* LOBBY */}
            {room.status === 'lobby' && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-bold text-white">Lobi Malam Siluman</h1>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Bagikan kode{' '}
                      <span className="font-mono-tabular text-white font-semibold">
                        {room.code}
                      </span>{' '}
                      kepada teman. Minimal <strong className="text-white">4 pemain aktif</strong>{' '}
                      untuk memulai permainan dengan narator otomatis!
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || activePlayersCount < 4}
                      onClick={() => void handleStartRound()}
                      className="w-full min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menurunkan Malam...'
                          : activePlayersCount < 4
                            ? `Menunggu Pemain Aktif (${activePlayersCount}/4 Minimal)`
                            : 'Mulai Malam Siluman'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai Malam Siluman...
                    </div>
                  )}
                </section>

                <MalamSilumanLobbySettings
                  room={room}
                  isHost={isHost}
                  activePlayersCount={activePlayersCount}
                />
              </>
            )}

            {/* ACTIVE GAMEPLAY */}
            {room.status === 'playing' && ms && (
              <>
                {/* Secret Role Card (Tap-to-Hide) */}
                <section
                  className={`bg-[#131A24] border rounded-2xl p-5 space-y-3 ${
                    myRoleMeta?.team === 'siluman'
                      ? 'border-rose-500/50'
                      : myRoleMeta?.team === 'netral'
                        ? 'border-amber-500/50'
                        : 'border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 font-medium">
                        {phaseLabel} · {ms.livingUids.length}/{ms.participantUids.length} warga hidup
                      </p>
                      <h2 className="text-base font-bold text-white mt-0.5 truncate">
                        Identitas Rahasia ({myName})
                      </h2>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setHiddenCardKey((prev) => (prev === roundKey ? null : roundKey))
                      }
                      className="min-h-[40px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {isCardHidden ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Buka Kartu</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Sembunyikan</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isCardHidden ? (
                    <button
                      type="button"
                      onClick={() => setHiddenCardKey(null)}
                      className="w-full min-h-[92px] rounded-xl bg-[#0B1018] border border-dashed border-slate-700 hover:border-rose-400/70 p-4 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                    >
                      <Eye className="w-5 h-5 text-rose-400" />
                      <span className="text-sm font-semibold text-white">
                        Identitas Disembunyikan
                      </span>
                      <span className="text-xs text-slate-400">
                        Ketuk untuk membuka kembali saat layar aman dari teman di sebelahmu.
                      </span>
                    </button>
                  ) : !isParticipant ? (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-400 text-center">
                      Kamu sedang BRB saat ronde dimulai (menjadi penonton sampai ronde berikutnya).
                    </div>
                  ) : !mySecret || !myRoleMeta ? (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-400 text-center">
                      Memuat kartu peranmu...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div
                        className={`rounded-xl border p-4 space-y-2 ${
                          myRoleMeta.team === 'siluman'
                            ? 'bg-rose-950/35 border-rose-500/45'
                            : myRoleMeta.team === 'netral'
                              ? 'bg-amber-950/30 border-amber-500/45'
                              : 'bg-emerald-950/25 border-emerald-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span
                              className={`text-[11px] uppercase tracking-wider font-bold block ${
                                myRoleMeta.team === 'siluman'
                                  ? 'text-rose-300'
                                  : myRoleMeta.team === 'netral'
                                    ? 'text-amber-300'
                                    : 'text-emerald-300'
                              }`}
                            >
                              {myRoleMeta.teamLabel}
                            </span>
                            <span className="text-xl sm:text-2xl font-black text-white">
                              {myRoleMeta.name}
                            </span>
                          </div>
                          {!isMyAlive && (
                            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-rose-300 inline-flex items-center gap-1">
                              <Skull className="w-3.5 h-3.5" />
                              Gugur
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-200 leading-relaxed">
                          {myRoleMeta.summary}
                        </p>

                        {/* Fellow Wolves Roster for Siluman & Siluman Bayangan */}
                        {isWolfActor && (mySecret.fellowWolves?.length ?? 0) > 1 && (
                          <div className="pt-2 border-t border-rose-500/30 text-xs text-rose-200">
                            <span className="font-semibold">Rekan Kawanan Siluman: </span>
                            {mySecret.fellowWolves
                              ?.filter((fw) => fw.uid !== myUid)
                              .map(
                                (fw) =>
                                  `${fw.displayName} (${MALAM_SILUMAN_ROLES[fw.role].name})`,
                              )
                              .join(', ')}
                          </div>
                        )}

                        {/* Extra Detailed Strategy Guide ONLY for Siluman Bayangan & Tumbal */}
                        {myRoleMeta.explanationTier === 'detailed' && myRoleMeta.detailedGuide && (
                          <div className="pt-2 border-t border-slate-700/60 space-y-2">
                            <button
                              type="button"
                              onClick={() => setGuideOpen((prev) => !prev)}
                              className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-amber-200 hover:text-white transition-colors"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5" />
                                <span>Panduan Lengkap Peran Spesial</span>
                              </span>
                              {guideOpen ? (
                                <ChevronUp className="w-4 h-4 shrink-0" />
                              ) : (
                                <ChevronDown className="w-4 h-4 shrink-0" />
                              )}
                            </button>

                            {guideOpen && (
                              <div className="space-y-2 text-xs text-slate-300 leading-relaxed pt-1">
                                <ul className="list-disc pl-4 space-y-1">
                                  {myRoleMeta.detailedGuide.mechanics.map((m, i) => (
                                    <li key={i}>{m}</li>
                                  ))}
                                </ul>
                                <p className="text-amber-200 font-semibold">
                                  Syarat Menang: {myRoleMeta.detailedGuide.winCondition}
                                </p>
                                <ul className="list-disc pl-4 space-y-1 text-emerald-200/90">
                                  {myRoleMeta.detailedGuide.tips.map((t, i) => (
                                    <li key={i}>{t}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Private Seer Peek Log across nights */}
                      {myRole === 'penerawang' && (mySecret.peekHistory?.length ?? 0) > 0 && (
                        <div className="rounded-xl bg-[#0B1018] border border-cyan-500/40 p-3.5 space-y-2">
                          <p className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Catatan Teropong Pribadi</span>
                          </p>
                          <div className="space-y-1.5">
                            {mySecret.peekHistory?.map((rec) => (
                              <div
                                key={`${rec.night}-${rec.targetUid}`}
                                className="flex items-center justify-between text-xs bg-[#131A24] border border-slate-800 rounded-lg px-3 py-2"
                              >
                                <span className="text-slate-300">
                                  Malam #{rec.night}:{' '}
                                  <strong className="text-white">{rec.targetName}</strong>
                                </span>
                                <span
                                  className={`font-bold ${
                                    rec.apparentTeam === 'siluman'
                                      ? 'text-rose-400'
                                      : 'text-emerald-300'
                                  }`}
                                >
                                  {rec.apparentTeam === 'siluman' ? 'Aura Siluman' : 'Aura Warga'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* PHASE 1: NIGHT */}
                {ms.phase === 'night' && (
                  <section className="bg-[#131A24] border border-indigo-500/45 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Moon className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Malam #{ms.nightNumber} — Desa Tertidur
                          </h3>
                          <p className="text-xs text-slate-300 mt-0.5">
                            Semua pemain hidup mengirim aksi secara diam-diam agar peran spesial aman.
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-[#0B1018] border border-slate-800 text-xs font-mono-tabular font-bold text-indigo-300">
                        {ms.submittedNightUids.length}/{ms.livingUids.length} siap
                      </span>
                    </div>

                    {!isMyAlive ? (
                      <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-400 text-center">
                        {isParticipant
                          ? 'Kamu sudah gugur dan menjadi penonton. Jangan bocorkan rahasia ke pemain hidup!'
                          : 'Kamu sedang BRB ronde ini. Menunggu fajar menyingsing...'}
                      </div>
                    ) : hasSubmittedNight ? (
                      <div className="rounded-xl bg-emerald-950/35 border border-emerald-500/45 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Aksi Malam #{ms.nightNumber} sudah terkunci! Menunggu fajar...</span>
                        </div>
                        {pendingCoSeatNight && (
                          <p className="text-xs text-amber-300">
                            Kursi Numpang{' '}
                            <strong className="text-white">{pendingCoSeatNight.displayName}</strong>{' '}
                            di HP ini belum beraksi—ketuk namanya di bar atas untuk melanjutkan.
                          </p>
                        )}
                      </div>
                    ) : myRoleMeta ? (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-1">
                          <p className="text-sm font-bold text-white">{myRoleMeta.nightActionTitle}</p>
                          <p className="text-xs text-slate-300 leading-relaxed">
                            {myRoleMeta.nightActionHint}
                          </p>
                        </div>

                        {isPowerNightRole ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {nightTargetCandidates.map((candidate) => {
                                const isCooldownBlocked =
                                  myRole === 'tabib' &&
                                  mySecret?.lastProtectedUid === candidate.uid;
                                const selected = selectedNightTarget === candidate.uid;
                                return (
                                  <button
                                    key={candidate.uid}
                                    type="button"
                                    disabled={actionBusy || isCooldownBlocked}
                                    onClick={() => setSelectedNightTarget(candidate.uid)}
                                    className={`min-h-[50px] px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                                      isCooldownBlocked
                                        ? 'bg-[#0B1018]/50 border-slate-800/60 text-slate-500 opacity-50 cursor-not-allowed'
                                        : selected
                                          ? isWolfActor
                                            ? 'bg-rose-500/20 border-rose-400 text-white'
                                            : myRole === 'tabib'
                                              ? 'bg-emerald-500/20 border-emerald-400 text-white'
                                              : 'bg-cyan-500/20 border-cyan-400 text-white'
                                          : 'bg-[#0B1018] border-slate-800 hover:border-slate-600 text-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span
                                        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                                        style={{ backgroundColor: candidate.avatarColor }}
                                      >
                                        {candidate.displayName.slice(0, 1).toUpperCase()}
                                      </span>
                                      <span className="text-sm font-semibold truncate">
                                        {candidate.displayName}
                                        {candidate.uid === myUid ? ' (Diri Sendiri)' : ''}
                                      </span>
                                    </div>
                                    {isCooldownBlocked && (
                                      <span className="text-[10px] text-amber-400 shrink-0">
                                        Baru dijaga
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              type="button"
                              disabled={actionBusy || !selectedNightTarget}
                              onClick={() => void handleSubmitNight()}
                              className={`w-full min-h-[46px] rounded-xl font-bold text-sm transition-colors disabled:opacity-40 ${
                                isWolfActor
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                  : myRole === 'tabib'
                                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                              }`}
                            >
                              {actionBusy
                                ? 'Mengirim Aksi...'
                                : isWolfActor
                                  ? 'Kunci Target Mangsa'
                                  : myRole === 'tabib'
                                    ? 'Lindungi Pemain Ini'
                                    : 'Teropong Aura Pemain Ini'}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleSubmitNight('decoy')}
                            className="w-full min-h-[48px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                          >
                            <Shield className="w-4 h-4" />
                            <span>
                              {actionBusy ? 'Mengirim...' : 'Kirim Ronda Malam (Tutup Mata)'}
                            </span>
                          </button>
                        )}
                      </div>
                    ) : null}

                    {isHost && (
                      <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleManualResolveNight()}
                          className="min-h-[40px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-amber-400 text-xs font-semibold text-amber-300 transition-colors disabled:opacity-40"
                        >
                          Lanjutkan ke Fajar ({ms.submittedNightUids.length}/{ms.livingUids.length})
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* PHASE 2: DAWN */}
                {ms.phase === 'dawn' && (
                  <section className="bg-[#131A24] border border-amber-500/50 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Sun className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Berita Fajar Hari #{ms.dayNumber}
                        </p>
                        <h3 className="text-lg font-bold text-white mt-0.5">
                          {ms.lastNightSummary ?? 'Matahari terbit di Desa Malam Siluman.'}
                        </h3>
                        {ms.lastHunterSummary && (
                          <p className="text-xs text-rose-300 mt-1.5 font-semibold">
                            {ms.lastHunterSummary}
                          </p>
                        )}
                      </div>
                    </div>

                    {myRole === 'penerawang' && (mySecret?.peekHistory?.length ?? 0) > 0 && (
                      <div className="rounded-xl bg-cyan-950/30 border border-cyan-500/40 px-4 py-3 text-xs text-cyan-200">
                        <HeartPulse className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                        Cek <strong>Catatan Teropong Pribadi</strong> di kartumu di atas untuk melihat hasil peneropongan semalam!
                      </div>
                    )}

                    {isHost ? (
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleAdvancePhase('day_discussion')}
                          className="flex-1 min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors disabled:opacity-40"
                        >
                          Mulai Diskusi Siang
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleAdvancePhase('day_voting')}
                          className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-amber-400 text-amber-200 font-semibold text-sm transition-colors disabled:opacity-40"
                        >
                          Langsung Buka Voting
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center">
                        Menunggu Host membuka Diskusi Siang...
                      </p>
                    )}
                  </section>
                )}

                {/* PHASE 3: DAY DISCUSSION */}
                {ms.phase === 'day_discussion' && (
                  <section className="bg-[#131A24] border border-amber-500/40 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Sun className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Diskusi Siang #{ms.dayNumber}
                        </p>
                        <h3 className="text-base sm:text-lg font-bold text-white mt-0.5">
                          Debat &amp; Bongkar Siluman!
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {ms.lastNightSummary}
                          {ms.lastHunterSummary ? ` ${ms.lastHunterSummary}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-300 leading-relaxed">
                      Berdiskusilah lewat suara langsung atau obrolan. Waspadai pemain yang tiba-tiba mengalihkan tuduhan—atau sengaja memancing eksekusi jika <strong>Tumbal</strong> aktif!
                    </div>

                    {isHost ? (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleAdvancePhase('day_voting')}
                        className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                      >
                        <Vote className="w-4 h-4" />
                        <span>{actionBusy ? 'Membuka Voting...' : 'Mulai Voting Eksekusi'}</span>
                      </button>
                    ) : (
                      <p className="text-xs text-slate-400 text-center">
                        Menunggu Host membuka kotak suara Voting Siang...
                      </p>
                    )}
                  </section>
                )}

                {/* PHASE 4: DAY VOTING */}
                {ms.phase === 'day_voting' && (
                  <section className="bg-[#131A24] border border-amber-500/55 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Vote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Voting Eksekusi Siang #{ms.dayNumber}
                          </h3>
                          <p className="text-xs text-slate-300 mt-0.5">
                            Pilih 1 tersangka secara rahasia, atau pilih Lewati Eksekusi.
                            {myRole === 'pak_rt' ? ' (Suaramu bernilai 2x sebagai Pak RT!)' : ''}
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-[#0B1018] border border-slate-800 text-xs font-mono-tabular font-bold text-amber-300">
                        {ms.submittedVoteUids.length}/{ms.livingUids.length} suara
                      </span>
                    </div>

                    {!isMyAlive ? (
                      <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-400 text-center">
                        Pemain yang gugur atau BRB tidak memiliki hak suara. Menunggu warga hidup selesai memilih...
                      </div>
                    ) : hasSubmittedVote ? (
                      <div className="rounded-xl bg-emerald-950/35 border border-emerald-500/45 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Suaramu sudah masuk ke kotak rahasia! Menunggu warga lain...</span>
                        </div>
                        {pendingCoSeatVote && (
                          <p className="text-xs text-amber-300">
                            Kursi Numpang{' '}
                            <strong className="text-white">{pendingCoSeatVote.displayName}</strong>{' '}
                            di HP ini belum memilih—ketuk namanya di bar atas untuk memilih.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {livingPlayers
                            .filter((p) => p.uid !== myUid)
                            .map((candidate) => {
                              const selected = selectedVoteTarget === candidate.uid;
                              return (
                                <button
                                  key={candidate.uid}
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => setSelectedVoteTarget(candidate.uid)}
                                  className={`min-h-[50px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                                    selected
                                      ? 'bg-amber-500/20 border-amber-400 text-white'
                                      : 'bg-[#0B1018] border-slate-800 hover:border-slate-600 text-slate-200'
                                  }`}
                                >
                                  <span
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                                    style={{ backgroundColor: candidate.avatarColor }}
                                  >
                                    {candidate.displayName.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span className="text-sm font-semibold truncate">
                                    {candidate.displayName}
                                  </span>
                                </button>
                              );
                            })}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <button
                            type="button"
                            disabled={actionBusy || !selectedVoteTarget}
                            onClick={() => void handleCastVote()}
                            className="flex-1 min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors disabled:opacity-40"
                          >
                            {actionBusy ? 'Mengunci Suara...' : 'Kunci Pilihan Eksekusi'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleCastVote('skip')}
                            className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-sm transition-colors disabled:opacity-40"
                          >
                            Lewati Eksekusi
                          </button>
                        </div>
                      </div>
                    )}

                    {isHost && (
                      <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                        <button
                          type="button"
                          disabled={actionBusy || ms.submittedVoteUids.length === 0}
                          onClick={() => void handleManualResolveVote()}
                          className="min-h-[40px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-amber-400 text-xs font-semibold text-amber-300 transition-colors disabled:opacity-40"
                        >
                          Hitung Hasil Voting ({ms.submittedVoteUids.length}/{ms.livingUids.length})
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* PHASE 5: HUNTER REVENGE SHOT */}
                {ms.phase === 'hunter_revenge' && (
                  <section className="bg-[#131A24] border border-rose-500/60 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Crosshair className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                          Tembakan Terakhir Pemburu
                        </p>
                        <h3 className="text-lg font-bold text-white mt-0.5">
                          {ms.pendingHunterName} Gugur Sebagai Pemburu!
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          Sebelum menghembuskan napas terakhir, ia boleh menembak 1 pemain hidup untuk ikut gugur.
                        </p>
                      </div>
                    </div>

                    {ms.pendingHunterUid === myUid ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {livingPlayers.map((candidate) => {
                            const selected = selectedHunterTarget === candidate.uid;
                            return (
                              <button
                                key={candidate.uid}
                                type="button"
                                disabled={actionBusy}
                                onClick={() => setSelectedHunterTarget(candidate.uid)}
                                className={`min-h-[50px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                                  selected
                                    ? 'bg-rose-500/20 border-rose-400 text-white'
                                    : 'bg-[#0B1018] border-slate-800 hover:border-slate-600 text-slate-200'
                                }`}
                              >
                                <span
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                                  style={{ backgroundColor: candidate.avatarColor }}
                                >
                                  {candidate.displayName.slice(0, 1).toUpperCase()}
                                </span>
                                <span className="text-sm font-semibold truncate">
                                  {candidate.displayName}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <button
                            type="button"
                            disabled={actionBusy || !selectedHunterTarget}
                            onClick={() => void handleHunterShot(false)}
                            className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-colors disabled:opacity-40"
                          >
                            {actionBusy ? 'Menembak...' : 'Lepaskan Tembakan Terakhir!'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleHunterShot(true)}
                            className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold text-sm transition-colors disabled:opacity-40"
                          >
                            Tahan Tembakan
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-300 text-center">
                          Menunggu <strong className="text-white">{ms.pendingHunterName}</strong>{' '}
                          membidik Tembakan Terakhirnya...
                        </div>
                        {isHost && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleHunterShot(true)}
                            className="w-full min-h-[42px] rounded-xl bg-[#0B1018] border border-slate-700 hover:border-rose-400 text-xs font-semibold text-rose-300 transition-colors disabled:opacity-40"
                          >
                            Host: Lewati Tembakan (Jika Pemburu Offline)
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {/* ROUND END: FULL ROLE REVEAL */}
            {room.status === 'round_end' && ms && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <Trophy
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      room.lastRoundResult?.winnerTeam === 'warga'
                        ? 'text-emerald-400'
                        : room.lastRoundResult?.winnerTeam === 'tumbal'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Hasil Ronde #{room.roundNumber} · Malam Siluman
                    </p>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {room.lastRoundResult?.winnerTeam === 'warga'
                        ? 'Tim Warga Menang!'
                        : room.lastRoundResult?.winnerTeam === 'tumbal'
                          ? 'Tumbal Menang Solo! (+4 Poin)'
                          : 'Kawanan Siluman Menang!'}
                    </h2>
                    {room.lastRoundResult?.reason && (
                      <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                        {room.lastRoundResult.reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* All Roles Revealed */}
                {ms.revealedRolesByUid && (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Identitas Seluruh Penduduk
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ms.participantUids.map((uid) => {
                        const roleId = ms.revealedRolesByUid?.[uid] ?? 'warga';
                        const meta = MALAM_SILUMAN_ROLES[roleId];
                        const name = ms.participantNamesByUid[uid] ?? 'Pemain';
                        const isDead = ms.deadPlayers.some((d) => d.uid === uid);
                        return (
                          <div
                            key={uid}
                            className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-2 text-xs ${
                              meta.team === 'siluman'
                                ? 'bg-rose-950/30 border-rose-500/45 text-rose-200'
                                : meta.team === 'netral'
                                  ? 'bg-amber-950/30 border-amber-500/45 text-amber-200'
                                  : 'bg-[#131A24] border-slate-800 text-slate-200'
                            }`}
                          >
                            <span className={`font-bold truncate ${isDead ? 'opacity-75' : ''}`}>
                              {name}
                              {isDead ? ' (Gugur)' : ''}
                            </span>
                            <span className="font-semibold shrink-0">{meta.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {ms.lastVoteTally && Object.keys(ms.lastVoteTally).length > 0 && (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-2">
                    <p className="text-xs font-semibold text-slate-400">
                      Suara Voting Siang Terakhir
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(ms.lastVoteTally).map(([uid, votes]) => (
                        <span
                          key={uid}
                          className="px-2.5 py-1 rounded-lg bg-[#131A24] border border-slate-800 text-xs text-slate-200"
                        >
                          {ms.participantNamesByUid[uid] ?? 'Pemain'}:{' '}
                          <strong className="font-mono-tabular text-amber-300">{votes}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {isHost ? (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy || activePlayersCount < 4}
                      onClick={() => void handleStartRound()}
                      className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>{actionBusy ? 'Menyiapkan...' : 'Ronde Berikutnya'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleReturnLobby()}
                      className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Ubah Peran / Lobi</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center">
                    Menunggu Host memulai ronde berikutnya atau kembali ke lobi.
                  </p>
                )}
              </section>
            )}

            {/* Caution reminder if host left someone dead trying to chat */}
            {room.status === 'playing' && ms && !isMyAlive && isParticipant && (
              <div className="rounded-xl bg-amber-950/25 border border-amber-500/35 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Sebagai arwah penonton, tahan komentar yang membocorkan siapa Siluman agar ronde tetap seru!
                </span>
              </div>
            )}
          </div>

          {/* Center Column: Village Roster & Scores */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <MalamSilumanPlayersPanel
              room={room}
              players={players}
              presence={presence}
              myUid={myUid}
            />
          </div>

          {/* Right Column: RTDB / LAN Chat */}
          <div
            className={`lg:col-span-3 ${
              mobileTab === 'obrolan' ? 'block' : 'hidden lg:block'
            }`}
          >
            <RoomChatPanel
              roomId={room.id}
              myUid={myUid}
              myName={myName}
              messages={messages}
              quickPrompts={MALAM_SILUMAN_QUICK_PROMPTS_ID}
              promptLabel="Celetukan Cepat"
              emptyPlaceholder="Diskusi desa, alibi malam, atau kecurigaanmu muncul di sini!"
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang Malam Siluman"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('desa')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'desa' ? 'text-rose-400' : 'text-slate-400'
          }`}
        >
          <Moon className="w-5 h-5" />
          <span>Desa</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('obrolan')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'obrolan' ? 'text-rose-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Obrolan</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('pemain')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'pemain' ? 'text-rose-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pemain ({players.length})</span>
        </button>
      </nav>
    </div>
  );
}
