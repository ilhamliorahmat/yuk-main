'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Monitor, QrCode, Smartphone, X } from 'lucide-react';
import { motion } from 'motion/react';
import QRCode from 'qrcode';

interface QrInviteModalProps {
  roomCode: string;
  onClose: () => void;
}

export function QrInviteModal({ roomCode, onClose }: QrInviteModalProps) {
  const [tab, setTab] = useState<'player' | 'stage'>('player');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const origin =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';
  const targetUrl =
    tab === 'player'
      ? `${origin}?room=${encodeURIComponent(roomCode)}`
      : `${origin}?room=${encodeURIComponent(roomCode)}&stage=1`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !targetUrl) return;

    void QRCode.toCanvas(canvas, targetUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0B1018',
        light: '#F8FAFC',
      },
    }).catch(() => {});
  }, [targetUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl bg-[#131A24] border border-slate-700/80 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-amber-400" />
            <h2 id="qr-modal-title" className="text-base font-bold text-white">
              Undangan Ruang & Layar Panggung
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0B1018] border border-slate-800">
            <button
              type="button"
              onClick={() => setTab('player')}
              className={`min-h-[44px] rounded-lg px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'player'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              Gabung Pemain
            </button>
            <button
              type="button"
              onClick={() => setTab('stage')}
              className={`min-h-[44px] rounded-lg px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                tab === 'stage'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Monitor className="w-4 h-4" />
              Layar Panggung (TV)
            </button>
          </div>

          <div className="flex flex-col items-center gap-3 py-3 rounded-xl bg-[#0B1018] border border-slate-800/80">
            <div className="p-3 rounded-xl bg-slate-50 shadow-inner">
              <canvas ref={canvasRef} className="block rounded-md" />
            </div>
            <div className="text-center px-4">
              <p className="text-xs text-slate-400">Kode Ruang</p>
              <p className="text-2xl font-black tracking-[0.22em] text-white tabular-nums mt-0.5">
                {roomCode}
              </p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {tab === 'player'
                  ? 'Scan dari HP teman untuk langsung masuk ke lobi tanpa ketik kode.'
                  : 'Buka tautan ini di TV atau laptop untuk menampilkan papan skor & stage tanpa membocorkan rahasia pemain.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="w-full min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Tautan Disalin!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                {tab === 'player' ? 'Salin Tautan Gabung' : 'Salin Tautan Layar Panggung'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
