'use client';

import React from 'react';
import { WifiOff, Radio } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/use-pwa';

interface OfflineNoticeBannerProps {
  isLanModeActive?: boolean;
  onSwitchToLan?: () => void;
}

/**
 * Warm, non-intrusive Indonesian Offline Notice shown whenever `!navigator.onLine`.
 * Reassures players that Zero-Internet LAN Party Mode works over local Wi-Fi/Hotspot.
 */
export function OfflineNoticeBanner({
  isLanModeActive = false,
  onSwitchToLan,
}: OfflineNoticeBannerProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl bg-amber-500/10 border border-amber-400/40 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0 mt-0.5">
          <WifiOff className="w-4 h-4 text-amber-300" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-amber-200">
            Kamu sedang offline — Mode LAN Party tetap siap jalan!
          </p>
          <p className="text-xs text-amber-100/80 leading-relaxed">
            Tidak ada koneksi internet? Tidak masalah. Nyalakan Wi-Fi atau Hotspot HP (tanpa kuota), lalu main bareng lewat <strong className="text-white">Mode LAN Party</strong>.
          </p>
        </div>
      </div>

      {!isLanModeActive && onSwitchToLan && (
        <button
          type="button"
          onClick={onSwitchToLan}
          className="min-h-[40px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Buka Mode LAN Party</span>
        </button>
      )}
    </div>
  );
}
