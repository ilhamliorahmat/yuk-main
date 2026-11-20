import type { DrawingPromptItem } from '../types';

export interface DrawingPromptPackMeta {
  id: string;
  label: string;
  description: string;
}

export const DRAWING_PROMPT_PACKS: DrawingPromptPackMeta[] = [
  {
    id: 'kuliner',
    label: 'Kuliner Nusantara',
    description: 'Makanan & jajanan khas Indonesia yang seru dan menantang digambar.',
  },
  {
    id: 'tongkrongan',
    label: 'Tongkrongan & Kota',
    description: 'Pemandangan jalanan, warung, dan ikonik kota di Indonesia.',
  },
  {
    id: 'hewan_alam',
    label: 'Hewan & Alam',
    description: 'Satwa unik, tumbuhan, dan fenomena alam dengan bentuk khas.',
  },
  {
    id: 'aktivitas',
    label: 'Profesi & Aksi',
    description: 'Karakter pekerjaan dan pose lucu yang rawan bikin salah tebak.',
  },
  {
    id: 'benda',
    label: 'Benda Sehari-Hari',
    description: 'Barang rumah tangga & gadget yang dekat dengan keseharian.',
  },
];

export const BUILTIN_DRAWING_PROMPTS_ID: DrawingPromptItem[] = [
  // 1. Kuliner Nusantara (Tema: Kuliner)
  { id: 'pg_kul_1', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Sate Ayam' },
  { id: 'pg_kul_2', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Bakso Urat' },
  { id: 'pg_kul_3', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Martabak Manis' },
  { id: 'pg_kul_4', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Nasi Tumpeng' },
  { id: 'pg_kul_5', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Mie Goreng Telor' },
  { id: 'pg_kul_6', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Es Kelapa Muda' },
  { id: 'pg_kul_7', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Pisang Goreng' },
  { id: 'pg_kul_8', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Kerak Telor' },
  { id: 'pg_kul_9', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Klepon' },
  { id: 'pg_kul_10', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Es Cendol' },
  { id: 'pg_kul_11', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Durian Montong' },
  { id: 'pg_kul_12', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Kerupuk Kaleng' },
  { id: 'pg_kul_13', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Kue Cubit' },
  { id: 'pg_kul_14', packId: 'kuliner', packLabel: 'Kuliner Nusantara', category: 'Kuliner', word: 'Cilok Tusuk' },

  // 2. Tongkrongan & Kota (Tema: Jalanan & Kota)
  { id: 'pg_ton_1', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Bajaj' },
  { id: 'pg_ton_2', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Becak' },
  { id: 'pg_ton_3', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Gerobak Bakso' },
  { id: 'pg_ton_4', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Tenda Pecel Lele' },
  { id: 'pg_ton_5', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Pos Ronda' },
  { id: 'pg_ton_6', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Monas' },
  { id: 'pg_ton_7', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Lampu Lalu Lintas' },
  { id: 'pg_ton_8', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Jembatan Layang' },
  { id: 'pg_ton_9', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Layang-Layang' },
  { id: 'pg_ton_10', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Motor Ojol' },
  { id: 'pg_ton_11', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Tiang Listrik' },
  { id: 'pg_ton_12', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Angkot' },
  { id: 'pg_ton_13', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Halte Bus' },
  { id: 'pg_ton_14', packId: 'tongkrongan', packLabel: 'Tongkrongan & Kota', category: 'Jalanan & Kota', word: 'Warung Kopi' },

  // 3. Hewan & Alam (Tema: Hewan & Alam)
  { id: 'pg_hwn_1', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Komodo' },
  { id: 'pg_hwn_2', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Gurita' },
  { id: 'pg_hwn_3', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Jerapah' },
  { id: 'pg_hwn_4', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Gunung Meletus' },
  { id: 'pg_hwn_5', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Kaktus' },
  { id: 'pg_hwn_6', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Kupu-Kupu' },
  { id: 'pg_hwn_7', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Ubur-Ubur' },
  { id: 'pg_hwn_8', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Pohon Kelapa' },
  { id: 'pg_hwn_9', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Gajah' },
  { id: 'pg_hwn_10', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Burung Hantu' },
  { id: 'pg_hwn_11', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Kura-Kura' },
  { id: 'pg_hwn_12', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Hiu' },
  { id: 'pg_hwn_13', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Ombak Pantai' },
  { id: 'pg_hwn_14', packId: 'hewan_alam', packLabel: 'Hewan & Alam', category: 'Hewan & Alam', word: 'Siput' },

  // 4. Profesi & Aksi (Tema: Profesi & Aksi)
  { id: 'pg_akt_1', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Tukang Parkir' },
  { id: 'pg_akt_2', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Barista Kopi' },
  { id: 'pg_akt_3', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Pemadam Kebakaran' },
  { id: 'pg_akt_4', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Pesulap Topi' },
  { id: 'pg_akt_5', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Astronot' },
  { id: 'pg_akt_6', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Kiper Bola' },
  { id: 'pg_akt_7', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Tukang Cukur' },
  { id: 'pg_akt_8', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Mancing Ikan' },
  { id: 'pg_akt_9', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Koki Masak' },
  { id: 'pg_akt_10', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Penyelam Laut' },
  { id: 'pg_akt_11', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Main Gitar' },
  { id: 'pg_akt_12', packId: 'aktivitas', packLabel: 'Profesi & Aksi', category: 'Profesi & Aksi', word: 'Ngepel Lantai' },

  // 5. Benda Sehari-Hari (Tema: Benda Harian)
  { id: 'pg_bnd_1', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Kipas Angin' },
  { id: 'pg_bnd_2', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Rice Cooker' },
  { id: 'pg_bnd_3', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Sandal Jepit' },
  { id: 'pg_bnd_4', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Payung Lipat' },
  { id: 'pg_bnd_5', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Helm' },
  { id: 'pg_bnd_6', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Jam Weker' },
  { id: 'pg_bnd_7', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Raket Nyamuk' },
  { id: 'pg_bnd_8', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Dispenser Galon' },
  { id: 'pg_bnd_9', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Gitar Akustik' },
  { id: 'pg_bnd_10', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Sapu Lidi' },
  { id: 'pg_bnd_11', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Earphone Kabel' },
  { id: 'pg_bnd_12', packId: 'benda', packLabel: 'Benda Sehari-Hari', category: 'Benda Harian', word: 'Kompor Gas' },
];

export const PELUKIS_QUICK_PROMPTS_ID: string[] = [
  'Garis barusan mencurigakan banget nih...',
  'Kok gambarnya malah nyambung ke situ?!',
  'Oke, garis ini ngebantu banget!',
  'Waduh, ada yang asal tarik garis nih!',
  'Siapa yang kelihatan bingung pas gilirannya?',
  'Coba jelasin maksud goresanmu tadi!',
];

