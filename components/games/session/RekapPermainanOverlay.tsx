'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Crown,
  Download,
  Hand,
  Hexagon,
  Scissors,
  Smartphone,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import type {
  GameType,
  RoomDoc,
  RoomPlayerDoc,
  SessionRecapDoc,
  SuitPick,
} from '@/lib/games/types';
import {
  advanceSuitDuelClash,
  closeSessionRecap,
  submitSuitDuelPick,
} from '@/lib/platform/room-service';

interface RekapPermainanOverlayProps {
  room: RoomDoc;
  recap: SessionRecapDoc;
  players: RoomPlayerDoc[];
  deviceUid: string;
  deviceName: string;
  activeSeatUid: string;
  isStageDisplay?: boolean;
  onSelectSeat?: (seat: RoomPlayerDoc) => void;
}

const GAME_LABELS: Record<GameType, string> = {
  spyfall: 'Yang Bener Yang Mana',
  kata_kata: 'Kata-Kata Hari Ini',
  satu_frekuensi: 'Satu Frekuensi',
  fakta_hari_ini: 'Fakta Hari Ini',
  pelukis_gadungan: 'Pelukis Gadungan',
};

const SUIT_OPTIONS: Array<{
  id: SuitPick;
  label: string;
  beats: string;
  icon: typeof Hexagon;
}> = [
  { id: 'batu', label: 'Batu', beats: 'Kalahkan Gunting', icon: Hexagon },
  { id: 'gunting', label: 'Gunting', beats: 'Kalahkan Kertas', icon: Scissors },
  { id: 'kertas', label: 'Kertas', beats: 'Kalahkan Batu', icon: Hand },
];

function suitLabel(pick: SuitPick): string {
  if (pick === 'batu') return 'Batu';
  if (pick === 'gunting') return 'Gunting';
  return 'Kertas';
}

function resolutionCaption(resolvedBy: SessionRecapDoc['resolvedBy']): string {
  if (resolvedBy === 'games_won') return 'Paling Banyak Menang Game';
  if (resolvedBy === 'overall_xp') return 'Seri Kemenangan · Unggul Total XP';
  if (resolvedBy === 'suit_duel') return 'Pemenang Duel Suit Best-of-3';
  return 'Menunggu Duel Penentuan MVP';
}

function clashSummaryText(
  clash: NonNullable<SessionRecapDoc['tiebreakerDuel']>['lastClash'],
  duelistNames: Record<string, string>,
): string {
  if (!clash) return '';
  if (clash.isDraw) {
    return `Bentrok #${clash.clashNumber} SERI! Tidak ada poin tambahan — ulangi bentrok!`;
  }
  const winners = clash.winnerUids.map((uid) => duelistNames[uid] ?? 'Pemain').join(', ');
  return `${winners} memenangkan Bentrok #${clash.clashNumber}!`;
}

