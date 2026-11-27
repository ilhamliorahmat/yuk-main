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
      'Kapan saja, pemain bisa menuduh tersangka. Jika mayoritas (50% + 1) pemilih aktif setuju, tersangka langsung diperiksa.',
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
      'Pemain yang masih bertahan dapat menuduh tersangka melalui voting mayoritas (50% + 1 Setuju/Tolak). Pemain tereliminasi statusnya langsung terbuka (Warga/Penyusup) dan menjadi penonton.',
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
  {
    id: 'malam_siluman',
    number: 6,
    title: 'Malam Siluman',
    subtitle: 'Werewolf Desa & Peran Rahasia',
    description:
      'Desa mendadak diteror Siluman di balik malam! Gunakan peran spesial seperti Penerawang, Tabib, Pemburu, hingga peran liar Siluman Bayangan & Tumbal—atau main klasik murni Siluman vs Warga.',
    minPlayers: 4,
    maxPlayers: 12,
    durationLabel: '8–15 Menit · Tanpa Moderator',
    available: true,
    rulesSummary: [
      'Minimal 4 pemain berkumpul di satu ruang. Siluman & Warga selalu aktif, sementara 6 peran opsional (Penerawang, Tabib, Pemburu, Pak RT, Siluman Bayangan, Tumbal) bisa dihidupkan atau dimatikan Host.',
      'Setiap fase Malam, SEMUA pemain hidup tetap menekan tombol aksi (Warga & peran pasif mengirim "Ronda Malam") agar tidak ada yang ketahuan dari bunyi ketukan layar.',
      'Siluman memangsa 1 warga per malam. Penerawang meneropong aura 1 orang, dan Tabib melindungi 1 orang (tidak boleh orang yang sama 2 malam berturut-turut).',
      'Saat Fajar & Siang, desa berdiskusi lalu melakukan voting eksekusi rahasia. Suara Pak RT bernilai 2x, sedangkan Pemburu yang gugur langsung melepaskan Tembakan Terakhir.',
      'Warga menang jika semua Siluman gugur; Siluman menang jika jumlahnya menyamai atau melebihi non-Siluman; Tumbal (jika aktif) menang SOLO (+4 poin) bila berhasil memancing desa mengeksekusinya di siang hari!',
    ],
  },
  {
    id: 'ular_tangga',
    number: 7,
    title: 'Ular Tangga RP',
    subtitle: 'Papan Petualangan RPG, Kelas Hero & Paket Skenario',
    description:
      'Ular Tangga klasik disulap jadi petualangan RPG meja! Pilih kelas Hero, kumpulkan Koin & item rahasia, hadapi monster, dan pilih Paket Skenario lengkap dengan tema seni & peta unik menuju Petak 100.',
    minPlayers: 2,
    maxPlayers: 12,
    durationLabel: '10–15 Menit · Tanpa Timer',
    available: true,
    rulesSummary: [
      'Minimal 2 pemain memilih Paket Skenario (tema visual, peta ular/tangga & monster unik) serta Kelas Hero masing-masing (Ksatria, Pencuri, Penyihir, atau Tabib).',
      'Sebelum melempar dadu di giliranmu, kamu bisa mengaktifkan 1 Skill Kelas (jika cooldown habis) dan/atau 1 Item Rahasia dari tasmu untuk menyembuhkan diri atau mensabotase lawan.',
      'Tangga menyembuhkan HP saat naik, Sarang Ular menggigit HP saat turun (kecuali dilindungi Jimat/Perisai Anti-Ular), Peti Harta memberi Koin + Item Rahasia, dan Kedai menjual perlengkapan RPG.',
      'Mendarat di Petak Monster memicu duel 1-ketuk (Dadu + Bonus Kelas vs Kekuatan Monster). Menang mendapat Koin + langkah maju bonus; kalah mengurangi HP.',
      'Jika HP habis (0), Hero tidak tereliminasi—ia hanya Pingsan (-8 petak, kehilangan setengah Koin, lalu bangkit dengan HP penuh di giliran berikutnya). Hero pertama yang menyentuh Petak 100 menang!',
    ],
    behindTheGame: {
      title: 'Di Balik Ular Tangga RP',
      lead: 'Ular Tangga tradisional sering terasa pasif karena 100% bergantung pada lemparan dadu. "RP" di sini berarti Roleplay Petualangan—mengubah balapan angka 1–100 menjadi kisah meja yang penuh negosiasi, gertakan, dan kejutan.',
      points: [
        'Identitas & Pilihan Taktis: Alih-alih sekadar bidak polos, setiap pemain membawa peran (Tank Ksatria, Pencuri licin, Penyihir sabotase, atau Tabib penyembuh) dan tas item rahasia.',
        'Bundel Skenario & Tema Seni: Setiap paket mengganti suasana visual papan, jenis tangga/ular, tata letak petak, hingga monster khas—dari Menara Nusantara, Distrik Neon 2099, sampai Pasar Malam Mistis.',
        'Tetap Ramah Tongkrongan: Tidak ada pemain yang dikeluarkan lebih awal (0 HP hanya Pingsan sementara) sehingga semua teman tetap tertawa bersama hingga garis finis.',
      ],
    },
  },
  {
    id: 'cuma_bercanda',
    number: 8,
    title: 'Cuma Bercanda',
    subtitle: 'Komik 3-Panel & Upvote Tanpa Batas',
    description:
      'Sistem melempar 2 panel komik pembuka yang absurd—giliranmu menutup panel ke-3 dari 7 kartu rahasia di tangan! Semua komik tampil anonim untuk di-upvote tongkrongan.',
    minPlayers: 2,
    maxPlayers: 12,
    durationLabel: '5–8 Menit · Tanpa Timer',
    available: true,
    rulesSummary: [
      'Minimal 2 pemain berkumpul di satu ruang. Setiap ronde, sistem membuka Panel 1 dan Panel 2 komik secara publik di semua layar.',
      'Setiap pemain memegang 7 kartu panel komik rahasia di tangan dan diam-diam memilih 1 kartu untuk menjadi Panel 3 (penutup/punchline) versinya masing-masing.',
      'Semua komik 3-panel yang terkumpul ditampilkan secara acak dan ANONIM—penulis tiap komik disembunyikan selama fase voting.',
      'Setiap pemain hanya bisa memberi maksimal 1 upvote per ronde: Upvote Biasa (+1 poin), Lewati (0 poin), atau Golden Upvote (+3 poin, HANYA 1 kali per seluruh sesi game!). Dilarang meng-upvote komik sendiri.',
      'Tidak ada batas maksimal poin: pemain dapat mengumpulkan poin upvote sebanyak mungkin sepanjang permainan!',
    ],
  },
  {
    id: 'meja_pembohong',
    number: 9,
    title: 'Meja Pembohong',
    subtitle: 'Gertak Kartu Tertutup & Silinder 1/6',
    description:
      'Setiap ronde menentukan Meja Raja, Ratu, atau As. Taruh 1–3 kartu tertutup dengan muka poker, atau teriak "BOHONG!" sebelum giliranmu—yang kalah menarik pelatuk silinder 1/6!',
    minPlayers: 2,
    maxPlayers: 12,
    durationLabel: '5–8 Menit · Tanpa Timer',
    available: true,
    rulesSummary: [
      'Minimal 2 pemain berkumpul di satu ruang. Setiap sub-ronde, sistem memilih acak Meja Raja, Meja Ratu, atau Meja As dan membagikan 5 kartu rahasia ke masing-masing pemain.',
      'Dek berisi kartu Raja, Ratu, As, serta kartu Joker (Kartu Bebas) yang selalu sah dianggap cocok untuk jenis meja apa pun.',
      'Pada giliranmu, pilih salah satu aksi: taruh 1–3 kartu tertutup sambil mengklaim semuanya cocok dengan Meja, ATAU teriak "BOHONG!" untuk membongkar klaim pemain tepat sebelummu.',
      'Jika ternyata ada kartu meleset (bukan pangkat Meja dan bukan Joker), sang penaruh kartu kalah. Jika semua kartunya jujur, sang penuduh yang kalah!',
      'Di mode Silinder 1/6, yang kalah menarik pelatuk revolver (peluang kena peluru rahasia makin naik hingga 100%). Pemenang terakhir meraih bonus poin!',
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
