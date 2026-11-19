import type { FactItem } from '../types';

export interface FactPackMeta {
  id: string;
  label: string;
  description: string;
}

export const FACT_PACKS: FactPackMeta[] = [
  {
    id: 'hukum_sejarah',
    label: 'Hukum & Sejarah Aneh',
    description: 'Aturan nyeleneh, kisah sejarah nyata, dan kejadian unik dari seluruh dunia.',
  },
  {
    id: 'nusantara',
    label: 'Serba-Serbi Nusantara',
    description: 'Fakta mengejutkan seputar tradisi, geografi, kuliner, dan budaya Indonesia.',
  },
  {
    id: 'sains_alam',
    label: 'Sains & Alam Nyeleneh',
    description: 'Fenomena biologis, hewan, dan luar angkasa yang terdengar seperti karangan.',
  },
];

interface RawFact {
  prefix: string;
  twist: string;
  suffix: string;
  category: string;
}

const HUKUM_SEJARAH_RAW: RawFact[] = [
  {
    prefix: 'Di sebuah negara di Timur Tengah pernah tercatat tidak ada laporan hukum korupsi formal pada era tertentu karena ',
    twist: 'belum adanya pasal undang-undang khusus yang mendefinisikan istilah korupsi itu sendiri',
    suffix: '.',
    category: 'Hukum Unik',
  },
  {
    prefix: 'Di Swiss, memelihara hanya satu ekor marmut (guinea pig) dianggap melanggar hukum kesejahteraan hewan karena ',
    twist: 'marmut adalah hewan sosial yang bisa stres dan kesepian jika hidup sendirian',
    suffix: '.',
    category: 'Hukum Hewan',
  },
  {
    prefix: 'Di kota Venice, Italia, memberi makan merpati di Alun-Alun St. Mark bisa dikenai denda ratusan euro karena ',
    twist: 'kotoran merpati bersifat asam dan merusak patung serta bangunan bersejarah',
    suffix: '.',
    category: 'Aturan Kota',
  },
  {
    prefix: 'Pada tahun 1932, militer Australia benar-benar pernah kalah dalam "perang" melawan ',
    twist: 'kawanan burung emu yang jumlahnya puluhan ribu dan terlalu cepat untuk dihadang',
    suffix: '.',
    category: 'Sejarah',
  },
  {
    prefix: 'Di negara bagian Alaska, membangunkan beruang yang sedang tidur demi mengambil foto dilarang hukum, padahal ',
    twist: 'berburu beruang secara legal di musim tertentu justru diperbolehkan',
    suffix: '.',
    category: 'Hukum Unik',
  },
  {
    prefix: 'Di Singapura, menjual permen karet dilarang sejak 1992 karena sebelumnya ',
    twist: 'permen karet yang ditempel di sensor pintu kereta MRT sering menghentikan operasional kereta',
    suffix: '.',
    category: 'Aturan Kota',
  },
  {
    prefix: 'Pada abad ke-18 di Inggris, pajak jendela pernah diberlakukan sehingga banyak warga ',
    twist: 'menutup jendela rumah mereka dengan batu bata agar tidak perlu membayar pajak tinggi',
    suffix: '.',
    category: 'Sejarah',
  },
  {
    prefix: 'Di Jepang, seorang pria bisa menyewa jasa aktor profesional khusus untuk ',
    twist: 'berpura-pura menjadi anggota keluarga atau tamu pernikahan yang ramai',
    suffix: '.',
    category: 'Budaya Modern',
  },
  {
    prefix: 'Di kota Longyearbyen, Norwegia, penduduk secara praktis "dilarang meninggal" dan dimakamkan di sana karena ',
    twist: 'tanah es abadi (permafrost) membuat jasad tidak bisa terurai dan berisiko menyimpan virus purba',
    suffix: '.',
    category: 'Geografi',
  },
  {
    prefix: 'Di Jerman, kehabisan bensin di jalan tol Autobahn bisa dikenai tilang karena ',
    twist: 'berhenti di bahu jalan akibat kelalaian sendiri dianggap membahayakan kendaraan berkecepatan tinggi',
    suffix: '.',
    category: 'Lalu Lintas',
  },
  {
    prefix: 'Kaisar Romawi Caligula konon pernah berencana mengangkat seekor makhluk tak terduga menjadi konsul negara, yaitu ',
    twist: 'kuda kesayangannya sendiri yang bernama Incitatus',
    suffix: '.',
    category: 'Sejarah Kuno',
  },
  {
    prefix: 'Di Yunani, pengunjung situs bersejarah Acropolis dilarang memakai sepatu hak tinggi karena ',
    twist: 'ujung hak yang tajam dapat mengikis dan merusak lantai marmer kuno',
    suffix: '.',
    category: 'Aturan Wisata',
  },
  {
    prefix: 'Pada zaman Mesir Kuno, para pelayan Firaun pernah diolesi madu di tubuhnya agar ',
    twist: 'lalat-lalat tertarik menghinggapi pelayan dan menjauh dari sang Firaun',
    suffix: '.',
    category: 'Sejarah Kuno',
  },
  {
    prefix: 'Di Prancis, terdapat aturan kuno yang melarang pemilik menamai babi peliharaan mereka dengan nama ',
    twist: 'Napoleon, karena dianggap menghina tokoh sejarah negara',
    suffix: '.',
    category: 'Hukum Unik',
  },
  {
    prefix: 'Saat Menara Eiffel pertama kali dibangun tahun 1889, banyak seniman Paris memprotes dan meminta menara itu ',
    twist: 'dibongkar setelah 20 tahun karena dianggap merusak pemandangan kota',
    suffix: '.',
    category: 'Sejarah',
  },
  {
    prefix: 'Universitas Oxford tercatat secara historis lebih tua ratusan tahun dibandingkan ',
    twist: 'berdirinya Kekaisaran Aztek di Amerika Tengah',
    suffix: '.',
    category: 'Linimasa',
  },
  {
    prefix: 'Pada tahun 1912, sebuah kompetisi resmi di Olimpiade Musim Panas pernah memberikan medali emas untuk bidang ',
    twist: 'seni lukis, sastra, musik, dan arsitektur',
    suffix: '.',
    category: 'Olahraga',
  },
  {
    prefix: 'Di negara kecil Liechtenstein pada tahun 1866, pasukan tentara mereka pulang dari perang dengan jumlah ',
    twist: 'bertambah satu orang karena mereka berteman dengan seorang prajurit lawan di perjalanan',
    suffix: '.',
    category: 'Sejarah',
  },
  {
    prefix: 'Di kota Milan, Italia, pernah ada aturan abad ke-19 yang mewajibkan warga selalu tersenyum di tempat umum, kecuali saat ',
    twist: 'menghadiri pemakaman atau menjenguk orang sakit di rumah sakit',
    suffix: '.',
    category: 'Hukum Unik',
  },
  {
    prefix: 'Di Thailand, menginjak uang kertas yang jatuh di jalan bisa berujung masalah hukum karena ',
    twist: 'uang kertas tersebut bergambar potret Raja yang sangat dihormati',
    suffix: '.',
    category: 'Budaya & Hukum',
  },
  {
    prefix: 'Di Inggris, seluruh angsa liar tidak bertuan di Sungai Thames secara tradisi masih dianggap sebagai ',
    twist: 'milik resmi Kerajaan Inggris sejak abad ke-12',
    suffix: '.',
    category: 'Tradisi',
  },
  {
    prefix: 'Kata "sandwich" lahir pada abad ke-18 karena bangsawan bernama Earl of Sandwich ingin ',
    twist: 'makan daging dengan satu tangan tanpa mengotori kartu saat terus bermain kartu',
    suffix: '.',
    category: 'Asal Kata',
  },
  {
    prefix: 'Pada era 1830-an di Amerika Serikat, saus tomat (ketchup) sempat dipasarkan dan dijual dalam bentuk pil sebagai ',
    twist: 'obat pencernaan dan penawar sakit perut',
    suffix: '.',
    category: 'Sejarah Kuliner',
  },
  {
    prefix: 'Di kota Eraclea, Italia, membangun istana pasir berukuran besar di pantai bisa kena denda karena ',
    twist: 'dianggap menghalangi jalur pejalan kaki dan petugas penyelamat pantai',
    suffix: '.',
    category: 'Aturan Kota',
  },
  {
    prefix: 'Perang tersingkat dalam sejarah dunia antara Inggris dan Zanzibar pada 1896 hanya berlangsung sekitar ',
    twist: '38 sampai 45 menit sebelum akhirnya gencatan senjata diumumkan',
    suffix: '.',
    category: 'Sejarah',
  },
];

