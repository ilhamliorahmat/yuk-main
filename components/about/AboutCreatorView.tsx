'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowUpRight, Github, Globe, ShieldCheck } from 'lucide-react';
import faktaCover from '@/src/assets/images/yukmain_fakta_cover_1795115894333.jpg';
import frekuensiCover from '@/src/assets/images/yukmain_frekuensi_cover_1795115894652.jpg';
import kataCover from '@/src/assets/images/yukmain_kata_cover_1795098826342.jpg';
import pelukisCover from '@/src/assets/images/yukmain_pelukis_cover_1795178136981.jpg';
import silumanCover from '@/src/assets/images/yukmain_siluman_cover_1795180059853.jpg';
import spyfallCover from '@/src/assets/images/yukmain_spyfall_cover_1795001423851.jpg';
import { PARTY_GAMES } from '@/lib/games/registry';

const CREATOR_GITHUB_URL = 'https://github.com/ilhamliorahmat/';
const CREATOR_WEBSITE_URL = 'https://liorahmat.xo.je';
const LICENSE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0';

const GAME_SHOWCASE = [
  { id: 'spyfall', title: 'Yang Bener Yang Mana', cover: spyfallCover },
  { id: 'kata_kata', title: 'Kata-Kata Hari Ini', cover: kataCover },
  { id: 'satu_frekuensi', title: 'Satu Frekuensi', cover: frekuensiCover },
  { id: 'fakta_hari_ini', title: 'Fakta Hari Ini', cover: faktaCover },
  { id: 'pelukis_gadungan', title: 'Pelukis Gadungan', cover: pelukisCover },
  { id: 'malam_siluman', title: 'Malam Siluman', cover: silumanCover },
];

const DESIGN_PRINCIPLES = [
  {
    number: '01.',
    title: 'Tongkrongan Pertama, Layar Kedua',
    description:
      'Setiap game dirancang agar percakapan tatap muka tetap jadi fokus utama—HP cukup dipakai untuk mengintip kartu rahasia, mengirim suara, atau menggambar garis giliran.',
  },
  {
    number: '02.',
    title: 'Jalan Terus Meski Sinyal Hilang',
    description:
      'Selain mode Online dengan 6 huruf kode ruang, Yuk Main menyediakan Mode LAN Party peer-to-peer lewat Wi-Fi/Hotspot tanpa kuota internet, ditambah mode Layar Panggung untuk TV serta Numpang untuk HP berbagi.',
  },
  {
    number: '03.',
    title: 'Satu Kode Ruang untuk Semalaman',
    description:
      'Host bisa berpindah antar 6 permainan di ruang yang sama tanpa mengusir pemain atau membuat kode baru, lalu menutup malam dengan Rekap Permainan dan Duel Suit Best-of-3.',
  },
];

