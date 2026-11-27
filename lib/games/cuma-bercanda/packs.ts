import type {
  BercandaCard,
  BercandaCardPackId,
  BercandaPanelScene,
  CumaBercandaSettings,
  CustomBercandaCard,
} from '../types';

export interface BercandaPackMeta {
  id: BercandaCardPackId;
  label: string;
  description: string;
}

export const BERCANDA_PACKS: BercandaPackMeta[] = [
  {
    id: 'tongkrongan',
    label: 'Tongkrongan & Warung',
    description: 'Drama patungan kopi, hutang Rp10 ribu, dan janji OTW palsu.',
  },
  {
    id: 'kantor_kampus',
    label: 'Kantor & Kampus',
    description: 'Revisi dadakan, rapat tak berujung, skripsi, dan gaji numpang lewat.',
  },
  {
    id: 'absurd_gelap',
    label: 'Absurd & Plot Twist',
    description: 'Komedi sarkas, kebohongan polos, dan pengakuan mendadak bikin hening.',
  },
];

export const BERCANDA_SCENE_META: Record<
  BercandaPanelScene,
  { label: string; badgeBg: string; accent: string }
> = {
  ngobrol_santai: { label: 'Ngobrol Santai', badgeBg: '#E0F2FE', accent: '#0284C7' },
  kaget_melotot: { label: 'Kaget Melotot', badgeBg: '#FEF3C7', accent: '#D97706' },
  bisik_rahasia: { label: 'Bisik Rahasia', badgeBg: '#EDE9FE', accent: '#7C3AED' },
  tunjuk_marah: { label: 'Tunjuk Emosi', badgeBg: '#FFE4E6', accent: '#E11D48' },
  nangis_lebay: { label: 'Nangis Lebay', badgeBg: '#DBEAFE', accent: '#2563EB' },
  cengar_cengir: { label: 'Cengar-Cengir', badgeBg: '#DCFCE7', accent: '#16A34A' },
  mikir_keras: { label: 'Mikir Keras', badgeBg: '#F1F5F9', accent: '#475569' },
  panik_keringat: { label: 'Panik Dingin', badgeBg: '#FFEDD5', accent: '#EA580C' },
  sombong_kacamata: { label: 'Sombong Pol', badgeBg: '#FAE8FF', accent: '#C026D3' },
  pingsan_tepuk_jidat: { label: 'Tepuk Jidat', badgeBg: '#FEE2E2', accent: '#DC2626' },
  pegang_hp: { label: 'Ngecek HP', badgeBg: '#CCFBF1', accent: '#0D9488' },
  pose_menang: { label: 'Bangga Diri', badgeBg: '#FEF9C3', accent: '#CA8A04' },
};

export const BERCANDA_SCENES_LIST: BercandaPanelScene[] = Object.keys(
  BERCANDA_SCENE_META,
) as BercandaPanelScene[];

