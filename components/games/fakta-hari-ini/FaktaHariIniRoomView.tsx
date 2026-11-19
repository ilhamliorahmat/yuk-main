'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { FAKTA_HARI_INI_QUICK_PROMPTS_ID } from '@/lib/games/fakta-hari-ini/facts-id';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import {
  advanceFaktaHariIniPhase,
  leaveRoom,
  returnFaktaHariIniToLobby,
  startFaktaHariIniRound,
  submitFaktaHariIniGuess,
} from '@/lib/platform/room-service';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { FaktaHariIniLobbySettings } from './FaktaHariIniLobbySettings';
import { FaktaHariIniPlayersPanel } from './FaktaHariIniPlayersPanel';

interface FaktaHariIniRoomViewProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  mySecret: PlayerSecretDoc | null;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
  onBeforeLeave: () => void;
  onExitToHub: () => void;
}

type MobileTab = 'kartu' | 'obrolan' | 'pemain';

export function FaktaHariIniRoomView({
  room,
  players,
  mySecret,
  messages,
  presence,
  myUid,
  myName,
  onBeforeLeave,
  onExitToHub,
}: FaktaHariIniRoomViewProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>('kartu');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dismissedAnnouncementKey, setDismissedAnnouncementKey] = useState<string | null>(null);
  const [hiddenCardKey, setHiddenCardKey] = useState<string | null>(null);
  const [selectedSuspectUid, setSelectedSuspectUid] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isHost = room.hostUid === myUid;
  const fakta = room.faktaState;
  const roundKey = `${room.id}:${room.currentRoundId}`;

  const isGuesser = Boolean(fakta && fakta.guesserUid === myUid);
  const isPhaseController = Boolean(fakta && fakta.phaseControllerUid === myUid);
  const isHostPlayingAsGuesser = isHost && isGuesser;

  const announcementClosed = dismissedAnnouncementKey === roundKey;
  const isFactHidden = hiddenCardKey === roundKey;

  const bluffers = players.filter((p) => p.uid !== fakta?.guesserUid);
  const potentialGuesserPoints = Math.max(1, players.length - 1);

  const phaseLabel =
    room.status === 'lobby'
      ? 'Lobi'
      : room.status === 'round_end'
        ? 'Pengungkapan Fakta'
        : fakta?.phase === 'guessing'
          ? 'Fase 2: Penebak Memilih'
          : 'Fase 1: Kartu & Diskusi Santai';

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
      await leaveRoom({ room, uid: myUid, displayName: myName, players });
    } finally {
      setActionBusy(false);
      onExitToHub();
    }
  };

  const handleStartRound = async () => {
    setActionBusy(true);
    setActionError(null);
    setSelectedSuspectUid(null);
    try {
      await startFaktaHariIniRound({ roomId: room.id, actorUid: myUid, actorName: myName });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulai ronde.');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePhaseChange = async (direction: 'advance' | 'back') => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await advanceFaktaHariIniPhase({
        roomId: room.id,
        actorUid: myUid,
        actorName: myName,
        direction,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah fase.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmGuess = async () => {
    if (!selectedSuspectUid || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitFaktaHariIniGuess({
        roomId: room.id,
        guesserUid: myUid,
        guesserName: myName,
        pickedUid: selectedSuspectUid,
      });
      setSelectedSuspectUid(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim tebakan.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnLobby = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await returnFaktaHariIniToLobby({
        roomId: room.id,
        hostUid: myUid,
        hostName: myName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal kembali ke lobi.');
    } finally {
      setActionBusy(false);
    }
  };

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
              Yuk Main · Fakta Hari Ini · Ronde #{room.roundNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {room.status !== 'lobby' && (
              <div className="hidden md:inline-flex min-h-[38px] px-3 rounded-xl bg-[#131A24] border border-slate-800 items-center gap-1.5 text-xs font-medium text-violet-300 whitespace-nowrap">
                <BookOpenCheck className="w-3.5 h-3.5" />
                <span>{phaseLabel} · Tanpa Timer</span>
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

        {/* Endless Phase Controller Bar (Host normally; random non-guesser Bluffer if Host is Penebak!) */}
        {room.status === 'playing' && fakta && (
          <section className="bg-[#131A24] border border-violet-500/45 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-violet-300 font-medium flex flex-wrap items-center gap-2">
                <span>{phaseLabel}</span>
                <span aria-hidden="true">·</span>
                <span>Penebak: {fakta.guesserName}</span>
                <span aria-hidden="true">·</span>
                <span>Pengendali Fase: {fakta.phaseControllerName}</span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {isHostPlayingAsGuesser
                  ? `Kamu sedang menjadi Penebak di ronde ini, jadi tombol Fase Selanjutnya dialihkan secara acak ke ${fakta.phaseControllerName}.`
                  : fakta.phase === 'discussion'
                    ? 'Waktu bebas untuk bercerita & berdebat! Pengendali Fase dapat menekan Fase Selanjutnya kapan pun semua sudah selesai bercerita.'
                    : `Menunggu ${fakta.guesserName} memilih siapa Pembawa Fakta Asli di antara Tim Bluffer.`}
              </p>
            </div>

            {isPhaseController ? (
              fakta.phase === 'discussion' ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handlePhaseChange('advance')}
                  className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                >
                  <span>{actionBusy ? 'Memproses...' : 'Fase Selanjutnya · Penebak Memilih'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handlePhaseChange('back')}
                  className="min-h-[44px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-xs inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Kembali ke Diskusi</span>
                </button>
              )
            ) : (
              <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                Dikendalikan oleh {fakta.phaseControllerName}
              </span>
            )}
          </section>
        )}

        {/* Responsive 12-Col Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Lobby / Announcement Card -> Fact Card / Guesser Pick / Reveal */}
          <div
            className={`lg:col-span-5 space-y-5 ${
              mobileTab === 'kartu' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* LOBBY */}
            {room.status === 'lobby' && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-bold text-white">Lobi Fakta Hari Ini</h1>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Bagikan kode{' '}
                      <span className="font-mono-tabular text-white font-semibold">
                        {room.code}
                      </span>{' '}
                      kepada teman. Minimal <strong className="text-white">3 pemain</strong>{' '}
                      (1 Penebak bergilir vs Tim Bluffer). Santai tanpa batas waktu!
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || players.length < 3}
                      onClick={() => void handleStartRound()}
                      className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyiapkan Ronde...'
                          : players.length < 3
                            ? `Menunggu Pemain (${players.length}/3 Minimal)`
                            : 'Mulai Fakta Hari Ini'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai ronde...
                    </div>
                  )}
                </section>

                <FaktaHariIniLobbySettings room={room} isHost={isHost} />
              </>
            )}

            {/* ACTIVE GAME: ANNOUNCEMENT CARD -> ROLE & FACT CARD -> GUESSING */}
            {room.status === 'playing' && fakta && (
              <AnimatePresence mode="wait">
                {!announcementClosed ? (
                  /* STEP 1: PUBLIC GUESSER ANNOUNCEMENT CARD */
                  <motion.section
                    key={`announce-${roundKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="bg-[#131A24] border border-violet-500/60 rounded-2xl p-6 text-center space-y-5"
                  >
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-950/60 border border-violet-500/50 flex items-center justify-center text-violet-300">
                      <Search className="w-7 h-7" />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-violet-300">
                        Pengumuman Ronde #{room.roundNumber}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight text-balance">
                        {fakta.guesserName} jadi Penebak!
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
                        {isGuesser
                          ? 'Giliranmu menebak! Tutup kartu ini lalu bersiap menyimak cerita dari seluruh Tim Bluffer.'
                          : `Kamu tergabung di Tim Bluffer bersama pemain lain. Tutup kartu ini untuk melihat Fakta Hari Ini dan siapa Pembawa Fakta Asli!`}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 space-y-1">
                      <p>
                        Pengendali Fase Ronde Ini:{' '}
                        <strong className="text-white">{fakta.phaseControllerName}</strong>
                      </p>
                      <p className="text-slate-400">
                        Skor: Penebak menang{' '}
                        <span className="font-mono-tabular text-amber-300 font-semibold">
                          +{potentialGuesserPoints}
                        </span>{' '}
                        · Tim Bluffer menang{' '}
                        <span className="font-mono-tabular text-violet-300 font-semibold">
                          +1 semua Bluffer
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDismissedAnnouncementKey(roundKey)}
                      className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
                    >
                      Tutup Kartu &amp; Lihat Peranku
                    </button>
                  </motion.section>
                ) : (
                  /* STEP 2: ROLE & FUN FACT CARD + GUESSING PANEL */
                  <motion.div
                    key={`play-${roundKey}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                  >
                    {isGuesser ? (
                      /* GUESSER CARD (ZERO SPOILERS) */
                      <section className="bg-[#131A24] border border-amber-500/50 rounded-2xl p-5 space-y-4">
                        <div className="flex items-start gap-3">
                          <Search className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-amber-300 font-medium">
                              Peranmu Ronde Ini · Penebak
                            </p>
                            <h2 className="text-lg font-bold text-white mt-0.5">
                              Temukan 1 Pembawa Fakta Asli!
                            </h2>
                          </div>
                        </div>

                        <p className="text-sm text-slate-300 leading-relaxed">
                          Seluruh Tim Bluffer ({bluffers.length} pemain) tahu fakta sebenarnya—tetapi{' '}
                          <strong className="text-white">hanya 1 orang</strong> yang bertugas
                          menyampaikan fakta asli, sedangkan sisanya mengarang bebas di dalam tanda
                          kurung!
                        </p>

                        <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 space-y-1">
                          <p>
                            Jika tebakanmu tepat:{' '}
                            <strong className="font-mono-tabular text-emerald-300">
                              +{potentialGuesserPoints} poin
                            </strong>{' '}
                            untukmu!
                          </p>
                          <p>
                            Jika kamu terkecoh:{' '}
                            <strong className="font-mono-tabular text-violet-300">
                              +1 poin
                            </strong>{' '}
                            untuk setiap anggota Tim Bluffer.
                          </p>
                        </div>

                        {fakta.phase === 'discussion' && (
                          <p className="text-xs text-slate-400">
                            Dengarkan cerita mereka di obrolan atau suara. Saat semua selesai,{' '}
                            <strong className="text-slate-200">{fakta.phaseControllerName}</strong>{' '}
                            akan membuka fase pilihan untukmu.
                          </p>
                        )}
                      </section>
                    ) : (
                      /* BLUFFER TEAM CARD (WITH TEAM-WIDE TRUTH-TELLER AWARENESS & PARENTHETICAL FACT) */
                      <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs text-violet-300 font-medium">
                              Kartu Tim Bluffer · {mySecret?.factCategory ?? 'Fakta Unik'}
                            </p>
                            <h2 className="text-base font-bold text-white mt-0.5">
                              {mySecret?.isTruthTeller
                                ? 'Kamu Pembawa Fakta Asli!'
                                : 'Kamu Pengarang (Tim Bluffer)'}
                            </h2>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setHiddenCardKey((prev) => (prev === roundKey ? null : roundKey))
                            }
                            className="min-h-[40px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                          >
                            {isFactHidden ? (
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

                        {isFactHidden ? (
                          <button
                            type="button"
                            onClick={() => setHiddenCardKey(null)}
                            className="w-full min-h-[140px] rounded-xl bg-[#0B1018] border border-dashed border-slate-700 hover:border-violet-400/70 p-5 flex flex-col items-center justify-center gap-2 text-center transition-colors"
                          >
                            <Eye className="w-6 h-6 text-violet-400" />
                            <span className="text-sm font-semibold text-white">
                              Kartu Fakta Disembunyikan
                            </span>
                            <span className="text-xs text-slate-400">
                              Ketuk untuk membuka lagi saat layar aman dari intipan Penebak.
                            </span>
                          </button>
                        ) : !mySecret || !mySecret.factTwist ? (
                          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-5 text-center text-xs text-slate-400">
                            Memuat kartu fakta rahasia...
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Team-Wide Truth-Teller Announcement (Visible to ALL Bluffers, hidden from Guesser) */}
                            <div
                              className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                                mySecret.isTruthTeller
                                  ? 'bg-emerald-950/35 border-emerald-500/50'
                                  : 'bg-violet-950/35 border-violet-500/50'
                              }`}
                            >
                              <ShieldCheck
                                className={`w-5 h-5 shrink-0 mt-0.5 ${
                                  mySecret.isTruthTeller ? 'text-emerald-400' : 'text-violet-300'
                                }`}
                              />
                              <div className="text-xs leading-relaxed">
                                <p className="font-bold text-white">
                                  Pembawa Fakta Ronde Ini:{' '}
                                  <span
                                    className={
                                      mySecret.isTruthTeller ? 'text-emerald-300' : 'text-violet-300'
                                    }
                                  >
                                    {mySecret.truthTellerName}
                                    {mySecret.isTruthTeller ? ' (Kamu!)' : ''}
                                  </span>
                                </p>
                                <p className="text-slate-300 mt-1">
                                  {mySecret.isTruthTeller
                                    ? 'Tugasmu menyampaikan isi fakta asli di dalam tanda kurung! Tetap kompak dengan Tim Bluffer agar Penebak ragu dan salah pilih (+1 poin untuk semua Bluffer).'
                                    : `Tugasmu mengarang bebas isi di dalam tanda kurung agar lebih meyakinkan daripada ${mySecret.truthTellerName}! Kalian satu tim—jika Penebak salah tebak, semua Bluffer dapat +1 poin.`}
                                </p>
                              </div>
                            </div>

                            {/* Fun Fact Display with Highlighted Parentheses */}
                            <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 space-y-3">
                              <p className="text-xs text-slate-400 font-medium">
                                Fakta Hari Ini
                              </p>
                              <p className="text-base sm:text-lg text-slate-100 leading-relaxed font-medium">
                                {mySecret.factPrefix}
                                <span className="text-violet-300 font-bold bg-violet-950/60 px-1.5 py-0.5 rounded-md">
                                  ({mySecret.factTwist})
                                </span>
                                {mySecret.factSuffix}
                              </p>
                              <p className="text-xs text-slate-400 pt-2 border-t border-slate-800/80 leading-relaxed">
                                Bagian di dalam tanda kurung{' '}
                                <span className="text-violet-300 font-semibold">(...)</span> adalah
                                ruang kreativitasmu! Pembawa Fakta membawakan fakta aslinya, sementara
                                Bluffer lain menggantinya dengan karangan yang meyakinkan.
                              </p>
                            </div>
                          </div>
                        )}
                      </section>
                    )}

                    {/* GUESSING PHASE PANEL */}
                    {fakta.phase === 'guessing' && (
                      <section className="bg-[#131A24] border border-amber-500/60 rounded-2xl p-5 space-y-4">
                        <div className="flex items-start gap-3">
                          <UserCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <h2 className="text-base font-bold text-white">
                              {isGuesser
                                ? 'Saatnya Memilih! Siapa Pembawa Fakta Asli?'
                                : `Menunggu ${fakta.guesserName} Menunjuk Pembawa Fakta...`}
                            </h2>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {isGuesser
                                ? 'Pilih 1 pemain dari Tim Bluffer yang menurutmu menyampaikan fakta asli.'
                                : 'Tahan ekspresimu! Penebak sedang memutuskan siapa yang paling meyakinkan.'}
                            </p>
                          </div>
                        </div>

                        {isGuesser && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {bluffers.map((candidate) => {
                                const selected = selectedSuspectUid === candidate.uid;
                                return (
                                  <button
                                    key={candidate.uid}
                                    type="button"
                                    disabled={actionBusy}
                                    onClick={() => setSelectedSuspectUid(candidate.uid)}
                                    className={`min-h-[52px] px-4 py-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                                      selected
                                        ? 'bg-amber-500/20 border-amber-400 text-white'
                                        : 'bg-[#0B1018] border-slate-800 hover:border-slate-600 text-slate-200'
                                    }`}
                                  >
                                    <span
                                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                                      style={{
                                        backgroundColor: candidate.avatarColor || '#7C3AED',
                                      }}
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

                            <button
                              type="button"
                              disabled={actionBusy || !selectedSuspectUid}
                              onClick={() => void handleConfirmGuess()}
                              className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-40"
                            >
                              {actionBusy ? 'Memeriksa Tebakan...' : 'Konfirmasi Pilihan Penebak'}
                            </button>
                          </div>
                        )}
                      </section>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* ROUND END: FULL FACT REVEAL & TEAM SCORING */}
            {room.status === 'round_end' && fakta && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <Trophy
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      fakta.guesserWon ? 'text-amber-400' : 'text-violet-400'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Hasil Ronde #{room.roundNumber} · {fakta.revealedCategory ?? 'Fakta Unik'}
                    </p>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {fakta.guesserWon
                        ? `Penebak Menang! (+${fakta.guesserPoints ?? 0} Poin)`
                        : 'Tim Bluffer Menang! (+1 Poin Semua Bluffer)'}
                    </h2>
                    {room.lastRoundResult?.reason && (
                      <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                        {room.lastRoundResult.reason}
                      </p>
                    )}
                  </div>
                </div>

                {/* Full Revealed Fun Fact */}
                <div className="rounded-xl bg-[#0B1018] border border-violet-500/40 p-4 space-y-2">
                  <span className="text-xs text-violet-300 font-medium block">
                    Fakta Asli Lengkap
                  </span>
                  <p className="text-sm sm:text-base text-slate-100 leading-relaxed font-medium">
                    {fakta.revealedFactPrefix}
                    <span className="text-emerald-300 font-bold">
                      ({fakta.revealedFactTwist})
                    </span>
                    {fakta.revealedFactSuffix}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#0B1018] border border-emerald-800/60 rounded-xl p-3.5">
                    <span className="text-xs text-emerald-300 block">Pembawa Fakta Asli</span>
                    <span className="text-base font-bold text-white mt-0.5 block">
                      {fakta.revealedTruthTellerName ?? '—'}
                    </span>
                  </div>
                  <div className="bg-[#0B1018] border border-slate-800 rounded-xl p-3.5">
                    <span className="text-xs text-slate-400 block">
                      Pilihan {fakta.guesserName}
                    </span>
                    <span
                      className={`text-base font-bold mt-0.5 block ${
                        fakta.guesserWon ? 'text-emerald-300' : 'text-rose-400'
                      }`}
                    >
                      {fakta.pickedName ?? '—'}
                    </span>
                  </div>
                </div>

                {isHost ? (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy || players.length < 3}
                      onClick={() => void handleStartRound()}
                      className="flex-1 min-h-[46px] rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
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
                      <span>Ubah Pengaturan</span>
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center">
                    Menunggu Host memulai ronde berikutnya atau kembali ke lobi.
                  </p>
                )}
              </section>
            )}
          </div>

          {/* Center Column: Ordered Roster & Scores */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <FaktaHariIniPlayersPanel
              room={room}
              players={players}
              mySecret={mySecret}
              presence={presence}
              myUid={myUid}
            />
          </div>

          {/* Right Column: RTDB Real-Time Chat */}
          <div
            className={`lg:col-span-4 ${
              mobileTab === 'obrolan' ? 'block' : 'hidden lg:block'
            }`}
          >
            <RoomChatPanel
              roomId={room.id}
              myUid={myUid}
              myName={myName}
              messages={messages}
              quickPrompts={FAKTA_HARI_INI_QUICK_PROMPTS_ID}
              promptLabel="Celetukan Cepat"
              emptyPlaceholder="Belum ada obrolan. Ceritakan versi faktamu atau ajukan pertanyaan ke Tim Bluffer!"
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang Fakta Hari Ini"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('kartu')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'kartu' ? 'text-violet-400' : 'text-slate-400'
          }`}
        >
          <BookOpenCheck className="w-5 h-5" />
          <span>Kartu Fakta</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('obrolan')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'obrolan' ? 'text-violet-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Obrolan</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('pemain')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'pemain' ? 'text-violet-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pemain ({players.length})</span>
        </button>
      </nav>
    </div>
  );
}
