'use client';

import React, { useState } from 'react';
import { Check, Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/use-pwa';

interface PwaInstallButtonProps {
  compact?: boolean;
}

export function PwaInstallButton({ compact = false }: PwaInstallButtonProps) {
  const { canPromptInstall, isInstalled, isIOS, install } = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (isInstalled) {
    if (compact) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400/90 font-medium">
        <Check className="w-3.5 h-3.5" />
        <span>Terpasang sebagai Aplikasi</span>
      </span>
    );
  }

  if (!canPromptInstall && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (canPromptInstall) {
      setBusy(true);
      try {
        await install();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (isIOS) {
      setIosGuideOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        className={
          compact
            ? 'min-h-[40px] px-3.5 rounded-xl bg-[#131A24] border border-slate-700/90 hover:border-amber-400/60 text-xs font-semibold text-slate-200 hover:text-amber-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50'
            : 'min-h-[42px] px-4 rounded-xl bg-[#131A24] border border-amber-500/40 hover:border-amber-400/70 text-xs sm:text-sm font-semibold text-amber-200 hover:text-amber-100 inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50'
        }
      >
        <Download className="w-4 h-4 text-amber-400" />
        <span>{busy ? 'Memasang...' : 'Pasang Aplikasi (Offline)'}</span>
      </button>

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-pwa-guide-title"
        >
          <div className="w-full sm:max-w-md bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-5 text-left">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 id="ios-pwa-guide-title" className="text-base font-bold text-white">
                    Pasang Yuk Main di iPhone / iPad
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Agar bisa dibuka walau tanpa kuota internet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                aria-label="Tutup panduan pasang"
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="space-y-3 text-sm text-slate-300 leading-relaxed list-decimal pl-5">
              <li>
                Ketuk ikon{' '}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold text-xs">
                  <Share className="w-3.5 h-3.5" />
                  Bagikan (Share)
                </span>{' '}
                di bilah bawah Safari.
              </li>
              <li>
                Gulir ke bawah lalu pilih{' '}
                <strong className="text-white">Tambahkan ke Layar Utama (Add to Home Screen)</strong>.
              </li>
              <li>
                Ketuk <strong className="text-white">Tambah</strong>. Yuk Main siap dibuka langsung dari Home Screen bahkan saat Airplane Mode + Wi-Fi!
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="w-full min-h-[44px] rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm transition-colors"
            >
              Siap, Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
