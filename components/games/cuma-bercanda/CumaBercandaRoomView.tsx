'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Hand,
  LogOut,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  SkipForward,
  Sparkles,
  ThumbsUp,
  Trophy,
  Users,
} from 'lucide-react';
import { RoomChatPanel } from '@/components/games/spyfall/RoomChatPanel';
import { CUMA_BERCANDA_QUICK_PROMPTS_ID } from '@/lib/games/cuma-bercanda/packs';
import { filterActivePlayers } from '@/lib/games/session/engine';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import {
  advanceCumaBercandaToVoting,
  castCumaBercandaUpvoteAction,
  leaveRoom,
  revealCumaBercandaRound,
  returnCumaBercandaToLobby,
  startCumaBercandaRound,
  submitCumaBercandaCard,
} from '@/lib/platform/room-service';
import { BercandaComicPanel, VoteScoreBadge } from './BercandaComicPanel';
import { CumaBercandaLobbySettings } from './CumaBercandaLobbySettings';
import { CumaBercandaPlayersPanel } from './CumaBercandaPlayersPanel';

interface CumaBercandaRoomViewProps {
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

export function CumaBercandaRoomView({
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
}: CumaBercandaRoomViewProps) {
  const [mobileTab, setMobileTab] = useState<'play' | 'players' | 'chat'>('play');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = room.hostUid === deviceUid;
  const activePlayers = filterActivePlayers(players);
  const cb = room.cumaBercandaState ?? null;
  const hand = mySecret?.bercandaHand ?? [];
  const selectedCard = hand.find((c) => c.id === selectedCardId) ?? null;

  const isParticipant = cb?.participantUids.includes(myUid) ?? false;
  const hasSubmitted = cb?.submittedUids.includes(myUid) ?? false;
  const hasVoted = cb?.votedUids.includes(myUid) ?? false;
  const myUsedGolden = cb?.goldenUsedByUid.includes(myUid) ?? false;
  const myOwnedEntryId = mySecret?.bercandaOwnedEntryId ?? null;

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

  const handleStartRound = () =>
    runAction(async () => {
      setSelectedCardId(null);
      await startCumaBercandaRound({ roomId: room.id });
    });

  const handleSubmitCard = () => {
    if (!selectedCard) return;
    void runAction(async () => {
      await submitCumaBercandaCard({
        roomId: room.id,
        actorUid: myUid,
        cardId: selectedCard.id,
      });
      setSelectedCardId(null);
    });
  };

  const handleUpvote = (kind: 'standard' | 'golden' | 'skip', targetEntryId: string | null) =>
    runAction(async () => {
      await castCumaBercandaUpvoteAction({
        roomId: room.id,
        actorUid: myUid,
        kind,
        targetEntryId,
      });
    });

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 pb-10">
      {/* Top Room Header */}
      <header className="border-b border-slate-800/80 bg-[#101722]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-black tracking-widest px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300">
              {room.code}
            </span>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-extrabold text-white truncate">
                Cuma Bercanda
              </h1>
              <p className="text-xs text-slate-400 tabular-nums">
                {room.status === 'lobby'
                  ? `Lobi · ${activePlayers.length} pemain aktif (min. 2)`
                  : `Ronde #${room.roundNumber} · ${
                      cb?.phase === 'picking'
                        ? 'Pilih Panel 3'
                        : cb?.phase === 'voting'
                          ? 'Voting Upvote Anonim'
                          : 'Hasil & Poin'
                    }`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLeave}
            disabled={busy}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#151D2B] hover:bg-rose-500/15 border border-slate-700 hover:border-rose-500/40 text-xs font-bold text-slate-300 hover:text-rose-200 inline-flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="xl:hidden border-t border-slate-800/80 grid grid-cols-3">
          <button
            type="button"
            onClick={() => setMobileTab('play')}
            className={`min-h-[44px] text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mobileTab === 'play'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400'
            }`}
          >
            <Hand className="w-4 h-4" /> Mainkan
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('players')}
            className={`min-h-[44px] text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mobileTab === 'players'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400'
            }`}
          >
            <Users className="w-4 h-4" /> Pemain ({players.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('chat')}
            className={`min-h-[44px] text-xs font-bold inline-flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
              mobileTab === 'chat'
                ? 'border-amber-400 text-amber-300 bg-amber-500/5'
                : 'border-transparent text-slate-400'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Obrolan ({messages.length})
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3">
          <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 px-4 py-2.5 text-xs font-semibold text-rose-200">
            {error}
          </div>
        </div>
      )}

      {/* Main Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left: Primary Stage */}
        <section
          className={`xl:col-span-8 space-y-5 ${
            mobileTab === 'play' ? 'block' : 'hidden xl:block'
          }`}
        >
          {/* LOBBY */}
          {room.status === 'lobby' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-5 space-y-4">
                <div className="space-y-1.5">
                  <h2 className="text-lg font-extrabold text-white">
                    Komik 3-Panel + Sistem Upvote Bebas Batas
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Sistem langsung melempar <strong className="text-amber-300">Panel 1 &amp; Panel 2</strong> di meja.
                    Setiap pemain memilih <strong className="text-emerald-300">Panel 3 penutup</strong> dari 7 kartu rahasia di tangan—lalu semua komik tampil <strong className="text-sky-300">anonim</strong> untuk di-upvote tongkrongan!
                  </p>
                </div>

                {isHost ? (
                  <button
                    type="button"
                    disabled={busy || activePlayers.length < 2}
                    onClick={handleStartRound}
                    className="w-full min-h-[48px] rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {activePlayers.length < 2
                      ? 'Butuh Minimal 2 Pemain Aktif'
                      : 'Mulai Ronde Cuma Bercanda'}
                  </button>
                ) : (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs font-semibold text-slate-400">
                    Menunggu Host ({players.find((p) => p.uid === room.hostUid)?.displayName ?? 'Host'}) memulai ronde...
                  </div>
                )}
              </div>

              <CumaBercandaLobbySettings room={room} isHost={isHost} />
            </div>
          )}

          {/* PHASE 1: PICKING PANEL 3 */}
          {room.status === 'playing' && cb && cb.phase === 'picking' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Public Setup Strip (Panel 1 + Panel 2 + Slot 3 Preview) */}
              <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-300">
                    Strip Komik Ronde #{room.roundNumber} (Sistem + Sistem + Kamu)
                  </h2>
                  <span className="text-xs font-bold text-slate-400 tabular-nums">
                    {cb.submittedUids.length} / {cb.participantUids.length} pemain kirim kartu
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <BercandaComicPanel card={cb.panel1} panelNumber={1} />
                  <BercandaComicPanel card={cb.panel2} panelNumber={2} />

                  {selectedCard && !hasSubmitted ? (
                    <BercandaComicPanel
                      card={selectedCard}
                      panelNumber={3}
                      selected
                    />
                  ) : (
                    <div className="rounded-2xl border-2 border-dashed border-slate-700 bg-[#0B1018] p-4 flex flex-col items-center justify-center text-center min-h-[210px]">
                      {hasSubmitted ? (
                        <>
                          <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                          <p className="text-sm font-bold text-emerald-300">
                            Panel 3 Terkirim!
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Menunggu teman lain mengirim punchline...
                          </p>
                        </>
                      ) : !isParticipant ? (
                        <p className="text-xs font-semibold text-amber-300">
                          Kamu sedang mode BRB untuk ronde ini.
                        </p>
                      ) : (
                        <>
                          <span className="text-2xl font-black text-slate-600 mb-1">
                            ?
                          </span>
                          <p className="text-xs font-bold text-slate-300">
                            Slot Panel 3 Milikmu
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            Pilih 1 kartu dari 7 kartu tangan di bawah.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Row for Selected Card / Host Advance */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {isParticipant && !hasSubmitted && (
                    <button
                      type="button"
                      disabled={busy || !selectedCard}
                      onClick={handleSubmitCard}
                      className="min-h-[44px] px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-45 text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center gap-2 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                      {selectedCard
                        ? 'Kirim Kartu Ini Jadi Panel 3'
                        : 'Pilih 1 Kartu Di Bawah'}
                    </button>
                  )}

                  {isHost && cb.submittedUids.length >= 1 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(() => advanceCumaBercandaToVoting({ roomId: room.id }))
                      }
                      className="ml-auto min-h-[44px] px-4 rounded-xl bg-[#0B1018] hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-2"
                    >
                      <Eye className="w-4 h-4 text-sky-400" />
                      Buka Voting Sekarang ({cb.submittedUids.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Player's 7-Card Private Hand */}
              {isParticipant && !hasSubmitted && (
                <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">
                      Kartu Tangan Rahasiamu ({hand.length} Kartu)
                    </h3>
                    <span className="text-xs text-slate-400">
                      Sisa kartu dibawa ke ronde berikutnya
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {hand.map((card) => {
                      const isPicked = selectedCardId === card.id;
                      return (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() =>
                            setSelectedCardId((prev) =>
                              prev === card.id ? null : card.id,
                            )
                          }
                          className="text-left focus:outline-none rounded-2xl transition-transform active:scale-[0.99]"
                        >
                          <BercandaComicPanel card={card} compact selected={isPicked} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* PHASE 2: ANONYMOUS UPVOTE VOTING */}
          {room.status === 'playing' && cb && cb.phase === 'voting' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Setup Recap */}
              <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-sky-300">
                    Pembuka Komik Ronde #{room.roundNumber}
                  </h2>
                  <span className="text-xs font-bold text-slate-300 tabular-nums">
                    {cb.votedUids.length} / {cb.participantUids.length} sudah vote
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <BercandaComicPanel card={cb.panel1} panelNumber={1} compact />
                  <BercandaComicPanel card={cb.panel2} panelNumber={2} compact />
                </div>
              </div>

              {/* Anonymous Panel 3 Candidates */}
              <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      Pilih Punchline Terlucu (Anonim!)
                    </h3>
                    <p className="text-xs text-slate-400">
                      1 upvote per ronde · Tidak bisa meng-upvote komik sendiri · Golden Upvote (+3) hanya 1x per sesi.
                    </p>
                  </div>
                  {isHost && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(() => revealCumaBercandaRound({ roomId: room.id }))
                      }
                      className="min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" /> Tutup Voting &amp; Buka Hasil
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {cb.entries.map((entry, idx) => {
                    const isMine = myOwnedEntryId === entry.entryId;
                    const myVote = cb.votesByUid?.[myUid];
                    const votedThis = myVote?.targetEntryId === entry.entryId;

                    return (
                      <div
                        key={entry.entryId}
                        className={`rounded-2xl border p-3.5 space-y-3 ${
                          votedThis
                            ? 'bg-emerald-500/10 border-emerald-400/60'
                            : isMine
                              ? 'bg-indigo-500/10 border-indigo-400/50'
                              : 'bg-[#0B1018] border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-slate-300">Karya #{idx + 1}</span>
                          {isMine ? (
                            <span className="text-indigo-300">Komikmu Sendiri</span>
                          ) : votedThis ? (
                            <span className="text-emerald-300">Pilihanmu</span>
                          ) : (
                            <span className="text-slate-500">Anonim</span>
                          )}
                        </div>

                        <BercandaComicPanel
                          card={entry.panel3}
                          panelNumber={3}
                          owned={isMine}
                          selected={votedThis}
                        />

                        {isParticipant && !hasVoted && !isMine && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleUpvote('standard', entry.entryId)}
                              className="flex-1 min-h-[44px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
                            >
                              <ThumbsUp className="w-4 h-4" /> Upvote (+1)
                            </button>
                            {cb.allowGoldenUpvote && !myUsedGolden && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleUpvote('golden', entry.entryId)}
                                className="flex-1 min-h-[44px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
                              >
                                <Sparkles className="w-4 h-4" /> Golden (+3 · 1x)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isParticipant && !hasVoted && (
                  <div className="pt-1 flex justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleUpvote('skip', null)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#0B1018] hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 inline-flex items-center gap-2"
                    >
                      <SkipForward className="w-4 h-4" /> Lewati Voting Ronde Ini (+0)
                    </button>
                  </div>
                )}

                {hasVoted && (
                  <p className="text-xs font-semibold text-emerald-300">
                    Vote kamu sudah dikunci! Menunggu pemain lain selesai menilai...
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* PHASE 3: ROUND REVEAL */}
          {room.status === 'round_end' && cb && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Winner Banner */}
              <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-[#131A24] to-emerald-500/10 border border-amber-400/50 p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-extrabold uppercase tracking-wider">
                  <Trophy className="w-4 h-4" /> Hasil Voting Ronde #{room.roundNumber}
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  {room.lastRoundResult?.reason ?? 'Ronde Selesai!'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <BercandaComicPanel card={cb.panel1} panelNumber={1} compact />
                  <BercandaComicPanel card={cb.panel2} panelNumber={2} compact />
                </div>
              </div>

              {/* Ranked Submissions with Revealed Authors & Voters */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {cb.entries.map((entry) => {
                  const isWin = cb.winnerEntryIds.includes(entry.entryId);
                  const stdNames = entry.standardVoterUids
                    .map((u) => cb.participantNamesByUid[u] ?? 'Pemain')
                    .join(', ');
                  const goldNames = entry.goldenVoterUids
                    .map((u) => cb.participantNamesByUid[u] ?? 'Pemain')
                    .join(', ');

                  return (
                    <div
                      key={entry.entryId}
                      className={`rounded-2xl border p-3.5 space-y-3 ${
                        isWin
                          ? 'bg-amber-500/10 border-amber-400/60'
                          : 'bg-[#131A24] border-slate-800'
                      }`}
                    >
                      <BercandaComicPanel
                        card={entry.panel3}
                        panelNumber={3}
                        isWinner={isWin}
                        authorLabel={entry.authorName}
                      />

                      <VoteScoreBadge
                        standardCount={entry.standardVoterUids.length}
                        goldenCount={entry.goldenVoterUids.length}
                        totalPoints={entry.totalPoints}
                      />

                      {(stdNames || goldNames) && (
                        <div className="text-[11px] text-slate-300 space-y-0.5 border-t border-slate-800 pt-2">
                          {goldNames && (
                            <p className="text-amber-300 font-semibold">
                              Golden (+3): {goldNames}
                            </p>
                          )}
                          {stdNames && <p>Upvote (+1): {stdNames}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isHost ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busy || activePlayers.length < 2}
                    onClick={handleStartRound}
                    className="flex-1 min-h-[48px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-sm inline-flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Ronde Berikutnya (Isi Ulang 7 Kartu)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(() => returnCumaBercandaToLobby({ roomId: room.id }))
                    }
                    className="min-h-[48px] px-4 rounded-xl bg-[#131A24] hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold text-sm inline-flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" /> Kembali ke Lobi
                  </button>
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-400 text-center">
                  Menunggu Host memulai ronde berikutnya atau kembali ke lobi...
                </p>
              )}
            </motion.div>
          )}
        </section>

        {/* Right: Players + Chat */}
        <aside className="xl:col-span-4 space-y-5">
          <div className={mobileTab === 'players' ? 'block' : 'hidden xl:block'}>
            <CumaBercandaPlayersPanel
              room={room}
              players={players}
              presence={presence}
              myUid={myUid}
            />
          </div>
          <div className={mobileTab === 'chat' ? 'block' : 'hidden xl:block'}>
            <RoomChatPanel
              roomId={room.id}
              messages={messages}
              myUid={myUid}
              myName={myName}
              quickPrompts={CUMA_BERCANDA_QUICK_PROMPTS_ID}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
