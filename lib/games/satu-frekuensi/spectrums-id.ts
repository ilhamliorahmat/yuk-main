import type { SpectrumItem } from '../types';

export interface SpectrumPackMeta {
  id: string;
  label: string;
  description: string;
}

export const SPECTRUM_PACKS: SpectrumPackMeta[] = [
  {
    id: 'tongkrongan',
    label: 'Tongkrongan & Gaul',
    description: 'Spektrum kocak soal kebiasaan nongkrong, asmara, dan drama sehari-hari.',
  },
  {
    id: 'kuliner',
    label: 'Kuliner & Jajanan',
    description: 'Dari jajanan SD sampai fine dining, dari hambar sampai pedas brutal.',
  },
  {
    id: 'budaya',
    label: 'Budaya & Pop +62',
    description: 'Film, musik, tren internet, dan hal-hal ikonik khas Indonesia.',
  },
];

interface RawSpectrum {
  left: string;
  right: string;
  category: string;
}

const TONGKRONGAN_RAW: RawSpectrum[] = [
  { left: 'Garing Banget', right: 'Ngakak Brutal', category: 'Humor' },
  { left: 'Bucin Akut', right: 'Cuek Bebek', category: 'Asmara' },
  { left: 'Red Flag', right: 'Green Flag', category: 'Relasi' },
  { left: 'Introvert Kamar', right: 'Ekstrovert Tongkrongan', category: 'Sosial' },
  { left: 'Mending Tidur', right: 'Wajib Gaspol', category: 'Aktivitas' },
  { left: 'Wacana Doang', right: 'Pasti Berangkat', category: 'Tongkrongan' },
  { left: 'Anak Rumahan', right: 'Anak Jalanan Malam', category: 'Gaya Hidup' },
  { left: 'Hemat Pangkal Kaya', right: 'Sultan Bebas Gesek', category: 'Keuangan' },
  { left: 'Gampang Baper', right: 'Hati Baja', category: 'Karakter' },
  { left: 'Overthinking Jam 2 Pagi', right: 'Santuy Tanpa Beban', category: 'Pikiran' },
  { left: 'Cringe Parah', right: 'Keren Abis', category: 'Vibe' },
  { left: 'Fast Response 1 Detik', right: 'Ghosting 3 Hari', category: 'Chatting' },
  { left: 'Teman Biasa', right: 'Sahabat Sehidup Semati', category: 'Pertemanan' },
  { left: 'Bikin Ngantuk', right: 'Bikin Melek Semalaman', category: 'Energi' },
  { left: 'Receh Banget', right: 'Filosofis Mendalam', category: 'Obrolan' },
  { left: 'Gampang Ditebak', right: 'Plot Twist Gila', category: 'Cerita' },
  { left: 'Sopan Santun', right: 'Blak-Blakan Pedas', category: 'Komunikasi' },
  { left: 'Nunda Deadline', right: 'Selesai H-7', category: 'Kerja' },
  { left: 'Malas Gerak (Mager)', right: 'Produktif Maksimal', category: 'Rutinitas' },
  { left: 'Bikin Malu Sendiri', right: 'Bikin Bangga Banget', category: 'Momen' },
  { left: 'Aman Terkendali', right: 'Penuh Risiko', category: 'Keputusan' },
  { left: 'Kelihatan Pintar', right: 'Benar-Benar Pintar', category: 'Kesan' },
  { left: 'Biasa Aja', right: 'Ikonik Legendaris', category: 'Status' },
  { left: 'Murah Meriah', right: 'Mahal Tak Masuk Akal', category: 'Harga' },
  { left: 'Sangat Membosankan', right: 'Seru Tak Terlupakan', category: 'Pengalaman' },
  { left: 'Cuma Gaya', right: 'Sangat Fungsional', category: 'Barang' },
  { left: 'Bisa Dilakukan Sambil Merem', right: 'Butuh Latihan Bertahun-Tahun', category: 'Keahlian' },
  { left: 'Dimaafkan Dalam 5 Menit', right: 'Diingat Seumur Hidup', category: 'Kesalahan' },
];

const KULINER_RAW: RawSpectrum[] = [
  { left: 'Warteg 15 Ribuan', right: 'Fine Dining Sultan', category: 'Tempat Makan' },
  { left: 'Tidak Pedas Sama Sekali', right: 'Pedas Bikin Nangis', category: 'Rasa' },
  { left: 'Jajanan SD', right: 'Hidangan Hotel Bintang 5', category: 'Menu' },
  { left: 'Makanan Tanggal Tua', right: 'Makanan Hari Gajian', category: 'Budget' },
  { left: 'Makanan Diet Sehat', right: 'Calorie Bomb Nikmat', category: 'Gizi' },
  { left: 'Enak Dimakan Dingin', right: 'Wajib Panas Mengepul', category: 'Suhu' },
  { left: 'Camilan Ringan', right: 'Bikin Kenyang Seharian', category: 'Porsi' },
  { left: 'Gampang Dimasak Anak Kos', right: 'Harus Chef Profesional', category: 'Masak' },
  { left: 'Rasa Manis Banget', right: 'Rasa Gurih Asin', category: 'Rasa' },
  { left: 'Harus Pakai Nasi', right: 'Aneh Kalau Pakai Nasi', category: 'Kebiasaan' },
  { left: 'Makanan Pagi Banget', right: 'Makanan Tengah Malam', category: 'Waktu' },
  { left: 'Bau Menyengat', right: 'Aroma Wangi Menggoda', category: 'Aroma' },
  { left: 'Tekstur Renyah Garing', right: 'Tekstur Lembut Lumer', category: 'Tekstur' },
  { left: 'Cuma Tren Sesaat', right: 'Abadi Sepanjang Masa', category: 'Kuliner' },
  { left: 'Paling Enak Diaduk', right: 'Haram Diaduk', category: 'Debat' },
  { left: 'Bikin Haus Banget', right: 'Sangat Menyegarkan', category: 'Minuman' },
  { left: 'Makanan Sendirian', right: 'Makanan Rame-Rame', category: 'Suasana' },
  { left: 'Pahit Pekat', right: 'Creamy Manis', category: 'Kopi & Minuman' },
  { left: 'Porsi Mini', right: 'Porsi Kuli Jumbo', category: 'Porsi' },
  { left: 'Gampang Dicari Di Mana Saja', right: 'Langka Harus Pesan Jauh', category: 'Akses' },
  { left: 'Bikin Ribet Makannya', right: 'Tinggal Hap Tanpa Ribet', category: 'Praktis' },
  { left: 'Masakan Rumahan Ibu', right: 'Masakan Restoran Cepat Saji', category: 'Gaya' },
  { left: 'Bumbu Minimalis', right: 'Rempah Medok Pekat', category: 'Bumbu' },
  { left: 'Cocok Saat Hujan Deras', right: 'Cocok Saat Terik Siang', category: 'Cuaca' },
  { left: 'Makanan Anak Kecil', right: 'Selera Orang Dewasa', category: 'Usia' },
  { left: 'Cepat Basi', right: 'Awet Berbulan-Bulan', category: 'Ketahanan' },
];

