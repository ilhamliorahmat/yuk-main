import type { GameType, PartyGameDefinition } from './types';

export const PARTY_GAMES: PartyGameDefinition[] = [
  {
    id: 'spyfall',
    number: 1,
    title: 'Yang Bener Yang Mana',
    subtitle: 'Deduksi Lokasi & Peran',
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
  {
    id: 'kata_kata',
    number: 2,
    title: 'Kata-Kata Hari Ini',
    subtitle: 'Penyusup Kata Buta & Multi-Spy',
    description:
      'Semua pemain mendapat satu kata rahasia—tetapi kata milik Penyusup sedikit berbeda! Bahkan Penyusup sendiri tidak tahu bahwa dirinya adalah Penyusup.',
    minPlayers: 3,
    maxPlayers: 12,
    durationLabel: '5–8 Menit',
    available: true,
    rulesSummary: [
      'Minimal 3 pemain berkumpul di satu ruang. Host dapat memilih mode 1 Penyusup, 2 Penyusup (≥5 pemain), atau Acak.',
      'Setiap pemain melihat 1 kata rahasia di kartunya tanpa label peran—Warga menerima Kata Warga, sedangkan Penyusup menerima kata lain yang mirip.',
      'Bergantian beri 1 petunjuk singkat yang menggambarkan katamu tanpa menyebut kata tersebut secara langsung.',
      'Pemain yang masih bertahan dapat menuduh tersangka melalui voting Setuju/Tolak. Pemain tereliminasi statusnya langsung terbuka (Warga/Penyusup) dan menjadi penonton.',
      'Jika Penyusup terakhir tertangkap, ia mendapat 1 Kesempatan Terakhir menebak Kata Warga untuk membalikkan kemenangan! Penyusup juga menang jika jumlahnya menyamai Warga atau waktu habis.',
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
