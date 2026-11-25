'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Brush,
  Coffee,
  Dices,
  LogOut,
  Monitor,
  Moon,
  Radio,
  Search,
  Smartphone,
  Sparkles,
  Timer,
  Trophy,
  Users,
  Wifi,
} from 'lucide-react';
import QRCode from 'qrcode';
import { PelukisCanvas } from '@/components/games/pelukis-gadungan/PelukisCanvas';
import { FrequencyDial } from '@/components/games/satu-frekuensi/FrequencyDial';
import { UlarDice3D } from '@/components/games/ular-tangga/UlarDice3D';
import { UlarTanggaBoard } from '@/components/games/ular-tangga/UlarTanggaBoard';
import { MALAM_SILUMAN_ROLES } from '@/lib/games/malam-siluman/roles-id';
import { getUlarScenarioPack } from '@/lib/games/ular-tangga/packs';
import {
  evaluateMajorityVoteProgress,
  getEligibleMajorityVoterUids,
} from '@/lib/games/voting/engine';
import type {
  GameType,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import { isLanRoomId } from '@/lib/lan/lan-protocol';
import { RekapPermainanOverlay } from './RekapPermainanOverlay';

interface LayarPanggungViewProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  revealedSecrets: Record<string, PlayerSecretDoc>;
  presence: Record<string, PresenceEntry>;
  onExitStage: () => void;
}

const GAME_META: Record<
  GameType,
  { title: string; icon: typeof Search; accent: string }