const NUSANTARA_RAW: RawFact[] = [
  {
    prefix: 'Di beberapa daerah di Jawa pada masa kolonial, orang menggunakan istilah "uang ketip" karena koin tersebut ',
    twist: 'bernilai sepuluh sen yang berasal dari kata Belanda "dubbeltje" atau kepingan tipis',
    suffix: '.',
    category: 'Sejarah Lokal',
  },
  {
    prefix: 'Indonesia menjadi satu-satunya tempat di dunia tempat ditemukannya komodo di alam liar, dan uniknya komodo betina bisa ',
    twist: 'berkembang biak tanpa pejantan melalui proses partenogenesis',
    suffix: '.',
    category: 'Fauna Nusantara',
  },
  {
    prefix: 'Di Desa Trunyan, Bali, jenazah warga yang meninggal secara wajar tidak dikubur maupun dibakar, melainkan ',
    twist: 'diletakkan di bawah pohon Taru Menyan yang aromanya secara alami menghilangkan bau',
    suffix: '.',
    category: 'Tradisi',
  },
  {
    prefix: 'Danau Kelimutu di Flores terkenal memiliki tiga kawah yang warnanya bisa berubah-ubah secara berkala karena ',
    twist: 'reaksi kimia mineral vulkanik dan aktivitas gas di dasar kawah',
    suffix: '.',
    category: 'Alam Indonesia',
  },
  {
    prefix: 'Candi Borobudur yang megah itu dibangun pada abad ke-8 tanpa menggunakan semen sama sekali, melainkan ',
    twist: 'sistem saling kunci antarbatu andesit seperti kepingan puzzle raksasa',
    suffix: '.',
    category: 'Arsitektur',
  },
  {
    prefix: 'Di Kalimantan Selatan, Pasar Terapung Lok Baintan telah bertahan ratusan tahun dan masih mempertahankan sistem ',
    twist: 'barter langsung antarperahu untuk hasil kebun dan ikan segar',
    suffix: '.',
    category: 'Budaya',
  },
  {
    prefix: 'Bahasa Indonesia tidak hanya digunakan di Nusantara, tetapi juga dipelajari secara luas sebagai bahasa asing populer di ',
    twist: 'sekolah-sekolah Australia dan bahkan diakui sebagai bahasa resmi di Sidang Umum UNESCO',
    suffix: '.',
    category: 'Bahasa',
  },
  {
    prefix: 'Bunga Rafflesia arnoldii di Bengkulu menjadi bunga tunggal terbesar di dunia, namun tanaman ini unik karena ',
    twist: 'tidak memiliki batang, daun, maupun akar sejati karena hidup sebagai parasit pada liana',
    suffix: '.',
    category: 'Flora Nusantara',
  },
  {
    prefix: 'Di Tana Toraja, Sulawesi Selatan, terdapat tradisi Ma\'nene yang dilakukan berkala oleh keluarga untuk ',
    twist: 'membersihkan jasad leluhur dan mengganti pakaiannya sebagai bentuk penghormatan',
    suffix: '.',
    category: 'Tradisi',
  },
  {
    prefix: 'Pulau Samosir di Sumatera Utara memiliki keunikan geografis langka karena merupakan ',
    twist: 'pulau vulkanik di tengah danau yang di atasnya juga terdapat danau kecil lagi',
    suffix: '.',
    category: 'Geografi',
  },
  {
    prefix: 'Di beberapa kota di Indonesia, pedagang bakso keliling menggunakan bunyi ketukan mangkuk atau kentongan tertentu karena ',
    twist: 'setiap bunyi menjadi kode khas yang langsung membedakan jenis dagangan dari dalam rumah',
    suffix: '.',
    category: 'Keseharian +62',
  },
  {
    prefix: 'Kopi Luwak dari Indonesia menjadi salah satu kopi termahal di dunia karena biji kopinya ',
    twist: 'mengalami fermentasi alami di dalam saluran pencernaan musang luwak sebelum diolah',
    suffix: '.',
    category: 'Kuliner',
  },
  {
    prefix: 'Kawah Ijen di Jawa Timur terkenal dengan fenomena "Api Biru" (Blue Fire) yang hanya terlihat malam hari akibat ',
    twist: 'pembakaran gas belerang bersuhu tinggi yang keluar dari celah batuan vulkanik',
    suffix: '.',
    category: 'Alam Indonesia',
  },
  {
    prefix: 'Di Kampung Naga, Tasikmalaya, seluruh rumah adat dibangun seragam menghadap utara atau selatan tanpa listrik PLN untuk ',
    twist: 'menjaga keselarasan adat leluhur dan mencegah kesenjangan sosial antarwarga',
    suffix: '.',
    category: 'Adat',
  },
  {
    prefix: 'Nama "Rendang" dalam bahasa Minangkabau sebenarnya merujuk bukan hanya pada makanannya, melainkan ',
    twist: 'teknik memasak perlahan (marandang) hingga santan mengering menjadi dedak bumbu gelap',
    suffix: '.',
    category: 'Kuliner',
  },
  {
    prefix: 'Di Kota Pontianak, dua kali setahun terjadi fenomena "Hari Tanpa Bayangan" tepat di Tugu Khatulistiwa karena ',
    twist: 'posisi matahari berada persis tegak lurus di atas garis lintang nol derajat',
    suffix: '.',
    category: 'Geografi',
  },
  {
    prefix: 'Suku Bajo di perairan Sulawesi dijuluki manusia laut karena secara fisiologis banyak dari mereka memiliki ',
    twist: 'ukuran limpa yang lebih besar sehingga mampu menahan napas lebih lama saat menyelam',
    suffix: '.',
    category: 'Sains & Budaya',
  },
  {
    prefix: 'Di Pulau Madura, terdapat desa yang warganya tidur beralaskan pasir halus bersih di dalam rumah karena ',
    twist: 'pasir dipercaya terasa sejuk di siang hari dan hangat saat malam tiba',
    suffix: '.',
    category: 'Tradisi Unik',
  },
  {
    prefix: 'Saat hari raya Nyepi di Bali, bahkan Bandara Internasional Ngurah Rai menutup operasional selama 24 jam penuh kecuali untuk ',
    twist: 'pendaratan darurat medis atau keselamatan penerbangan',
    suffix: '.',
    category: 'Budaya',
  },
  {
    prefix: 'Indonesia memiliki lebih dari 700 bahasa daerah aktif, menjadikannya negara dengan keberagaman bahasa terbesar kedua di dunia setelah ',
    twist: 'Papua Nugini yang memiliki lebih dari 800 bahasa',
    suffix: '.',
    category: 'Bahasa',
  },
  {
    prefix: 'Di daerah Lampung, kain tradisional Tapis dulunya ditenun dengan benang emas asli dan dipakai sebagai penanda ',
    twist: 'status sosial serta kesiapan seseorang dalam upacara adat penting',
    suffix: '.',
    category: 'Warisan',
  },
  {
    prefix: 'Masjid Menara Kudus di Jawa Tengah memiliki menara berbentuk menyerupai candi Hindu karena ',
    twist: 'Sunan Kudus memadukan arsitektur lokal agar dakwah diterima secara damai oleh masyarakat',
    suffix: '.',
    category: 'Sejarah',
  },
  {
    prefix: 'Di Yogyakarta, garis imajiner lurus menghubungkan Gunung Merapi, Keraton, dan Pantai Parangtritis yang melambangkan ',
    twist: 'keselarasan hubungan antara manusia, alam, dan Sang Pencipta',
    suffix: '.',
    category: 'Filosofi',
  },
  {
    prefix: 'Buah durian dilarang dibawa masuk ke banyak hotel dan transportasi umum di Asia Tenggara karena ',
    twist: 'senyawa sulfur alaminya menghasilkan aroma tajam yang sangat lama hilang di ruang ber-AC',
    suffix: '.',
    category: 'Kuliner',
  },
  {
    prefix: 'Istilah "Nongkrong" dalam bahasa gaul Indonesia diyakini berasal dari kebiasaan duduk berjongkok di pinggir jalan sambil ',
    twist: 'mengobrol santai berjam-jam tanpa agenda resmi',
    suffix: '.',
    category: 'Keseharian +62',
  },
];