export function AboutCreatorView() {
  return (
    <div className="min-h-screen bg-[#0B1018] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#0B1018]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <Link
            href="/"
            className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Yuk Main
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a
              href="#kreator"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Kreator
            </a>
            <a
              href="#prinsip"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Prinsip Desain
            </a>
            <a
              href="#lisensi"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Lisensi
            </a>
            <Link
              href="/"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Katalog Game
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-xs sm:text-sm font-semibold text-slate-950 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Main Sekarang</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-16">
        {/* Split Hero */}
        <section id="kreator" className="scroll-mt-24 space-y-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-7 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                <p className="text-xs sm:text-sm font-medium text-amber-300/90 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>Ilham Liorahmat</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>Kreator Yuk Main</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>100% Source Available*</span>
                </p>

                <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12] text-balance">
                  Membangun permainan tongkrongan yang langsung hidup di browser.
                </h1>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  Halo, saya <strong className="text-white font-semibold">Ilham Liorahmat</strong>{' '}
                  (<span className="text-amber-300 font-medium">Liorahmat</span>).{' '}
                  <strong className="text-white font-semibold">Yuk Main</strong> lahir dari
                  kebutuhan sederhana saat kumpul bareng teman: ingin langsung main game sosial
                  berbahasa Indonesia tanpa perlu semua orang mengunduh aplikasi, bikin akun rumit,
                  atau menunjuk satu orang jadi moderator yang tidak ikut bermain.
                </p>

                <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                  Dari ruang kos, kafe, sampai vila dengan sinyal pas-pasan, seluruh permainan di
                  sini dibuat ringan di browser—baik lewat ruang Online maupun Mode LAN Party
                  berbasis Wi-Fi/Hotspot lokal.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={CREATOR_GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400/60 text-sm font-medium text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Github className="w-4 h-4 text-slate-200" />
                  <span>GitHub</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </a>

                <a
                  href={CREATOR_WEBSITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400/60 text-sm font-medium text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Globe className="w-4 h-4 text-slate-200" />
                  <span>liorahmat.xo.je</span>
                  <ArrowUpRight className="w-4 h-4 text-slate-400" />
                </a>

                <Link
                  href="/"
                  className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <span>Buka Katalog Game</span>
                </Link>
              </div>
            </motion.div>

            {/* Right Visual Showcase: 6 Real Game Artworks */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-5 bg-[#131A24] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="grid grid-cols-2 gap-2.5 flex-1">
                {GAME_SHOWCASE.map((item) => (
                  <div
                    key={item.id}
                    className="relative aspect-video rounded-xl overflow-hidden bg-[#0B1018] border border-slate-800/80"
                  >
                    <Image
                      src={item.cover}
                      alt={item.title}
                      fill
                      referrerPolicy="no-referrer"
                      sizes="(max-width: 1024px) 50vw, 240px"
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B1018]/90 via-[#0B1018]/20 to-transparent" />
                    <span className="absolute bottom-2 left-2.5 right-2.5 text-[11px] font-medium text-slate-100 truncate">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 flex items-center justify-between gap-2 pt-1">
                <span>Karya Ilham Liorahmat</span>
                <span className="font-mono-tabular text-slate-300">
                  {PARTY_GAMES.length} Game Aktif
                </span>
              </p>
            </motion.div>
          </div>

          {/* Full-width Key Metrics Row Below Hero Split */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-6 border-y border-slate-800/80">
            <div className="space-y-1">
              <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-bold text-white">
                {PARTY_GAMES.length}
              </p>
              <p className="text-xs text-slate-400">Permainan Pesta Indonesia</p>
            </div>
            <div className="space-y-1">
              <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-bold text-white">
                2 Mode
              </p>
              <p className="text-xs text-slate-400">Online &amp; LAN Tanpa Internet</p>
            </div>
            <div className="space-y-1">
              <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-bold text-white">
                283+
              </p>
              <p className="text-xs text-slate-400">Lokasi, Kata, Spektrum &amp; Fakta</p>
            </div>
            <div className="space-y-1">
              <p className="font-display font-mono-tabular text-2xl sm:text-3xl font-bold text-white">
                0 MB
              </p>
              <p className="text-xs text-slate-400">Tanpa Instal Aplikasi Tambahan</p>
            </div>
          </div>
        </section>

        {/* Design Principles */}
        <section id="prinsip" className="scroll-mt-24 space-y-6">
          <div className="space-y-2 max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Prinsip di Balik Yuk Main
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Tiga pegangan utama saat merancang pengalaman bermain untuk tongkrongan Indonesia.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {DESIGN_PRINCIPLES.map((item) => (
              <article
                key={item.number}
                className="bg-[#131A24] border border-slate-800 rounded-2xl p-6 space-y-3"
              >
                <h3 className="font-display text-lg font-bold text-white">
                  <span className="font-mono-tabular text-amber-300 mr-2">{item.number}</span>
                  {item.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Source Available & License Explanation */}
        <section
          id="lisensi"
          className="scroll-mt-24 pt-10 border-t border-slate-800/80 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>PolyForm Noncommercial License 1.0.0</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Kenapa &ldquo;100% Source Available*&rdquo;?
              </h2>
            </div>

            <a
              href={LICENSE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400/60 text-xs sm:text-sm font-medium text-slate-200 hover:text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors self-start sm:self-auto"
            >
              <span>Baca Teks Lisensi Resmi</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#131A24] border border-slate-800 rounded-2xl p-6 space-y-3">
              <h3 className="text-base font-bold text-white">
                Terbuka &amp; Gratis untuk Pemakaian Non-Komersial
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Seluruh kode sumber Yuk Main dipublikasikan secara terbuka. Siapa pun bebas
                membaca, mempelajari arsitekturnya, membuat fork, memodifikasi, hingga melakukan
                self-hosting untuk keperluan pribadi, edukasi, riset, maupun nongkrong bersama
                komunitas tanpa biaya apa pun.
              </p>
            </div>

            <div className="bg-[#131A24] border border-slate-800 rounded-2xl p-6 space-y-3">
              <h3 className="text-base font-bold text-white">
                Bukan Open-Source Komersial Tanpa Batas
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Berbeda dengan lisensi MIT/Apache, lisensi{' '}
                <strong className="text-white font-medium">PolyForm Noncommercial 1.0.0</strong>{' '}
                tidak mengizinkan pihak lain memonetisasi, menjual ulang, memasang iklan, atau
                menghadirkan layanan komersial berbayar dari kode sumber Yuk Main tanpa izin
                tertulis dari <strong className="text-white font-medium">Ilham Liorahmat</strong>.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-400">
          <span>
            Yuk Main · Copyright &copy; 2026 Ilham Liorahmat (100% Source Available — PolyForm
            Noncommercial 1.0.0)
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href="/"
              className="text-amber-300 hover:text-amber-200 font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Beranda
            </Link>
            <a
              href={CREATOR_GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              GitHub
            </a>
            <a
              href={CREATOR_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              liorahmat.xo.je
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
