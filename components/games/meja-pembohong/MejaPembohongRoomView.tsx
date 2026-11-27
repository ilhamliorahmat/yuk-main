'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  Layers,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  ShieldCheck,
  Skull,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { RoomChatPanel } from '@/components/games/spyfall/RoomChatPanel';
import {
  defaultMejaPembohongSettings,
  MEJA_MAX_PLAY_CARDS,
  MEJA_PEMBOHONG_QUICK_PROMPTS_ID,
  MEJA_RANK_LABELS,
} from '@/lib/games/meja-pembohong/engine';
import { filterActivePlayers } from '@/lib/games/session/engine';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import {
  callMejaPembohongLiar,
  leaveRoom,
  nextMejaPembohongSubRound,
  playMejaPembohongCards,
  returnMejaPembohongToLobby,
  startMejaPembohongRound,
} from '@/lib/platform/room-service';
import { MejaCardGraphic, MejaChamberIndicator } from './MejaCardGraphic';
import { MejaPembohongLobbySettings } from './MejaPembohongLobbySettings';
import { MejaPembohongPlayersPanel } from './MejaPembohongPlayersPanel';

interface MejaPembohongRoomViewProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  mySecret: PlayerSecretDoc | null;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
  deviceUid: string;
  deviceName: string;
  onBeforeLeave?: () => void;
  onExitToHub: () => void;
}

