'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Flag,
  LogOut,
  MessageSquare,
  MessageSquareQuote,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { KATA_KATA_QUICK_PROMPTS_ID } from '@/lib/games/kata-kata/words-id';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
} from '@/lib/games/types';
import {
  cancelKataKataVote,
  castKataKataVote,
  leaveRoom,
  resolveKataKataTimeout,
  returnKataKataToLobby,
  startKataKataRound,
  submitKataKataLastChanceGuess,
} from '@/lib/platform/room-service';
import { getEligibleMajorityVoterUids } from '@/lib/games/voting/engine';
import { AccusationVoteBanner } from '../session/AccusationVoteBanner';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { KataKataLobbySettings } from './KataKataLobbySettings';
import { KataKataPlayersPanel } from './KataKataPlayersPanel';

interface KataKataRoomViewProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  mySecret: PlayerSecretDoc | null;
  revealedSecrets: Record<string, PlayerSecretDoc>;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
  deviceUid?: string;
  deviceName?: string;
  onBeforeLeave: () => void;
  onExitToHub: () => void;
}

type MobileTab = 'kartu' | 'obrolan' | 'pemain';

export function KataKataRoomView({
  room,
  players,
  mySecret,
  revealedSecrets,
  messages,
  presence,
  myUid,
  myName,
  deviceUid,
  deviceName,
  onBeforeLeave,
  onExitToHub,
}: KataKataRoomViewProps) {
  const actualDeviceUid = deviceUid ?? myUid;
  const actualDeviceName = deviceName ?? myName;
  const [mobileTab, setMobileTab] = useState<MobileTab>('kartu');
  const [revealedRoundKey, setRevealedRoundKey] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [guessInput, setGuessInput] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const roundStateKey = `${room.id}:${room.roundNumber}:${room.status}:${myUid}`;
  const cardRevealed = revealedRoundKey === roundStateKey;

  useEffect(() => {
    if (room.status === 'lobby' || room.status === 'round_end') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [room.status]);

  const remainingSec = useMemo(() => {
    if (!room.roundEndsAtMs) return 0;
    return Math.max(0, Math.ceil((room.roundEndsAtMs - nowMs) / 1000));
  }, [room.roundEndsAtMs, nowMs]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [remainingSec]);

  const isHost = room.hostUid === actualDeviceUid;
  const activePlayersCount = players.filter((p) => !p.isBrb).length;
  const eliminatedSet = new Set(room.eliminatedUids ?? []);
  const amIEliminated = room.status !== 'lobby' && eliminatedSet.has(myUid);
  const eliminationLog = room.eliminationLog ?? [];
  const isTimerExpired =
    room.status === 'playing' && remainingSec === 0 && room.roundEndsAtMs > 0;

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
    setGuessInput('');
    try {
      await startKataKataRound({
        roomId: room.id,
        actorUid: actualDeviceUid,
        actorName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulai ronde.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCastVote = async (choice: 'yes' | 'no') => {
    setActionBusy(true);
    setActionError(null);
    try {
      await castKataKataVote({
        roomId: room.id,
        voterUid: myUid,
        voterName: myName,
        choice,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim suara.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelVote = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await cancelKataKataVote({
        roomId: room.id,
        hostUid: myUid,
        hostName: myName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal membatalkan voting.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLastChanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim() || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitKataKataLastChanceGuess({
        roomId: room.id,
        spyUid: myUid,
        spyName: myName,
        guessedWord: guessInput.trim(),
      });
      setGuessInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim tebakan kata.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLastChanceSurrender = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await submitKataKataLastChanceGuess({
        roomId: room.id,
        spyUid: myUid,
        spyName: myName,
        surrender: true,
      });
      setGuessInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyerah.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTimeoutResolve = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await resolveKataKataTimeout({
        roomId: room.id,
        actorUid: myUid,
        actorName: myName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyelesaikan ronde.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnLobby = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await returnKataKataToLobby({
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

  const activeVote = room.activeVote;
  const myPlayer = players.find((p) => p.uid === myUid);
  const eligibleVoterUids = useMemo(
    () =>
      getEligibleMajorityVoterUids({
        players,
        targetUid: activeVote?.targetUid,
        excludedUids: room.eliminatedUids ?? [],
      }),
    [players, activeVote?.targetUid, room.eliminatedUids],
  );

  const isCaughtFinalSpy =
    room.status === 'spy_guess' && room.pendingSpyGuess?.spyUid === myUid;

  const roundResult = room.lastRoundResult as RoundResult | null;
  const spyUidSet = new Set(roundResult?.spyUids ?? []);

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

            <span className="hidden sm:inline text-xs text-slate-400 whitespace-nowrap">
              Yuk Main · Kata-Kata Hari Ini · Ronde #{room.roundNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {room.status !== 'lobby' && (
              <div
                className={`min-h-[38px] px-3 rounded-xl border inline-flex items-center gap-1.5 font-mono-tabular text-sm font-semibold ${
                  remainingSec <= 60 && room.status !== 'round_end'
                    ? 'bg-rose-950/60 border-rose-700 text-rose-200'
                    : 'bg-[#131A24] border-slate-800 text-amber-300'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{room.status === 'round_end' ? 'Selesai' : formattedTime}</span>
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

        {/* Active Elimination Vote Banner (50% + 1 Majority Module) */}
        {room.status === 'voting' && activeVote && (
          <AccusationVoteBanner
            activeVote={activeVote}
            eligibleVoterUids={eligibleVoterUids}
            myUid={myUid}
            isHost={isHost}
            isBrb={Boolean(myPlayer?.isBrb)}
            isEliminated={amIEliminated}
            actionBusy={actionBusy}
            title={`Voting Eliminasi: Apakah ${activeVote.targetName} Penyusup?`}
            yesButtonLabel="Setuju, Eliminasi Dia"
            yesRecordedLabel="Setuju Eliminasi"
            accentBorderClassName="border-amber-500/60"
            onCastVote={(choice) => void handleCastVote(choice)}
            onCancelVote={() => void handleCancelVote()}
          />
        )}

        {/* Final Caught Spy Last-Chance Word Guess */}
        {room.status === 'spy_guess' && room.pendingSpyGuess && (
          <section className="bg-[#131A24] border border-rose-500/70 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {isCaughtFinalSpy
                      ? 'Terbongkar! Kamu Adalah Penyusup Terakhir — Kesempatan Terakhir!'
                      : `${room.pendingSpyGuess.spyName} adalah Penyusup Terakhir!`}
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {isCaughtFinalSpy
                      ? 'Ketik Kata Warga yang menurutmu benar untuk membalikkan keadaan dan merebut kemenangan (+4 Poin)!'
                      : `Menunggu ${room.pendingSpyGuess.spyName} menebak Kata Warga pada Kesempatan Terakhir...`}
                  </p>
                </div>
              </div>
              {isHost && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={handleTimeoutResolve}
                  className="min-h-[40px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                >
                  Akhiri Paksa
                </button>
              )}
            </div>

            {isCaughtFinalSpy && (
              <form
                onSubmit={handleLastChanceSubmit}
                className="flex flex-col sm:flex-row items-stretch gap-2.5"
              >
                <input
                  type="text"
                  maxLength={80}
                  value={guessInput}
                  onChange={(e) => setGuessInput(e.target.value)}
                  placeholder="Ketik tebakan Kata Warga..."
                  className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={actionBusy || !guessInput.trim()}
                  className="min-h-[46px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Tebakan</span>
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleLastChanceSurrender()}
                  className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-medium text-xs whitespace-nowrap shrink-0 transition-colors"
                >
                  Menyerah
                </button>
              </form>
            )}
          </section>
        )}

        {/* Timer Expired Notice */}
        {isTimerExpired && (
          <section className="bg-[#131A24] border border-amber-500/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Flag className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-white">Waktu Diskusi Habis!</h2>
                <p className="text-xs text-slate-300">
                  Selesaikan ronde untuk membuka Kata Warga, Kata Penyusup, dan menghitung poin.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={actionBusy}
              onClick={handleTimeoutResolve}
              className="min-h-[44px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 transition-colors"
            >
              Selesaikan Ronde
            </button>
          </section>
        )}

        {/* Responsive 12-Col Tactical Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Blind Word Card + Elimination Feed / Settings / Round Reveal */}
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
                    <h1 className="text-lg font-bold text-white">Lobi Kata-Kata Hari Ini</h1>
                    <p className="text-xs text-slate-400">
                      Bagikan kode{' '}
                      <span className="font-mono-tabular text-white font-semibold">
                        {room.code}
                      </span>{' '}
                      kepada teman. Minimal 3 pemain untuk memulai (≥5 pemain untuk mode 2 Penyusup).
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || activePlayersCount < 3}
                      onClick={handleStartRound}
                      className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyiapkan Ronde...'
                          : activePlayersCount < 3
                            ? `Menunggu Pemain Aktif (${activePlayersCount}/3 Minimal)`
                            : 'Mulai Kata-Kata Hari Ini'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai ronde...
                    </div>
                  )}
                </section>

                <KataKataLobbySettings room={room} isHost={isHost} />
              </>
            )}

            {/* ACTIVE GAME: TRUE BLIND PRIVACY SHIELD CARD */}
            {(room.status === 'playing' ||
              room.status === 'voting' ||
              room.status === 'spy_guess') && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-white">Kartu Kata Rahasiamu</h2>
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedRoundKey((prev) =>
                          prev === roundStateKey ? null : roundStateKey,
                        )
                      }
                      className="min-h-[40px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {cardRevealed ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Sembunyikan</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Buka Kata</span>
                        </>
                      )}
                    </button>
                  </div>

                  {amIEliminated && !isCaughtFinalSpy && (
                    <div className="rounded-xl bg-slate-900/80 border border-slate-700 px-3.5 py-2.5 text-xs text-slate-300">
                      Kamu telah tereliminasi di ronde ini. Tetap rahasiakan katamu dan saksikan sisa permainan!
                    </div>
                  )}

                  {!cardRevealed ? (
                    <button
                      type="button"
                      onClick={() => setRevealedRoundKey(roundStateKey)}
                      className="w-full min-h-[148px] rounded-xl bg-[#0B1018] border border-dashed border-slate-700 hover:border-amber-400/70 p-5 flex flex-col items-center justify-center gap-2 text-center transition-colors"
                    >
                      <Eye className="w-6 h-6 text-amber-400" />
                      <span className="text-sm font-semibold text-white">
                        Ketuk untuk Melihat Kata Rahasiamu
                      </span>
                      <span className="text-xs text-slate-400">
                        Pastikan tidak ada teman yang mengintip layar ponselmu.
                      </span>
                    </button>
                  ) : !mySecret || !mySecret.secretWord ? (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-5 text-center text-xs text-slate-400">
                      Memuat kata rahasia milikmu...
                    </div>
                  ) : (
                    /* IDENTICAL styling for every single player — zero visual hint of Spy status! */
                    <div className="rounded-xl bg-indigo-950/35 border border-indigo-500/50 p-5 space-y-3 text-center">
                      <div className="inline-flex items-center gap-2 text-indigo-300">
                        <MessageSquareQuote className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider">
                          Kata Rahasiamu Ronde Ini
                        </span>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                        {mySecret.secretWord}
                      </p>
                      <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                        Berikan petunjuk singkat yang cocok tanpa menyebut kata ini. Ingat—kamu tidak tahu apakah katamu milik Warga atau kamu adalah Penyusup!
                      </p>
                    </div>
                  )}
                </section>

                {/* Elimination Log (visible once at least 1 player has been voted out) */}
                {eliminationLog.length > 0 && (
                  <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-white">Riwayat Eliminasi Ronde Ini</h2>
                      <span className="text-xs text-slate-400 font-mono-tabular">
                        {eliminationLog.length} Tereliminasi
                      </span>
                    </div>
                    <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800">
                      {eliminationLog.map((entry, idx) => (
                        <div
                          key={`${entry.uid}-${idx}`}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="font-medium text-white truncate">
                            {idx + 1}. {entry.displayName}
                          </span>
                          <span
                            className={`font-semibold inline-flex items-center gap-1 shrink-0 ${
                              entry.wasSpy ? 'text-rose-400' : 'text-emerald-300'
                            }`}
                          >
                            {entry.wasSpy && <ShieldAlert className="w-3.5 h-3.5" />}
                            <span>{entry.wasSpy ? 'Penyusup' : 'Warga'}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Compact Gameplay Guide Card */}
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <p className="font-semibold text-white">Alur Permainan Kata-Kata Hari Ini</p>
                  <p>
                    1. Bergantian sebutkan 1 petunjuk singkat di obrolan atau langsung di meja.
                  </p>
                  <p>
                    2. Jika petunjuk seseorang terasa janggal, tekan <strong className="text-white">Tuduh</strong> di daftar pemain untuk voting eliminasi.
                  </p>
                  <p>
                    3. Saat Penyusup terakhir tertangkap, ia mendapat <strong className="text-amber-300">1 Kesempatan Terakhir</strong> menebak Kata Warga!
                  </p>
                </section>
              </>
            )}

            {/* ROUND END SUMMARY & FULL WORD REVEAL */}
            {room.status === 'round_end' && roundResult && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <Trophy
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      roundResult.winnerTeam === 'warga' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Hasil Ronde #{roundResult.roundNumber}
                    </p>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {roundResult.winnerTeam === 'warga'
                        ? 'Tim Warga Menang!'
                        : 'Tim Penyusup Menang!'}
                    </h2>
                    <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                      {roundResult.reason}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#0B1018] border border-emerald-800/60 rounded-xl p-3.5">
                    <span className="text-xs text-emerald-300 block">Kata Warga</span>
                    <span className="text-base font-bold text-white mt-0.5 block">
                      {roundResult.citizenWord || roundResult.locationName || '—'}
                    </span>
                  </div>
                  <div className="bg-[#0B1018] border border-rose-800/60 rounded-xl p-3.5">
                    <span className="text-xs text-rose-300 block">Kata Penyusup</span>
                    <span className="text-base font-bold text-white mt-0.5 block">
                      {roundResult.spyWord || '—'}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0B1018] border border-slate-800 rounded-xl p-3.5">
                  <span className="text-xs text-slate-400 block">Identitas Penyusup</span>
                  <span className="text-base font-bold text-rose-400 mt-0.5 block">
                    {roundResult.spyNames.length > 0
                      ? roundResult.spyNames.join(', ')
                      : '—'}
                  </span>
                </div>

                {/* Per-player Secret Word & True Role Reveal */}
                {Object.keys(revealedSecrets).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-300">
                      Pembukaan Kata & Peran Pemain
                    </h3>
                    <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800">
                      {players.map((p) => {
                        const sec = revealedSecrets[p.uid];
                        const isPlayerSpy = spyUidSet.has(p.uid);
                        return (
                          <div
                            key={p.uid}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-medium text-white truncate">
                              {p.displayName}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-300">
                                {sec?.secretWord ?? '—'}
                              </span>
                              <span
                                className={`font-semibold ${
                                  isPlayerSpy ? 'text-rose-400' : 'text-emerald-300'
                                }`}
                              >
                                ({isPlayerSpy ? 'Penyusup' : 'Warga'})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isHost ? (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy || activePlayersCount < 3}
                      onClick={handleStartRound}
                      className="flex-1 min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
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

          {/* Center Column: Alive/Eliminated Roster & Accusations */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <KataKataPlayersPanel
              room={room}
              players={players}
              presence={presence}
              myUid={myUid}
              myName={myName}
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
              quickPrompts={KATA_KATA_QUICK_PROMPTS_ID}
              promptLabel="Ide Petunjuk"
              emptyPlaceholder="Belum ada pesan. Mulailah memberi petunjuk singkat untuk membongkar Penyusup!"
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang Kata-Kata Hari Ini"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('kartu')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'kartu' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <MessageSquareQuote className="w-5 h-5" />
          <span>Kata Rahasia</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('obrolan')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'obrolan' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Obrolan</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('pemain')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'pemain' ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pemain ({players.length})</span>
        </button>
      </nav>
    </div>
  );
}
