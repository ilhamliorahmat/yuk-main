'use client';

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Check, ClipboardPaste } from 'lucide-react';

interface QrScannerBoxProps {
  label: string;
  onScan: (decodedText: string) => void;
  disabled?: boolean;
  pastePlaceholder?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

/**
 * Offline-safe QR scanner prioritizing native Android Chrome `BarcodeDetector`
 * with a throttled high-resolution `jsQR` fallback + manual paste fallback
 * (essential for Android split-screen where only 1 window can hold the camera).
 */
export function QrScannerBox({
  label,
  onScan,
  disabled = false,
  pastePlaceholder = 'Tempel kode YMLAN1:... atau YMLAN0:... di sini',
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
    let lastScanAt = 0;
    let nativeBusy = false;
    hasScannedRef.current = false;

    let nativeDetector: NativeBarcodeDetector | null = null;
    if (typeof window !== 'undefined') {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
        .BarcodeDetector;
      if (typeof Detector === 'function') {
        try {
          nativeDetector = new Detector({ formats: ['qr_code'] });
        } catch {
          nativeDetector = null;
        }
      }
    }

    const startCamera = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setCameraError(
          'Kamera tidak tersedia di browser ini. Gunakan opsi Tempel Kode Manual di bawah.',
        );
        setManualOpen(true);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
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

        const handleDecoded = (text: string) => {
          const clean = text.trim();
          if (clean.startsWith('YMLAN') && !hasScannedRef.current) {
            hasScannedRef.current = true;
            onScanRef.current(clean);
            return true;
          }
          return false;
        };

        const tick = (now: number) => {
          if (cancelled || hasScannedRef.current) return;
          const vid = videoRef.current;

          if (vid && vid.readyState >= vid.HAVE_CURRENT_DATA && now - lastScanAt >= 85) {
            lastScanAt = now;

            if (nativeDetector && !nativeBusy) {
              nativeBusy = true;
              nativeDetector
                .detect(vid)
                .then((codes) => {
                  if (cancelled || hasScannedRef.current) return;
                  for (const code of codes) {
                    if (code.rawValue && handleDecoded(code.rawValue)) {
                      return;
                    }
                  }
                })
                .catch(() => {
                  // Fall back to jsQR if BarcodeDetector fails on this device
                  nativeDetector = null;
                })
                .finally(() => {
                  nativeBusy = false;
                });
            } else if (!nativeDetector) {
              const canvas = canvasRef.current;
              if (canvas) {
                const vw = vid.videoWidth;
                const vh = vid.videoHeight;
                if (vw > 0 && vh > 0) {
                  // Cap decode canvas at 900px max side for fast & sharp jsQR decoding
                  const scale = Math.min(1, 900 / Math.max(vw, vh));
                  const w = Math.max(1, Math.round(vw * scale));
                  const h = Math.max(1, Math.round(vh * scale));
                  canvas.width = w;
                  canvas.height = h;
                  const ctx = canvas.getContext('2d', { willReadFrequently: true });
                  if (ctx) {
                    ctx.drawImage(vid, 0, 0, w, h);
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const decoded = jsQR(imgData.data, w, h, {
                      inversionAttempts: 'attemptBoth',
                    });
                    if (decoded?.data && handleDecoded(decoded.data)) {
                      return;
                    }
                  }
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
            'Kamera ditolak atau sedang dipakai jendela lain (Split-Screen). Gunakan Tempel Kode Manual di bawah.',
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
          className="text-xs font-medium text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 transition-colors shrink-0"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          <span>{manualOpen ? 'Tutup Manual' : 'Tempel Kode Manual'}</span>
        </button>
      </div>

      {/* Camera Viewport */}
      {!cameraError && (
        <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-700/80 aspect-square max-h-[250px] w-full mx-auto">
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

      {/* Manual Paste Fallback (works offline, on laptops, or in Android split-screen) */}
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
