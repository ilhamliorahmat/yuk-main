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
  MapPin,
  MessageSquare,
  Play,
  RotateCcw,
  ShieldAlert,
  Target,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import { useRoomSession } from '@/hooks/use-room-session';
import type { RoundResult } from '@/lib/games/types';
import {
  cancelActiveVoteOrSpyGuess,
  castAccusationVote,
  leaveRoom,
  resolveRoundTimeout,
  returnRoomToLobby,
  startSpyfallRound,
  submitSpyLocationGuess,
} from '@/lib/platform/room-service';
import { LobbySettingsPanel } from './LobbySettingsPanel';
import { PlayersAndVotePanel } from './PlayersAndVotePanel';
import { RoomChatPanel } from './RoomChatPanel';

interface SpyfallRoomViewProps {
  roomId: string;
  myUid: string;
  myName: string;
  onExitToHub: () => void;
}

type MobileTab = 'kartu' | 'obrolan' | 'pemain';

export function SpyfallRoomView({
  roomId,
  myUid,
  myName,
  onExitToHub,
}: SpyfallRoomViewProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  const {
    room,
    players,
    mySecret,
    revealedSecrets,
    messages,
    presence,
    loadingRoom,
    roomMissing,
  } = useRoomSession({ roomId: isLeaving ? null : roomId, uid: myUid, displayName: myName });

  const [mobileTab, setMobileTab] = useState<MobileTab>('kartu');
  const [revealedRoundKey, setRevealedRoundKey] = useState<string | null>(null);
  const [crossedByRound, setCrossedByRound] = useState<Record<string, Record<string, boolean>>>({});
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [guessModalOpen, setGuessModalOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const roundStateKey = room ? `${room.id}:${room.roundNumber}:${room.status}` : '';
  const cardRevealed = revealedRoundKey === roundStateKey;
  const crossedLocations = crossedByRound[roundStateKey] ?? {};

  // Countdown tick while playing/voting/spy_guess
  useEffect(() => {
    if (!room || room.status === 'lobby' || room.status === 'round_end') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [room]);

  const remainingSec = useMemo(() => {
    if (!room || !room.roundEndsAtMs) return 0;
    return Math.max(0, Math.ceil((room.roundEndsAtMs - nowMs) / 1000));
  }, [room, nowMs]);

  const formattedTime = useMemo(() => {
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [remainingSec]);

  if (isLeaving) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Keluar dari ruang permainan...</p>
      </div>
    );
  }

  if (loadingRoom) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <p className="text-sm text-slate-300">Memuat ruang permainan Yuk Main...</p>
      </div>
    );
  }

  if (roomMissing || !room) {
    return (
      <div className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#131A24] border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Ruang Tidak Ditemukan</h2>
          <p className="text-sm text-slate-400">
            Ruang permainan ini telah ditutup atau kode undangan sudah kedaluwarsa.
          </p>
          <button
            type="button"
            onClick={onExitToHub}
            className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors"
          >
            Kembali ke Beranda Yuk Main
          </button>
        </div>
      </div>
    );
  }

  const isHost = room.hostUid === myUid;
  const isTimerExpired = room.status === 'playing' && remainingSec === 0 && room.roundEndsAtMs > 0;

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
    setIsLeaving(true);
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
    try {
      await startSpyfallRound({ roomId: room.id, actorUid: myUid, actorName: myName });
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
      await castAccusationVote({
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
      await cancelActiveVoteOrSpyGuess({
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

  const handleSpyGuessSubmit = async (locName: string) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await submitSpyLocationGuess({
        roomId: room.id,
        spyUid: myUid,
        spyName: myName,
        guessedLocation: locName,
      });
      setGuessModalOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim tebakan lokasi.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTimeoutResolve = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await resolveRoundTimeout({
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
      await returnRoomToLobby({
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
  const isTargetOfVote = activeVote?.targetUid === myUid;
  const myVoteChoice = activeVote?.votes[myUid];
  const eligibleCount = Math.max(1, players.length - 1);
  const yesVoteCount = activeVote
    ? Object.values(activeVote.votes).filter((v) => v === 'yes').length
    : 0;

  const roundResult = room.lastRoundResult as RoundResult | null;

  const isConvictedSpyAwaitingGuess =
    room.status === 'spy_guess' &&
    activeVote?.targetUid === myUid &&
    mySecret?.isSpy === true;

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col pb-20 lg:pb-8">
      {/* Compact Sticky Top HUD (<= 15% mobile height budget) */}
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
              Yuk Main · Spyfall · Ronde #{room.roundNumber}
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

        {/* Active Voting Banner */}
        {room.status === 'voting' && activeVote && (
          <section className="bg-[#131A24] border border-amber-600/60 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Vote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    Pemungutan Suara: Apakah {activeVote.targetName} Mata-Mata?
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Diajukan oleh {activeVote.initiatorName} ·{' '}
                    <span className="font-mono-tabular">
                      {yesVoteCount}/{eligibleCount} Suara Setuju
                    </span>{' '}
                    (Wajib sepakat penuh selain tertuduh)
                  </p>
                </div>
              </div>

              {isHost && (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleCancelVote()}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                >
                  Batalkan Voting
                </button>
              )}
            </div>

            {isTargetOfVote ? (
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-xl px-3.5 py-2.5">
                Kamu sedang dituduh! Tunggu hasil suara pemain lain.
              </p>
            ) : myVoteChoice ? (
              <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-3.5 py-2.5">
                Suaramu ({myVoteChoice === 'yes' ? 'Setuju Tuduhan' : 'Tidak Setuju'}) telah tercatat.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleCastVote('yes')}
                  className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors"
                >
                  Setuju, Dia Mata-Mata
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleCastVote('no')}
                  className="flex-1 min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-semibold transition-colors"
                >
                  Tidak Setuju
                </button>
              </div>
            )}
          </section>
        )}

        {/* Convicted Spy Last-Chance Guess Prompt */}
        {room.status === 'spy_guess' && (
          <section className="bg-[#131A24] border border-rose-600/70 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {isConvictedSpyAwaitingGuess
                      ? 'Identitasmu Terbongkar! Kesempatan Terakhir Menebak Lokasi'
                      : `${activeVote?.targetName ?? 'Tertuduh'} adalah Mata-Mata!`}
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isConvictedSpyAwaitingGuess
                      ? 'Pilih lokasi yang menurutmu benar dari daftar di bawah untuk membalikkan keadaan dan menang!'
                      : 'Menunggu Mata-Mata mengirimkan tebakan lokasi terakhirnya...'}
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

            {isConvictedSpyAwaitingGuess && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                {room.selectedLocationNames.map((locName) => (
                  <button
                    key={locName}
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleSpyGuessSubmit(locName)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-rose-500 hover:bg-rose-950/40 text-xs font-medium text-white text-left transition-colors"
                  >
                    {locName}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Timer Expired Notice */}
        {isTimerExpired && (
          <section className="bg-[#131A24] border border-amber-600/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Flag className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-white">Waktu Diskusi Habis!</h2>
                <p className="text-xs text-slate-300">
                  Selesaikan ronde untuk melihat siapa Mata-Matanya dan menghitung poin.
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
          {/* Left Column: Secret Role Card + Locations + Settings / Round Summary */}
          <div
            className={`lg:col-span-5 space-y-5 ${
              mobileTab === 'kartu' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* LOBBY STATE */}
            {room.status === 'lobby' && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-bold text-white">Lobi Ruang Spyfall</h1>
                    <p className="text-xs text-slate-400">
                      Bagikan kode <span className="font-mono-tabular text-white font-semibold">{room.code}</span> kepada teman. Minimal 3 pemain untuk memulai.
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || players.length < 3}
                      onClick={handleStartRound}
                      className="w-full min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyiapkan Ronde...'
                          : players.length < 3
                            ? `Menunggu Pemain (${players.length}/3 Minimal)`
                            : 'Mulai Ronde Spyfall'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai ronde...
                    </div>
                  )}
                </section>

                <LobbySettingsPanel room={room} isHost={isHost} />
              </>
            )}

            {/* ACTIVE GAME: PRIVACY SHIELD ROLE CARD + LOCATION CHECKLIST */}
            {(room.status === 'playing' ||
              room.status === 'voting' ||
              room.status === 'spy_guess') && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-white">Kartu Identitas Rahasia</h2>
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
                          <span>Buka Kartu</span>
                        </>
                      )}
                    </button>
                  </div>

                  {!cardRevealed ? (
                    <button
                      type="button"
                      onClick={() => setRevealedRoundKey(roundStateKey)}
                      className="w-full min-h-[140px] rounded-xl bg-[#0B1018] border border-dashed border-slate-700 hover:border-rose-500/70 p-5 flex flex-col items-center justify-center gap-2 text-center transition-colors"
                    >
                      <Eye className="w-6 h-6 text-slate-400" />
                      <span className="text-sm font-semibold text-white">
                        Ketuk untuk Melihat Peran & Lokasi
                      </span>
                      <span className="text-xs text-slate-400">
                        Pastikan tidak ada teman yang mengintip layar ponselmu.
                      </span>
                    </button>
                  ) : !mySecret ? (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-5 text-center text-xs text-slate-400">
                      Memuat kartu rahasia milikmu...
                    </div>
                  ) : mySecret.isSpy ? (
                    <div className="rounded-xl bg-rose-950/40 border border-rose-700/70 p-5 space-y-3">
                      <div className="flex items-center gap-2.5 text-rose-300">
                        <ShieldAlert className="w-5 h-5 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider">
                          Peran Rahasia
                        </span>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-white">Kamu adalah MATA-MATA</p>
                        <p className="text-xs text-rose-200/90 mt-1.5 leading-relaxed">
                          Kamu tidak tahu lokasi saat ini. Simak pertanyaan dan jawaban Warga dengan cermat, lalu berbaurlah tanpa ketahuan!
                        </p>
                      </div>
                      {room.status === 'playing' && (
                        <button
                          type="button"
                          onClick={() => setGuessModalOpen(true)}
                          className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                        >
                          <Target className="w-4 h-4" />
                          <span>Tebak Lokasi Sekarang</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/60 p-5 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-300">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold">Warga Terdaftar</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-[#0B1018]/80 rounded-xl p-3 border border-slate-800">
                          <span className="text-[11px] text-slate-400 block">Lokasi Ronde Ini</span>
                          <span className="text-base font-bold text-white mt-0.5 block">
                            {mySecret.locationName}
                          </span>
                        </div>
                        <div className="bg-[#0B1018]/80 rounded-xl p-3 border border-slate-800">
                          <span className="text-[11px] text-slate-400 block">Peranmu</span>
                          <span className="text-base font-bold text-emerald-300 mt-0.5 block">
                            {mySecret.roleName}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Interactive Location Checklist */}
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-white">Daftar Lokasi Kemungkinan</h2>
                      <p className="text-xs text-slate-400">
                        Ketuk lokasi untuk mencoret kemungkinan saat deduksi.
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono-tabular">
                      {room.selectedLocationNames.length} Lokasi
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {room.selectedLocationNames.map((locName) => {
                      const isCrossed = Boolean(crossedLocations[locName]);
                      const isMyPlace =
                        cardRevealed && mySecret && !mySecret.isSpy && mySecret.locationName === locName;

                      return (
                        <button
                          key={locName}
                          type="button"
                          onClick={() =>
                            setCrossedByRound((prev) => ({
                              ...prev,
                              [roundStateKey]: {
                                ...(prev[roundStateKey] ?? {}),
                                [locName]: !(prev[roundStateKey]?.[locName] ?? false),
                              },
                            }))
                          }
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-medium transition-colors ${
                            isMyPlace
                              ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-200'
                              : isCrossed
                                ? 'bg-[#0B1018]/40 border-slate-800/60 text-slate-500 line-through'
                                : 'bg-[#0B1018] border-slate-800 text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {locName}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ROUND END SUMMARY & FULL REVEAL */}
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
                        : 'Mata-Mata Menang!'}
                    </h2>
                    <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                      {roundResult.reason}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#0B1018] border border-slate-800 rounded-xl p-3.5">
                    <span className="text-xs text-slate-400 block">Lokasi Sebenarnya</span>
                    <span className="text-base font-bold text-white mt-0.5 block">
                      {roundResult.locationName || 'Memuat...'}
                    </span>
                  </div>
                  <div className="bg-[#0B1018] border border-slate-800 rounded-xl p-3.5">
                    <span className="text-xs text-slate-400 block">Identitas Mata-Mata</span>
                    <span className="text-base font-bold text-rose-400 mt-0.5 block">
                      {roundResult.spyNames.length > 0
                        ? roundResult.spyNames.join(', ')
                        : 'Memuat...'}
                    </span>
                  </div>
                </div>

                {/* Per-player Role Reveal */}
                {Object.keys(revealedSecrets).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-slate-300">
                      Pembukaan Peran Pemain
                    </h3>
                    <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800">
                      {players.map((p) => {
                        const sec = revealedSecrets[p.uid];
                        return (
                          <div
                            key={p.uid}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="font-medium text-white truncate">
                              {p.displayName}
                            </span>
                            <span
                              className={`font-semibold shrink-0 ${
                                sec?.isSpy ? 'text-rose-400' : 'text-emerald-300'
                              }`}
                            >
                              {sec ? sec.roleName : '—'}
                            </span>
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
                      disabled={actionBusy || players.length < 3}
                      onClick={handleStartRound}
                      className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
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

          {/* Center Column: Players & Accusation Controls */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <PlayersAndVotePanel
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
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang permainan"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('kartu')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'kartu' ? 'text-rose-400' : 'text-slate-400'
          }`}
        >
          <MapPin className="w-5 h-5" />
          <span>Peran & Lokasi</span>
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

      {/* Voluntary Spy Guess Modal */}
      {guessModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="spy-guess-title"
        >
          <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div>
              <h2 id="spy-guess-title" className="text-lg font-bold text-white">
                Tebak Lokasi Sekarang
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Hati-hati! Jika tebakanmu benar, kamu langsung menang (+4 Poin). Jika salah, Tim Warga yang menang!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {room.selectedLocationNames.map((locName) => (
                <button
                  key={locName}
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void handleSpyGuessSubmit(locName)}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-rose-500 hover:bg-rose-950/40 text-xs font-medium text-white text-left transition-colors"
                >
                  {locName}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setGuessModalOpen(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
