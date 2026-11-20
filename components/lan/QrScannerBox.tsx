'use client';

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, ClipboardPaste, Check } from 'lucide-react';

interface QrScannerBoxProps {
  label: string;
  onScan: (decodedText: string) => void;
  disabled?: boolean;
  pastePlaceholder?: string;
}

/**
 * Zero-dependency-network QR scanner using `getUserMedia` + `jsQR` on an offscreen canvas,
 * paired with a manual paste fallback (useful on laptops without rear cameras or quick 2-tab testing).
 */
export function QrScannerBox({
  label,
  onScan,
  disabled = false,
  pastePlaceholder = 'Tempel kode YMLAN1:... di sini',
}: QrScannerBoxProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onScanRef = useRef(onScan);
  const hasScannedRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualText, setManualText] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (disabled) return;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;
    hasScannedRef.current = false;

    const startCamera = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraError('Kamera tidak tersedia di browser ini. Gunakan opsi Tempel Kode Manual di bawah.');
        setManualOpen(true);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 640 },
            height: { ideal: 640 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();
        setCameraActive(true);
        setCameraError(null);

        const tick = () => {
          if (cancelled || hasScannedRef.current) return;
          const vid = videoRef.current;
          const canvas = canvasRef.current;
          if (vid && canvas && vid.readyState === vid.HAVE_ENOUGH_DATA) {
            const w = vid.videoWidth;
            const h = vid.videoHeight;
            if (w > 0 && h > 0) {
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(vid, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const decoded = jsQR(imgData.data, w, h, {
                  inversionAttempts: 'attemptBoth',
                });
                if (decoded?.data && decoded.data.startsWith('YMLAN')) {
                  hasScannedRef.current = true;
                  onScanRef.current(decoded.data.trim());
                  return;
                }
              }
            }
          }
          rafId = window.requestAnimationFrame(tick);
        };

        rafId = window.requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setCameraActive(false);
          setCameraError(
            'Izin kamera ditolak atau tidak tersedia. Kamu tetap bisa pakai Tempel Kode Manual di bawah.',
          );
          setManualOpen(true);
        }
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setCameraActive(false);
    };
  }, [disabled]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualText.trim();
    if (!cleaned) return;
    onScan(cleaned);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          {cameraActive ? (
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <CameraOff className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span>{label}</span>
        </p>
        <button
          type="button"
          onClick={() => setManualOpen((prev) => !prev)}
          className="text-xs font-medium text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 transition-colors"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>{manualOpen ? 'Tutup Input Manual' : 'Tempel Kode Manual'}</span>
        </button>
      </div>

      {/* Camera Viewport */}
      {!cameraError && (
        <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-700/80 aspect-square max-h-[260px] w-full mx-auto">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Crisp QR Targeting Reticle */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-44 h-44 rounded-2xl border-2 border-amber-400/80 shadow-[0_0_0_9999px_rgba(6,9,15,0.45)]" />
          </div>

          {!cameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0B1018]/80 text-xs text-slate-300 px-4 text-center">
              Membuka kamera belakang...
            </div>
          )}
        </div>
      )}

      {cameraError && (
        <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-3.5 py-3 text-xs text-slate-400 leading-relaxed">
          {cameraError}
        </div>
      )}

      {/* Manual Paste Fallback (works offline, on laptops, or across 2 browser tabs) */}
      {manualOpen && (
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <textarea
            rows={3}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={pastePlaceholder}
            className="w-full rounded-xl bg-[#0B1018] border border-slate-700 focus:border-amber-400/70 px-3 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none resize-none"
          />
          <button
            type="submit"
            disabled={disabled || !manualText.trim()}
            className="w-full min-h-[42px] rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Gunakan Kode Ini</span>
          </button>
        </form>
      )}
    </div>
  );
}
