import type { WerewolfRoleId, WerewolfTeam } from '../types';

export interface WerewolfRoleMetadata {
  id: WerewolfRoleId;
  name: string;
  team: WerewolfTeam;
  teamLabel: string;
  mandatory: boolean;
  toggleKey?: 'seer' | 'doctor' | 'hunter' | 'mayor' | 'stealthWolf' | 'jester';
  /** Base & Standard roles use 'simple'; Siluman Bayangan & Tumbal use 'detailed' */
  explanationTier: 'simple' | 'detailed';
  /** Short 1-line explanation used everywhere */
  summary: string;
  /** Quick night instruction prompt for the player's action box */
  nightActionTitle: string;
  nightActionHint: string;
  /** Extra detailed explanation ONLY for Siluman Bayangan & Tumbal */
  detailedGuide?: {
    tagline: string;
    mechanics: string[];
    winCondition: string;
    tips: string[];
    counterplay: string[];
  };
}

export const MALAM_SILUMAN_ROLES: Record<WerewolfRoleId, WerewolfRoleMetadata> = {
  siluman: {
    id: 'siluman',
    name: 'Siluman',
    team: 'siluman',
    teamLabel: 'Tim Siluman',
    mandatory: true,
    explanationTier: 'simple',
    summary: 'Memangsa 1 warga setiap malam dan berbaur saat diskusi siang hari.',
    nightActionTitle: 'Pilih Mangsa Malam Ini',
    nightActionHint:
      'Pilih 1 pemain di luar kawanan Siluman. Jika ada 2+ Siluman, target suara terbanyak yang diserang.',
  },
  warga: {
    id: 'warga',
    name: 'Warga',
    team: 'warga',
    teamLabel: 'Tim Warga',
    mandatory: true,
    explanationTier: 'simple',
    summary: 'Tidak punya kekuatan malam; gunakan insting & diskusi siang untuk mengungkap Siluman.',
    nightActionTitle: 'Ronda Malam (Tutup Mata)',
    nightActionHint:
      'Kirim aksi ronda malam agar semua pemain sama-sama mengetuk layar dan peran spesialmu aman.',
  },
  penerawang: {
    id: 'penerawang',
    name: 'Penerawang',
    team: 'warga',
    teamLabel: 'Tim Warga',
    mandatory: false,
    toggleKey: 'seer',
    explanationTier: 'simple',
    summary: 'Setiap malam dapat meneropong 1 pemain untuk melihat auranya (Warga atau Siluman).',
    nightActionTitle: 'Teropong Aura Pemain',
    nightActionHint:
      'Pilih 1 pemain hidup untuk diteropong malam ini. Hasil aura langsung muncul di catatan pribadimu saat Fajar.',
  },
  tabib: {
    id: 'tabib',
    name: 'Tabib',
    team: 'warga',
    teamLabel: 'Tim Warga',
    mandatory: false,
    toggleKey: 'doctor',
    explanationTier: 'simple',
    summary: 'Setiap malam melindungi 1 pemain dari serangan Siluman (tidak bisa 2 malam beruntun ke orang sama).',
    nightActionTitle: 'Lindungi Pemain Malam Ini',
    nightActionHint:
      'Pilih 1 pemain hidup (termasuk dirimu sendiri) untuk dijaga. Tidak bisa memilih orang yang sama dua malam berturut-turut.',
  },
  pemburu: {
    id: 'pemburu',
    name: 'Pemburu',
    team: 'warga',
    teamLabel: 'Tim Warga',
    mandatory: false,
    toggleKey: 'hunter',
    explanationTier: 'simple',
    summary: 'Jika gugur (malam atau siang), langsung melepaskan 1 Tembakan Terakhir untuk membawa 1 tersangka.',
    nightActionTitle: 'Ronda Malam (Siaga Senapan)',
    nightActionHint:
      'Kirim aksi ronda malam untuk menyamarkan peran. Senapanmu otomatis aktif jika kamu gugur!',
  },
  pak_rt: {
    id: 'pak_rt',
    name: 'Pak RT',
    team: 'warga',
    teamLabel: 'Tim Warga',
    mandatory: false,
    toggleKey: 'mayor',
    explanationTier: 'simple',
    summary: 'Suara voting eksekusimu di siang hari dihitung 2x lipat dibanding warga biasa.',
    nightActionTitle: 'Ronda Malam (Pantau Desa)',
    nightActionHint:
      'Kirim aksi ronda malam agar peranmu tidak terbaca. Kekuatan 2x suaramu aktif saat voting siang.',
  },
  siluman_bayangan: {
    id: 'siluman_bayangan',
    name: 'Siluman Bayangan',
    team: 'siluman',
    teamLabel: 'Tim Siluman',
    mandatory: false,
    toggleKey: 'stealthWolf',
    explanationTier: 'detailed',
    summary:
      'Siluman penyamar ulung yang tetap terbaca "Aura Warga" saat diteropong Penerawang.',
    nightActionTitle: 'Pilih Mangsa Bersama Kawanan',
    nightActionHint:
      'Kamu berburu bersama Siluman lain, namun Penerawang akan selalu melihatmu sebagai Aura Warga!',
    detailedGuide: {
      tagline: 'Siluman Penyamar Kebal Teropong Penerawang',
      mechanics: [
        'Menggantikan 1 kursi Siluman biasa jika jumlah Siluman dalam ruangan minimal 2 orang (otomatis 6+ pemain atau diatur Host ke 2–3 Siluman).',
        'Setiap Malam, kamu tetap ikut memilih mangsa bersama kawanan Siluman dan mengenal identitas rekan Silumanmu.',
        'KEBAL TEROPONG: Jika Penerawang meneropongmu di malam hari, hasil yang muncul di HP Penerawang tetap "Aura Warga"—sama persis seperti warga tidak bersalah!',
      ],
      winCondition:
        'Menang bersama Tim Siluman ketika jumlah Siluman yang masih hidup sama atau lebih banyak daripada total pemain non-Siluman yang masih hidup.',
      tips: [
        'Beranilah memancing Penerawang agar meneropongmu lebih awal! Begitu Penerawang mengumumkan kamu "bersih", gunakan kepercayaan itu untuk mengarahkan tuduhan ke Warga asli atau Pemburu.',
        'Jangan ikut membela rekan Siluman yang sudah terpojok habis-habisan—korbankan rekanmu jika perlu agar alibimu tetap tak tersentuh sampai akhir.',
      ],
      counterplay: [
        'Warga & Penerawang tidak boleh 100% pasrah pada hasil "Aura Warga" jika Siluman Bayangan aktif.',
        'Perhatikan pola suara voting siang, siapa yang sering menyelamatkan tersangka, dan inkonsistensi argumen saat jumlah pemain tinggal sedikit.',
      ],
    },
  },
  tumbal: {
    id: 'tumbal',
    name: 'Tumbal',
    team: 'netral',
    teamLabel: 'Pihak Netral (Solo)',
    mandatory: false,
    toggleKey: 'jester',
    explanationTier: 'detailed',
    summary:
      'Pihak netral solo: langsung MENANG SENDIRIAN (+4 poin) jika dieksekusi oleh voting warga di siang hari!',
    nightActionTitle: 'Ronda Malam (Menebar Curiga)',
    nightActionHint:
      'Kirim aksi ronda malam agar tetap aman dari mangsa Siluman—targetmu adalah dieksekusi saat voting siang!',
    detailedGuide: {
      tagline: 'Si Gila Pancingan — Menang Solo Jika Digantung Desa',
      mechanics: [
        'Berdiri di faksi Netral sendirian: bukan bagian dari Tim Warga maupun Tim Siluman.',
        'KEMENANGAN SEKETIKA: Jika kamu mendapat suara terbanyak dan dieksekusi pada Voting Siang, ronde LANGSUNG BERAKHIR dan hanya kamu yang dinyatakan MENANG (+4 poin)!',
        'BATAS MALAM: Jika kamu mati dimangsa Siluman di malam hari (atau terkena Tembakan Terakhir Pemburu), kamu hanya gugur seperti biasa dan TIDAK mendapat kemenangan.',
      ],
      winCondition:
        'Menang solo (+4 poin) secara instan tepat saat desa memutuskan mengeksekusi dirimu lewat Voting Siang.',
      tips: [
        'Jangan bersikap terlalu konyol sejak detik pertama karena warga akan langsung sadar kamu Tumbal dan mengabaikanmu.',
        'Cara paling ampuh: berpura-puralah seperti Siluman yang gugup, salah menyebut alibi tipis-tipis, atau klaim peran palsu yang sedikit bertabrakan agar desa yakin kamu penyusup.',
      ],
      counterplay: [
        'Jika seseorang terlalu bersemangat ingin di-voting keluar atau sengaja memancing amarah desa tanpa alasan jelas, tahan diri—pilih "Lewati Eksekusi" atau uji dengan Penerawang.',
        'Tim Siluman juga harus berhati-hati: membiarkan Tumbal dieksekusi siang hari otomatis menggagalkan kemenangan Siluman!',
      ],
    },
  },
};

export const MALAM_SILUMAN_OPTIONAL_ORDER: Array<{
  roleId: WerewolfRoleId;
  toggleKey: 'seer' | 'doctor' | 'hunter' | 'mayor' | 'stealthWolf' | 'jester';
}> = [
  { roleId: 'penerawang', toggleKey: 'seer' },
  { roleId: 'tabib', toggleKey: 'doctor' },
  { roleId: 'pemburu', toggleKey: 'hunter' },
  { roleId: 'pak_rt', toggleKey: 'mayor' },
  { roleId: 'siluman_bayangan', toggleKey: 'stealthWolf' },
  { roleId: 'tumbal', toggleKey: 'jester' },
];

export const MALAM_SILUMAN_QUICK_PROMPTS_ID: string[] = [
  'Semalam gerak-geriknya mencurigakan banget sih...',
  'Aku bersih ya, jangan asal tuduh tanpa bukti!',
  'Siapa nih yang paling diam dari tadi pagi?',
  'Hati-hati kalau ada Tumbal, jangan asal eksekusi!',
  'Mending kita lewati voting dulu atau gas?',
  'Kok alibi kamu barusan agak berubah?',
];
