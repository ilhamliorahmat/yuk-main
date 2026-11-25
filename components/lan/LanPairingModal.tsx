'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Hash,
  Monitor,
  QrCode,
  Radio,
  RefreshCw,
  ScanLine,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  getLocalLanProfile,
  saveLocalLanNickname,
  type LanQuickCodeStatus,
  type LanSdpDiagnostics,
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
  initialRoomCode?: string;
  initialMethod?: 'code' | 'qr';
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
      width: 264,
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

function DiagnosticsStrip({
  diagnostics,
  iceState,
}: {
  diagnostics: LanSdpDiagnostics | null;
  iceState?: RTCIceConnectionState;
}) {
  if (!diagnostics) return null;
  const toneClasses =
    diagnostics.tone === 'ok'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
      : diagnostics.tone === 'warn'
        ? 'bg-amber-500/10 border-amber-400/35 text-amber-200'
        : 'bg-rose-500/10 border-rose-500/35 text-rose-200';

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] flex items-center justify-between gap-2 text-left ${toneClasses}`}
    >
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Activity className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{diagnostics.summary}</span>
      </span>
      {iceState && iceState !== 'new' && (
        <span className="font-mono uppercase text-[10px] opacity-80 shrink-0">
          ICE: {iceState}
        </span>
      )}
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
      initialRoomCode={props.initialRoomCode}
      initialMethod={props.initialMethod}
      onClose={props.onClose}
      onConnected={props.onConnected}
    />
  );
}

// ============================================================================
// HOST MODE: Quick-Code 6-Char Mailbox (Wi-Fi) + Offline 2-Way QR (0% Internet)
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
  const [diagnostics, setDiagnostics] = useState<LanSdpDiagnostics | null>(null);
  const [busy, setBusy] = useState<boolean>(true);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedOffer, setCopiedOffer] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastPairedName, setLastPairedName] = useState<string>('');
  const [peers, setPeers] = useState<LanPeerConnectionInfo[]>(() =>
    lanRuntime.getConnectedPeersInfo(),
  );
  const [quickCodeInfo, setQuickCodeInfo] = useState<{
    status: LanQuickCodeStatus;
    error: string | null;
  }>(() => lanRuntime.getQuickCodeStatus());

  const activeSlotRef = useRef<string | null>(null);

  useEffect(() => {
    lanRuntime.setHostInviteModalOpen(true);
    const unsub = lanRuntime.subscribe(() => {
      setPeers(lanRuntime.getConnectedPeersInfo());
      setQuickCodeInfo(lanRuntime.getQuickCodeStatus());
    });
    return () => {
      unsub();
      lanRuntime.setHostInviteModalOpen(false);
    };
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
      setDiagnostics(slot.diagnostics);
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
    let cancelled = false;

    lanRuntime
      .createHostOfferSlot()
      .then((slot) => {
        if (cancelled) {
          lanRuntime.cancelHostSlot(slot.slotId);
          return;
        }
        activeSlotRef.current = slot.slotId;
        setSlotId(slot.slotId);
        setOfferCode(slot.offerCode);
        setDiagnostics(slot.diagnostics);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'Gagal menyiapkan QR LAN. Pastikan Wi-Fi/Hotspot aktif.',
        );
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
      const currentId = activeSlotRef.current;
      if (currentId) {
        const info = lanRuntime.getConnectedPeersInfo().find((p) => p.slotId === currentId);
        if (info && info.state === 'pairing') {
          lanRuntime.cancelHostSlot(currentId);
        }
      }
    };
  }, []);

  const handleAnswerScanned = async (answerCode: string) => {
    if (!slotId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { peerName } = await lanRuntime.acceptGuestAnswer(slotId, answerCode);
      activeSlotRef.current = null;
      setSlotId(null);
      setLastPairedName(peerName);
      setStep('paired');
    } catch (err) {
      // Slot was cleanly torn down by lanRuntime on error; reset slotId so retry generates fresh QR
      activeSlotRef.current = null;
      setSlotId(null);
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyambungkan pemain LAN.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleCopyOffer = async () => {
    if (!offerCode) return;
    try {
      await navigator.clipboard.writeText(offerCode);
      setCopiedOffer(true);
      window.setTimeout(() => setCopiedOffer(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const connectedPeers = peers.filter((p) => p.state === 'connected');
  const activeSlotInfo = slotId ? peers.find((p) => p.slotId === slotId) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-host-modal-title"
    >
      <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id="lan-host-modal-title" className="text-base font-bold text-white">
                Undang Teman ke LAN Party
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Gameplay 100% P2P lokal · {connectedPeers.length} perangkat terhubung
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

        {/* Fast 6-Letter Quick-Code Card (Works on Home Wi-Fi & Split-Screen) */}
        <div className="rounded-2xl bg-[#0B1018] border border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-amber-400" />
                <span>Kode Cepat LAN (Tanpa Scan QR)</span>
              </p>
              <p className="font-mono text-2xl font-black tracking-[0.22em] text-white">
                {roomCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyRoomCode()}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400/60 text-xs font-semibold text-slate-200 inline-flex items-center gap-1.5 transition-colors shrink-0"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCode ? 'Tersalin' : 'Salin'}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px]">
            {quickCodeInfo.status === 'ready' ? (
              <span className="text-emerald-300 inline-flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Aktif! Teman cukup ketik <strong className="font-mono">{roomCode}</strong> di tab LAN Party.
                </span>
              </span>
            ) : quickCodeInfo.status === 'registering' ? (
              <span className="text-amber-300">Mengaktifkan Kode Cepat Wi-Fi...</span>
            ) : (
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-slate-400 inline-flex items-center gap-1.5">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>
                    Mode 0% Internet aktif — pakai QR / Salin Kode di bawah (Kode 6 huruf tetap bisa untuk 2 tab di 1 HP).
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => lanRuntime.retryRegisterQuickCode()}
                  className="text-amber-300 hover:text-amber-200 font-semibold shrink-0"
                >
                  Coba Lagi
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Diagnostics Strip */}
        <DiagnosticsStrip diagnostics={diagnostics} iceState={activeSlotInfo?.iceState} />

        {/* Offline 2-Way QR Section */}
        <div className="pt-1 space-y-3">
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
              <span>1. QR Offline (0% Net)</span>
            </button>
            <button
              type="button"
              disabled={busy || !offerCode || !slotId || step === 'paired'}
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
            <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200 space-y-2">
              <p>{errorMsg}</p>
              {!slotId && (
                <button
                  type="button"
                  onClick={() => void prepareFreshOffer()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-semibold text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Buat QR Baru</span>
                </button>
              )}
            </div>
          )}

          {/* STEP 1: SHOW OFFER QR */}
          {step === 'offer' && (
            <div className="space-y-3.5 text-center">
              {busy ? (
                <div className="py-10 text-xs text-slate-400">
                  Mengumpulkan alamat Wi-Fi lokal...
                </div>
              ) : offerCode ? (
                <>
                  <QrCodeCanvas value={offerCode} />
                  <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                    Untuk kondisi <strong className="text-white">tanpa internet sama sekali</strong>: minta teman scan QR ini di tab <strong className="text-white">Scan QR / Manual</strong>.
                  </p>

                  <div className="flex flex-col sm:flex-row items-stretch gap-2">
                    <button
                      type="button"
                      disabled={!slotId}
                      onClick={() => setStep('scan_answer')}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                    >
                      <ScanLine className="w-4 h-4" />
                      <span>Lanjut: Scan QR Jawaban</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyOffer()}
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {copiedOffer ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      <span>{copiedOffer ? 'Tersalin' : 'Salin Kode QR'}</span>
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
                  <span>Buat QR Undangan</span>
                </button>
              )}
            </div>
          )}

          {/* STEP 2: SCAN GUEST ANSWER QR */}
          {step === 'scan_answer' && (
            <div className="space-y-3">
              <QrScannerBox
                label="Arahkan kamera Host ke QR Jawaban di HP teman"
                onScan={(code) => void handleAnswerScanned(code)}
                disabled={busy || !slotId}
                pastePlaceholder="Tempel kode Jawaban (YMLAN1:... / YMLAN0:...) dari teman di sini"
              />
              {busy && (
                <p className="text-xs text-amber-300 text-center font-medium">
                  Menyambungkan jalur langsung lewat Wi-Fi lokal...
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
                  Koneksi langsung sudah aktif tanpa beban server. Undang pemain lain atau mulai bermain!
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
                  Kembali ke Lobi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Connected Peers Summary (Auto-updates for both Quick-Code & QR joins) */}
        {connectedPeers.length > 0 && (
          <div className="rounded-xl bg-[#0B1018] border border-slate-800 p-3.5 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Perangkat Tersambung ({connectedPeers.length})</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {connectedPeers.map((p) => (
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
      </div>
    </div>
  );
}

// ============================================================================
// GUEST / STAGE MODE: Tab 1 (6-Letter Quick-Code) + Tab 2 (Offline 2-Way QR)
// ============================================================================
function GuestLanPairingModal({
  initialStageDisplay = false,
  initialRoomCode = '',
  initialMethod = 'code',
  onClose,
  onConnected,
}: {
  initialStageDisplay?: boolean;
  initialRoomCode?: string;
  initialMethod?: 'code' | 'qr';
  onClose: () => void;
  onConnected: (roomId: string, isStageDisplay: boolean) => void;
}) {
  const initialProfile = getLocalLanProfile();
  const [nickname, setNickname] = useState(initialProfile.displayName);
  const [isStageDisplay, setIsStageDisplay] = useState(initialStageDisplay);
  const [method, setMethod] = useState<'code' | 'qr'>(() => {
    if (initialRoomCode.trim().length > 0) return 'code';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'qr';
    return initialMethod;
  });
  const [quickCode, setQuickCode] = useState(initialRoomCode.toUpperCase());
  const [progressText, setProgressText] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<LanSdpDiagnostics | null>(null);

  // Offline QR state
  const [qrStep, setQrStep] = useState<'scan_offer' | 'show_answer'>('scan_offer');
  const [answerCode, setAnswerCode] = useState('');
  const [hostInfo, setHostInfo] = useState<{ hostName: string; roomCode: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancelPairingRef = useRef<(() => void) | null>(null);
  const abortQuickRef = useRef<AbortController | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!connectedRef.current) {
        abortQuickRef.current?.abort();
        cancelPairingRef.current?.();
      }
    };
  }, []);

  const handleQuickCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCode = quickCode.trim().toUpperCase();
    if (cleanedCode.length !== 6 || busy) return;

    setBusy(true);
    setErrorMsg(null);
    setProgressText('Menyiapkan koneksi LAN...');
    setDiagnostics(null);

    const controller = new AbortController();
    abortQuickRef.current = controller;

    try {
      const savedProfile = saveLocalLanNickname(nickname);
      const { roomId, diagnostics: diag } = await lanRuntime.joinLanRoomByQuickCode({
        roomCode: cleanedCode,
        uid: savedProfile.uid,
        displayName: isStageDisplay ? 'Layar Panggung' : savedProfile.displayName,
        avatarColor: savedProfile.avatarColor,
        isStageDisplay,
        signal: controller.signal,
        onProgress: (text, d) => {
          setProgressText(text);
          if (d) setDiagnostics(d);
        },
      });
      setDiagnostics(diag);
      connectedRef.current = true;
      abortQuickRef.current = null;
      onConnected(roomId, isStageDisplay);
    } catch (err) {
      setBusy(false);
      setProgressText('');
      if (!connectedRef.current) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Gagal bergabung ke ruang LAN.',
        );
      }
    }
  };

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
      setDiagnostics(session.diagnostics);
      setHostInfo({ hostName: session.hostName, roomCode: session.roomCode });
      setQrStep('show_answer');
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
    setDiagnostics(null);
    setErrorMsg(null);
    setQrStep('scan_offer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lan-guest-modal-title"
    >
      <div className="w-full sm:max-w-lg bg-[#131A24] border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto">
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
                {isStageDisplay ? 'Hubungkan Layar Panggung LAN' : 'Gabung LAN Party'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tersambung langsung ke HP Host lewat Wi-Fi / Hotspot lokal
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

        {/* Role Switcher + Nickname (shown before QR Answer step) */}
        {qrStep === 'scan_offer' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsStageDisplay(false)}
                className={`min-h-[38px] px-3 rounded-xl border font-semibold transition-colors ${
                  !isStageDisplay
                    ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400'
                }`}
              >
                Ikut Sebagai Pemain
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsStageDisplay(true)}
                className={`min-h-[38px] px-3 rounded-xl border font-semibold transition-colors ${
                  isStageDisplay
                    ? 'bg-amber-500/15 border-amber-400/60 text-amber-200'
                    : 'bg-[#0B1018] border-slate-800 text-slate-400'
                }`}
              >
                Layar Panggung (TV)
              </button>
            </div>

            {!isStageDisplay && (
              <div className="space-y-1">
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
                  disabled={busy}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Contoh: Dimas"
                  className="w-full min-h-[42px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 focus:border-amber-400/70 text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            )}

            {/* Method Switcher: Quick-Code vs Offline QR */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0B1018] border border-slate-800 text-xs">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setErrorMsg(null);
                  setMethod('code');
                }}
                className={`min-h-[36px] px-2.5 rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  method === 'code'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Kode 6 Huruf (Cepat)</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setErrorMsg(null);
                  setMethod('qr');
                }}
                className={`min-h-[36px] px-2.5 rounded-lg font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  method === 'qr'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR / Manual (0% Net)</span>
              </button>
            </div>
          </div>
        )}

        <DiagnosticsStrip diagnostics={diagnostics} />

        {errorMsg && (
          <div className="rounded-xl bg-rose-950/60 border border-rose-800/70 px-3.5 py-2.5 text-xs text-rose-200 leading-relaxed">
            {errorMsg}
          </div>
        )}

        {/* METHOD 1: 6-LETTER QUICK CODE */}
        {method === 'code' && qrStep === 'scan_offer' && (
          <form onSubmit={(e) => void handleQuickCodeSubmit(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="lan-quick-code" className="text-xs font-medium text-slate-300">
                Masukkan Kode 6 Huruf dari HP Host
              </label>
              <input
                id="lan-quick-code"
                type="text"
                maxLength={6}
                disabled={busy}
                value={quickCode}
                onChange={(e) =>
                  setQuickCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                placeholder="CONTOH: K9M2P4"
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 focus:border-amber-400/70 text-white font-mono text-lg tracking-[0.22em] uppercase text-center placeholder:text-slate-500 placeholder:tracking-normal placeholder:text-sm focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy || quickCode.trim().length !== 6}
              className="w-full min-h-[46px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>{busy ? progressText || 'Menyambungkan...' : 'Gabung Ruang LAN'}</span>
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>

            <p className="text-[11px] text-slate-400 leading-relaxed text-center">
              Cocok untuk Wi-Fi rumah &amp; Split-Screen (tanpa kamera). Setelah tersambung, semua permainan berjalan langsung antar-HP lewat Wi-Fi lokal.
            </p>
          </form>
        )}

        {/* METHOD 2: OFFLINE 2-WAY QR */}
        {method === 'qr' && qrStep === 'scan_offer' && (
          <QrScannerBox
            label="Langkah 1: Scan QR Undangan di HP Host"
            onScan={(code) => void handleOfferScanned(code)}
            disabled={busy}
            pastePlaceholder="Tempel kode Undangan (YMLAN1:... / YMLAN0:...) dari Host di sini"
          />
        )}

        {qrStep === 'show_answer' && (
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