const BUDAYA_RAW: RawSpectrum[] = [
  { left: 'Jadul Era 90-an', right: 'Futuristik Tahun 2099', category: 'Era' },
  { left: 'Wajar di +62', right: 'Cuma Ada di Film', category: 'Realita' },
  { left: 'Lagu Galau Hujan', right: 'Lagu Joget Hajatan', category: 'Musik' },
  { left: 'Film Bikin Nangis', right: 'Film Komedi Ngakak', category: 'Film' },
  { left: 'Karakter Antagonis', right: 'Pahlawan Sejati', category: 'Fiksi' },
  { left: 'Lokal Nusantara', right: 'Internasional Global', category: 'Budaya' },
  { left: 'Sangat Realistis', right: 'Fantasi Murni', category: 'Genre' },
  { left: 'Liburan Hemat Backpacker', right: 'Liburan Mewah Resort', category: 'Wisata' },
  { left: 'Olahraga Santai', right: 'Olahraga Ekstrem', category: 'Olahraga' },
  { left: 'Kota Super Sibuk', right: 'Desa Tenang Damai', category: 'Tempat' },
  { left: 'Teknologi Kuno', right: 'Teknologi Canggih', category: 'Sains' },
  { left: 'Hewan Imut Menggemaskan', right: 'Hewan Seram Buas', category: 'Alam' },
  { left: 'Benda Sangat Kecil', right: 'Benda Raksasa', category: 'Ukuran' },
  { left: 'Sangat Pelan', right: 'Secepat Kilat', category: 'Kecepatan' },
  { left: 'Pekerjaan Santai', right: 'Pekerjaan Penuh Tekanan', category: 'Profesi' },
  { left: 'Hobi Murah', right: 'Hobi Bikin Kantong Jebol', category: 'Hobi' },
  { left: 'Underrated Banget', right: 'Overrated Banget', category: 'Opini' },
  { left: 'Game Santai Kasual', right: 'Game Kompetitif Bikin Emosi', category: 'Gaming' },
  { left: 'Tradisi Sakral', right: 'Tren Viral TikTok', category: 'Sosial' },
  { left: 'Pakaian Santai Rumah', right: 'Pakaian Kondangan Resmi', category: 'Fashion' },
  { left: 'Super Rahasia', right: 'Rahasia Umum Semua Tahu', category: 'Informasi' },
  { left: 'Nyaris Mustahil Terjadi', right: 'Terjadi Setiap Hari', category: 'Peluang' },
  { left: 'Menyeramkan Di Malam Hari', right: 'Menenangkan Di Malam Hari', category: 'Suasana' },
  { left: 'Kendaraan Harian', right: 'Kendaraan Mimpi', category: 'Transportasi' },
  { left: 'Cocok Untuk Libur Panjang', right: 'Cocok Untuk Istirahat 10 Menit', category: 'Waktu' },
  { left: 'Karya Seni Klasik', right: 'Meme Internet', category: 'Seni' },
];

function buildPack(packId: string, packLabel: string, rows: RawSpectrum[]): SpectrumItem[] {
  return rows.map((row, idx) => ({
    id: `${packId}_${idx + 1}`,
    leftLabel: row.left,
    rightLabel: row.right,
    category: row.category,
    packId,
    packLabel,
  }));
}

export const BUILTIN_SPECTRUMS_ID: SpectrumItem[] = [
  ...buildPack('tongkrongan', 'Tongkrongan & Gaul', TONGKRONGAN_RAW),
  ...buildPack('kuliner', 'Kuliner & Jajanan', KULINER_RAW),
  ...buildPack('budaya', 'Budaya & Pop +62', BUDAYA_RAW),
];

export const SATU_FREKUENSI_QUICK_PROMPTS_ID: string[] = [
  'Menurutku ini condong ke kiri dikit sih!',
  'Wah petunjuknya bikin mikir keras nih...',
  'Yakin banget ini di sekitar 70–85!',
  'Aku nebak di tengah-tengah aja deh biar aman.',
  'Penerawang jangan kasih kode muka ya!',
  'Udah kunci jarum semua? Gas buka tabir!',
];