export const BUILTIN_BERCANDA_CARDS_ID: BercandaCard[] = [
  // ============================================================================
  // PACK 1: TONGKRONGAN & WARUNG (30 kartu)
  // ============================================================================
  {
    id: 'cb_t1',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pegang_hp',
    speaker: 'Teman',
    caption: 'Gue udah di jalan nih, lima menit lagi nyampe!',
    subtext: 'Padahal baru selesai mandi.',
  },
  {
    id: 'cb_t2',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'cengar_cengir',
    speaker: 'Si Irit',
    caption: 'Eh bayarin dulu ya, saldo gue lagi nyangkut di aplikasi.',
    subtext: 'Klasik akhir bulan.',
  },
  {
    id: 'cb_t3',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'kaget_melotot',
    speaker: 'Kasir',
    caption: 'Total pesanannya empat ratus delapan puluh ribu ya kak.',
  },
  {
    id: 'cb_t4',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'bisik_rahasia',
    speaker: 'Sahabat',
    caption: 'Jangan bilang siapa-siapa, sebenarnya aku yang ngabisin gorengan.',
  },
  {
    id: 'cb_t5',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'tunjuk_marah',
    speaker: 'Ketua Geng',
    caption: 'Yang ngide nongkrong jam sebelas malam kan elu!',
  },
  {
    id: 'cb_t6',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'nangis_lebay',
    speaker: 'Sobat Galau',
    caption: 'Mantan udah nikah, masa gue masih debat soal sambal dipisah?',
  },
  {
    id: 'cb_t7',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'sombong_kacamata',
    speaker: 'Sultan Dadakan',
    caption: 'Tenang, malam ini gue traktir... air putih gelas masing-masing.',
  },
  {
    id: 'cb_t8',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'panik_keringat',
    speaker: 'Tukang Parkir',
    caption: 'Lho, motornya barusan dipindahin mas-mas helm ojol ke sana!',
  },
  {
    id: 'cb_t9',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Bendahara',
    caption: 'Pantes duit kas kurang, struk kembaliannya ikut kegoreng!',
  },
  {
    id: 'cb_t10',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'mikir_keras',
    speaker: 'Filsuf Warkop',
    caption: 'Kalau mie instan rebus dikasih es batu, jatuhnya soto atau es cendol?',
  },
  {
    id: 'cb_t11',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'ngobrol_santai',
    speaker: 'Kang Kopi',
    caption: 'Mau kopi susu gula aren atau kopi pahit kenyataan?',
  },
  {
    id: 'cb_t12',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pose_menang',
    speaker: 'Juara Mabar',
    caption: 'Tuh kan, gue bilang juga tim musuh itu bot semua!',
  },
  {
    id: 'cb_t13',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pegang_hp',
    speaker: 'Grup WA',
    caption: 'Siapa yang tadi bilang "yuk cabut jam 7 teng"? Ini udah jam 9.',
  },
  {
    id: 'cb_t14',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'cengar_cengir',
    speaker: 'Penumpang',
    caption: 'Gue cuma numpang nyicip satu suap, eh mangkoknya udah licin.',
  },
  {
    id: 'cb_t15',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'kaget_melotot',
    speaker: 'Tetangga Meja',
    caption: 'Lah, bukannya tadi kamu izin ke nyokap bilang lagi kerja kelompok?',
  },
  {
    id: 'cb_t16',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'bisik_rahasia',
    speaker: 'Mak Comblang',
    caption: 'Ssst, gebetan lo baru aja masuk kafe bareng orang lain.',
  },
  {
    id: 'cb_t17',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'tunjuk_marah',
    speaker: 'Supir',
    caption: 'Katanya patungan bensin, kok malah nawarin doa keselamatan?',
  },
  {
    id: 'cb_t18',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'nangis_lebay',
    speaker: 'Pemain Baru',
    caption: 'Katanya nongkrong sehat, kok pulangnya jam tiga subuh lagi?!',
  },
  {
    id: 'cb_t19',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'sombong_kacamata',
    speaker: 'Kritikus',
    caption: 'Kafe ini estetik sih, sayang rasa kopinya mirip obat batuk.',
  },
  {
    id: 'cb_t20',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'panik_keringat',
    speaker: 'Peminjam',
    caption: 'Sebentar, password mobile banking gue kepencet blokir tiga kali!',
  },
  {
    id: 'cb_t21',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Koordinator',
    caption: 'Dari dua belas orang yang vote setuju, yang datang cuma bertiga.',
  },
  {
    id: 'cb_t22',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'mikir_keras',
    speaker: 'Pelanggan',
    caption: 'Kenapa wi-fi warkop selalu kencang pas kita lagi nggak butuh?',
  },
  {
    id: 'cb_t23',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'ngobrol_santai',
    speaker: 'Barista',
    caption: 'Mohon maaf kak, menu yang kakak pilih habis semua kecuali teh tawar.',
  },
  {
    id: 'cb_t24',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pose_menang',
    speaker: 'Si Paling Hemat',
    caption: 'Voucher gratis ongkir seribu perak berhasil kuamankan!',
  },
  {
    id: 'cb_t25',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pegang_hp',
    speaker: 'Akun IG',
    caption: 'Gawat! Story close friend barusan keposting ke publik semua orang!',
  },
  {
    id: 'cb_t26',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'cengar_cengir',
    speaker: 'Pemesan',
    caption: 'Gue cuma pesen es teh manis, tapi numpang ngecas tiga HP sekaligus.',
  },
  {
    id: 'cb_t27',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'tunjuk_marah',
    speaker: 'Penjaga Kos',
    caption: 'Gerbang udah digembok jam sepuluh, siapa suruh beli nasi goreng?!',
  },
  {
    id: 'cb_t28',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'panik_keringat',
    speaker: 'Driver',
    caption: 'Waduh, titik jemputnya ternyata nyasar ke pemakaman umum!',
  },
  {
    id: 'cb_t29',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'bisik_rahasia',
    speaker: 'Anak Kos',
    caption: 'Kalau ibu kos nanya, bilang aja gue udah pindah sejak semalam.',
  },
  {
    id: 'cb_t30',
    packId: 'tongkrongan',
    packLabel: 'Tongkrongan & Warung',
    scene: 'pose_menang',
    speaker: 'Pemilik Meja',
    caption: 'Akhirnya kursi colokan di pojok berhasil direbut tanpa pertumpahan darah!',
  },

  // ============================================================================
  // PACK 2: KANTOR & KAMPUS (30 kartu)
  // ============================================================================
  {
    id: 'cb_k1',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'ngobrol_santai',
    speaker: 'Manajer',
    caption: 'Revisi kecil aja kok, cuma ubah seluruh konsep dari awal.',
  },
  {
    id: 'cb_k2',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'panik_keringat',
    speaker: 'Mahasiswa',
    caption: 'Dosen pembimbing baru aja kirim pesan: "Bisa ketemu sekarang?"',
  },
  {
    id: 'cb_k3',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'kaget_melotot',
    speaker: 'Anak Magang',
    caption: 'Loh, bukannya tombol "Delete Production DB" ini buat bersihin cache?',
  },
  {
    id: 'cb_k4',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'nangis_lebay',
    speaker: 'Karyawan',
    caption: 'Tanggal gajian masih lima hari lagi, isi rekening udah sisa Rp4.200.',
  },
  {
    id: 'cb_k5',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'cengar_cengir',
    speaker: 'Rekan Kerja',
    caption: 'Kerjaanmu rapi banget, boleh minta template-nya buat presentasi bos?',
  },
  {
    id: 'cb_k6',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'tunjuk_marah',
    speaker: 'Ketua Kelompok',
    caption: 'Tugas dikumpul sepuluh menit lagi dan kamu baru nanya judulnya apa?!',
  },
  {
    id: 'cb_k7',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'sombong_kacamata',
    speaker: 'Senior',
    caption: 'Jam terbang enggak bisa bohong—walau tidur siang dua jam di musala.',
  },
  {
    id: 'cb_k8',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'bisik_rahasia',
    speaker: 'HRD',
    caption: 'Jangan bilang yang lain, rapat evaluasi jam tiga bakal ada snack kotak.',
  },
  {
    id: 'cb_k9',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Presenter',
    caption: 'Layar udah share screen dua puluh menit dan chat curhat masih kebuka!',
  },
  {
    id: 'cb_k10',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'mikir_keras',
    speaker: 'Peserta Rapat',
    caption: 'Rapat dua jam ini sebenarnya cukup dibalas "Oke siap" di chat.',
  },
  {
    id: 'cb_k11',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pegang_hp',
    speaker: 'Bos',
    caption: 'Maaf ganggu di hari Minggu, cuma mau tanya ide brilian buat Senin pagi.',
  },
  {
    id: 'cb_k12',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pose_menang',
    speaker: 'Pegawai Teladan',
    caption: 'Meeting dibatalkan! Saatnya pura-pura ngetik keras sampai jam lima!',
  },
  {
    id: 'cb_k13',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'ngobrol_santai',
    speaker: 'Klien',
    caption: 'Budget kami tipis, tapi proyek ini bakal bagus banget buat portofolio!',
  },
  {
    id: 'cb_k14',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'kaget_melotot',
    speaker: 'Penjaga Ujian',
    caption: 'Waktu tinggal tiga menit, silakan langsung isi nama di lembar soal!',
  },
  {
    id: 'cb_k15',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'panik_keringat',
    speaker: 'Mahasiswa Akhir',
    caption: 'File Skripsi_Final_Fix_Banget_V9.docx barusan hilang nggak kesave!',
  },
  {
    id: 'cb_k16',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'cengar_cengir',
    speaker: 'Teman Sekelas',
    caption: 'Titip absen dong, gue kejebak macet di atas kasur nih.',
  },
  {
    id: 'cb_k17',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'tunjuk_marah',
    speaker: 'Dosen',
    caption: 'Paragraf ketiga ini persis sama dengan artikel Wikipedia tahun 2014!',
  },
  {
    id: 'cb_k18',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'nangis_lebay',
    speaker: 'Fresh Graduate',
    caption: 'Lowongan entry level tapi wajib pengalaman minimal tujuh tahun!',
  },
  {
    id: 'cb_k19',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'sombong_kacamata',
    speaker: 'Mentor',
    caption: 'Di perusahaan ini kita bukan cuma rekan kerja—kita keluarga besar!',
    subtext: 'Tapi lembur dibayar ucapan terima kasih.',
  },
  {
    id: 'cb_k20',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'bisik_rahasia',
    speaker: 'Staff IT',
    caption: 'Sebenarnya trik terampuh kami cuma matiin router terus nyalain lagi.',
  },
  {
    id: 'cb_k21',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Mikrofon Zoom',
    caption: 'Lupa mute pas lagi ngomongin gaji atasan di depan tiga puluh orang.',
  },
  {
    id: 'cb_k22',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'mikir_keras',
    speaker: 'Desainer',
    caption: 'Klien minta logo dibuat lebih "berani, minimalis, tapi rame dan bersinar".',
  },
  {
    id: 'cb_k23',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pegang_hp',
    speaker: 'Notifikasi Slack',
    caption: 'Bos mengetik pesan panjang pukul 23:47 WIB...',
  },
  {
    id: 'cb_k24',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'pose_menang',
    speaker: 'Pemburu Cuti',
    caption: 'Cuti dua hari diapit tanggal merah langsung berubah jadi liburan sembilan hari!',
  },
  {
    id: 'cb_k25',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'ngobrol_santai',
    speaker: 'Dosen Penguji',
    caption: 'Menarik sekali... sekarang coba jelaskan tanpa baca slide PowerPoint!',
  },
  {
    id: 'cb_k26',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'panik_keringat',
    speaker: 'Akuntan',
    caption: 'Selisih laporan keuangan bulan ini cuma Rp1, tapi bos minta dicari sampai ketemu!',
  },
  {
    id: 'cb_k27',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'tunjuk_marah',
    speaker: 'Pemilik Kulkas Kantor',
    caption: 'Siapa yang nyicip puding mangga gue tinggal wadah kosongnya aja?!',
  },
  {
    id: 'cb_k28',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'cengar_cengir',
    speaker: 'Anak Kos',
    caption: 'Datang seminar kampus cuma demi sertifikat plus nasi kotak dua biji.',
  },
  {
    id: 'cb_k29',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'sombong_kacamata',
    speaker: 'Founder Startup',
    caption: 'Kita lagi pivot ke AI blockchain berbasis empati kemanusiaan!',
  },
  {
    id: 'cb_k30',
    packId: 'kantor_kampus',
    packLabel: 'Kantor & Kampus',
    scene: 'nangis_lebay',
    speaker: 'Mahasiswa',
    caption: 'Udah begadang seminggu bikin makalah, eh kelasnya diganti kuis dadakan.',
  },

  // ============================================================================
  // PACK 3: ABSURD & PLOT TWIST (30 kartu)
  // ============================================================================
  {
    id: 'cb_a1',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'bisik_rahasia',
    speaker: 'Pengakuan',
    caption: 'Sebenarnya sejak SMP aku nggak pernah bisa bedain kanan dan kiri.',
  },
  {
    id: 'cb_a2',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'kaget_melotot',
    speaker: 'Dokter',
    caption: 'Pak, hasil rontgennya bagus, tapi kok di perut bapak ada tutup galon?',
  },
  {
    id: 'cb_a3',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'cengar_cengir',
    speaker: 'Jin Lampu',
    caption: 'Permintaanmu terkabul—tapi seluruh mantanmu sekarang jadi tetanggamu.',
  },
  {
    id: 'cb_a4',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'tunjuk_marah',
    speaker: 'Polisi',
    caption: 'Jadi bapak ngaku ngebut karena kebelet boker?!',
  },
  {
    id: 'cb_a5',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'ngobrol_santai',
    speaker: 'Orang Asing',
    caption: 'Jangan panik, aku dirimu dari masa depan—dan kita masih jomblo.',
  },
  {
    id: 'cb_a6',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'panik_keringat',
    speaker: 'Tamu Undangan',
    caption: 'Baru sadar salah masuk gedung resepsi setelah nambah rendang tiga piring!',
  },
  {
    id: 'cb_a7',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Detektif',
    caption: 'Setelah menyelidiki selama tiga jam, pelakunya ternyata kucing liar.',
  },
  {
    id: 'cb_a8',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'nangis_lebay',
    speaker: 'Hantu Lembur',
    caption: 'Aku niatnya mau nakutin kamu, tapi lihat kerjaanmu kok aku ikut sedih.',
  },
  {
    id: 'cb_a9',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'sombong_kacamata',
    speaker: 'Kakek Sakti',
    caption: 'Uang tidak bisa membeli kebahagiaan... makanya transfer aja ke rekeningku.',
  },
  {
    id: 'cb_a10',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'mikir_keras',
    speaker: 'Alien',
    caption: 'Planet ini penuh makhluk aneh yang memotret makanannya sebelum dimakan.',
  },
  {
    id: 'cb_a11',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pegang_hp',
    speaker: 'Kurir Paket',
    caption: 'Paket COD lima juta rupiah dari akun bernama "Saya Khilaf" udah di depan ya kak.',
  },
  {
    id: 'cb_a12',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pose_menang',
    speaker: 'Orang Tua',
    caption: 'Dapet nilai seratus sih bagus, tapi anak tetangga barusan beli rumah.',
  },
  {
    id: 'cb_a13',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'bisik_rahasia',
    speaker: 'Saksi Mata',
    caption: 'Aku pura-pura tidur di angkot biar nggak ditanyain ongkos dua kali.',
  },
  {
    id: 'cb_a14',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'kaget_melotot',
    speaker: 'Guru TK',
    caption: 'Bapak kok ikut baris di antrean pembagian susu kotak anak-anak?',
  },
  {
    id: 'cb_a15',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'cengar_cengir',
    speaker: 'Teman Polos',
    caption: 'Aku kira "RSVP" itu nama merek bumbu mi instan impor.',
  },
  {
    id: 'cb_a16',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'tunjuk_marah',
    speaker: 'Ibu',
    caption: 'Katanya mau merantau cari jati diri, kok koper kotornya dikirim lewat kargo?',
  },
  {
    id: 'cb_a17',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'ngobrol_santai',
    speaker: 'Peramal',
    caption: 'Garis tanganmu menunjukkan kamu akan segera... minum es teh manis.',
  },
  {
    id: 'cb_a18',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'panik_keringat',
    speaker: 'Pengantin',
    caption: 'Penghulunya udah siap, tapi cincinnya masih di laci meja kantor!',
  },
  {
    id: 'cb_a19',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pingsan_tepuk_jidat',
    speaker: 'Tetangga',
    caption: 'Pantes Wi-Fi rumahku lemot, ternyata satu RT pakai password "12345678".',
  },
  {
    id: 'cb_a20',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'nangis_lebay',
    speaker: 'Dompet',
    caption: 'Tolong hentikan checkout jam dua belas malam, aku sudah lelah.',
  },
  {
    id: 'cb_a21',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'sombong_kacamata',
    speaker: 'Influencer',
    caption: 'Jangan lupa subscribe ya guys, walaupun konten ini nggak ada faedahnya.',
  },
  {
    id: 'cb_a22',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'mikir_keras',
    speaker: 'Pemikir',
    caption: 'Kenapa kita ngomong "permisi" pas lewat depan kucing yang lagi nongkrong?',
  },
  {
    id: 'cb_a23',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pegang_hp',
    speaker: 'Alarm Subuh',
    caption: 'Sudah kuduga tombol "Snooze 5 Menit" bakal kamu pencet delapan belas kali.',
  },
  {
    id: 'cb_a24',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pose_menang',
    speaker: 'Maling Insaf',
    caption: 'Brankasnya kosong mas, malah saya yang jadi transfer Rp50 ribu karena iba.',
  },
  {
    id: 'cb_a25',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'bisik_rahasia',
    speaker: 'Teman Dekat',
    caption: 'Sebenarnya aku nggak ngerti topik obrolan ini sejak setengah jam lalu.',
  },
  {
    id: 'cb_a26',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'kaget_melotot',
    speaker: 'Mertua',
    caption: 'Oh, jadi kamu yang kemarin komentar "ngarang bebas" di grup keluarga?',
  },
  {
    id: 'cb_a27',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'cengar_cengir',
    speaker: 'Pembohong Ulung',
    caption: 'Seriusan sumpah, barusan itu cuma latihan refleks wajah!',
  },
  {
    id: 'cb_a28',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'tunjuk_marah',
    speaker: 'Sahabat Lama',
    caption: 'Jadi selama lima tahun ini kamu kira nama panggilanku itu "Mas Bro"?!',
  },
  {
    id: 'cb_a29',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'panik_keringat',
    speaker: 'Pejalan Kaki',
    caption: 'Aduh, salah melambai balik—ternyata dia lagi dadah ke orang di belakangku!',
  },
  {
    id: 'cb_a30',
    packId: 'absurd_gelap',
    packLabel: 'Absurd & Plot Twist',
    scene: 'pose_menang',
    speaker: 'Pemenang Undian',
    caption: 'Selamat! Hadiah utama Anda adalah... ucapan terima kasih dari panitia!',
  },
];

