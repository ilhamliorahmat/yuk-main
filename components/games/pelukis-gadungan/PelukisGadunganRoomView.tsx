'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brush,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  MessageSquare,
  Palette,
  Play,
  RotateCcw,
  SkipForward,
  Sparkles,
  Trophy,
  Users,
  Vote,
} from 'lucide-react';
import { PELUKIS_QUICK_PROMPTS_ID } from '@/lib/games/pelukis-gadungan/prompts-id';
import type {
  ChatMessage,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';
import {
  castPelukisVote,
  leaveRoom,
  resolvePelukisVote,
  returnPelukisToLobby,
  skipPelukisTurn,
  startPelukisRound,
  submitPelukisGuess,
  submitPelukisStroke,
} from '@/lib/platform/room-service';
import { RoomChatPanel } from '../spyfall/RoomChatPanel';
import { PelukisCanvas } from './PelukisCanvas';
import { PelukisLobbySettings } from './PelukisLobbySettings';
import { PelukisPlayersPanel } from './PelukisPlayersPanel';

interface PelukisGadunganRoomViewProps {
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

type MobileTab = 'kanvas' | 'obrolan' | 'pemain';

export function PelukisGadunganRoomView({
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
}: PelukisGadunganRoomViewProps) {
  const actualDeviceUid = deviceUid ?? myUid;
  const actualDeviceName = deviceName ?? myName;
  const [mobileTab, setMobileTab] = useState<MobileTab>('kanvas');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [hiddenCardKey, setHiddenCardKey] = useState<string | null>(null);
  const [selectedSuspectUid, setSelectedSuspectUid] = useState<string | null>(null);
  const [guessedWord, setGuessedWord] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoResolvedRoundRef = useRef<string | null>(null);

  const isHost = room.hostUid === actualDeviceUid;
  const activePlayers = players.filter((p) => !p.isBrb);
  const activePlayersCount = activePlayers.length;
  const lukisan = room.lukisanState;
  const roundKey = `${room.id}:${room.currentRoundId}:${myUid}`;
  const isCardHidden = hiddenCardKey === roundKey;

  const myInkColor =
    mySecret?.playerInkColor ??
    lukisan?.turnColorsByUid[myUid] ??
    players.find((p) => p.uid === myUid)?.avatarColor ??
    '#10B981';

  const isMyTurn = Boolean(
    room.status === 'playing' &&
      lukisan?.phase === 'drawing' &&
      lukisan.currentTurnUid === myUid,
  );

  const isParticipant = Boolean(lukisan && lukisan.turnOrder.includes(myUid));
  const hasMyVote = Boolean(lukisan && lukisan.submittedVoteUids.includes(myUid));

  const ownedDrawerOtherSeat = useMemo(() => {
    if (!lukisan || room.status !== 'playing' || lukisan.phase !== 'drawing') return null;
    if (lukisan.currentTurnUid === myUid) return null;
    return (
      players.find(
        (p) =>
          p.uid === lukisan.currentTurnUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid,
      ) ?? null
    );
  }, [lukisan, room.status, myUid, players, actualDeviceUid]);

  const pendingCoSeatVoter = useMemo(() => {
    if (!lukisan || room.status !== 'playing' || lukisan.phase !== 'voting') return null;
    const voted = new Set(lukisan.submittedVoteUids);
    return (
      players.find(
        (p) =>
          p.uid !== myUid &&
          (p.controllerUid ?? p.uid) === actualDeviceUid &&
          lukisan.turnOrder.includes(p.uid) &&
          !voted.has(p.uid),
      ) ?? null
    );
  }, [lukisan, room.status, myUid, players, actualDeviceUid]);

  // Host auto-resolves voting once all eligible turnOrder players have submitted votes
  useEffect(() => {
    if (
      !isHost ||
      room.status !== 'playing' ||
      !lukisan ||
      lukisan.phase !== 'voting' ||
      lukisan.turnOrder.length === 0 ||
      lukisan.submittedVoteUids.length < lukisan.turnOrder.length
    ) {
      return;
    }

    const resolveKey = `${room.id}:${room.currentRoundId}`;
    if (autoResolvedRoundRef.current === resolveKey) return;
    autoResolvedRoundRef.current = resolveKey;

    void resolvePelukisVote({
      roomId: room.id,
      hostUid: actualDeviceUid,
      hostName: actualDeviceName,
    }).catch((err) => {
      autoResolvedRoundRef.current = null;
      setActionError(err instanceof Error ? err.message : 'Gagal menghitung hasil voting.');
    });
  }, [isHost, room.status, room.id, room.currentRoundId, lukisan, actualDeviceUid, actualDeviceName]);

  const phaseLabel =
    room.status === 'lobby'
      ? 'Lobi'
      : room.status === 'round_end'
        ? 'Pengungkapan'
        : lukisan?.phase === 'gadungan_guess'
          ? 'Kesempatan Terakhir Gadungan'
          : lukisan?.phase === 'voting'
            ? 'Diskusi & Voting'
            : `Menggambar Putaran ${lukisan?.strokeRound ?? 1}/${lukisan?.totalStrokeRounds ?? 2}`;

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
    setSelectedSuspectUid(null);
    setGuessedWord('');
    autoResolvedRoundRef.current = null;
    try {
      await startPelukisRound({
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

  const handleSubmitStroke = async (points: number[]) => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitPelukisStroke({
        roomId: room.id,
        actorUid: myUid,
        actorName: myName,
        points,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim goresan.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSkipTurn = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await skipPelukisTurn({
        roomId: room.id,
        actorUid: isMyTurn ? myUid : actualDeviceUid,
        actorName: isMyTurn ? myName : actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal melewati giliran.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitVote = async () => {
    if (!selectedSuspectUid || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await castPelukisVote({
        roomId: room.id,
        voterUid: myUid,
        voterName: myName,
        targetUid: selectedSuspectUid,
      });
      setSelectedSuspectUid(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim pilihan voting.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManualResolveVote = async () => {
    if (!isHost || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await resolvePelukisVote({
        roomId: room.id,
        hostUid: actualDeviceUid,
        hostName: actualDeviceName,
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal membuka hasil voting.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitGuess = async (surrender = false) => {
    if (actionBusy) return;
    if (!surrender && !guessedWord.trim()) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await submitPelukisGuess({
        roomId: room.id,
        actorUid: surrender && isHost && lukisan?.accusedUid !== myUid ? actualDeviceUid : myUid,
        actorName: surrender && isHost && lukisan?.accusedUid !== myUid ? actualDeviceName : myName,
        guessedWord: surrender ? '' : guessedWord.trim(),
        surrender,
      });
      setGuessedWord('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengirim tebakan kata.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleReturnLobby = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await returnPelukisToLobby({
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
              Yuk Main · Pelukis Gadungan · Ronde #{room.roundNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {room.status !== 'lobby' && (
              <div className="hidden md:inline-flex min-h-[38px] px-3 rounded-xl bg-[#131A24] border border-slate-800 items-center gap-1.5 text-xs font-medium text-emerald-300 whitespace-nowrap">
                <Brush className="w-3.5 h-3.5" />
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

        {/* Active Turn Banner for Numpang Seats */}
        {ownedDrawerOtherSeat && (
          <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 px-4 py-3 text-xs text-amber-200 leading-relaxed">
            Sekarang giliran <strong className="text-white">{ownedDrawerOtherSeat.displayName}</strong> (kursi Numpang di HP ini)! Ketuk tombol namanya di bilah kursi bagian atas sebelum menggambar.
          </div>
        )}

        {/* Responsive 12-Col Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Lobby / Secret Card + Shared Canvas / Voting / Reveal */}
          <div
            className={`lg:col-span-6 space-y-5 ${
              mobileTab === 'kanvas' ? 'block' : 'hidden lg:block'
            }`}
          >
            {/* LOBBY */}
            {room.status === 'lobby' && (
              <>
                <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-lg font-bold text-white">Lobi Pelukis Gadungan</h1>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Bagikan kode{' '}
                      <span className="font-mono-tabular text-white font-semibold">
                        {room.code}
                      </span>{' '}
                      kepada teman. Minimal <strong className="text-white">3 pemain</strong>{' '}
                      untuk mulai menggambar bersama dan menebak peniru!
                    </p>
                  </div>

                  {isHost ? (
                    <button
                      type="button"
                      disabled={actionBusy || activePlayersCount < 3}
                      onClick={() => void handleStartRound()}
                      className="w-full min-h-[48px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" />
                      <span>
                        {actionBusy
                          ? 'Menyiapkan Kanvas...'
                          : activePlayersCount < 3
                            ? `Menunggu Pemain Aktif (${activePlayersCount}/3 Minimal)`
                            : 'Mulai Pelukis Gadungan'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-4 py-3 text-xs text-slate-300 text-center">
                      Menunggu Host memulai ronde...
                    </div>
                  )}
                </section>

                <PelukisLobbySettings room={room} isHost={isHost} />
              </>
            )}

            {/* ACTIVE GAMEPLAY */}
            {room.status === 'playing' && lukisan && (
              <>
                {/* Secret Role & Word Card (Tap-to-Hide) */}
                <section
                  className={`bg-[#131A24] border rounded-2xl p-5 space-y-3 ${
                    mySecret?.isGadungan
                      ? 'border-rose-500/50'
                      : 'border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 font-medium">
                        Tema Umum · <strong className="text-emerald-300">{lukisan.category}</strong>
                      </p>
                      <h2 className="text-base font-bold text-white mt-0.5">
                        Kartu Rahasia ({myName})
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
                      className="w-full min-h-[96px] rounded-xl bg-[#0B1018] border border-dashed border-slate-700 hover:border-emerald-400/70 p-4 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                    >
                      <Eye className="w-5 h-5 text-emerald-400" />
                      <span className="text-sm font-semibold text-white">
                        Kartu Rahasia Disembunyikan
                      </span>
                      <span className="text-xs text-slate-400">
                        Ketuk untuk mengintip kembali saat layar aman.
                      </span>
                    </button>
                  ) : !mySecret ? (
                    <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-center text-xs text-slate-400">
                      Memuat kartu peranmu...
                    </div>
                  ) : mySecret.isGadungan ? (
                    <div className="rounded-xl bg-rose-950/35 border border-rose-500/50 p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm sm:text-base font-black text-rose-300">
                          Kamu adalah Pelukis Gadungan!
                        </span>
                        <span
                          className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: myInkColor }}
                          title="Warna tintamu"
                        />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Kamu HANYA tahu tema umumnya (<strong className="text-white">{mySecret.drawingCategory ?? lukisan.category}</strong>) tanpa tahu Kata Rahasia! Perhatikan goresan teman lain lalu gambar garis meyakinkan agar tidak ketahuan.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/45 p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-emerald-300 font-bold block">
                            Kata Rahasia Pelukis Asli
                          </span>
                          <span className="text-xl sm:text-2xl font-black text-white">
                            {mySecret.drawingWord ?? '—'}
                          </span>
                        </div>
                        <span
                          className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                          style={{ backgroundColor: myInkColor }}
                          title="Warna tintamu"
                        />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Gambarlah cukup jelas untuk meyakinkan sesama Pelukis Asli, tapi jangan terlalu gamblang agar Pelukis Gadungan tidak ikut menebak!
                      </p>
                    </div>
                  )}
                </section>

                {/* PHASE 1: DRAWING BOARD */}
                {lukisan.phase === 'drawing' && (
                  <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              lukisan.turnColorsByUid[lukisan.currentTurnUid] ?? '#10B981',
                          }}
                        />
                        <div className="min-w-0">
                          <p className="text-xs text-emerald-300 font-semibold">
                            Putaran {lukisan.strokeRound}/{lukisan.totalStrokeRounds} · Giliran{' '}
                            {lukisan.currentTurnIndex + 1}/{lukisan.turnOrder.length}
                          </p>
                          <h3 className="text-base font-bold text-white truncate">
                            {isMyTurn
                              ? 'Giliranmu! Tarik 1 Garis Sekarang'
                              : `Menunggu ${lukisan.currentTurnName} Menggambar...`}
                          </h3>
                        </div>
                      </div>

                      {(isMyTurn || isHost) && (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => void handleSkipTurn()}
                          className="min-h-[38px] px-3 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-xs font-semibold text-slate-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                          <span>Lewati Giliran</span>
                        </button>
                      )}
                    </div>

                    <PelukisCanvas
                      strokes={lukisan.strokes}
                      interactive={isMyTurn && !actionBusy}
                      inkColor={myInkColor}
                      onSubmitStroke={handleSubmitStroke}
                      busy={actionBusy}
                      turnOrder={lukisan.turnOrder}
                      turnNamesByUid={lukisan.turnNamesByUid}
                      turnColorsByUid={lukisan.turnColorsByUid}
                    />
                  </section>
                )}

                {/* PHASE 2: VOTING */}
                {lukisan.phase === 'voting' && (
                  <section className="bg-[#131A24] border border-amber-500/50 rounded-2xl p-5 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <Vote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-base font-bold text-white">
                            Diskusi &amp; Pilih Pelukis Gadungan!
                          </h3>
                          <p className="text-xs text-slate-300 mt-0.5">
                            Periksa setiap warna goresan di kanvas, lalu pilih 1 tersangka secara rahasia.
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-[#0B1018] border border-slate-800 text-xs font-mono-tabular font-bold text-amber-300">
                        {lukisan.submittedVoteUids.length}/{lukisan.turnOrder.length} suara
                      </span>
                    </div>

                    <PelukisCanvas
                      strokes={lukisan.strokes}
                      interactive={false}
                      turnOrder={lukisan.turnOrder}
                      turnNamesByUid={lukisan.turnNamesByUid}
                      turnColorsByUid={lukisan.turnColorsByUid}
                    />

                    {!isParticipant ? (
                      <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-400 text-center">
                        Kamu tidak ikut menggambar di ronde ini (BRB). Menunggu pemain lain selesai memilih.
                      </div>
                    ) : hasMyVote ? (
                      <div className="rounded-xl bg-emerald-950/35 border border-emerald-500/45 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Pilihanmu sudah terkunci! Menunggu pemain lain...</span>
                        </div>
                        {pendingCoSeatVoter && (
                          <p className="text-xs text-amber-300">
                            Kursi Numpang <strong className="text-white">{pendingCoSeatVoter.displayName}</strong> di HP ini belum memilih—ketuk namanya di bar atas untuk memilih.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {lukisan.turnOrder
                            .filter((uid) => uid !== myUid)
                            .map((uid) => {
                              const selected = selectedSuspectUid === uid;
                              const color = lukisan.turnColorsByUid[uid] ?? '#94A3B8';
                              const name = lukisan.turnNamesByUid[uid] ?? 'Pemain';
                              return (
                                <button
                                  key={uid}
                                  type="button"
                                  disabled={actionBusy}
                                  onClick={() => setSelectedSuspectUid(uid)}
                                  className={`min-h-[50px] px-4 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                                    selected
                                      ? 'bg-amber-500/20 border-amber-400 text-white'
                                      : 'bg-[#0B1018] border-slate-800 hover:border-slate-600 text-slate-200'
                                  }`}
                                >
                                  <span
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                                    style={{ backgroundColor: color }}
                                  >
                                    {name.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span className="text-sm font-semibold truncate">{name}</span>
                                </button>
                              );
                            })}
                        </div>

                        <button
                          type="button"
                          disabled={actionBusy || !selectedSuspectUid}
                          onClick={() => void handleSubmitVote()}
                          className="w-full min-h-[46px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors disabled:opacity-40"
                        >
                          {actionBusy ? 'Mengunci Pilihan...' : 'Kunci Pilihan Voting'}
                        </button>
                      </div>
                    )}

                    {isHost && (
                      <div className="pt-2 border-t border-slate-800/80 flex justify-end">
                        <button
                          type="button"
                          disabled={actionBusy || lukisan.submittedVoteUids.length === 0}
                          onClick={() => void handleManualResolveVote()}
                          className="min-h-[40px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-amber-400 text-xs font-semibold text-amber-300 transition-colors disabled:opacity-40"
                        >
                          Buka Hasil Voting ({lukisan.submittedVoteUids.length}/
                          {lukisan.turnOrder.length})
                        </button>
                      </div>
                    )}
                  </section>
                )}

                {/* PHASE 3: CAUGHT GADUNGAN LAST-CHANCE WORD GUESS */}
                {lukisan.phase === 'gadungan_guess' && (
                  <section className="bg-[#131A24] border border-rose-500/60 rounded-2xl p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                          Kesempatan Terakhir
                        </p>
                        <h3 className="text-lg font-bold text-white mt-0.5">
                          {lukisan.accusedName} Tertangkap sebagai Pelukis Gadungan!
                        </h3>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          Jika dia berhasil menebak Kata Rahasia (Tema:{' '}
                          <strong className="text-white">{lukisan.category}</strong>), dia membalikkan kemenangan!
                        </p>
                      </div>
                    </div>

                    <PelukisCanvas
                      strokes={lukisan.strokes}
                      interactive={false}
                      turnOrder={lukisan.turnOrder}
                      turnNamesByUid={lukisan.turnNamesByUid}
                      turnColorsByUid={lukisan.turnColorsByUid}
                    />

                    {lukisan.accusedUid === myUid ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          maxLength={60}
                          value={guessedWord}
                          onChange={(e) => setGuessedWord(e.target.value)}
                          placeholder="Ketik tebakan Kata Rahasia di sini..."
                          className="w-full min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400"
                        />
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <button
                            type="button"
                            disabled={actionBusy || !guessedWord.trim()}
                            onClick={() => void handleSubmitGuess(false)}
                            className="flex-1 min-h-[46px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-colors disabled:opacity-40"
                          >
                            {actionBusy ? 'Memeriksa...' : 'Kirim Tebakan Kata'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleSubmitGuess(true)}
                            className="min-h-[46px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-300 font-semibold text-sm transition-colors disabled:opacity-40"
                          >
                            Menyerah
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-4 text-xs text-slate-300 text-center">
                          Menunggu <strong className="text-white">{lukisan.accusedName}</strong>{' '}
                          menebak Kata Rahasia...
                        </div>
                        {isHost && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void handleSubmitGuess(true)}
                            className="w-full min-h-[42px] rounded-xl bg-[#0B1018] border border-slate-700 hover:border-rose-400 text-xs font-semibold text-rose-300 transition-colors disabled:opacity-40"
                          >
                            Host: Lewati Tebakan (Anggap Menyerah)
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}

            {/* ROUND END: FULL REVEAL & REPLAY */}
            {room.status === 'round_end' && lukisan && (
              <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex items-start gap-3">
                  <Trophy
                    className={`w-6 h-6 shrink-0 mt-0.5 ${
                      room.lastRoundResult?.winnerTeam === 'pelukis'
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-400">
                      Hasil Ronde #{room.roundNumber} · Tema {lukisan.category}
                    </p>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {room.lastRoundResult?.winnerTeam === 'pelukis'
                        ? 'Pelukis Asli Menang! (+2 Poin)'
                        : 'Pelukis Gadungan Menang! (+3 Poin)'}
                    </h2>
                    {room.lastRoundResult?.reason && (
                      <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                        {room.lastRoundResult.reason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-[#0B1018] border border-emerald-800/60 rounded-xl p-3.5">
                    <span className="text-xs text-emerald-300 block">Kata Rahasia</span>
                    <span className="text-lg font-black text-white mt-0.5 block">
                      {lukisan.revealedWord ?? room.lastRoundResult?.drawingWord ?? '—'}
                    </span>
                  </div>
                  <div className="bg-[#0B1018] border border-rose-800/60 rounded-xl p-3.5">
                    <span className="text-xs text-rose-300 block">Pelukis Gadungan</span>
                    <span className="text-lg font-black text-white mt-0.5 block">
                      {lukisan.gadunganNames?.join(', ') ||
                        room.lastRoundResult?.spyNames.join(', ') ||
                        '—'}
                    </span>
                  </div>
                </div>

                <PelukisCanvas
                  strokes={lukisan.strokes}
                  interactive={false}
                  allowReplay
                  autoPlayReplay
                  turnOrder={lukisan.turnOrder}
                  turnNamesByUid={lukisan.turnNamesByUid}
                  turnColorsByUid={lukisan.turnColorsByUid}
                />

                {lukisan.voteTally && Object.keys(lukisan.voteTally).length > 0 && (
                  <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-2">
                    <p className="text-xs font-semibold text-slate-400">Rekap Suara Voting</p>
                    <div className="flex flex-wrap gap-2">
                      {lukisan.turnOrder.map((uid) => {
                        const votes = lukisan.voteTally?.[uid] ?? 0;
                        const name = lukisan.turnNamesByUid[uid] ?? 'Pemain';
                        return (
                          <span
                            key={uid}
                            className="px-2.5 py-1 rounded-lg bg-[#131A24] border border-slate-800 text-xs text-slate-200"
                          >
                            {name}: <strong className="font-mono-tabular text-amber-300">{votes}</strong>
                          </span>
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
                      onClick={() => void handleStartRound()}
                      className="flex-1 min-h-[46px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
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

          {/* Center Column: Players & Turn Order */}
          <div
            className={`lg:col-span-3 space-y-5 ${
              mobileTab === 'pemain' ? 'block' : 'hidden lg:block'
            }`}
          >
            <PelukisPlayersPanel
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
              quickPrompts={PELUKIS_QUICK_PROMPTS_ID}
              promptLabel="Celetukan Cepat"
              emptyPlaceholder="Belum ada obrolan. Komentari goresan teman atau tuduh siapa yang paling mencurigakan!"
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation */}
      <nav
        aria-label="Navigasi ruang Pelukis Gadungan"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1018]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-3"
      >
        <button
          type="button"
          onClick={() => setMobileTab('kanvas')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'kanvas' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Palette className="w-5 h-5" />
          <span>Kanvas</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('obrolan')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'obrolan' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Obrolan</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('pemain')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
            mobileTab === 'pemain' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Pemain ({players.length})</span>
        </button>
      </nav>
    </div>
  );
}
