'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Coffee,
  LogOut,
  Monitor,
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
import { FrequencyDial } from '@/components/games/satu-frekuensi/FrequencyDial';
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
    return `Hasil Ronde #${res.roundNumber}`;
  }, [room]);

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

                  {room.activeVote && (
                    <div className="rounded-xl bg-rose-500/15 border border-rose-400/50 p-4 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Voting Tuduhan Sedang Berlangsung
                      </p>
                      <p className="text-lg font-black text-white mt-1">
                        {room.activeVote.initiatorName} menuduh {room.activeVote.targetName}!
                      </p>
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

                  {room.activeVote && (
                    <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 p-4 text-center">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Voting Eliminasi Berlangsung
                      </p>
                      <p className="text-lg font-black text-white mt-1">
                        Apakah {room.activeVote.targetName} adalah Penyusup?
                      </p>
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
