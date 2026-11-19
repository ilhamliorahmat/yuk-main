'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  BookOpen,
  Compass,
  MessageSquareQuote,
  Plus,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import kataCover from '@/src/assets/images/yukmain_kata_cover_1795098826342.jpg';
import kataEmblem from '@/src/assets/images/yukmain_kata_emblem_1795098826535.jpg';
import spyEmblem from '@/src/assets/images/yukmain_spy_emblem_1795001425384.jpg';
import spyfallCover from '@/src/assets/images/yukmain_spyfall_cover_1795001423851.jpg';
import { useAuth } from '@/hooks/use-auth';
import { PARTY_GAMES } from '@/lib/games/registry';
import type { GameType, PartyGameDefinition } from '@/lib/games/types';
import { createRoom, joinRoomByCode } from '@/lib/platform/room-service';
import { AuthDialog } from './AuthDialog';

interface YukMainHubProps {
  initialRoomCode?: string;
  onEnterRoom: (roomId: string) => void;
}

export function YukMainHub({ initialRoomCode = '', onEnterRoom }: YukMainHubProps) {
  const { user, profile, configured } = useAuth();
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [rulesGame, setRulesGame] = useState<PartyGameDefinition | null>(null);
  const [featuredGame, setFeaturedGame] = useState<GameType>('kata_kata');

  const handleCreateGame = async (gameType: GameType) => {
    setErrorMsg(null);
    if (!configured) {
      setErrorMsg('Konfigurasi Firebase belum tersedia di environment.');
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
              Katalog Game ({PARTY_GAMES.length})
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
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131A24] border border-slate-800 hover:border-slate-700 text-xs sm:text-sm font-medium text-white whitespace-nowrap shrink-0 transition-colors"
            >
              {profile ? profile.displayName : 'Masuk'}
            </button>
          </div>
        </div>
      </header>

      <main
        id="beranda"
        className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-12"
      >
        {!configured && (
          <div className="rounded-2xl bg-amber-950/40 border border-amber-700/60 p-4 flex items-start gap-3 text-sm text-amber-200">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Konfigurasi Firebase Belum Terdeteksi</p>
              <p className="text-xs text-amber-200/80 mt-1">
                Pastikan variabel <code className="font-mono-tabular">NEXT_PUBLIC_FIREBASE_*</code>{' '}
                telah diisi di <code className="font-mono-tabular">.env.local</code>.
              </p>
            </div>
          </div>
        )}

        {/* Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="text-xs font-medium text-rose-400 flex flex-wrap items-center gap-2">
                <span>Koleksi Game Pesta Indonesia</span>
                <span aria-hidden="true">·</span>
                <span>2 Permainan Aktif</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12] text-balance">
                Adu insting & temukan penyamar di antara temanmu.
              </h1>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
                Mainkan <strong className="text-white">Yang Bener Yang Mana</strong> dan game baru{' '}
                <strong className="text-amber-300">Kata-Kata Hari Ini</strong> langsung dari
                peramban ponsel atau desktop tanpa unduh aplikasi tambahan.
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
                  onClick={() => void handleCreateGame('spyfall')}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {busyAction === 'create:spyfall'
                      ? 'Membuat Ruang...'
                      : 'Main Yang Bener Yang Mana'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleCreateGame('kata_kata')}
                  className="min-h-[48px] px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <MessageSquareQuote className="w-4 h-4" />
                  <span>
                    {busyAction === 'create:kata_kata'
                      ? 'Membuat Ruang...'
                      : 'Main Kata-Kata Hari Ini'}
                  </span>
                </button>
              </div>

              <form onSubmit={handleJoinRoom} className="flex items-stretch gap-2.5 max-w-md">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
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
            <div className="relative h-full min-h-[260px] sm:min-h-[340px] rounded-2xl overflow-hidden border border-slate-800 bg-gradient-to-br from-[#131A24] via-[#0F172A] to-[#0B1018]">
              <Image
                src={featuredGame === 'kata_kata' ? kataCover : spyfallCover}
                alt={
                  featuredGame === 'kata_kata'
                    ? 'Ilustrasi meja tongkrongan Kata-Kata Hari Ini dengan kartu kata rahasia dan kopi hangat'
                    : 'Ilustrasi meja investigasi Yang Bener Yang Mana dengan peta Nusantara dan kartu rahasia'
                }
                fill
                priority
                referrerPolicy="no-referrer"
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1018]/95 via-[#0B1018]/35 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 space-y-3">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-amber-300 font-medium">
                      {featuredGame === 'kata_kata'
                        ? 'Game #2 · Rilis Terbaru Yuk Main 2.0'
                        : 'Game #1 · Favorit Tongkrongan'}
                    </p>
                    <p className="text-lg font-semibold text-white truncate">
                      {featuredGame === 'kata_kata'
                        ? 'Kata-Kata Hari Ini'
                        : 'Yang Bener Yang Mana'}
                    </p>
                  </div>
                  <span className="text-xs text-slate-300 font-mono-tabular shrink-0">
                    3–12 Pemain
                  </span>
                </div>

                <div
                  className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0B1018]/80 backdrop-blur-sm border border-slate-700/70"
                  role="tablist"
                  aria-label="Pratinjau sampul permainan"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={featuredGame === 'kata_kata'}
                    onClick={() => setFeaturedGame('kata_kata')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      featuredGame === 'kata_kata'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Kata-Kata Hari Ini
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={featuredGame === 'spyfall'}
                    onClick={() => setFeaturedGame('spyfall')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      featuredGame === 'spyfall'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Yang Bener Yang Mana
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Game Catalog Section */}
        <section id="katalog" className="space-y-5 pt-4 border-t border-slate-800/80">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Katalog Permainan Yuk Main
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Pilih permainan untuk membuat ruang baru, lalu bagikan kode 6 huruf ke temanmu.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PARTY_GAMES.map((game) => {
              const isKataKata = game.id === 'kata_kata';
              const isCreatingThis = busyAction === `create:${game.id}`;
              const coverSrc = isKataKata ? kataCover : spyfallCover;
              const emblemSrc = isKataKata ? kataEmblem : spyEmblem;

              return (
                <article
                  key={game.id}
                  className="bg-[#131A24] border border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* 16:9 Game Cover Banner */}
                    <div className="relative aspect-video w-full bg-gradient-to-br from-[#131A24] to-[#0B1018] border-b border-slate-800/80 overflow-hidden">
                      <Image
                        src={coverSrc}
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
                            src={emblemSrc}
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
                      className={`flex-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                        isKataKata
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
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

      <footer className="border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500">
        Yuk Main — Hub Permainan Pesta Indonesia
      </footer>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />

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