> = {
  spyfall: { title: 'Yang Bener Yang Mana', icon: Search, accent: 'text-rose-400' },
  kata_kata: { title: 'Kata-Kata Hari Ini', icon: Sparkles, accent: 'text-amber-400' },
  satu_frekuensi: { title: 'Satu Frekuensi', icon: Radio, accent: 'text-cyan-400' },
  fakta_hari_ini: { title: 'Fakta Hari Ini', icon: BookOpenCheck, accent: 'text-indigo-400' },
  pelukis_gadungan: { title: 'Pelukis Gadungan', icon: Brush, accent: 'text-emerald-400' },
  malam_siluman: { title: 'Malam Siluman', icon: Moon, accent: 'text-rose-400' },
  ular_tangga: { title: 'Ular Tangga RP', icon: Dices, accent: 'text-amber-400' },
};

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LayarPanggungView({
  room,
  players,
  revealedSecrets,
  presence,
  onExitStage,
}: LayarPanggungViewProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const isLanRoom = isLanRoomId(room.id);

  const joinUrl =
    typeof window !== 'undefined' && !isLanRoom
      ? `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room.code)}`
      : '';

  useEffect(() => {
    if (isLanRoom || room.status !== 'lobby') return;
    const canvas = qrCanvasRef.current;
    if (!canvas || !joinUrl) return;
    void QRCode.toCanvas(canvas, joinUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0B1018', light: '#F8FAFC' },
    }).catch(() => {});
  }, [isLanRoom, room.status, joinUrl]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players],
  );
  const activeCount = players.filter((p) => !p.isBrb).length;
  const brbCount = players.length - activeCount;

  const remainingSec =
    room.status === 'playing' && room.roundEndsAtMs > 0
      ? Math.max(0, Math.ceil((room.roundEndsAtMs - nowMs) / 1000))
      : 0;

  const meta = GAME_META[room.gameType];
  const GameIcon = meta.icon;
  const spyUidSet = new Set(room.lastRoundResult?.spyUids ?? []);

  const roundEndHeadline = useMemo(() => {
    const res = room.lastRoundResult;
    if (!res) return '';
    if (room.gameType === 'spyfall') {
      return res.winnerTeam === 'warga' ? 'Tim Warga Menang!' : 'Mata-Mata Menang!';
    }
    if (room.gameType === 'kata_kata') {
      return res.winnerTeam === 'warga' ? 'Tim Warga Menang!' : 'Tim Penyusup Menang!';
    }
    if (room.gameType === 'satu_frekuensi') {
      return `Target Asli: Titik ${room.frequencyState?.revealedTarget ?? '—'}`;
    }
    if (room.gameType === 'fakta_hari_ini') {
      return room.faktaState?.guesserWon
        ? `Penebak Menang! (+${room.faktaState.guesserPoints ?? 0} Poin)`
        : 'Tim Bluffer Menang! (+1 Poin Semua Bluffer)';
    }
    if (room.gameType === 'pelukis_gadungan') {
      return res.winnerTeam === 'pelukis'
        ? 'Pelukis Asli Menang! (+2 Poin)'
        : 'Pelukis Gadungan Menang! (+3 Poin)';
    }
    if (room.gameType === 'malam_siluman') {
      if (res.winnerTeam === 'warga') return 'Tim Warga Menang!';
      if (res.winnerTeam === 'tumbal') return 'Tumbal Menang Solo! (+4 Poin)';
      return 'Kawanan Siluman Menang!';
    }
    if (room.gameType === 'ular_tangga') {
      return `${room.ularTanggaState?.winnerName ?? 'Juara'} Menaklukkan Petak 100!`;
    }
    return `Hasil Ronde #${res.roundNumber}`;
  }, [room]);

  const stageVoteProgress = useMemo(() => {
    if (!room.activeVote) return null;
    const eligible = getEligibleMajorityVoterUids({
      players,
      targetUid: room.activeVote.targetUid,
      excludedUids: room.gameType === 'kata_kata' ? (room.eliminatedUids ?? []) : [],
    });
    return evaluateMajorityVoteProgress(room.activeVote.votes, eligible);
  }, [players, room.activeVote, room.eliminatedUids, room.gameType]);

  return (
    <div className="min-h-screen bg-[#070B12] text-slate-100 flex flex-col">
      {/* Stage Top Header */}
      <header className="border-b border-slate-800/90 bg-[#0D131E] px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center">
              <Monitor className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                {isLanRoom
                  ? 'Layar Panggung · LAN Tanpa Internet'
                  : 'Layar Panggung · Mode Tanpa Rahasia'}
              </p>
              <div className="flex items-center gap-2.5 mt-0.5">
                <GameIcon className={`w-5 h-5 ${meta.accent}`} />
                <h1 className="text-xl sm:text-2xl font-black text-white">{meta.title}</h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Kode Ruang</p>
              <p className="text-2xl font-black tracking-[0.22em] text-white tabular-nums">
                {room.code}
              </p>
            </div>
            <div className="hidden sm:block h-9 w-px bg-slate-800" />
            <div className="hidden sm:block text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400">Pemain Aktif</p>
              <p className="text-lg font-bold text-slate-200 tabular-nums">
                {activeCount}
                {brbCount > 0 ? ` (${brbCount} BRB)` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onExitStage}
              className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Tutup Panggung</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Stage Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 sm:py-8">
        {room.status === 'lobby' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Giant Join QR (Online) or Wi-Fi LAN Stage Card */}
            <div className="lg:col-span-5 rounded-2xl bg-[#131A24] border border-slate-800 p-6 sm:p-8 flex flex-col items-center text-center space-y-5">
              {isLanRoom ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center">
                    <Wifi className="w-8 h-8 text-amber-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
                      Terhubung via LAN Party
                    </p>
                    <p className="text-4xl sm:text-5xl font-black tracking-[0.24em] text-white tabular-nums pt-1">
                      {room.code}
                    </p>
                  </div>
                  <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                    Layar Panggung ini tersambung langsung ke HP Host lewat Wi-Fi lokal tanpa internet. Untuk menambah pemain lain, minta Host menekan tombol{' '}
                    <strong className="text-amber-300">Undang LAN (QR)</strong>.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
                    Scan untuk Gabung dari HP
                  </p>
                  <div className="p-4 rounded-2xl bg-slate-50 shadow-xl">
                    <canvas ref={qrCanvasRef} className="block rounded-md" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Atau masukkan kode ruang</p>
                    <p className="text-4xl sm:text-5xl font-black tracking-[0.24em] text-white tabular-nums mt-1">
                      {room.code}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                    Menunggu Host memulai ronde <strong className="text-white">{meta.title}</strong>. Semua rahasia peran hanya muncul di layar HP masing-masing.
                  </p>
                </>
              )}
            </div>

            {/* Right: Live Roster & Current Match Scores */}
            <div className="lg:col-span-7 rounded-2xl bg-[#131A24] border border-slate-800 p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-white">
                    Pemain di Meja ({players.length}/12)
                  </h2>
                </div>
                <span className="text-xs text-slate-400 tabular-nums">
                  {room.completedGames?.length ?? 0} game terekap · {room.currentMatchRounds ?? 0} ronde
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedPlayers.map((p) => {
                  const controllerId = p.controllerUid ?? p.uid;
                  const isOnline = presence[controllerId]?.online === true;
                  return (
                    <div
                      key={p.uid}
                      className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
                        p.isBrb
                          ? 'bg-[#0B1018]/60 border-amber-500/30 opacity-75'
                          : 'bg-[#0B1018] border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white"
                            style={{ backgroundColor: p.avatarColor }}
                          >
                            {p.displayName.slice(0, 1).toUpperCase()}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0B1018] ${
                              isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {p.displayName}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {p.isHost && <span className="text-amber-400 font-semibold">Host</span>}
                            {p.isNumpang && (
                              <span className="inline-flex items-center gap-0.5 text-emerald-400">
                                <Smartphone className="w-3 h-3" />
                                Numpang
                              </span>
                            )}
                            {p.isBrb && (
                              <span className="inline-flex items-center gap-0.5 text-amber-300 font-semibold">
                                <Coffee className="w-3 h-3" />
                                BRB
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-base font-black text-slate-200 tabular-nums">
                        {p.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE PLAY OR ROUND END STAGE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Stage Area */}
            <div className="lg:col-span-8 space-y-5">
              {/* Round End Banner */}
              {room.status === 'round_end' && room.lastRoundResult && (
                <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-[#131A24] to-[#131A24] border border-amber-400/50 p-6 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                    <Trophy className="w-4 h-4" />
                    <span>Ronde #{room.roundNumber} Selesai</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    {roundEndHeadline}
                  </h2>
                  <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                    {room.lastRoundResult.reason}
                  </p>
                </div>
              )}

              {/* GAME #1: SPYFALL STAGE */}
              {room.gameType === 'spyfall' && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">
                        Ronde #{room.roundNumber}
                      </p>
                      <h2 className="text-xl font-black text-white mt-0.5">
                        Daftar Kemungkinan Lokasi
                      </h2>
                    </div>
                    {room.status === 'playing' && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1018] border border-slate-800">
                        <Timer className="w-5 h-5 text-rose-400" />
                        <span className="text-2xl font-mono font-black text-white tabular-nums">
                          {formatClock(remainingSec)}
                        </span>
                      </div>
                    )}
                  </div>

                  {room.activeVote && stageVoteProgress && (
                    <div className="rounded-xl bg-rose-500/15 border border-rose-400/50 p-4 text-center space-y-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Voting Tuduhan Sedang Berlangsung · Mayoritas 50% + 1
                      </p>
                      <p className="text-lg font-black text-white">
                        {room.activeVote.initiatorName} menuduh {room.activeVote.targetName}!
                      </p>
                      <div className="max-w-md mx-auto space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-200">
                          <span className="font-bold text-rose-200">
                            Setuju {stageVoteProgress.yesCount}/{stageVoteProgress.requiredYes}
                          </span>
                          <span className="text-slate-300">
                            Tolak {stageVoteProgress.noCount} · Belum {stageVoteProgress.remainingCount}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-900/80 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-400 transition-all duration-300"
                            style={{
                              width: `${
                                stageVoteProgress.requiredYes > 0
                                  ? Math.min(
                                      100,
                                      Math.round(
                                        (stageVoteProgress.yesCount / stageVoteProgress.requiredYes) *
                                          100,
                                      ),
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {room.selectedLocationNames.map((loc) => {
                      const isActual =
                        room.status === 'round_end' &&
                        room.lastRoundResult?.locationName === loc;
                      return (
                        <div
                          key={loc}
                          className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold border ${
                            isActual
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-black'
                              : 'bg-[#0B1018] border-slate-800 text-slate-200'
                          }`}
                        >
                          {loc}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GAME #2: KATA-KATA STAGE */}
              {room.gameType === 'kata_kata' && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-slate-400">
                        Ronde #{room.roundNumber} · Eliminasi &amp; Deduksi
                      </p>
                      <h2 className="text-xl font-black text-white mt-0.5">
                        Status Meja Kata-Kata
                      </h2>
                    </div>
                    {room.status === 'playing' && (
                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1018] border border-slate-800">
                        <Timer className="w-5 h-5 text-amber-400" />
                        <span className="text-2xl font-mono font-black text-white tabular-nums">
                          {formatClock(remainingSec)}
                        </span>
                      </div>
                    )}
                  </div>

                  {room.activeVote && stageVoteProgress && (
                    <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 p-4 text-center space-y-2.5">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Voting Eliminasi Berlangsung · Mayoritas 50% + 1
                      </p>
                      <p className="text-lg font-black text-white">
                        Apakah {room.activeVote.targetName} adalah Penyusup?
                      </p>
                      <div className="max-w-md mx-auto space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-200">
                          <span className="font-bold text-amber-200">
                            Setuju {stageVoteProgress.yesCount}/{stageVoteProgress.requiredYes}
                          </span>
                          <span className="text-slate-300">
                            Tolak {stageVoteProgress.noCount} · Belum {stageVoteProgress.remainingCount}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-900/80 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-400 transition-all duration-300"
                            style={{
                              width: `${
                                stageVoteProgress.requiredYes > 0
                                  ? Math.min(
                                      100,
                                      Math.round(
                                        (stageVoteProgress.yesCount / stageVoteProgress.requiredYes) *
                                          100,
                                      ),
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {room.pendingSpyGuess && (
                    <div className="rounded-xl bg-rose-500/15 border border-rose-400/50 p-4 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Kesempatan Terakhir Penyusup
                      </p>
                      <p className="text-lg font-black text-white mt-1">
                        {room.pendingSpyGuess.spyName} sedang menebak kata Warga!
                      </p>
                    </div>
                  )}

                  {room.status === 'round_end' && room.lastRoundResult?.citizenWord && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-4">
                        <p className="text-xs text-emerald-300 uppercase font-bold">Kata Warga</p>
                        <p className="text-2xl font-black text-white mt-1">
                          {room.lastRoundResult.citizenWord}
                        </p>
                      </div>
                      <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-4">
                        <p className="text-xs text-rose-300 uppercase font-bold">
                          Kata Penyusup
                        </p>
                        <p className="text-2xl font-black text-white mt-1">
                          {room.lastRoundResult.spyWord || '—'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GAME #3: SATU FREKUENSI STAGE */}
              {room.gameType === 'satu_frekuensi' && room.frequencyState && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-cyan-400 font-bold">
                        Ronde #{room.roundNumber} · Penerawang: {room.frequencyState.psychicName}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                        {room.frequencyState.clueText
                          ? `“${room.frequencyState.clueText}”`
                          : `${room.frequencyState.psychicName} sedang memikirkan petunjuk...`}
                      </h2>
                    </div>
                    {room.frequencyState.phase === 'dialing' && (
                      <div className="px-4 py-2 rounded-xl bg-[#0B1018] border border-slate-800 text-right">
                        <p className="text-[11px] uppercase text-slate-400">Terkunci</p>
                        <p className="text-xl font-mono font-black text-cyan-300 tabular-nums">
                          {room.frequencyState.lockedUids.length} /{' '}
                          {Math.max(1, activeCount - 1)}
                        </p>
                      </div>
                    )}
                  </div>

                  <FrequencyDial
                    leftLabel={room.frequencyState.leftLabel}
                    rightLabel={room.frequencyState.rightLabel}
                    interactive={false}
                    targetValue={
                      room.frequencyState.phase === 'reveal'
                        ? room.frequencyState.revealedTarget
                        : null
                    }
                    showTargetZone={room.frequencyState.phase === 'reveal'}
                    revealedGuesses={
                      room.frequencyState.phase === 'reveal'
                        ? room.frequencyState.revealedGuesses
                        : []
                    }
                    centerCaption={
                      room.frequencyState.phase === 'clue'
                        ? 'Target rahasia hanya terlihat di HP Penerawang.'
                        : room.frequencyState.phase === 'dialing'
                          ? 'Semua penebak sedang menggeser jarum di HP masing-masing.'
                          : undefined
                    }
                  />
                </div>
              )}

              {/* GAME #4: FAKTA HARI INI STAGE */}
              {room.gameType === 'fakta_hari_ini' && room.faktaState && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-indigo-400 font-bold">
                        Ronde #{room.roundNumber} · Pengendali Fase:{' '}
                        {room.faktaState.phaseControllerName}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                        Penebak: {room.faktaState.guesserName}
                      </h2>
                    </div>
                    <div className="px-4 py-2 rounded-xl bg-indigo-500/15 border border-indigo-400/40 text-sm font-bold text-indigo-200">
                      {room.status === 'round_end'
                        ? 'Pengungkapan Fakta'
                        : room.faktaState.phase === 'guessing'
                          ? 'Fase 2: Penebak Memilih'
                          : 'Fase 1: Kartu & Diskusi'}
                    </div>
                  </div>

                  {room.status === 'round_end' && room.faktaState.revealedFactTwist ? (
                    <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/50 p-5 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                        Pembawa Fakta Asli: {room.faktaState.revealedTruthTellerName ?? '—'}
                      </p>
                      <p className="text-lg sm:text-xl font-bold text-white leading-relaxed">
                        {room.faktaState.revealedFactPrefix}
                        <span className="text-emerald-300 font-black">
                          ({room.faktaState.revealedFactTwist})
                        </span>
                        {room.faktaState.revealedFactSuffix}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-6 text-center space-y-2">
                      <p className="text-lg font-bold text-white">
                        {room.faktaState.phase === 'guessing'
                          ? `${room.faktaState.guesserName} sedang menunjuk siapa Pembawa Fakta Asli!`
                          : 'Tim Bluffer sedang membacakan fakta & karangan terbaik mereka.'}
                      </p>
                      <p className="text-sm text-slate-400">
                        Isi fakta rahasia tidak ditampilkan di Layar Panggung sampai ronde selesai.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* GAME #5: PELUKIS GADUNGAN STAGE */}
              {room.gameType === 'pelukis_gadungan' && room.lukisanState && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 sm:p-8 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
                        Ronde #{room.roundNumber} · Tema Umum: {room.lukisanState.category}
                      </p>
                      <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                        {room.status === 'round_end'
                          ? `Kata Rahasia: ${room.lukisanState.revealedWord ?? '—'}`
                          : room.lukisanState.phase === 'drawing'
                            ? `Giliran Menggambar: ${room.lukisanState.currentTurnName}`
                            : room.lukisanState.phase === 'voting'
                              ? 'Diskusi & Voting Pelukis Gadungan!'
                              : `${room.lukisanState.accusedName} Menebak Kata Rahasia...`}
                      </h2>
                    </div>
                    <div className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-sm font-bold text-emerald-200 tabular-nums">
                      {room.lukisanState.phase === 'drawing'
                        ? `Putaran ${room.lukisanState.strokeRound}/${room.lukisanState.totalStrokeRounds}`
                        : room.lukisanState.phase === 'voting'
                          ? `${room.lukisanState.submittedVoteUids.length}/${room.lukisanState.turnOrder.length} Suara`
                          : room.status === 'round_end'
                            ? 'Pengungkapan'
                            : 'Kesempatan Terakhir'}
                    </div>
                  </div>

                  {room.status === 'round_end' && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-400/40 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                          Pelukis Gadungan Ronde Ini
                        </p>
                        <p className="text-xl font-black text-white mt-0.5">
                          {room.lukisanState.gadunganNames?.join(', ') || '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-400">Kata Rahasia</p>
                        <p className="text-xl font-black text-emerald-300">
                          {room.lukisanState.revealedWord ?? '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="max-w-xl mx-auto">
                    <PelukisCanvas
                      strokes={room.lukisanState.strokes}
                      interactive={false}
                      allowReplay={room.status === 'round_end'}
                      autoPlayReplay={room.status === 'round_end'}
                      turnOrder={room.lukisanState.turnOrder}
                      turnNamesByUid={room.lukisanState.turnNamesByUid}
                      turnColorsByUid={room.lukisanState.turnColorsByUid}
                    />
                  </div>
                </div>
              )}

              {/* GAME #6: MALAM SILUMAN STAGE (Zero living secret leaks) */}
              {room.gameType === 'malam_siluman' && room.malamSilumanState && (() => {
                const ms = room.malamSilumanState;
                const livingSet = new Set(ms.livingUids);
                const deadByUid = new Map(ms.deadPlayers.map((d) => [d.uid, d]));
                const stagePhaseTitle =
                  room.status === 'round_end'
                    ? 'Pengungkapan Identitas Desa'
                    : ms.phase === 'night'
                      ? `Malam #${ms.nightNumber} — Desa Tertidur`
                      : ms.phase === 'dawn'
                        ? `Fajar Hari #${ms.dayNumber}`
                        : ms.phase === 'day_discussion'
                          ? `Diskusi Siang #${ms.dayNumber}`
                          : ms.phase === 'day_voting'
                            ? `Voting Eksekusi Siang #${ms.dayNumber}`
                            : 'Tembakan Terakhir Pemburu!';
                const stageProgressLabel =
                  ms.phase === 'night'
                    ? `${ms.submittedNightUids.length}/${ms.livingUids.length} Aksi Malam`
                    : ms.phase === 'day_voting'
                      ? `${ms.submittedVoteUids.length}/${ms.livingUids.length} Suara`
                      : `${ms.livingUids.length}/${ms.participantUids.length} Hidup`;

                return (
                  <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-6 sm:p-8 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-rose-400 font-bold">
                          Ronde #{room.roundNumber} · Desa Malam Siluman
                        </p>
                        <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                          {stagePhaseTitle}
                        </h2>
                      </div>
                      <div className="px-4 py-2 rounded-xl bg-rose-500/15 border border-rose-400/40 text-sm font-bold text-rose-200 tabular-nums">
                        {stageProgressLabel}
                      </div>
                    </div>

                    {(ms.lastNightSummary || ms.lastDaySummary || ms.lastHunterSummary) && (
                      <div className="space-y-2.5">
                        {ms.lastNightSummary && (
                          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-sm text-slate-200 leading-relaxed">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1">
                              Berita Fajar
                            </span>
                            {ms.lastNightSummary}
                          </div>
                        )}
                        {ms.lastHunterSummary && (
                          <div className="rounded-xl bg-rose-950/35 border border-rose-500/40 p-4 text-sm text-rose-200 leading-relaxed">
                            <span className="text-xs font-bold uppercase tracking-wider text-rose-300 block mb-1">
                              Tembakan Pemburu
                            </span>
                            {ms.lastHunterSummary}
                          </div>
                        )}
                        {ms.lastDaySummary && (
                          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-sm text-slate-200 leading-relaxed">
                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                              Hasil Voting Siang
                            </span>
                            {ms.lastDaySummary}
                          </div>
                        )}
                      </div>
                    )}

                    {ms.phase === 'hunter_revenge' && ms.pendingHunterName && (
                      <div className="rounded-xl bg-rose-500/15 border border-rose-400/50 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                          Fase Pembalasan Pemburu
                        </p>
                        <p className="text-lg font-black text-white mt-1">
                          {ms.pendingHunterName} sedang membidik 1 tersangka untuk ikut gugur!
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Status Penduduk Desa ({ms.livingUids.length} Hidup · {ms.deadPlayers.length} Gugur)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {ms.participantUids.map((uid) => {
                          const isAlive = livingSet.has(uid);
                          const dead = deadByUid.get(uid);
                          const endRoleId =
                            room.status === 'round_end' ? ms.revealedRolesByUid?.[uid] : null;
                          const shownRole =
                            endRoleId ?? (dead?.revealedRole ? dead.revealedRole : null);
                          const roleMeta = shownRole ? MALAM_SILUMAN_ROLES[shownRole] : null;

                          return (
                            <div
                              key={uid}
                              className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-2 ${
                                !isAlive
                                  ? 'bg-[#0B1018]/60 border-rose-900/50 text-slate-400'
                                  : 'bg-[#0B1018] border-slate-800 text-slate-100'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className={`text-sm font-bold truncate ${!isAlive ? 'line-through' : 'text-white'}`}>
                                  {ms.participantNamesByUid[uid] ?? 'Pemain'}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {isAlive
                                    ? 'Masih Hidup'
                                    : dead?.cause === 'night_kill'
                                      ? `Gugur Malam #${dead.dayOrNightNumber}`
                                      : dead?.cause === 'hunter_shot'
                                        ? 'Tertembak Pemburu'
                                        : `Dieksekusi Hari #${dead?.dayOrNightNumber ?? 1}`}
                                </p>
                              </div>
                              <span
                                className={`text-xs font-bold shrink-0 ${
                                  roleMeta
                                    ? roleMeta.team === 'siluman'
                                      ? 'text-rose-400'
                                      : roleMeta.team === 'netral'
                                        ? 'text-amber-300'
                                        : 'text-emerald-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {roleMeta ? roleMeta.name : isAlive ? 'Rahasia' : 'Tertutup'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* GAME #7: ULAR TANGGA RP STAGE (Public Board + Adventure Log, Zero Bag Leaks) */}
              {room.gameType === 'ular_tangga' && room.ularTanggaState && (() => {
                const uts = room.ularTanggaState;
                const scenarioPack = getUlarScenarioPack(uts.scenarioId);
                return (
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                          Giliran #{uts.turnNumber} · {uts.boardMode === 'brutal' ? 'Mode Brutal' : 'Mode Standar'}
                        </p>
                        <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                          {room.status === 'round_end'
                            ? `${uts.winnerName ?? 'Petualang'} Menang!`
                            : `Giliran: ${uts.currentTurnName}`}
                        </h2>
                        {uts.lastRoll && (
                          <p className="text-xs sm:text-sm text-slate-300 leading-snug">
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
                        />
                      </div>
                    </div>

                    <UlarTanggaBoard state={uts} />

                    <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Log Petualangan Terbaru
                      </p>
                      <ul className="space-y-1 text-xs sm:text-sm text-slate-300">
                        {uts.eventLog.slice(0, 4).map((line, i) => (
                          <li key={i} className={i === 0 ? 'text-white font-semibold' : 'text-slate-400'}>
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}

              {/* Post-Round Role Reveal Table (Spyfall & Kata-Kata only) */}
              {room.status === 'round_end' &&
                Object.keys(revealedSecrets).length > 0 &&
                (room.gameType === 'spyfall' || room.gameType === 'kata_kata') && (
                  <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Identitas Terbongkar
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {players.map((p) => {
                        const sec = revealedSecrets[p.uid];
                        if (!sec) return null;
                        const isSuspect =
                          room.gameType === 'kata_kata'
                            ? spyUidSet.has(p.uid)
                            : Boolean(sec.isSpy);
                        const label =
                          room.gameType === 'kata_kata'
                            ? `${sec.secretWord ?? '—'} (${isSuspect ? 'Penyusup' : 'Warga'})`
                            : sec.isSpy
                              ? 'Mata-Mata'
                              : sec.roleName || 'Warga';
                        return (
                          <div
                            key={p.uid}
                            className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between text-sm ${
                              isSuspect
                                ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                                : 'bg-[#0B1018] border-slate-800 text-slate-200'
                            }`}
                          >
                            <span className="font-bold truncate">{p.displayName}</span>
                            <span className="text-xs font-semibold shrink-0">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>

            {/* Right Sidebar: Live Scoreboard */}
            <aside className="lg:col-span-4 rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Skor Game Ini
                </h3>
                <span className="text-xs text-slate-500 tabular-nums">
                  {room.currentMatchRounds ?? 0} ronde
                </span>
              </div>
              <div className="space-y-2">
                {sortedPlayers.map((p, idx) => (
                  <div
                    key={p.uid}
                    className={`rounded-xl px-3.5 py-2.5 border flex items-center justify-between gap-2 ${
                      p.isBrb
                        ? 'bg-[#0B1018]/60 border-amber-500/25 opacity-65'
                        : 'bg-[#0B1018] border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono text-slate-500 w-5 tabular-nums">
                        #{idx + 1}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.avatarColor }}
                      />
                      <span className="text-sm font-bold text-white truncate">
                        {p.displayName}
                      </span>
                      {p.isBrb && (
                        <span className="text-[10px] font-bold text-amber-400">BRB</span>
                      )}
                    </div>
                    <span className="font-mono text-base font-black text-amber-300 tabular-nums">
                      {p.score}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Synchronized Rekap Permainan & Live Suit Duel on Big Screen */}
      {room.activeRecap && (
        <RekapPermainanOverlay
          room={room}
          recap={room.activeRecap}
          players={players}
          deviceUid=""
          deviceName="Layar Panggung"
          activeSeatUid=""
          isStageDisplay
        />
      )}
    </div>
  );
}