export function MejaPembohongRoomView({
  room,
  players,
  mySecret,
  messages,
  presence,
  myUid,
  myName,
  deviceUid,
  onBeforeLeave,
  onExitToHub,
}: MejaPembohongRoomViewProps) {
  const [mobileTab, setMobileTab] = useState<'play' | 'players' | 'chat'>('play');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = room.hostUid === deviceUid;
  const activePlayers = filterActivePlayers(players);
  const mp = room.mejaPembohongState ?? null;
  const settings = room.mejaPembohongSettings ?? defaultMejaPembohongSettings();
  const hand = useMemo(() => mySecret?.mejaHand ?? [], [mySecret?.mejaHand]);
  const handIdSet = useMemo(() => new Set(hand.map((c) => c.id)), [hand]);

  const validSelectedIds = useMemo(
    () => selectedCardIds.filter((id) => handIdSet.has(id)),
    [selectedCardIds, handIdSet],
  );

  const isParticipant = mp?.participantUids.includes(myUid) ?? false;
  const isEliminated = mp?.eliminatedUids.includes(myUid) ?? false;
  const isMyTurn = Boolean(mp && mp.phase === 'playing' && mp.currentTurnUid === myUid);
  const canChallenge = Boolean(
    isMyTurn && mp?.lastClaim && mp.lastClaim.byUid !== myUid && !isEliminated,
  );

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    onBeforeLeave?.();
    try {
      await leaveRoom({ room, uid: deviceUid, displayName: myName, players });
    } finally {
      onExitToHub();
    }
  };

  const toggleCardSelection = (cardId: string) => {
    if (!isMyTurn || busy) return;
    setSelectedCardIds((prev) => {
      const cleanPrev = prev.filter((id) => handIdSet.has(id));
      if (cleanPrev.includes(cardId)) {
        return cleanPrev.filter((id) => id !== cardId);
      }
      if (cleanPrev.length >= MEJA_MAX_PLAY_CARDS) {
        return [...cleanPrev.slice(1), cardId];
      }
      return [...cleanPrev, cardId];
    });
  };

  const handlePlaySelected = () => {
    if (validSelectedIds.length < 1 || validSelectedIds.length > MEJA_MAX_PLAY_CARDS) return;
    void runAction(async () => {
      await playMejaPembohongCards({
        roomId: room.id,
        actorUid: myUid,
        cardIds: validSelectedIds,
      });
      setSelectedCardIds([]);
    });
  };

  const handleCallLiar = () => {
    void runAction(async () => {
      await callMejaPembohongLiar({
        roomId: room.id,
        actorUid: myUid,
      });
      setSelectedCardIds([]);
    });
  };

  const handleNextSubRound = () => {
    void runAction(async () => {
      await nextMejaPembohongSubRound({
        roomId: room.id,
        actorUid: myUid,
      });
      setSelectedCardIds([]);
    });
  };

  const tableRankLabel = mp ? MEJA_RANK_LABELS[mp.tableRank] : 'Raja';

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 pb-10">
      {/* Top Room Header */}
      <header className="border-b border-slate-800/80 bg-[#101722]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-black tracking-widest px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
              {room.code}
            </span>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-white truncate">
                Meja Pembohong
              </h1>
              <p className="text-xs text-slate-400 tabular-nums">
                {room.status === 'lobby'
                  ? `Lobi · ${activePlayers.length} pemain aktif (min. 2) · ${
                      settings.mode === 'cepat' ? 'Skor Cepat' : 'Silinder 1/6'
                    }`
                  : `Ronde #${room.roundNumber} · Tangan #${mp?.subRoundNumber ?? 1}${
                      mp?.maxSubRounds ? `/${mp.maxSubRounds}` : ''
                    } · Meja ${tableRankLabel}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isHost && room.status !== 'lobby' && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runAction(() => returnMejaPembohongToLobby({ roomId: room.id }))
                }
                className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Lobi</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleLeave()}
              className="min-h-[40px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-semibold text-rose-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="lg:hidden border-b border-slate-800 bg-[#0F1620] px-4 py-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setMobileTab('play')}
          className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
            mobileTab === 'play'
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-[#131A24] text-slate-300'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Meja</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('players')}
          className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
            mobileTab === 'players'
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-[#131A24] text-slate-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Pemain ({players.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('chat')}
          className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
            mobileTab === 'chat'
              ? 'bg-emerald-500 text-slate-950'
              : 'bg-[#131A24] text-slate-300'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Obrolan</span>
        </button>
      </div>

      {/* Main Content Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Center Stage (8 cols) */}
        <section
          className={`lg:col-span-8 space-y-5 ${
            mobileTab !== 'play' ? 'hidden lg:block' : 'block'
          }`}
        >
          {error && (
            <div className="rounded-xl bg-rose-500/15 border border-rose-500/45 px-4 py-3 text-xs sm:text-sm text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* LOBBY PHASE */}
          {room.status === 'lobby' && (
            <div className="space-y-4">
              <MejaPembohongLobbySettings room={room} isHost={isHost} />

              <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">
                    {activePlayers.length >= 2
                      ? 'Meja siap dikocok!'
                      : 'Butuh minimal 2 pemain aktif'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Saat ronde dimulai, sistem menentukan Pangkat Meja (Raja, Ratu, atau As) dan membagikan 5 kartu rahasia ke tiap pemain.
                  </p>
                </div>
                {isHost ? (
                  <button
                    type="button"
                    disabled={busy || activePlayers.length < 2}
                    onClick={() =>
                      void runAction(async () => {
                        setSelectedCardIds([]);
                        await startMejaPembohongRound({ roomId: room.id });
                      })
                    }
                    className="min-h-[48px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Bagikan Kartu</span>
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-amber-300 shrink-0">
                    Menunggu Host memulai...
                  </span>
                )}
              </div>
            </div>
          )}

          {/* PLAYING / CHALLENGE REVEAL / END PHASE */}
          {room.status !== 'lobby' && mp && (
            <div className="space-y-4">
              {/* Round End Summary Card */}
              {room.status === 'round_end' && room.lastRoundResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-[#131A24] to-[#131A24] border border-amber-400/50 p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                        <Trophy className="w-4 h-4" />
                        Ronde #{room.roundNumber} Selesai
                      </p>
                      <h2 className="text-xl sm:text-2xl font-black text-white">
                        Pemenang: {mp.winnerNames.join(' & ') || 'Juara Meja'}
                      </h2>
                    </div>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {room.lastRoundResult.reason}
                  </p>
                  {isHost && (
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(async () => {
                            setSelectedCardIds([]);
                            await startMejaPembohongRound({ roomId: room.id });
                          })
                        }
                        className="min-h-[44px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm inline-flex items-center gap-2 transition-colors"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Ronde Baru</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(() => returnMejaPembohongToLobby({ roomId: room.id }))
                        }
                        className="min-h-[44px] px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm inline-flex items-center gap-2 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Kembali ke Lobi</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Felt Tavern Table Arena */}
              <div className="rounded-3xl bg-gradient-to-b from-emerald-950/65 to-[#0D1518] border border-emerald-700/45 p-5 sm:p-6 space-y-5 shadow-2xl">
                {/* Top Strip: Table Rank + Pile + Turn Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-800/40 pb-4">
                  <div className="flex items-center gap-4">
                    <MejaCardGraphic rank={mp.tableRank} compact />
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                        Pangkat Meja Saat Ini · Tangan #{mp.subRoundNumber}
                        {mp.maxSubRounds ? `/${mp.maxSubRounds}` : ''}
                      </p>
                      <h2 className="text-xl sm:text-2xl font-black text-white">
                        MEJA {tableRankLabel.toUpperCase()}
                      </h2>
                      <p className="text-xs text-slate-300">
                        Klaim sah: <strong className="text-white">{tableRankLabel}</strong> atau{' '}
                        <strong className="text-violet-300">Joker (Kartu Bebas)</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#0B1018]/85 border border-slate-700/80 px-3.5 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400">
                        Tumpukan Meja
                      </p>
                      <p className="font-mono text-lg font-black text-white tabular-nums">
                        {mp.pileCardCount} kartu
                      </p>
                    </div>
                  </div>
                </div>

                {/* Challenge Reveal Spotlight */}
                {(mp.phase === 'challenge_reveal' || mp.phase === 'reveal') && mp.lastChallenge && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-2xl border p-5 space-y-4 ${
                      mp.lastChallenge.wasLie
                        ? 'bg-rose-950/50 border-rose-500/60'
                        : 'bg-emerald-950/60 border-emerald-400/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase tracking-wider text-amber-300">
                          {mp.lastChallenge.wasLie
                            ? 'TERBONGKAR BOHONG!'
                            : 'TERBUKTI JUJUR 100%!'}
                        </p>
                        <p className="text-sm sm:text-base font-bold text-white">
                          {mp.lastChallenge.summary}
                        </p>
                      </div>

                      {mp.mode === 'silinder' && mp.lastChallenge.chamberStep !== null && (
                        <div className="rounded-xl bg-[#0B1018]/85 border border-slate-700 px-3.5 py-2 space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">
                            Silinder {mp.lastChallenge.loserName}
                          </p>
                          <MejaChamberIndicator
                            shotsTaken={mp.lastChallenge.chamberStep}
                            eliminated={Boolean(mp.lastChallenge.eliminatedUid)}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-slate-300">
                        Kartu milik <strong>{mp.lastChallenge.accusedName}</strong> yang dibuka:
                      </p>
                      <div className="flex flex-wrap items-center gap-3">
                        {mp.lastChallenge.revealedCards.map((card) => (
                          <MejaCardGraphic
                            key={card.id}
                            rank={card.rank}
                            matchedTableRank={mp.lastChallenge?.claimedRank}
                            compact
                          />
                        ))}
                      </div>
                    </div>

                    {mp.phase === 'challenge_reveal' && (
                      <div className="pt-1 flex items-center justify-between gap-3">
                        <span className="text-xs text-slate-300">
                          {isHost
                            ? 'Siap membagikan 5 kartu baru untuk tangan berikutnya?'
                            : 'Menunggu Host melanjutkan ke tangan berikutnya...'}
                        </span>
                        {isHost && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleNextSubRound}
                            className="min-h-[44px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm inline-flex items-center gap-2 shrink-0 transition-colors"
                          >
                            <span>Lanjut Tangan Baru</span>
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Active Claim On Felt during Playing */}
                {mp.phase === 'playing' && (
                  <div className="rounded-2xl bg-[#0B1018]/80 border border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {mp.lastClaim ? (
                      <>
                        <div className="flex items-center gap-3.5">
                          <div className="flex -space-x-6 shrink-0">
                            {Array.from({ length: mp.lastClaim.cardCount }, (_, idx) => (
                              <MejaCardGraphic key={idx} faceDown compact />
                            ))}
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                              Taruhan Terakhir di Meja
                            </p>
                            <p className="text-sm sm:text-base font-extrabold text-white">
                              {mp.lastClaim.byName} menaruh{' '}
                              <span className="text-amber-300 tabular-nums">
                                {mp.lastClaim.cardCount} kartu
                              </span>{' '}
                              &amp; mengklaim{' '}
                              <span className="text-emerald-300">
                                {mp.lastClaim.cardCount}x {MEJA_RANK_LABELS[mp.lastClaim.claimedRank]}
                              </span>
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-3 text-slate-300">
                        <Layers className="w-5 h-5 text-emerald-400 shrink-0" />
                        <p className="text-sm">
                          Meja masih bersih. <strong>{mp.currentTurnName}</strong> memulai taruhan pertama!
                        </p>
                      </div>
                    )}

                    <div
                      className={`rounded-xl px-4 py-2.5 border text-xs font-bold shrink-0 ${
                        isMyTurn
                          ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                          : 'bg-[#131A24] border-slate-700 text-slate-300'
                      }`}
                    >
                      {isMyTurn ? 'Giliranmu Sekarang!' : `Giliran: ${mp.currentTurnName}`}
                    </div>
                  </div>
                )}

                {/* Recent Event Log */}
                {mp.eventLog.length > 0 && (
                  <div className="rounded-xl bg-[#0B1018]/75 border border-slate-800/80 px-4 py-3 space-y-1">
                    {mp.eventLog.slice(0, 3).map((line, idx) => (
                      <p
                        key={idx}
                        className={`text-xs leading-snug ${
                          idx === 0 ? 'text-slate-100 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Player's Private Hand & Action Bar */}
              {isParticipant && room.status === 'playing' && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-4">
                  {isEliminated ? (
                    <div className="flex items-center gap-3 text-rose-300 text-sm">
                      <Skull className="w-5 h-5 shrink-0" />
                      <span>
                        Kamu tereliminasi oleh peluru silinder! Kamu tetap dapat memantau meja dan obrolan sampai pemenang ditentukan.
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-300" />
                            Kartu Rahasiamu ({hand.length})
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {isMyTurn
                              ? hand.length > 0
                                ? `Pilih 1–3 kartu untuk ditaruh (jujur maupun gertak!), atau teriak "BOHONG!" ke ${mp.lastClaim?.byName ?? 'lawan'}.`
                                : 'Kartumu sudah habis! Tuduh taruhan terakhir atau lanjut bagikan kartu baru.'
                              : `Menunggu ${mp.currentTurnName} mengambil langkah...`}
                          </p>
                        </div>
                        {mp.mode === 'silinder' && (
                          <MejaChamberIndicator
                            shotsTaken={mp.shotsTakenByUid[myUid] ?? 0}
                            eliminated={isEliminated}
                          />
                        )}
                      </div>

                      {hand.length > 0 ? (
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 py-2">
                          {hand.map((card) => {
                            const isSelected = validSelectedIds.includes(card.id);
                            return (
                              <MejaCardGraphic
                                key={card.id}
                                rank={card.rank}
                                selected={isSelected}
                                disabled={!isMyTurn || busy}
                                matchedTableRank={mp.tableRank}
                                onClick={() => toggleCardSelection(card.id)}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-emerald-300 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 shrink-0" />
                          <span>Tanganmu kosong pada sub-ronde ini!</span>
                        </div>
                      )}

                      {isMyTurn && mp.phase === 'playing' && (
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          {hand.length > 0 ? (
                            <button
                              type="button"
                              disabled={busy || validSelectedIds.length === 0}
                              onClick={handlePlaySelected}
                              className="min-h-[48px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black text-sm inline-flex items-center gap-2 transition-colors"
                            >
                              <span>
                                Taruh{' '}
                                {validSelectedIds.length > 0
                                  ? `${validSelectedIds.length} Kartu (${tableRankLabel})`
                                  : 'Kartu (Pilih 1–3)'}
                              </span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleNextSubRound}
                              className="min-h-[48px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-black text-sm inline-flex items-center gap-2 transition-colors"
                            >
                              <span>Bagikan Tangan Baru</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                          )}

                          {canChallenge && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleCallLiar}
                              className="min-h-[48px] px-6 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-black text-sm inline-flex items-center gap-2 shadow-lg shadow-rose-900/40 transition-colors"
                            >
                              <AlertTriangle className="w-4 h-4" />
                              <span>TERIAK &ldquo;BOHONG!&rdquo;</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column: Players + Unified Chat */}
        <aside className="lg:col-span-4 space-y-5">
          <div className={mobileTab === 'chat' ? 'hidden lg:block' : mobileTab === 'play' ? 'hidden lg:block' : 'block'}>
            <MejaPembohongPlayersPanel
              room={room}
              players={players}
              presence={presence}
              myUid={myUid}
            />
          </div>

          <div className={mobileTab === 'chat' ? 'block' : 'hidden lg:block'}>
            <RoomChatPanel
              roomId={room.id}
              myUid={myUid}
              myName={myName}
              messages={messages}
              quickPrompts={MEJA_PEMBOHONG_QUICK_PROMPTS_ID}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
