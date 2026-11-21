'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Compass,
  Github,
  Globe,
  Monitor,
  QrCode,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import faktaCover from '@/src/assets/images/yukmain_fakta_cover_1795115894333.jpg';
import faktaEmblem from '@/src/assets/images/yukmain_fakta_emblem_1795115894196.jpg';
import frekuensiCover from '@/src/assets/images/yukmain_frekuensi_cover_1795115894652.jpg';
import frekuensiEmblem from '@/src/assets/images/yukmain_frekuensi_emblem_1795115893627.jpg';
import kataCover from '@/src/assets/images/yukmain_kata_cover_1795098826342.jpg';
import kataEmblem from '@/src/assets/images/yukmain_kata_emblem_1795098826535.jpg';
import pelukisCover from '@/src/assets/images/yukmain_pelukis_cover_1795178136981.jpg';
import pelukisEmblem from '@/src/assets/images/yukmain_pelukis_emblem_1795178137917.jpg';
import silumanCover from '@/src/assets/images/yukmain_siluman_cover_1795180059853.jpg';
import silumanEmblem from '@/src/assets/images/yukmain_siluman_emblem_1795180059939.jpg';
import spyEmblem from '@/src/assets/images/yukmain_spy_emblem_1795001425384.jpg';
import spyfallCover from '@/src/assets/images/yukmain_spyfall_cover_1795001423851.jpg';
import { LanPairingModal } from '@/components/lan/LanPairingModal';
import { OfflineNoticeBanner } from '@/components/pwa/OfflineNoticeBanner';
import { useAuth } from '@/hooks/use-auth';
import { useOnlineStatus } from '@/hooks/use-pwa';
import { PARTY_GAMES } from '@/lib/games/registry';
import type { GameType, PartyGameDefinition } from '@/lib/games/types';
import {
  getLocalLanProfile,
  saveLocalLanNickname,
  type NetworkMode,
} from '@/lib/lan/lan-protocol';
import { lanRuntime } from '@/lib/lan/lan-runtime';
import {
  createRoom,
  joinRoomAsStageDisplay,
  joinRoomByCode,
} from '@/lib/platform/room-service';
import { AuthDialog } from './AuthDialog';

const CREATOR_GITHUB_URL = 'https://github.com/ilhamliorahmat/';
const CREATOR_WEBSITE_URL = 'https://liorahmat.xo.je';

interface YukMainHubProps {
  initialRoomCode?: string;
  onEnterRoom: (roomId: string, options?: { isStageDisplay?: boolean }) => void;
}

interface GameVisualMeta {
  cover: StaticImageData;
  emblem: StaticImageData;
  ctaClass: string;
}

const GAME_VISUALS: Record<GameType, GameVisualMeta> = {
  spyfall: {
    cover: spyfallCover,
    emblem: spyEmblem,
    ctaClass: 'bg-rose-600 hover:bg-rose-500 text-white',
  },
  kata_kata: {
    cover: kataCover,
    emblem: kataEmblem,
    ctaClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
  },
  satu_frekuensi: {
    cover: frekuensiCover,
    emblem: frekuensiEmblem,
    ctaClass: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950',
  },
  fakta_hari_ini: {
    cover: faktaCover,
    emblem: faktaEmblem,
    ctaClass: 'bg-violet-600 hover:bg-violet-500 text-white',
  },
  pelukis_gadungan: {
    cover: pelukisCover,
    emblem: pelukisEmblem,
    ctaClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950',
  },
  malam_siluman: {
    cover: silumanCover,
    emblem: silumanEmblem,
    ctaClass: 'bg-rose-600 hover:bg-rose-500 text-white',
  },
};