export const CUMA_BERCANDA_QUICK_PROMPTS_ID: string[] = [
  'Panel ke-2 tadi udah nge-bait banget sumpah!',
  'Siapa nih yang ngelempar punchline paling gelap barusan?',
  'Jangan lupa Golden Upvote (+3) cuma berlaku 1x per sesi lho!',
  'Ayo cepat lempar kartu biar komiknya kebuka semua!',
  'Plot twist panel penutupnya enggak ketebak sama sekali!',
  'Hayo, pasti si itu nih penulis komik paling ngaco ini.',
];

export function defaultCumaBercandaSettings(): CumaBercandaSettings {
  return {
    allowGoldenUpvote: true,
  };
}

export function sanitizeCumaBercandaSettings(
  raw?: Partial<CumaBercandaSettings> | null,
): CumaBercandaSettings {
  return {
    allowGoldenUpvote:
      typeof raw?.allowGoldenUpvote === 'boolean' ? raw.allowGoldenUpvote : true,
  };
}

export function sanitizeCustomBercandaCard(
  raw: Partial<CustomBercandaCard>,
  fallbackIndex = 0,
): CustomBercandaCard | null {
  const caption = (raw.caption ?? '').trim().slice(0, 120);
  if (caption.length < 3) return null;
  const speaker = ((raw.speaker ?? '').trim() || 'Tokoh').slice(0, 28);
  const subtext = (raw.subtext ?? '').trim().slice(0, 60);
  const scene: BercandaPanelScene = BERCANDA_SCENES_LIST.includes(raw.scene as BercandaPanelScene)
    ? (raw.scene as BercandaPanelScene)
    : 'ngobrol_santai';
  const id = (raw.id ?? `cb_custom_${fallbackIndex}_${Date.now()}`).slice(0, 48);

  return {
    id,
    scene,
    speaker,
    caption,
    ...(subtext ? { subtext } : {}),
  };
}

export function mergeBercandaCardPool(
  enabledPacks: string[],
  customCards: CustomBercandaCard[] = [],
): BercandaCard[] {
  const packSet = new Set(
    enabledPacks.length > 0 ? enabledPacks : ['tongkrongan', 'kantor_kampus'],
  );
  const builtIn = BUILTIN_BERCANDA_CARDS_ID.filter((card) => packSet.has(card.packId));
  const custom: BercandaCard[] = customCards
    .map((c, idx) => sanitizeCustomBercandaCard(c, idx))
    .filter((c): c is CustomBercandaCard => Boolean(c))
    .map((c) => ({
      ...c,
      packId: 'custom',
      packLabel: 'Kartu Kustom',
    }));

  const combined = [...builtIn, ...custom];
  return combined.length >= 16 ? combined : [...BUILTIN_BERCANDA_CARDS_ID, ...custom];
}
