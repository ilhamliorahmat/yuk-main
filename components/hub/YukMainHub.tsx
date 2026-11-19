'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Plus,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import spyEmblem from '@/src/assets/images/yukmain_spy_emblem_1795001425384.jpg';
import spyfallCover from '@/src/assets/images/yukmain_spyfall_cover_1795001423851.jpg';
import { useAuth } from '@/hooks/use-auth';
import { PARTY_GAMES } from '@/lib/games/registry';
import { createRoom, joinRoomByCode } from '@/lib/platform/room-service';
import { AuthDialog } from './AuthDialog';

interface YukMainHubProps {
  initialRoomCode?: string;
  onEnterRoom: (roomId: string) => void;
}

export function YukMainHub({ initialRoomCode = '', onEnterRoom }: YukMainHubProps) {
  const { user, profile, configured } = useAuth();
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [busyAction, setBusyAction] = useState<'create' | 'join' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const spyfall = PARTY_GAMES[0];

  const handleCreateSpyfall = async () => {
    setErrorMsg(null);
    if (!configured) {
      setErrorMsg('Konfigurasi Firebase belum tersedia di environment.');
      return;
    }
    if (!user || !profile) {
      setAuthOpen(true);
      return;
    }

    setBusyAction('create');
    try {
      const { roomId } = await createRoom({
        hostUid: user.uid,
        hostName: profile.displayName,
        avatarColor: profile.avatarColor,
        gameType: 'spyfall',
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
    if (!configured) {
      setErrorMsg('Konfigurasi Firebase belum tersedia di environment.');
      return;
    }
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
      onEnterRoom(roomId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal bergabung ke ruang.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col">
      {/* Zone-3 Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B1018]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#beranda"
            className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
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
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Cara Bermain
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131A24] border border-slate-800 hover:border-slate-700 text-xs sm:text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors"
            >
              {profile ? profile.displayName : 'Masuk'}
            </button>
          </div>
        </div>
      </header>

      <main id="beranda" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12">
        {!configured && (
          <div className="rounded-2xl bg-amber-950/40 border border-amber-700/60 p-4 flex items-start gap-3 text-sm text-amber-200">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Konfigurasi Firebase Belum Terdeteksi</p>
              <p className="text-xs text-amber-200/80 mt-1">
                Pastikan variabel <code className="font-mono-tabular">NEXT_PUBLIC_FIREBASE_*</code> telah diisi di <code className="font-mono-tabular">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-medium text-rose-400 flex items-center gap-2">
                <span>Koleksi Game Pesta Indonesia</span>
                <span aria-hidden="true">·</span>
                <span>Permainan #1: Spyfall</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12] text-balance">
                Temukan penyamar di antara temanmu malam ini.
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                {spyfall.description} Langsung bermain dari peramban ponsel atau desktop tanpa unduh aplikasi tambahan.
              </p>
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-4 py-3 text-xs text-rose-200">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleCreateSpyfall}
                  className="min-h-[48px] px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>{busyAction === 'create' ? 'Membuat Ruang...' : 'Buat Ruang Spyfall'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRulesOpen(true)}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-[#131A24] border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Cara Bermain</span>
                </button>
              </div>

              <form onSubmit={handleJoinRoom} className="flex items-stretch gap-2.5 max-w-md">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="KODE 6 HURUF"
                  aria-label="Kode Ruang"
                  className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#131A24] border border-slate-800 text-white font-mono-tabular text-sm tracking-widest uppercase placeholder:text-slate-500 placeholder:tracking-normal focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={busyAction !== null || joinCode.trim().length !== 6}
                  className="min-h-[48px] px-5 rounded-xl bg-slate-100 hover:bg-white text-slate-900 font-semibold text-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                >
                  <span>{busyAction === 'join' ? 'Masuk...' : 'Gabung'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Hero Artwork */}
          <div className="lg:col-span-6">
            <div className="relative h-full min-h-[240px] sm:min-h-[320px] rounded-2xl overflow-hidden border border-slate-800 bg-[#131A24]">
              <Image
                src={spyfallCover}
                alt="Ilustrasi meja investigasi Spyfall Indonesia dengan tiket Kereta Api Jakarta dan peta Nusantara"
                fill
                unoptimized
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1018]/90 via-[#0B1018]/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-amber-300 font-medium">Game #01 · Aktif Sekarang</p>
                  <p className="text-lg font-semibold text-white">Spyfall Edisi Nusantara</p>
                </div>
                <span className="text-xs text-slate-300 font-mono-tabular">26+ Lokasi</span>
              </div>
            </div>
          </div>
        </section>

        {/* Game Catalog Section */}
        <section id="katalog" className="space-y-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">Katalog Permainan Yuk Main</h2>
              <p className="text-sm text-slate-400 mt-1">
                Dibangun modular agar mudah menambah permainan pesta baru di masa mendatang.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PARTY_GAMES.map((game) => (
              <article
                key={game.id}
                className="bg-[#131A24] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-800 bg-[#0B1018] shrink-0 relative">
                      <Image
                        src={spyEmblem}
                        alt={`Ikon permainan ${game.title}`}
                        fill
                        unoptimized
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

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleCreateSpyfall}
                  className="w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  Mainkan Spyfall
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500">
        Yuk Main — Hub Permainan Pesta Indonesia
      </footer>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* Rules Modal */}
      {rulesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rules-modal-title"
        >
          <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <h2 id="rules-modal-title" className="text-lg font-bold text-white">
                Aturan Main Spyfall
              </h2>
              <button
                type="button"
                onClick={() => setRulesOpen(false)}
                aria-label="Tutup panduan"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-slate-300 leading-relaxed list-decimal pl-5">
              {spyfall.rulesSummary.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setRulesOpen(false)}
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
