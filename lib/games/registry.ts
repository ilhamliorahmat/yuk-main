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
  {
    id: 'satu_frekuensi',
    number: 3,
    title: 'Satu Frekuensi',
    subtitle: 'Telepati Spektrum & Santai Tanpa Timer',
    description:
      'Satu Penerawang memberi petunjuk untuk menuntun teman-teman memutar jarum ke titik rahasia di antara dua kutub ekstrem. Santai tanpa batas waktu—cocok untuk ngobrol!',
    minPlayers: 2,
    maxPlayers: 12,
    durationLabel: 'Bebas · Kontrol Host',
    available: true,
    rulesSummary: [
      'Minimal 2 pemain berkumpul di satu ruang. Setiap ronde, peran Penerawang bergilir secara berurutan.',
      'Hanya Penerawang yang melihat posisi zona target rahasia (0–100) di spektrum antara dua konsep berlawanan.',
      'Penerawang memberi 1 petunjuk singkat (via kolom petunjuk atau obrolan langsung) tanpa menyebut kata kutub secara mentah.',
      'Semua Penebak bebas berdiskusi tanpa batas waktu sambil memutar dan mengunci jarum masing-masing di dial 180°.',
      'Host menekan tombol "Fase Selanjutnya" kapan pun selesai ngobrol untuk membuka tabir! Tepat Sasaran +4, Hampir Tepat +3, Cukup Dekat +2, plus bonus Penerawang (+1 per Penebak yang masuk zona, maks +4).',
    ],
  },
  {
    id: 'fakta_hari_ini',
    number: 4,
    title: 'Fakta Hari Ini',
    subtitle: 'Adu Fakta Asli vs Tim Bluffer',
    description:
      'Satu Penebak bergilir menghadapi seluruh Tim Bluffer! Satu Bluffer terpilih acak membawakan fakta unik asli, sisanya bebas mengarang di dalam tanda kurung untuk mengecoh Penebak.',
    minPlayers: 3,
    maxPlayers: 12,
    durationLabel: 'Bebas · Kontrol Fase',
    available: true,
    rulesSummary: [
      'Minimal 3 pemain berkumpul di satu ruang. Setiap ronde, 1 pemain dipilih berurutan sebagai Penebak dan diumumkan ke semua pemain.',
      'Setelah kartu pengumuman ditutup, seluruh Tim Bluffer melihat fakta unik dengan bagian di dalam kurung (...) sebagai ruang kreativitas, sekaligus mengetahui siapa 1 rekan yang ditunjuk acak sebagai Pembawa Fakta Asli.',
      'Pembawa Fakta wajib menyampaikan fakta asli di dalam kurung, sementara Bluffer lainnya mengarang versi palsu yang meyakinkan. Semua Bluffer bekerja sebagai satu tim!',
      'Tidak ada batas waktu! Pengendali Fase menekan "Fase Selanjutnya" saat siap menebak. Jika Host menjadi Penebak, salah satu Bluffer ditunjuk acak sebagai Pengendali Fase.',
      'Jika Penebak berhasil menunjuk Pembawa Fakta, Penebak meraih +(N−1) poin. Jika Penebak salah pilih, seluruh Tim Bluffer (termasuk Pembawa Fakta) masing-masing mendapat +1 poin!',
    ],
  },
  {
    id: 'pelukis_gadungan',
    number: 5,
    title: 'Pelukis Gadungan',
    subtitle: 'Gambar 1 Garis & Tebak Peniru',
    description:
      'Semua pemain tahu kata rahasia yang sama—kecuali sang Pelukis Gadungan yang hanya melihat Tema umum! Bergiliran menggambar 1 tarikan garis di kanvas bersama lalu bongkar siapa yang asal meniru!',
    minPlayers: 3,
    maxPlayers: 12,
    durationLabel: '4–6 Menit · Tanpa Timer',
    available: true,
    rulesSummary: [
      'Minimal 3 pemain berkumpul di satu ruang. Host menentukan 1 atau 2 putaran garis per pemain serta mode 1 atau 2 Pelukis Gadungan.',
      'Pelukis Asli melihat Tema umum (mis. "Kuliner Nusantara") beserta Kata Rahasia (mis. "Sate Ayam"). Pelukis Gadungan HANYA melihat Tema umum tanpa tahu Kata Rahasia!',
      'Sesuai urutan giliran, tiap pemain menggambar tepat 1 garis kontinu dengan warna masing-masing di kanvas bersama—jangan terlalu jelas nanti dicontek Gadungan, jangan terlalu abstrak nanti dicurigai!',
      'Setelah semua garis selesai, semua pemain berdiskusi lalu memilih 1 tersangka Pelukis Gadungan secara serentak.',
      'Jika Gadungan lolos dari suara terbanyak, Gadungan menang (+3 poin). Jika Gadungan tertangkap, ia mendapat 1 Kesempatan Terakhir menebak Kata Rahasia untuk membalikkan keadaan!',
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
