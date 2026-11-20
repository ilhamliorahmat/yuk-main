'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  CheckCircle2,
  Copy,
  Monitor,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  UserPlus,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import {
  getLocalLanProfile,
  saveLocalLanNickname,
} from '@/lib/lan/lan-protocol';
import { lanRuntime, type LanPeerConnectionInfo } from '@/lib/lan/lan-runtime';
import { QrScannerBox } from './QrScannerBox';

interface HostPairingProps {
  mode: 'host';
  roomCode: string;
  onClose: () => void;
}

interface GuestPairingProps {
  mode: 'guest';
  initialStageDisplay?: boolean;
  onClose: () => void;
  onConnected: (roomId: string, isStageDisplay: boolean) => void;
}

export type LanPairingModalProps = HostPairingProps | GuestPairingProps;

function QrCodeCanvas({ value }: { value: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    void QRCode.toCanvas(canvas, value, {
      width: 248,
      margin: 2,
      errorCorrectionLevel: 'L',
      color: { dark: '#0B1018', light: '#FFFFFF' },
    }).catch(() => {});
  }, [value]);

  return (
    <div className="inline-flex p-3 rounded-2xl bg-white shadow-lg">
      <canvas ref={canvasRef} className="block rounded-md max-w-full h-auto" />
    </div>
  );
}

export function LanPairingModal(props: LanPairingModalProps) {
  if (props.mode === 'host') {
    return <HostLanPairingModal roomCode={props.roomCode} onClose={props.onClose} />;
  }
  return (
    <GuestLanPairingModal
      initialStageDisplay={props.initialStageDisplay}
      onClose={props.onClose}
      onConnected={props.onConnected}
    />
  );
}