function downloadRecapCardPng(roomCode: string, recap: SessionRecapDoc) {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep theatrical backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0B1018');
  bgGrad.addColorStop(0.55, '#131A26');
  bgGrad.addColorStop(1, '#1A141E');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle top accent bar
  const barGrad = ctx.createLinearGradient(0, 0, width, 0);
  barGrad.addColorStop(0, '#F59E0B');
  barGrad.addColorStop(0.5, '#F43F5E');
  barGrad.addColorStop(1, '#22D3EE');
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, width, 14);

  // Header
  ctx.fillStyle = '#F59E0B';
  ctx.font = '700 28px system-ui, -apple-system, sans-serif';
  ctx.fillText('YUK MAIN · REKAP PERMAINAN', 72, 92);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 24px ui-monospace, SFMono-Regular, monospace';
  ctx.fillText(`RUANG ${roomCode} · ${recap.completedGames.length} GAME SELESAI`, 72, 134);

  // MVP Hero Card
  ctx.fillStyle = '#182130';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(72, 178, width - 144, 240, 28);
  ctx.fill();
  ctx.stroke();

  const mvpStanding =
    recap.standings.find((s) => recap.mvpUids.includes(s.uid)) ?? recap.standings[0];

  ctx.fillStyle = '#FBBF24';
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.fillText('MVP MALAM INI', 112, 232);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 58px system-ui, -apple-system, sans-serif';
  const mvpDisplayTitle =
    recap.mvpNames.length > 0
      ? recap.mvpNames.join(' & ')
      : mvpStanding?.displayName ?? 'Juara Tongkrongan';
  ctx.fillText(mvpDisplayTitle.slice(0, 22), 112, 304);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '600 26px system-ui, -apple-system, sans-serif';
  const statLine = mvpStanding
    ? `${mvpStanding.gamesWon} Menang Game  ·  ${mvpStanding.overallXp} Total XP  ·  ${resolutionCaption(recap.resolvedBy)}`
    : resolutionCaption(recap.resolvedBy);
  ctx.fillText(statLine.slice(0, 62), 112, 358);

  // Klasemen Sesi
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '800 30px system-ui, -apple-system, sans-serif';
  ctx.fillText('Klasemen Sesi', 72, 488);

  const topStandings = recap.standings.slice(0, 6);
  let y = 520;
  topStandings.forEach((row, idx) => {
    ctx.fillStyle = idx === 0 ? '#1E293B' : '#111824';
    ctx.strokeStyle = idx === 0 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(51, 65, 85, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(72, y, width - 144, 72, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = idx === 0 ? '#FBBF24' : '#94A3B8';
    ctx.font = '800 26px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`#${idx + 1}`, 102, y + 46);

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '700 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(row.displayName.slice(0, 20), 174, y + 46);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FBBF24';
    ctx.font = '800 24px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`${row.gamesWon} Menang`, width - 255, y + 45);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '700 24px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`${row.overallXp} XP`, width - 104, y + 45);
    ctx.textAlign = 'left';

    y += 84;
  });

  // Riwayat Game
  const historyY = Math.max(y + 34, 1040);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '800 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('Riwayat Permainan', 72, historyY);

  const recentGames = recap.completedGames.slice(-4);
  let gy = historyY + 26;
  recentGames.forEach((game, idx) => {
    const gameNum = recap.completedGames.length - recentGames.length + idx + 1;
    const winners = game.winnerNames.join(', ') || '—';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `#${gameNum} ${GAME_LABELS[game.gameType]} (${game.roundsPlayed} ronde) — Juara: ${winners}`.slice(
        0,
        66,
      ),
      72,
      gy + 22,
    );
    gy += 38;
  });

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('Yuk Main · Main Bareng Tanpa Ribet', 72, height - 42);

  const link = document.createElement('a');
  link.download = `rekap-yuk-main-${roomCode.toLowerCase()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export function RekapPermainanOverlay({
  room,
  recap,
  players,
  deviceUid,
  deviceName,
  activeSeatUid,
  isStageDisplay = false,
  onSelectSeat,
}: RekapPermainanOverlayProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = !isStageDisplay && room.hostUid === deviceUid;
  const duel = recap.tiebreakerDuel;
  const isDuelActive = Boolean(duel && duel.status !== 'finished');

  const deviceSeats = useMemo(
    () =>
      players.filter(
        (p) => p.uid === deviceUid || (p.isNumpang && p.controllerUid === deviceUid),
      ),
    [players, deviceUid],
  );

  const activeSeat =
    deviceSeats.find((s) => s.uid === activeSeatUid) ??
    players.find((p) => p.uid === deviceUid) ??
    null;

  const isActiveSeatDuelist = Boolean(
    !isStageDisplay &&
      duel &&
      activeSeat &&
      duel.duelistUids.includes(activeSeat.uid),
  );
  const activeSeatPicked = Boolean(
    duel && activeSeat && duel.submittedUids.includes(activeSeat.uid),
  );

  // Check if another Numpang seat on this same phone is also a duelist waiting to pick
  const pendingCoSeatDuelist = useMemo(() => {
    if (!duel || duel.status !== 'picking' || isStageDisplay) return null;
    return (
      deviceSeats.find(
        (seat) =>
          seat.uid !== activeSeat?.uid &&
          duel.duelistUids.includes(seat.uid) &&
          !duel.submittedUids.includes(seat.uid),
      ) ?? null
    );
  }, [duel, deviceSeats, activeSeat, isStageDisplay]);

  const handleSuitPick = async (pick: SuitPick) => {
    if (!activeSeat || busy || isStageDisplay) return;
    setBusy(true);
    setError(null);
    try {
      await submitSuitDuelPick({
        roomId: room.id,
        actorUid: activeSeat.uid,
        actorName: activeSeat.displayName,
        pick,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim pilihan Suit.');
    } finally {
      setBusy(false);
    }
  };

  const handleNextClash = async () => {
    if (!isHost || busy) return;
    setBusy(true);
    setError(null);
    try {
      await advanceSuitDuelClash({
        roomId: room.id,
        hostUid: deviceUid,
        hostName: deviceName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melanjutkan bentrok Suit.');
    } finally {
      setBusy(false);
    }
  };

  const handleCloseRecap = async () => {
    if (!isHost || busy) return;
    setBusy(true);
    setError(null);
    try {
      await closeSessionRecap({
        roomId: room.id,
        hostUid: deviceUid,
        hostName: deviceName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menutup Rekap Permainan.');
    } finally {
      setBusy(false);
    }
  };

  const mvpStanding =
    recap.standings.find((s) => recap.mvpUids.includes(s.uid)) ?? recap.standings[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#070B12]/95 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rekap-title"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center shrink-0">
              {isDuelActive ? (
                <Swords className="w-6 h-6 text-amber-400" />
              ) : (
                <Trophy className="w-6 h-6 text-amber-400" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                Ruang {room.code} · {recap.completedGames.length} Game Terekap
              </p>
              <h1 id="rekap-title" className="text-xl sm:text-2xl font-black text-white">
                {isDuelActive ? 'Duel Suit Penentuan MVP' : 'Rekap Permainan'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isDuelActive && !isStageDisplay && (
              <button
                type="button"
                onClick={() => downloadRecapCardPng(room.code, recap)}
                className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Simpan Kartu (PNG)</span>
              </button>
            )}
            {isHost && (
              <button
                type="button"
                disabled={busy}
                onClick={handleCloseRecap}
                className="min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Tutup Rekap</span>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* STAGE A: LIVE BEST-OF-3 SUIT DUEL TIEBREAKER */}
        {isDuelActive && duel ? (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-[#131A24] border border-amber-500/40 p-5 sm:p-7 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Skor Menang &amp; Total XP Seri · Best-of-3 (Cari 2 Kemenangan)
                </p>
                <h2 className="text-lg sm:text-2xl font-black text-white mt-1">
                  Bentrok #{duel.clashNumber} — Batu, Gunting, Kertas
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Status Terkunci</p>
                <p className="text-lg font-black text-cyan-300 tabular-nums">
                  {duel.submittedUids.length} / {duel.duelistUids.length}
                </p>
              </div>
            </div>

            {/* Contenders Scoreboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {duel.duelistUids.map((cUid) => {
                const wins = duel.winsByUid[cUid] ?? 0;
                const locked = duel.submittedUids.includes(cUid);
                const revealedPick = duel.lastClash?.picksByUid[cUid];
                const wonLastClash = duel.lastClash?.winnerUids.includes(cUid);
                return (
                  <div
                    key={cUid}
                    className={`rounded-xl p-4 border flex items-center justify-between gap-3 ${
                      wonLastClash
                        ? 'bg-emerald-500/10 border-emerald-400/60'
                        : 'bg-[#0B1018] border-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-base font-bold text-white truncate">
                        {duel.duelistNames[cUid] ?? 'Pemain'}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {duel.status === 'clash_reveal' && revealedPick
                          ? `Mengeluarkan: ${suitLabel(revealedPick)}`
                          : locked
                            ? 'Pilihan terkunci'
                            : 'Sedang memilih...'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {Array.from({ length: duel.targetWins }).map((_, idx) => (
                        <span
                          key={idx}
                          className={`w-4 h-4 rounded-full border ${
                            idx < wins
                              ? 'bg-amber-400 border-amber-300'
                              : 'bg-slate-900 border-slate-700'
                          }`}
                        />
                      ))}
                      <span className="ml-1.5 font-mono text-sm font-black text-amber-300 tabular-nums">
                        {wins}/{duel.targetWins}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Picking Phase Controls */}
            {duel.status === 'picking' && (
              <div className="space-y-4">
                {isActiveSeatDuelist ? (
                  activeSeatPicked ? (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 space-y-3">
                      <div className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>
                          Pilihan {activeSeat?.displayName} sudah terkunci! Menunggu lawan...
                        </span>
                      </div>
                      {pendingCoSeatDuelist && onSelectSeat && (
                        <button
                          type="button"
                          onClick={() => onSelectSeat(pendingCoSeatDuelist)}
                          className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          <Smartphone className="w-4 h-4" />
                          Serahkan HP ke {pendingCoSeatDuelist.displayName} (Numpang)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-300">
                        Giliran rahasia <strong className="text-white">{activeSeat?.displayName}</strong> — pilih jurusmu:
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {SUIT_OPTIONS.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={busy}
                              onClick={() => handleSuitPick(opt.id)}
                              className="min-h-[104px] rounded-xl bg-[#0B1018] hover:bg-amber-500/15 border border-slate-700 hover:border-amber-400 p-3 flex flex-col items-center justify-center gap-2 text-center transition-all disabled:opacity-40"
                            >
                              <Icon className="w-7 h-7 text-amber-400" />
                              <span className="text-sm sm:text-base font-black text-white">
                                {opt.label}
                              </span>
                              <span className="text-[11px] text-slate-400 hidden sm:block">
                                {opt.beats}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-center space-y-2">
                    <p className="text-sm font-semibold text-slate-200">
                      {isStageDisplay
                        ? 'Para finalis sedang mengunci pilihan Suit di HP masing-masing...'
                        : 'Kamu sedang menonton Duel Suit penentuan MVP!'}
                    </p>
                    {pendingCoSeatDuelist && onSelectSeat && (
                      <button
                        type="button"
                        onClick={() => onSelectSeat(pendingCoSeatDuelist)}
                        className="mt-2 min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Smartphone className="w-4 h-4" />
                        Pindah ke Kursi {pendingCoSeatDuelist.displayName} untuk Memilih
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Clash Reveal State */}
            {duel.status === 'clash_reveal' && duel.lastClash && (
              <div className="rounded-xl bg-[#0B1018] border border-amber-500/40 p-4 space-y-4">
                <p className="text-base font-bold text-amber-300 text-center">
                  {clashSummaryText(duel.lastClash, duel.duelistNames)}
                </p>
                {isHost ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleNextClash}
                    className="w-full min-h-[48px] rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-sm transition-colors"
                  >
                    {busy ? 'Menyiapkan Bentrok...' : `Mulai Bentrok #${duel.clashNumber + 1}`}
                  </button>
                ) : (
                  <p className="text-xs text-center text-slate-400">
                    Menunggu Host memulai bentrok berikutnya...
                  </p>
                )}
              </div>
            )}
          </motion.section>
        ) : (
          /* STAGE B: FINAL MVP PODIUM */
          mvpStanding && (
            <motion.section
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl bg-gradient-to-br from-[#1B2230] via-[#151C28] to-[#1D1622] border border-amber-400/50 p-6 sm:p-8 text-center space-y-4 shadow-2xl"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto">
                <Crown className="w-9 h-9 text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
                  MVP Malam Ini · {resolutionCaption(recap.resolvedBy)}
                </p>
                <h2 className="text-3xl sm:text-5xl font-black text-white mt-2 tracking-tight">
                  {mvpStanding.displayName}
                </h2>
              </div>
              <div className="inline-grid grid-cols-2 gap-6 pt-2 px-6 py-3 rounded-xl bg-[#0B1018]/80 border border-slate-800">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Menang Game
                  </p>
                  <p className="text-2xl sm:text-3xl font-black text-amber-400 tabular-nums">
                    {mvpStanding.gamesWon}
                  </p>
                </div>
                <div className="border-l border-slate-800 pl-6">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">
                    Total XP
                  </p>
                  <p className="text-2xl sm:text-3xl font-black text-cyan-300 tabular-nums">
                    {mvpStanding.overallXp}
                  </p>
                </div>
              </div>
            </motion.section>
          )
        )}

        {/* Overall Session Standings */}
        <section className="rounded-2xl bg-[#131A24] border border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm sm:text-base font-bold text-white">
                Klasemen Sesi (Menang Game Utama · XP Penentu Seri)
              </h3>
            </div>
          </div>
          <div className="divide-y divide-slate-800/80">
            {recap.standings.map((row, idx) => {
              const isMvp = recap.mvpUids.includes(row.uid);
              return (
                <div
                  key={row.uid}
                  className={`px-5 py-3.5 flex items-center justify-between gap-3 ${
                    isMvp ? 'bg-amber-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-7 text-sm font-mono font-black tabular-nums ${
                        idx === 0 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      #{idx + 1}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: row.avatarColor }}
                    />
                    <span className="text-sm sm:text-base font-bold text-white truncate">
                      {row.displayName}
                    </span>
                    {isMvp && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <p className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
                        {row.gamesWon} Menang
                      </p>
                    </div>
                    <div className="w-20 border-l border-slate-800 pl-3">
                      <p className="text-xs sm:text-sm font-mono font-bold text-slate-300 tabular-nums">
                        {row.overallXp} XP
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Chronological Per-Game Breakdown (Each Visit Isolated) */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Rincian Poin Per Game ({recap.completedGames.length} Sesi Game)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recap.completedGames.map((game, idx) => {
              const sortedScores = Object.entries(game.scoresByUid).sort((a, b) => b[1] - a[1]);
              return (
                <div
                  key={`${game.matchIndex}-${game.finishedAtMs}`}
                  className="rounded-xl bg-[#131A24] border border-slate-800 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div>
                      <p className="text-[11px] font-mono text-slate-500">
                        GAME #{idx + 1} · {game.roundsPlayed} RONDE
                      </p>
                      <h4 className="text-sm font-bold text-white mt-0.5">
                        {GAME_LABELS[game.gameType]}
                      </h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500">Juara</p>
                      <p className="text-xs font-bold text-amber-300">
                        {game.winnerNames.join(', ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {sortedScores.map(([uid, pts]) => {
                      const isWinner = game.winnerUids.includes(uid);
                      return (
                        <div
                          key={uid}
                          className="flex items-center justify-between text-xs"
                        >
                          <span
                            className={`truncate ${
                              isWinner ? 'text-amber-200 font-bold' : 'text-slate-300'
                            }`}
                          >
                            {game.playerNamesByUid[uid] ?? 'Pemain'}
                          </span>
                          <span className="font-mono font-bold text-slate-200 tabular-nums">
                            {pts} poin
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 15-Second Empty-Room Auto-Reset Explanation */}
        <footer className="rounded-xl bg-[#0E141E] border border-slate-800/90 px-4 py-3 flex items-start gap-2.5 text-xs text-slate-400">
          <Clock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Menutup Rekap Permainan tidak menghapus catatan sesi selama masih ada pemain di ruang. Statistik ruang baru akan di-reset otomatis <strong className="text-slate-200">15 detik setelah pemain terakhir keluar atau offline</strong>.
          </p>
        </footer>
      </div>
    </div>
  );
}
