import type { GameType, PartyGameDefinition } from './types';

export const PARTY_GAMES: PartyGameDefinition[] = [
  {
    id: 'spyfall',
    number: 1,
    title: 'Spyfall Indonesia',
    subtitle: 'Deduksi Sosial & Penyamaran',
    description:
      'Semua pemain mendapat lokasi dan peran rahasia—kecuali sang Mata-Mata. Ajukan pertanyaan cerdas untuk membongkar penyamar sebelum waktu habis!',
    minPlayers: 3,
    maxPlayers: 12,
    durationLabel: '6–8 Menit',
    available: true,
    rulesSummary: [
      'Minimal 3 pemain berkumpul di satu ruang menggunakan kode undangan 6 huruf.',
      'Setiap Warga menerima nama lokasi yang sama serta peran unik. Mata-Mata hanya tahu dirinya adalah Mata-Mata.',
      'Bergantian ajukan 1 pertanyaan singkat kepada pemain lain tentang lokasi tanpa membocorkan lokasi secara langsung.',
      'Kapan saja, pemain bisa menuduh tersangka. Jika semua pemain lain setuju, tersangka diperiksa.',
      'Mata-Mata menang jika berhasil menebak lokasi dengan benar, waktu habis, atau Warga salah menuduh orang tidak bersalah.',
    ],
  },
];

export function getPartyGame(gameType: GameType): PartyGameDefinition {
  const found = PARTY_GAMES.find((g) => g.id === gameType);
  if (!found) {
    return PARTY_GAMES[0];
  }
  return found;
}