// ============================================================================
// HOST MODE: Generates Offer QR -> Scans Guest Answer QR -> Peer joins LAN!
// ============================================================================
function HostLanPairingModal({
  roomCode,
  onClose,
}: {
  roomCode: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'offer' | 'scan_answer' | 'paired'>('offer');
  const [slotId, setSlotId] = useState<string | null>(null);
  const [offerCode, setOfferCode] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastPairedName, setLastPairedName] = useState<string>('');
  const [peers, setPeers] = useState<LanPeerConnectionInfo[]>(() =>
    lanRuntime.getConnectedPeersInfo(),
  );

  const activeSlotRef = useRef<string | null>(null);

  useEffect(() => {
    return lanRuntime.subscribe(() => {
      setPeers(lanRuntime.getConnectedPeersInfo());
    });
  }, []);

  const prepareFreshOffer = useCallback(async () => {
    if (activeSlotRef.current) {
      lanRuntime.cancelHostSlot(activeSlotRef.current);
      activeSlotRef.current = null;
    }
    setBusy(true);
    setErrorMsg(null);
    setStep('offer');
    try {
      const slot = await lanRuntime.createHostOfferSlot();
      activeSlotRef.current = slot.slotId;
      setSlotId(slot.slotId);
      setOfferCode(slot.offerCode);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal menyiapkan QR LAN. Pastikan Wi-Fi/Hotspot aktif.',
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void prepareFreshOffer();
    return () => {
      // Cancel unfinished pairing slot if closed before connecting
      const currentId = activeSlotRef.current;
      if (currentId) {
        const info = lanRuntime.getConnectedPeersInfo().find((p) => p.slotId === currentId);
        if (info && info.state === 'pairing') {
          lanRuntime.cancelHostSlot(currentId);
        }
      }
    };
  }, [prepareFreshOffer]);

  const handleAnswerScanned = async (answerCode: string) => {
    if (!slotId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { peerName } = await lanRuntime.acceptGuestAnswer(slotId, answerCode);
      activeSlotRef.current = null;
      setLastPairedName(peerName);
      setStep('paired');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyambungkan pemain LAN.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyOffer = async () => {
    if (!offerCode) return;
    try {
      await navigator.clipboard.writeText(offerCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const connectedCount = peers.filter((p) => p.state === 'connected').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-host-modal-title"
    >
      <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id="lan-host-modal-title" className="text-base font-bold text-white">
                Undang Teman via LAN Party ({roomCode})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tanpa internet · {connectedCount} perangkat terhubung via Wi-Fi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal undangan LAN"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            disabled={busy || step === 'paired'}
            onClick={() => setStep('offer')}
            className={`min-h-[38px] px-3 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              step === 'offer'
                ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                : 'bg-[#0B1018] border-slate-800 text-slate-400'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>1. Teman Scan QR Ini</span>
          </button>
          <button
            type="button"
            disabled={busy || !offerCode || step === 'paired'}
            onClick={() => setStep('scan_answer')}
            className={`min-h-[38px] px-3 rounded-xl border font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              step === 'scan_answer'
                ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                : 'bg-[#0B1018] border-slate-800 text-slate-400'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>2. Host Scan Balik</span>
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: SHOW OFFER QR */}
        {step === 'offer' && (
          <div className="space-y-4 text-center">
            {busy ? (
              <div className="py-12 text-xs text-slate-400">
                Mengumpulkan alamat Wi-Fi lokal...
              </div>
            ) : offerCode ? (
              <>
                <QrCodeCanvas value={offerCode} />
                <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                  Minta 1 teman membuka <strong className="text-white">Mode LAN Party → Gabung LAN</strong>, lalu arahkan kameranya ke QR di atas.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep('scan_answer')}
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <ScanLine className="w-4 h-4" />
                    <span>Lanjut: Scan QR Jawaban Teman</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyOffer()}
                    className="min-h-[46px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copied ? 'Tersalin' : 'Salin Kode'}</span>
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void prepareFreshOffer()}
                className="min-h-[44px] px-4 rounded-xl bg-amber-400 text-slate-950 font-semibold text-sm inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Coba Buat QR Lagi</span>
              </button>
            )}
          </div>
        )}

        {/* STEP 2: SCAN GUEST ANSWER QR */}
        {step === 'scan_answer' && (
          <div className="space-y-4">
            <QrScannerBox
              label="Arahkan kamera Host ke QR Jawaban di HP teman"
              onScan={(code) => void handleAnswerScanned(code)}
              disabled={busy}
              pastePlaceholder="Tempel kode Jawaban (YMLAN1:...) dari teman di sini"
            />
            {busy && (
              <p className="text-xs text-amber-300 text-center font-medium">
                Menyambungkan koneksi langsung lewat Wi-Fi lokal...
              </p>
            )}
          </div>
        )}

        {/* STEP 3: PAIRED SUCCESS */}
        {step === 'paired' && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/35 p-5 text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">
                {lastPairedName} Terhubung via Wi-Fi LAN!
              </h3>
              <p className="text-xs text-slate-300">
                Perangkat sudah tersambung langsung tanpa internet. Mau undang teman lagi atau langsung mulai?
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => void prepareFreshOffer()}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Undang Pemain Lain</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-white font-semibold text-sm transition-colors"
              >
                Selesai &amp; Kembali ke Lobi
              </button>
            </div>
          </div>
        )}

        {/* Connected Peers Summary */}
        {connectedCount > 0 && (
          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Perangkat Tersambung ({connectedCount})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {peers
                .filter((p) => p.state === 'connected')
                .map((p) => (
                  <span
                    key={p.slotId}
                    className="px-2.5 py-1 rounded-lg bg-[#131A24] border border-slate-700 text-xs text-slate-200 font-medium inline-flex items-center gap-1.5"
                  >
                    {p.isStageDisplay ? (
                      <Monitor className="w-3 h-3 text-amber-400" />
                    ) : (
                      <Radio className="w-3 h-3 text-emerald-400" />
                    )}
                    <span>{p.displayName}</span>
                  </span>
                ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 leading-relaxed text-center">
          Tip: Pastikan semua HP tersambung ke Wi-Fi atau Hotspot HP yang sama (kuota data boleh dimatikan).
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// GUEST / STAGE MODE: Scans Host Offer QR -> Shows Answer QR -> Auto-enters Room!
// ============================================================================
function GuestLanPairingModal({
  initialStageDisplay = false,
  onClose,
  onConnected,
}: {
  initialStageDisplay?: boolean;
  onClose: () => void;
  onConnected: (roomId: string, isStageDisplay: boolean) => void;
}) {
  const initialProfile = getLocalLanProfile();
  const [nickname, setNickname] = useState(initialProfile.displayName);
  const [isStageDisplay, setIsStageDisplay] = useState(initialStageDisplay);
  const [step, setStep] = useState<'scan_offer' | 'show_answer'>('scan_offer');
  const [answerCode, setAnswerCode] = useState('');
  const [hostInfo, setHostInfo] = useState<{ hostName: string; roomCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancelPairingRef = useRef<(() => void) | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!connectedRef.current && cancelPairingRef.current) {
        cancelPairingRef.current();
      }
    };
  }, []);

  const handleOfferScanned = async (offerCode: string) => {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const savedProfile = saveLocalLanNickname(nickname);
      const session = await lanRuntime.createGuestAnswerFromOffer({
        offerCode,
        uid: savedProfile.uid,
        displayName: isStageDisplay ? 'Layar Panggung' : savedProfile.displayName,
        avatarColor: savedProfile.avatarColor,
        isStageDisplay,
      });

      cancelPairingRef.current = session.cancel;
      setAnswerCode(session.answerCode);
      setHostInfo({ hostName: session.hostName, roomCode: session.roomCode });
      setStep('show_answer');
      setBusy(false);

      const { roomId } = await session.waitForConnected();
      connectedRef.current = true;
      cancelPairingRef.current = null;
      onConnected(roomId, isStageDisplay);
    } catch (err) {
      setBusy(false);
      if (!connectedRef.current) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal memproses QR Host LAN. Coba scan ulang.',
        );
      }
    }
  };

  const handleCopyAnswer = async () => {
    if (!answerCode) return;
    try {
      await navigator.clipboard.writeText(answerCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleBackToScan = () => {
    if (cancelPairingRef.current) {
      cancelPairingRef.current();
      cancelPairingRef.current = null;
    }
    setAnswerCode('');
    setHostInfo(null);
    setErrorMsg(null);
    setStep('scan_offer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-guest-modal-title"
    >
      <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
              {isStageDisplay ? (
                <Monitor className="w-5 h-5 text-amber-400" />
              ) : (
                <Wifi className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <h2 id="lan-guest-modal-title" className="text-base font-bold text-white">
                {isStageDisplay ? 'Hubungkan Layar Panggung LAN' : 'Gabung LAN Party (Tanpa Internet)'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tersambung langsung ke HP Host lewat Wi-Fi/Hotspot lokal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal gabung LAN"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* STEP 1: NICKNAME + ROLE + SCAN HOST OFFER QR */}
        {step === 'scan_offer' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsStageDisplay(false)}
                className={`min-h-[40px] px-3 rounded-xl border font-semibold transition-colors ${
                  !isStageDisplay
                    ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400'
                }`}
              >
                Ikut Sebagai Pemain
              </button>
              <button
                type="button"
                onClick={() => setIsStageDisplay(true)}
                className={`min-h-[40px] px-3 rounded-xl border font-semibold transition-colors ${
                  isStageDisplay
                    ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400'
                }`}
              >
                Layar Panggung (TV)
              </button>
            </div>

            {!isStageDisplay && (
              <div className="space-y-1.5">
                <label
                  htmlFor="lan-guest-nickname"
                  className="text-xs font-medium text-slate-300"
                >
                  Nama Panggilanmu
                </label>
                <input
                  id="lan-guest-nickname"
                  type="text"
                  maxLength={32}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Contoh: Dimas"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 focus:border-amber-400/70 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            )}

            <QrScannerBox
              label="Langkah 1: Scan QR Undangan di HP Host"
              onScan={(code) => void handleOfferScanned(code)}
              disabled={busy}
              pastePlaceholder="Tempel kode Undangan (YMLAN1:...) dari Host di sini"
            />
          </div>
        )}

        {/* STEP 2: SHOW ANSWER QR & WAIT FOR HOST TO SCAN BACK */}
        {step === 'show_answer' && (
          <div className="space-y-4 text-center">
            <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 text-xs text-amber-200">
              Ruang <strong className="font-mono text-white">{hostInfo?.roomCode}</strong> (Host:{' '}
              <strong className="text-white">{hostInfo?.hostName}</strong>) terdeteksi!
            </div>

            <QrCodeCanvas value={answerCode} />

            <div className="space-y-1">
              <p className="text-sm font-bold text-white">
                Langkah 2: Tunjukkan QR ini ke HP Host
              </p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                Begitu Host selesai memindai QR ini, kamu akan otomatis masuk ke ruang permainan lewat Wi-Fi lokal!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => void handleCopyAnswer()}
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Kode Jawaban Tersalin' : 'Salin Kode Jawaban (Manual)'}</span>
              </button>
              <button
                type="button"
                onClick={handleBackToScan}
                className="min-h-[44px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-semibold transition-colors"
              >
                Scan Ulang
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