const SAINS_ALAM_RAW: RawFact[] = [
  {
    prefix: 'Gurita adalah salah satu makhluk laut paling aneh karena memiliki tiga jantung, darah berwarna biru, dan ',
    twist: 'sembilan otak—satu otak pusat dan satu mini-otak di setiap delapan lengannya',
    suffix: '.',
    category: 'Biologi Laut',
  },
  {
    prefix: 'Madu murni yang disimpan rapat hampir tidak pernah basi—bahkan madu berusia 3.000 tahun di makam Mesir masih layak makan karena ',
    twist: 'kadar airnya sangat rendah dan keasamannya membuat bakteri sulit berkembang biak',
    suffix: '.',
    category: 'Sains Pangan',
  },
  {
    prefix: 'Wombat, hewan berkantung asal Australia, adalah satu-satunya mamalia di dunia yang menghasilkan kotoran berbentuk ',
    twist: 'kubus kotak rapi agar tidak menggelinding saat dipakai menandai wilayah di atas batu',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Satu hari di Planet Venus ternyata lebih lama daripada satu tahunnya sendiri karena ',
    twist: 'rotasi Venus pada porosnya jauh lebih lambat daripada waktu revolusinya mengelilingi Matahari',
    suffix: '.',
    category: 'Astronomi',
  },
  {
    prefix: 'Secara botani, buah pisang dan semangka sebenarnya masuk kategori buah beri (berry), sedangkan stroberi bukan beri karena ',
    twist: 'biji stroberi berada di permukaan luar, bukan tertanam di dalam daging buahnya',
    suffix: '.',
    category: 'Botani',
  },
  {
    prefix: 'Hiu sudah berenang di lautan Bumi jauh lebih lama sebelum munculnya ',
    twist: 'pepohonan pertama di daratan maupun terbentuknya cincin Planet Saturnus',
    suffix: '.',
    category: 'Evolusi',
  },
  {
    prefix: 'Berang-berang laut (sea otter) punya kebiasaan menggemaskan saat tidur mengapung di air, yaitu ',
    twist: 'saling berpegangan tangan agar tidak terbawa arus dan terpisah dari kelompoknya',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Tubuh manusia di pagi hari rata-rata sekitar 1 sentimeter lebih tinggi dibandingkan malam hari karena ',
    twist: 'tulang rawan di tulang belakang tertekan gravitasi sepanjang hari lalu mengembang lagi saat tidur',
    suffix: '.',
    category: 'Tubuh Manusia',
  },
  {
    prefix: 'Flamingo sebenarnya terlahir dengan bulu berwarna abu-abu pucat, lalu berubah menjadi merah muda karena ',
    twist: 'pigmen karotenoid dari udang kecil dan alga yang mereka makan setiap hari',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Suara "krek" saat seseorang membunyikan buku-buku jari bukan berasal dari tulang yang bergesekan, melainkan ',
    twist: 'letupan gelembung gas kecil di dalam cairan pelumas sendi',
    suffix: '.',
    category: 'Tubuh Manusia',
  },
  {
    prefix: 'Lumba-lumba tidur dengan cara unik agar tetap bisa naik mengambil napas, yaitu dengan ',
    twist: 'mengistirahatkan hanya separuh otaknya sementara separuh lainnya tetap terjaga',
    suffix: '.',
    category: 'Biologi Laut',
  },
  {
    prefix: 'Di Planet Saturnus dan Jupiter, para ilmuwan menduga tekanan atmosfer ekstremnya bisa menyebabkan ',
    twist: 'hujan kristal berlian yang jatuh dari awan karbon bertekanan tinggi',
    suffix: '.',
    category: 'Astronomi',
  },
  {
    prefix: 'Pohon bambu raksasa tertentu bisa tumbuh hingga hampir satu meter hanya dalam satu hari karena ',
    twist: 'sel-sel ruasnya sudah terbentuk rapat dan tinggal memanjang secara serentak saat menyerap air',
    suffix: '.',
    category: 'Botani',
  },
  {
    prefix: 'Koala memiliki sidik jari yang bentuknya sangat mirip dengan sidik jari manusia hingga ',
    twist: 'bahkan di bawah mikroskop sekalipun nyaris sulit dibedakan oleh ahli forensik',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Air panas dalam kondisi tertentu bisa membeku lebih cepat daripada air dingin—fenomena fisika nyata yang disebut ',
    twist: 'Efek Mpemba, dinamai dari seorang siswa sekolah di Tanzania yang memperhatikannya saat membuat es krim',
    suffix: '.',
    category: 'Fisika',
  },
  {
    prefix: 'Kupu-kupu mengecap rasa makanan bukan menggunakan mulut, melainkan memakai ',
    twist: 'sensor reseptor rasa yang berada di telapak kakinya saat hinggap di daun atau bunga',
    suffix: '.',
    category: 'Serangga',
  },
  {
    prefix: 'Di luar angkasa, astronot tidak bisa menangis dengan air mata menetes ke pipi karena ',
    twist: 'tanpa gravitasi, air mata hanya berkumpul membentuk bola cairan lengket di sekitar mata',
    suffix: '.',
    category: 'Antariksa',
  },
  {
    prefix: 'Ubur-ubur jenis Turritopsis dohrnii dijuluki "ubur-ubur abadi" karena saat stres atau tua, ia mampu ',
    twist: 'mengembalikan sel tubuhnya kembali ke fase bayi (polip) dan memulai siklus hidup baru',
    suffix: '.',
    category: 'Biologi Laut',
  },
  {
    prefix: 'Sidik lidah setiap manusia ternyata sama uniknya dengan sidik jari karena ',
    twist: 'pola tekstur, lipatan, dan bentuk permukaan lidah tidak ada yang identik antarindividu',
    suffix: '.',
    category: 'Tubuh Manusia',
  },
  {
    prefix: 'Seekor siput kebun bisa tidur panjang tanpa bangun selama bertahun-tahun saat cuaca ekstrem karena ',
    twist: 'tubuhnya membentuk lapisan lendir penutup cangkang agar tidak kehilangan kelembapan',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Kacang tanah sebenarnya secara botani bukan termasuk keluarga kacang pohon (nut), melainkan ',
    twist: 'polong-polongan yang tumbuh dan matang di dalam tanah seperti kerabat buncis',
    suffix: '.',
    category: 'Botani',
  },
  {
    prefix: 'Awan kumulus putih yang terlihat ringan melayang di langit sebenarnya memiliki berat rata-rata setara dengan ',
    twist: 'ratusan ton air yang tersebar dalam miliaran tetesan mikroskopis',
    suffix: '.',
    category: 'Cuaca',
  },
  {
    prefix: 'Anjing memiliki kemampuan mencium bau luar biasa hingga bisa merasakan perubahan waktu karena ',
    twist: 'kadar aroma pemiliknya di dalam ruangan perlahan memudar seiring berjalannya jam',
    suffix: '.',
    category: 'Fauna',
  },
  {
    prefix: 'Di Bulan, jejak sepatu astronot Apollo yang dibuat lebih dari 50 tahun lalu masih utuh hingga sekarang karena ',
    twist: 'Bulan tidak memiliki atmosfer, angin, maupun hujan untuk menghapus jejak tersebut',
    suffix: '.',
    category: 'Antariksa',
  },
  {
    prefix: 'Burung gagak mampu mengingat wajah manusia selama bertahun-tahun dan bahkan bisa ',
    twist: 'mengajarkan anak-anaknya untuk mewaspadai orang yang pernah mengganggu mereka',
    suffix: '.',
    category: 'Fauna',
  },
];

function buildFactPack(packId: string, packLabel: string, rows: RawFact[]): FactItem[] {
  return rows.map((row, idx) => ({
    id: `${packId}_${idx + 1}`,
    prefix: row.prefix,
    twist: row.twist,
    suffix: row.suffix,
    category: row.category,
    packId,
    packLabel,
  }));
}

export const BUILTIN_FACTS_ID: FactItem[] = [
  ...buildFactPack('hukum_sejarah', 'Hukum & Sejarah Aneh', HUKUM_SEJARAH_RAW),
  ...buildFactPack('nusantara', 'Serba-Serbi Nusantara', NUSANTARA_RAW),
  ...buildFactPack('sains_alam', 'Sains & Alam Nyeleneh', SAINS_ALAM_RAW),
];

export const FAKTA_HARI_INI_QUICK_PROMPTS_ID: string[] = [
  'Ceritamu terlalu detail, mencurigakan banget!',
  'Aku yakin versi yang tadi itu ngarang bebas deh!',
  'Eh tunggu, coba ulangin alasannya sekali lagi?',
  'Tim Bluffer kompak banget bikin pusing!',
  'Ini sih masuk akal banget... atau justru jebakan?',
  'Siap! Pengendali Fase, gas lanjut ke fase tebakan!',
];