export function YukMainHub({ initialRoomCode = '', onEnterRoom }: YukMainHubProps) {
  const { user, profile } = useAuth();
  const isOnline = useOnlineStatus();
  const [networkMode, setNetworkMode] = useState<NetworkMode>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'lan' : 'online',
  );
  const [lanNickname, setLanNickname] = useState<string>(() => {
    const local = getLocalLanProfile();
    return local.displayName === 'Pemain LAN' ? '' : local.displayName;
  });
  const [lanGuestModal, setLanGuestModal] = useState<{ open: boolean; stage: boolean }>({
    open: false,
    stage: false,
  });
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [rulesGame, setRulesGame] = useState<PartyGameDefinition | null>(null);
  const [creatorCardsOpen, setCreatorCardsOpen] = useState(false);
  const creatorAnchorRef = useRef<HTMLDivElement | null>(null);

  // Auto-switch to LAN Party Mode when browser drops offline
  useEffect(() => {
    const handleOffline = () => {
      setNetworkMode('lan');
    };
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!creatorCardsOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (
        creatorAnchorRef.current &&
        !creatorAnchorRef.current.contains(event.target as Node)
      ) {
        setCreatorCardsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCreatorCardsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [creatorCardsOpen]);

  const handleCreateGame = async (gameType: GameType) => {
    setErrorMsg(null);

    if (networkMode === 'lan') {
      const effectiveName = (lanNickname.trim() || profile?.displayName || 'Host LAN').slice(0, 40);
      const localProfile = saveLocalLanNickname(effectiveName);
      setBusyAction(`create:${gameType}`);
      try {
        const { roomId } = lanRuntime.startHostRoom({
          hostUid: localProfile.uid,
          hostName: localProfile.displayName,
          avatarColor: localProfile.avatarColor,
          gameType,
        });
        onEnterRoom(roomId, { isStageDisplay: false });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat ruang LAN Party.');
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (!isOnline) {
      setErrorMsg('Kamu sedang offline. Pindah ke Mode LAN Party untuk main tanpa internet.');
      return;
    }
    if (!user || !profile) {
      setAuthOpen(true);
      return;
    }

    setBusyAction(`create:${gameType}`);
    try {
      const { roomId } = await createRoom({
        hostUid: user.uid,
        hostName: profile.displayName,
        avatarColor: profile.avatarColor,
        gameType,
      });
      onEnterRoom(roomId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat ruang permainan.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!user || !profile) {
      setAuthOpen(true);
      return;
    }

    setBusyAction('join');
    try {
      const roomId = await joinRoomByCode({
        code: joinCode,
        uid: user.uid,
        displayName: profile.displayName,
        avatarColor: profile.avatarColor,
      });
      onEnterRoom(roomId, { isStageDisplay: false });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal bergabung ke ruang.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinAsStage = async () => {
    setErrorMsg(null);
    if (!user || !profile) {
      setAuthOpen(true);
      return;
    }
    if (joinCode.trim().length !== 6) return;

    setBusyAction('stage');
    try {
      const { roomId } = await joinRoomAsStageDisplay({ code: joinCode });
      onEnterRoom(roomId, { isStageDisplay: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuka Layar Panggung.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B1018]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#beranda"
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Yuk Main
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a
              href="#katalog"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Katalog Game
            </a>
            <a
              href="#gabung-ruang"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Gabung Ruang
            </a>
            <button
              type="button"
              onClick={() => setRulesGame(PARTY_GAMES[0])}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Cara Bermain
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131A24] border border-slate-800 hover:border-amber-400/50 text-xs sm:text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors"
            >
              {profile ? profile.displayName : 'Masuk'}
            </button>
          </div>
        </div>
      </header>

      <main
        id="beranda"
        className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-10 pb-12 sm:pt-14 sm:pb-16 space-y-12"
      >
        <OfflineNoticeBanner
          isLanModeActive={networkMode === 'lan'}
          onSwitchToLan={() => setNetworkMode('lan')}
        />

        {/* Centered Warm Platform Intro Hero (Option 1) */}
        <section className="relative text-center max-w-3xl mx-auto space-y-7">
          {/* Subtle warm ambient glow behind headline */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[520px] max-w-full h-56 rounded-full bg-amber-500/[0.07] blur-3xl"
          />

          <div className="relative space-y-4">
            <p className="text-xs sm:text-sm font-medium text-amber-300/90 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>100% Gratis &amp; Open-Source</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>{PARTY_GAMES.length} Permainan Grup</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Langsung Main di Browser</span>
            </p>

            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12] text-balance">
              Hidupkan tongkronganmu bareng Yuk Main.
            </h1>

            <div ref={creatorAnchorRef} className="relative max-w-2xl mx-auto">
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Ada{' '}
                <strong className="text-white font-semibold">
                  {PARTY_GAMES.length} permainan grup
                </strong>{' '}
                yang bakal mengasah otak dan skill sosial kalian, loh—tanpa ribet instal
                aplikasi. Platform ini 100% gratis dan open-source, dikembangkan oleh{' '}
                <button
                  type="button"
                  onClick={() => setCreatorCardsOpen((prev) => !prev)}
                  aria-expanded={creatorCardsOpen}
                  aria-controls="liorahmat-creator-cards"
                  className="inline-flex items-baseline font-semibold text-amber-300 hover:text-amber-200 underline decoration-amber-400/60 decoration-dashed underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 rounded"
                >
                  Liorahmat
                </button>
                .
              </p>

              {/* 2 Tiny Summoned Creator Cards (GitHub + Website) */}
              <AnimatePresence>
                {creatorCardsOpen && (
                  <motion.div
                    id="liorahmat-creator-cards"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-4 inline-grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md mx-auto text-left"
                  >
                    <a
                      href={CREATOR_GITHUB_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group min-h-[56px] px-3.5 py-2.5 rounded-xl bg-[#131A24] border border-slate-700/90 hover:border-amber-400/60 flex items-center justify-between gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#0B1018] border border-slate-800 flex items-center justify-center shrink-0 text-slate-200 group-hover:text-amber-300 transition-colors">
                          <Github className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">GitHub</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            github.com/ilhamliorahmat
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-amber-300 shrink-0 transition-colors" />
                    </a>

                    <a
                      href={CREATOR_WEBSITE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group min-h-[56px] px-3.5 py-2.5 rounded-xl bg-[#131A24] border border-slate-700/90 hover:border-amber-400/60 flex items-center justify-between gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#0B1018] border border-slate-800 flex items-center justify-center shrink-0 text-slate-200 group-hover:text-amber-300 transition-colors">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">Website</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            liorahmat.xo.je
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-amber-300 shrink-0 transition-colors" />
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {errorMsg && (
            <div className="max-w-xl mx-auto rounded-xl bg-rose-950/60 border border-rose-800/70 px-4 py-3 text-xs text-rose-200 text-left">
              {errorMsg}
            </div>
          )}

          {/* Dual-Mode Room Entry Dock (Online vs Zero-Internet LAN Party) */}
          <div id="gabung-ruang" className="max-w-xl mx-auto space-y-3.5 scroll-mt-24">
            {/* Segmented Mode Switcher */}
            <div
              role="tablist"
              aria-label="Pilih mode koneksi"
              className="inline-grid grid-cols-2 p-1 rounded-xl bg-[#131A24] border border-slate-800 w-full sm:w-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={networkMode === 'online'}
                onClick={() => {
                  setErrorMsg(null);
                  setNetworkMode('online');
                }}
                className={`min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  networkMode === 'online'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Online</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={networkMode === 'lan'}
                onClick={() => {
                  setErrorMsg(null);
                  setNetworkMode('lan');
                }}
                className={`min-h-[40px] px-4 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                  networkMode === 'lan'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Wifi className="w-4 h-4" />
                <span>LAN Party (Tanpa Internet)</span>
              </button>
            </div>

            {networkMode === 'online' ? (
              <form
                onSubmit={handleJoinRoom}
                className="flex flex-col sm:flex-row items-stretch gap-2.5"
              >
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                  placeholder="KODE 6 HURUF"
                  aria-label="Kode Ruang"
                  className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#131A24] border border-slate-800 text-white font-mono-tabular text-sm tracking-widest uppercase text-center sm:text-left placeholder:text-slate-500 placeholder:tracking-normal focus:outline-none focus:border-amber-400/70"
                />
                <div className="flex items-stretch gap-2.5">
                  <button
                    type="submit"
                    disabled={busyAction !== null || joinCode.trim().length !== 6}
                    className="flex-1 sm:flex-none min-h-[48px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                  >
                    <span>{busyAction === 'join' ? 'Masuk...' : 'Gabung'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busyAction !== null || joinCode.trim().length !== 6}
                    onClick={() => void handleJoinAsStage()}
                    title="Buka di TV/Laptop tanpa menampilkan rahasia pemain"
                    className="flex-1 sm:flex-none min-h-[48px] px-4 rounded-xl bg-[#131A24] hover:bg-slate-800/90 border border-slate-700 hover:border-amber-400/50 text-slate-200 hover:text-amber-200 font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                  >
                    <Monitor className="w-4 h-4 text-amber-300" />
                    <span>{busyAction === 'stage' ? 'Membuka...' : 'Layar Panggung'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                  <input
                    type="text"
                    maxLength={32}
                    value={lanNickname}
                    onChange={(e) => {
                      setLanNickname(e.target.value);
                      if (e.target.value.trim()) {
                        saveLocalLanNickname(e.target.value);
                      }
                    }}
                    placeholder={profile?.displayName || 'Nama panggilanmu (tanpa login)'}
                    aria-label="Nama Panggilan LAN"
                    className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#131A24] border border-slate-800 text-white text-sm text-center sm:text-left placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70"
                  />
                  <div className="flex items-stretch gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (lanNickname.trim()) saveLocalLanNickname(lanNickname);
                        setLanGuestModal({ open: true, stage: false });
                      }}
                      className="flex-1 sm:flex-none min-h-[48px] px-5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Gabung LAN</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanGuestModal({ open: true, stage: true })}
                      title="Hubungkan TV/Laptop sebagai Layar Panggung via Wi-Fi LAN"
                      className="flex-1 sm:flex-none min-h-[48px] px-4 rounded-xl bg-[#131A24] hover:bg-slate-800/90 border border-slate-700 hover:border-amber-400/50 text-slate-200 hover:text-amber-200 font-semibold text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Monitor className="w-4 h-4 text-amber-300" />
                      <span>Layar Panggung</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Main 100% lewat Wi-Fi atau Hotspot HP tanpa kuota internet dan tanpa login akun.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
              <span>
                {networkMode === 'lan'
                  ? 'Mau jadi Host LAN Party?'
                  : 'Mau bikin ruang baru?'}
              </span>
              <a
                href="#katalog"
                className="inline-flex items-center gap-1 text-slate-200 hover:text-amber-300 font-medium transition-colors"
              >
                <span>Pilih permainannya di bawah</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </a>
            </p>
          </div>
        </section>

        {/* Game Catalog Section (2x2 Balanced Grid — Preserved As-Is) */}
        <section id="katalog" className="space-y-5 pt-6 border-t border-slate-800/80 scroll-mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Katalog Permainan Yuk Main
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {networkMode === 'lan'
                  ? 'Pilih permainan untuk langsung membuka ruang Host LAN Party (tanpa internet), lalu undang teman lewat QR.'
                  : 'Pilih permainan untuk membuat ruang baru, lalu bagikan kode 6 huruf ke temanmu.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PARTY_GAMES.map((game) => {
              const isCreatingThis = busyAction === `create:${game.id}`;
              const visual = GAME_VISUALS[game.id];

              return (
                <article
                  key={game.id}
                  className="bg-[#131A24] border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* 16:9 Game Cover Banner */}
                    <div className="relative aspect-video w-full bg-gradient-to-br from-[#131A24] to-[#0B1018] border-b border-slate-800/80 overflow-hidden">
                      <Image
                        src={visual.cover}
                        alt={`Sampul permainan ${game.title}`}
                        fill
                        referrerPolicy="no-referrer"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#131A24] via-[#131A24]/25 to-transparent" />
                    </div>

                    {/* Card Content */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-700/80 bg-[#0B1018] shrink-0 relative">
                          <Image
                            src={visual.emblem}
                            alt={`Ikon permainan ${game.title}`}
                            fill
                            referrerPolicy="no-referrer"
                            sizes="56px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-slate-400">
                            <span>Game #{game.number}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{game.subtitle}</span>
                          </div>
                          <h3 className="text-lg font-bold text-white truncate">{game.title}</h3>
                        </div>
                      </div>

                      <p className="text-sm text-slate-300 leading-relaxed">{game.description}</p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          <span>
                            {game.minPlayers}–{game.maxPlayers} Pemain
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Compass className="w-3.5 h-3.5" />
                          <span>{game.durationLabel}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 pb-5 flex items-center gap-2.5">
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleCreateGame(game.id)}
                      className={`flex-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${visual.ctaClass}`}
                    >
                      {isCreatingThis ? 'Membuat Ruang...' : `Mainkan ${game.title}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRulesGame(game)}
                      aria-label={`Aturan main ${game.title}`}
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Aturan</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-center text-center text-xs text-slate-500">
          <span>Yuk Main — Hub Permainan Pesta Indonesia (Online &amp; LAN Party)</span>
        </div>
      </footer>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />

      {lanGuestModal.open && (
        <LanPairingModal
          mode="guest"
          initialStageDisplay={lanGuestModal.stage}
          onClose={() => setLanGuestModal({ open: false, stage: false })}
          onConnected={(roomId, stageFlag) => {
            setLanGuestModal({ open: false, stage: false });
            onEnterRoom(roomId, { isStageDisplay: stageFlag });
          }}
        />
      )}

      {/* Rules Modal */}
      {rulesGame && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rules-modal-title"
        >
          <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">Game #{rulesGame.number}</p>
                <h2 id="rules-modal-title" className="text-lg font-bold text-white">
                  Aturan Main {rulesGame.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRulesGame(null)}
                aria-label="Tutup panduan"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-slate-300 leading-relaxed list-decimal pl-5">
              {rulesGame.rulesSummary.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setRulesGame(null)}
              className="w-full min-h-[44px] rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-sm transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
