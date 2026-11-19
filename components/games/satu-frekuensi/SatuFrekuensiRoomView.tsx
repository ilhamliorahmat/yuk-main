'use client';

import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  MessageSquare,
  Play,
  Radio,
  RotateCcw,
  Send,
  Trophy,
  Users,
} from 'lucide-react';
import { SATU_FREKUENSI_QUICK_PROMPTS_ID } from '@/lib/games/satu-frekuensi/spectrums-id';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import {
  advanceSatuFrekuensiPhase,
  leaveRoom,
  returnSatuFrekuensiToLobby,
  startSatuFrekuensiRound,
  submitSatuFrekuensiClue,
  submitSatuFrekuensiGuess,
} from '@/lib/platform/room-service';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { FrequencyDial } from './FrequencyDial';
import { SatuFrekuensiLobbySettings } from './SatuFrekuensiLobbySettings';
import { SatuFrekuensiPlayersPanel } from './SatuFrekuensiPlayersPanel';

interface SatuFrekuensiRoomViewProps {
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

type MobileTab = 'dial' | 'obrolan' | 'pemain';

const TIER_LABEL: Record<string, string> = {
  bullseye: 'Tepat Sasaran',
  close: 'Hampir Tepat',
  near: 'Cukup Dekat',
  miss: 'Meleset',
};

export function SatuFrekuensiRoomView({
  room,
  players,
  mySecret,
  messages,
  presence,
  myUid,
  myName,
  onBeforeLeave,
  onExitToHub,
}: SatuFrekuensiRoomViewProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>('dial');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [clueInput, setClueInput] = useState('');
  const [dialValueByRound, setDialValueByRound] = useState<Record<string, number>>({});
  const [psychicShieldRound, setPsychicShieldRound] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isHost = room.hostUid === myUid;
  const freq = room.frequencyState;
  const isPsychic = Boolean(freq && freq.psychicUid === myUid);
  const roundKey = `${room.id}:${room.currentRoundId}`;
  const myDialValue = dialValueByRound[roundKey] ?? 50;
  const hasLockedMyGuess = Boolean(freq?.lockedUids?.includes(myUid));
  const psychicSeesTarget = psychicShieldRound === roundKey;

  const guesserTotal = Math.max(1, players.length - 1);
  const lockedCount = freq?.lockedUids?.length ?? 0;

  const phaseLabel =
    room.status === 'lobby'
      ? 'Lobi'
      : room.status === 'round_end'
        ? 'Pengungkapan'
        : freq?.phase === 'clue'
          ? 'Fase 1: Petunjuk Penerawang'
          : 'Fase 2: Diskusi & Putar Jarum';

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
    setClueInput('');
    try {
      await startSatuFrekuensiRound({ roomId: room.id, actorUid: myUid, actorName: myName });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memulai ronde.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitClue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clueInput.trim() || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitSatuFrekuensiClue({
        roomId: room.id,
        psychicUid: myUid,
        psychicName: myName,
        clueText: clueInput.trim(),
      });
      setClueInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim petunjuk.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleVoiceClueQuick = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitSatuFrekuensiClue({
        roomId: room.id,
        psychicUid: myUid,
        psychicName: myName,
        clueText: '(Petunjuk disampaikan langsung lewat suara)',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal melanjutkan fase.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleLockGuess = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitSatuFrekuensiGuess({
        roomId: room.id,
        guessValue: myDialValue,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengunci jarum.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleNextPhase = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await advanceSatuFrekuensiPhase({
        roomId: room.id,
        hostUid: myUid,
        hostName: myName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal melanjutkan fase.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnLobby = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await returnSatuFrekuensiToLobby({
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
              Yuk Main · Satu Frekuensi · Ronde #{room.roundNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {room.status !== 'lobby' && (
              <div className="hidden md:inline-flex min-h-[38px] px-3 rounded-xl bg-[#131A24] border border-slate-800 items-center gap-1.5 text-xs font-medium text-cyan-300 whitespace-nowrap">
                <Radio className="w-3.5 h-3.5" />
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

        {/* Host Endless Phase Control Bar (Active Playing Only) */}
        {room.status === 'playing' && freq && (
          <section className="bg-[#131A24] border border-cyan-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-cyan-300 font-medium flex flex-wrap items-center gap-2">
                <span>{phaseLabel}</span>
                <span aria-hidden="true">·</span>
                <span>Penerawang: {freq.psychicName}</span>
                {freq.phase === 'dialing' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {lockedCount}/{guesserTotal} Jarum Terkunci
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {freq.phase === 'clue'
                  ? `Santai tanpa batas waktu—tunggu ${freq.psychicName} memberi petunjuk, atau Host bisa langsung lanjut jika petunjuk disampaikan lewat suara.`
                  : 'Bebas ngobrol sepuasnya! Tekan "Fase Selanjutnya" saat semua sudah siap membuka tabir.'}
              </p>
            </div>

            {isHost ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void handleNextPhase()}
                className="min-h-[44px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
              >
                <span>
                  {actionBusy
                    ? 'Memproses...'
                    : freq.phase === 'clue'
                      ? 'Fase Selanjutnya · Putar Jarum'
                      : 'Fase Selanjutnya · Buka Tabir'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                Menunggu Host klik Fase Selanjutnya
              </span>
            )}
          </section>
        )}

        {/* Responsive 12-Col Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Lobby / Interactive Dial Arena / Reveal */}
          <div
            className={`lg:col-span-5 space-y-5 ${
              mobileTab === 'dial' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* LOBBY */}
            {room.status === 'lobby' && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-bold text-white">Lobi Satu Frekuensi</h1>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Bagikan kode{' '}
                      <span className="font-mono-tabular text-white font-semibold">
                        {room.code}
                      </span>{' '}
                      kepada teman. Bisa dimainkan mulai dari <strong className="text-white">2 pemain</strong> tanpa batas waktu—cocok sambil ngobrol santai!
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || players.length < 2}
                      onClick={() => void handleStartRound()}
                      className="w-full min-h-[48px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyiapkan Ronde...'
                          : players.length < 2
                            ? `Menunggu Pemain (${players.length}/2 Minimal)`
                            : 'Mulai Satu Frekuensi'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai ronde...
                    </div>
                  )}
                </section>

                <SatuFrekuensiLobbySettings room={room} isHost={isHost} />
              </>
            )}

            {/* ACTIVE GAME: CLUE OR DIALING */}
            {room.status === 'playing' && freq && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-cyan-300 font-medium">
                      Spektrum · {freq.category}
                    </p>
                    <h2 className="text-base font-bold text-white mt-0.5">
                      {isPsychic ? 'Kamu Adalah Penerawang' : `Penerawang: ${freq.psychicName}`}
                    </h2>
                  </div>

                  {isPsychic && (
                    <button
                      type="button"
                      onClick={() =>
                        setPsychicShieldRound((prev) => (prev === roundKey ? null : roundKey))
                      }
                      className="min-h-[40px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      {psychicSeesTarget ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>Sembunyikan Target</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Intip Target</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Clue Banner during Dialing Phase */}
                {freq.phase === 'dialing' && (
                  <div className="rounded-xl bg-cyan-950/35 border border-cyan-500/40 px-4 py-3.5 text-center space-y-1">
                    <p className="text-xs text-cyan-300 font-medium">
                      Petunjuk dari {freq.psychicName}
                    </p>
                    <p className="text-lg font-bold text-white leading-snug">
                      &ldquo;{freq.clueText}&rdquo;
                    </p>
                  </div>
                )}

                {/* Dial Surface */}
                <FrequencyDial
                  leftLabel={freq.leftLabel}
                  rightLabel={freq.rightLabel}
                  interactive={!isPsychic && freq.phase === 'dialing'}
                  needleValue={myDialValue}
                  onChangeValue={(val) =>
                    setDialValueByRound((prev) => ({ ...prev, [roundKey]: val }))
                  }
                  targetValue={isPsychic ? (mySecret?.targetValue ?? null) : null}
                  showTargetZone={isPsychic && psychicSeesTarget}
                  centerCaption={
                    isPsychic
                      ? 'Ketuk "Intip Target" untuk melihat zona rahasia tanpa ketahuan teman sebelah.'
                      : freq.phase === 'clue'
                        ? `Menunggu ${freq.psychicName} menyiapkan petunjuk...`
                        : 'Seret jarum di dial atau pakai penggeser di bawah, lalu kunci tebakanmu.'
                  }
                />

                {/* Psychic Clue Form (Phase 1) */}
                {isPsychic && freq.phase === 'clue' && (
                  <div className="space-y-3 pt-2 border-t border-slate-800/80">
                    <form onSubmit={handleSubmitClue} className="space-y-2.5">
                      <label htmlFor="sf-clue-input" className="text-xs font-semibold text-slate-300 block">
                        Tulis 1 Petunjuk untuk Menuntun Penebak ke Zona Target
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="sf-clue-input"
                          type="text"
                          maxLength={80}
                          value={clueInput}
                          onChange={(e) => setClueInput(e.target.value)}
                          placeholder="Contoh: Nasi Padang pakai rendang..."
                          className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="submit"
                          disabled={actionBusy || !clueInput.trim()}
                          className="min-h-[44px] px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                        >
                          <Send className="w-4 h-4" />
                          <span>Kirim Petunjuk</span>
                        </button>
                      </div>
                    </form>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleVoiceClueQuick()}
                      className="w-full min-h-[40px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 hover:border-slate-600 text-xs text-slate-300 hover:text-white transition-colors"
                    >
                      Sudah sebutkan lewat suara? Lanjut ke Fase Putar Jarum
                    </button>
                  </div>
                )}

                {/* Guesser Lock Button (Phase 2) */}
                {!isPsychic && freq.phase === 'dialing' && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleLockGuess()}
                      className={`w-full min-h-[46px] rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${
                        hasLockedMyGuess
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyimpan...'
                          : hasLockedMyGuess
                            ? `Perbarui Kunci Jarum (Titik ${myDialValue})`
                            : `Kunci Jarum di Titik ${myDialValue}`}
                      </span>
                    </button>
                    {hasLockedMyGuess && (
                      <p className="text-xs text-emerald-300 text-center">
                        Jarummu sudah terkunci! Kamu masih bisa mengubahnya sebelum Host menekan Fase Selanjutnya.
                      </p>
                    )}
                  </div>
                )}

                {/* Psychic Waiting Note in Phase 2 */}
                {isPsychic && freq.phase === 'dialing' && (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 leading-relaxed">
                    Dengarkan perdebatan para Penebak tanpa membocorkan posisinya! Saat ini{' '}
                    <span className="font-mono-tabular font-semibold text-cyan-300">
                      {lockedCount}/{guesserTotal}
                    </span>{' '}
                    Penebak telah mengunci jarum.
                  </div>
                )}
              </section>
            )}

            {/* ROUND END: REVEAL & SCOREBOARD */}
            {room.status === 'round_end' && freq && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <Trophy className="w-6 h-6 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Hasil Ronde #{room.roundNumber} · Petunjuk: &ldquo;{freq.clueText}&rdquo;
                    </p>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      Target Asli: Titik {freq.revealedTarget ?? '—'}
                    </h2>
                    {room.lastRoundResult?.reason && (
                      <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                        {room.lastRoundResult.reason}
                      </p>
                    )}
                  </div>
                </div>

                <FrequencyDial
                  leftLabel={freq.leftLabel}
                  rightLabel={freq.rightLabel}
                  targetValue={freq.revealedTarget}
                  showTargetZone={true}
                  revealedGuesses={freq.revealedGuesses}
                />

                {/* Breakdown Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Rincian Poin Ronde Ini</span>
                    <span>
                      Bonus Penerawang ({freq.psychicName}):{' '}
                      <strong className="font-mono-tabular text-cyan-300">
                        +{freq.psychicBonus}
                      </strong>
                    </span>
                  </div>

                  {freq.revealedGuesses.length > 0 ? (
                    <div className="divide-y divide-slate-800 rounded-xl bg-[#0B1018] border border-slate-800">
                      {freq.revealedGuesses.map((entry) => (
                        <div
                          key={entry.uid}
                          className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: entry.avatarColor }}
                            />
                            <span className="font-medium text-white truncate">
                              {entry.displayName}
                            </span>
                            <span className="font-mono-tabular text-slate-400">
                              (Titik {entry.value})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-slate-400">
                              {TIER_LABEL[entry.tier] ?? entry.tier}
                            </span>
                            <span
                              className={`font-mono-tabular font-bold ${
                                entry.points > 0 ? 'text-cyan-300' : 'text-slate-500'
                              }`}
                            >
                              +{entry.points}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 bg-[#0B1018] border border-slate-800 rounded-xl p-3 text-center">
                      Belum ada Penebak yang sempat mengunci jarum pada ronde ini.
                    </p>
                  )}
                </div>

                {isHost ? (
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <button
                      type="button"
                      disabled={actionBusy || players.length < 2}
                      onClick={() => void handleStartRound()}
                      className="flex-1 min-h-[46px] rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
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

          {/* Center Column: Players & Readiness */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <SatuFrekuensiPlayersPanel
              room={room}
              players={players}
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
              quickPrompts={SATU_FREKUENSI_QUICK_PROMPTS_ID}
              promptLabel="Obrolan Santai"
              emptyPlaceholder="Belum ada obrolan. Diskusikan petunjuk Penerawang sepuasnya tanpa dikejar waktu!"
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang Satu Frekuensi"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('dial')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'dial' ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span>Frekuensi</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('obrolan')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'obrolan' ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Obrolan</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('pemain')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'pemain' ? 'text-cyan-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pemain ({players.length})</span>
        </button>
      </nav>
    </div>
  );
}
