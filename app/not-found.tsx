import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#0B1018] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#131A24] border border-slate-800 rounded-2xl p-6 text-center space-y-4">
        <p className="text-xs font-mono-tabular text-rose-400 font-semibold">404</p>
        <h1 className="text-xl font-bold text-white">Halaman Tidak Ditemukan</h1>
        <p className="text-sm text-slate-400">
          Tautan yang kamu buka tidak tersedia atau ruang permainan sudah ditutup.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center w-full min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors"
        >
          Kembali ke Beranda Yuk Main
        </Link>
      </div>
    </main>
  );
}
