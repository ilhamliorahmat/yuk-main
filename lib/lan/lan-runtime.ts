import type { GameType } from '../games/types';
import { apiFetch, buildPhpApiUrl } from '../platform/api-client';
import { LanHostAuthority } from './lan-host-authority';
import type {
  LanActionName,
  LanHostMessage,
  LanPeerMessage,
  LanQuickCodeStatus,
  LanRoomSnapshot,
  LanSdpDiagnostics,
} from './lan-protocol';
import {
  createLanPeerConnection,
  createZeroInternetPeerConnection,
  decodeLanSignal,
  encodeLanSignal,
  inspectLanSdpCandidates,
  setLocalDescriptionAndGatherIce,
  warmUpLocalIpPermission,
} from './lan-signaling';

export interface LanPeerConnectionInfo {
  slotId: string;
  peerUid: string;
  displayName: string;
  isStageDisplay: boolean;
  state: 'pairing' | 'connecting' | 'connected' | 'disconnected';
  iceState?: RTCIceConnectionState;
}

interface HostPeerSlot {
  slotId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  peerUid: string;
  displayName: string;
  isStageDisplay: boolean;
  state: 'pairing' | 'connecting' | 'connected' | 'disconnected';
  iceState: RTCIceConnectionState;
}

interface PendingActionPromise {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingPhpLanRequest {
  requestId: string;
  guestUid: string;
  displayName: string;
  avatarColor: string;
  isStageDisplay: boolean;
  offerCode: string;
  createdAtMs: number;
}

type BroadcastSignalMessage =
  | {
      kind: 'LAN_BC_OFFER';
      roomCode: string;
      requestId: string;
      guestUid: string;
      displayName: string;
      avatarColor: string;
      isStageDisplay: boolean;
      offerCode: string;
    }
  | {
      kind: 'LAN_BC_ANSWER';
      roomCode: string;
      requestId: string;
      answerCode: string;
      hostName: string;
    };

type RuntimeListener = () => void;

const LAN_BROADCAST_CHANNEL = 'yukmain-lan-signal-v1';
const HOST_POLL_INTERVAL_MS = 1800;
const GUEST_POLL_INTERVAL_MS = 900;
const HANDSHAKE_TIMEOUT_MS = 15000;

/**
 * Browser-side WebRTC LAN Party Runtime.
 *
 * Supports 3 seamless pairing transports over the exact same direct P2P DataChannel:
 * 1. Zero-Internet 2-Way QR / Manual Copy-Paste (0% internet, 0 DB calls).
 * 2. Ephemeral 6-Letter Quick-Code via InfinityFree PHP MySQL mailbox (~2s handshake, 0 DB calls during play).
 * 3. Same-Browser BroadcastChannel (instant split-screen / dual-tab testing with 0 server & 0 camera).
 */
class LanPartyRuntime {
  private role: 'idle' | 'host' | 'guest' = 'idle';
  private roomId: string | null = null;
  private localUid: string = '';
  private isStageDisplay: boolean = false;

  // Host state
  private authority: LanHostAuthority | null = null;
  private hostSlots: Map<string, HostPeerSlot> = new Map();
  private hostQuickCodeStatus: LanQuickCodeStatus = 'idle';
  private hostQuickCodeError: string | null = null;
  private hostSignalSecret: string | null = null;
  private hostPollTimer: ReturnType<typeof setTimeout> | null = null;
  private hostPollInFlight: boolean = false;
  private hostInviteModalOpen: boolean = false;
  private handledRequestIds: Set<string> = new Set();
  private hostBroadcastChannel: BroadcastChannel | null = null;

  // Guest state
  private guestPc: RTCPeerConnection | null = null;
  private guestDc: RTCDataChannel | null = null;
  private guestSnapshot: LanRoomSnapshot | null = null;
  private guestRoomClosed: boolean = false;
  private pendingRequests: Map<string, PendingActionPromise> = new Map();

  private listeners: Set<RuntimeListener> = new Set();

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber error
      }
    }
  }

  getActiveRoomId(): string | null {
    return this.roomId;
  }

  getRole(): 'idle' | 'host' | 'guest' {
    return this.role;
  }

  getQuickCodeStatus(): { status: LanQuickCodeStatus; error: string | null } {
    return {
      status: this.hostQuickCodeStatus,
      error: this.hostQuickCodeError,
    };
  }

  setHostInviteModalOpen(open: boolean): void {
    this.hostInviteModalOpen = open;
    if (open && this.role === 'host' && this.authority) {
      if (this.hostQuickCodeStatus === 'ready' && !this.hostPollTimer) {
        this.scheduleHostMailboxPoll(300);
      } else if (this.hostQuickCodeStatus === 'offline' || this.hostQuickCodeStatus === 'idle') {
        void this.registerHostQuickCodeMailbox();
      }
    }
  }

  retryRegisterQuickCode(): void {
    if (this.role !== 'host' || !this.authority) return;
    void this.registerHostQuickCodeMailbox();
  }

  isRoomMissing(roomId: string): boolean {
    if (this.roomId !== roomId) return true;
    if (this.role === 'guest' && this.guestRoomClosed) return true;
    return false;
  }

  getConnectedPeersInfo(): LanPeerConnectionInfo[] {
    return Array.from(this.hostSlots.values()).map((slot) => ({
      slotId: slot.slotId,
      peerUid: slot.peerUid,
      displayName: slot.displayName,
      isStageDisplay: slot.isStageDisplay,
      state: slot.state,
      iceState: slot.iceState,
    }));
  }

  /**
   * Starts a brand-new LAN Party room as the Host device.
   * Immediately works offline (QR/Paste), and also registers the ephemeral 6-letter
   * Quick-Code mailbox in the background if InfinityFree PHP is reachable.
   */
  startHostRoom(params: {
    hostUid: string;
    hostName: string;
    avatarColor: string;
    gameType: GameType;
  }): { roomId: string; code: string } {
    this.teardown();

    this.authority = new LanHostAuthority(params);
    this.role = 'host';
    this.roomId = this.authority.getRoomId();
    this.localUid = params.hostUid;
    this.isStageDisplay = false;
    this.hostQuickCodeStatus = 'idle';
    this.hostQuickCodeError = null;
    this.hostSignalSecret = null;
    this.handledRequestIds.clear();

    this.startHostBroadcastListener();
    void this.registerHostQuickCodeMailbox();
    this.emit();

    return {
      roomId: this.authority.getRoomId(),
      code: this.authority.getRoom().code,
    };
  }

  private startHostBroadcastListener(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel(LAN_BROADCAST_CHANNEL);
      this.hostBroadcastChannel = bc;
      bc.onmessage = (event: MessageEvent<BroadcastSignalMessage>) => {
        const msg = event.data;
        if (!msg || msg.kind !== 'LAN_BC_OFFER' || !this.authority || this.role !== 'host') {
          return;
        }
        const room = this.authority.getRoom();
        if (msg.roomCode !== room.code) return;
        if (this.handledRequestIds.has(msg.requestId)) return;
        this.handledRequestIds.add(msg.requestId);

        void this.acceptGuestInitiatedOffer({
          offerCode: msg.offerCode,
          guestUid: msg.guestUid,
          displayName: msg.displayName,
          isStageDisplay: msg.isStageDisplay,
          useStun: false,
        })
          .then(({ answerCode }) => {
            const hostPlayer = this.authority
              ?.getPlayersList()
              .find((p) => p.uid === room.hostUid);
            const reply: BroadcastSignalMessage = {
              kind: 'LAN_BC_ANSWER',
              roomCode: room.code,
              requestId: msg.requestId,
              answerCode,
              hostName: hostPlayer?.displayName ?? 'Host',
            };
            bc.postMessage(reply);
          })
          .catch(() => {
            this.handledRequestIds.delete(msg.requestId);
          });
      };
    } catch {
      // BroadcastChannel unavailable
    }
  }

  private shouldPollHostMailbox(): boolean {
    if (this.role !== 'host' || !this.authority || !this.hostSignalSecret) return false;
    if (this.hostInviteModalOpen) return true;
    const status = this.authority.getRoom().status;
    return status === 'lobby';
  }

  private async registerHostQuickCodeMailbox(): Promise<void> {
    if (this.role !== 'host' || !this.authority) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.hostQuickCodeStatus = 'offline';
      this.hostQuickCodeError = null;
      this.emit();
      return;
    }

    const room = this.authority.getRoom();
    const hostPlayer = this.authority.getPlayersList().find((p) => p.uid === room.hostUid);
    this.hostQuickCodeStatus = 'registering';
    this.hostQuickCodeError = null;
    this.emit();

    try {
      const res = await apiFetch<{
        ok: boolean;
        roomCode: string;
        hostSecret: string;
      }>(buildPhpApiUrl('lan/register'), {
        method: 'POST',
        body: JSON.stringify({
          roomCode: room.code,
          gameType: room.gameType,
          hostName: hostPlayer?.displayName ?? 'Host LAN',
          hostSecret: this.hostSignalSecret ?? undefined,
        }),
      });

      if (this.role !== 'host' || this.authority?.getRoom().code !== room.code) {
        return;
      }

      this.hostSignalSecret = res.hostSecret;
      this.hostQuickCodeStatus = 'ready';
      this.hostQuickCodeError = null;
      this.emit();
      this.scheduleHostMailboxPoll(600);
    } catch (err) {
      if (this.role !== 'host') return;
      this.hostQuickCodeStatus = 'offline';
      this.hostQuickCodeError =
        err instanceof Error ? err.message : 'Mode Offline Penuh aktif (gunakan QR/Salin Kode).';
      this.emit();
    }
  }

  private scheduleHostMailboxPoll(delayMs = HOST_POLL_INTERVAL_MS): void {
    if (this.hostPollTimer) {
      clearTimeout(this.hostPollTimer);
      this.hostPollTimer = null;
    }
    if (!this.shouldPollHostMailbox()) return;
    this.hostPollTimer = setTimeout(() => {
      this.hostPollTimer = null;
      void this.pollHostMailboxOnce();
    }, delayMs);
  }

  private async pollHostMailboxOnce(): Promise<void> {
    if (!this.shouldPollHostMailbox() || this.hostPollInFlight || !this.authority || !this.hostSignalSecret) {
      return;
    }

    const roomCode = this.authority.getRoom().code;
    const hostSecret = this.hostSignalSecret;
    this.hostPollInFlight = true;

    try {
      const res = await apiFetch<{ ok: boolean; pending?: PendingPhpLanRequest[] }>(
        buildPhpApiUrl('lan/poll'),
        {
          method: 'POST',
          body: JSON.stringify({ roomCode, hostSecret }),
        },
      );

      const pending = Array.isArray(res.pending) ? res.pending : [];
      for (const req of pending) {
        if (this.handledRequestIds.has(req.requestId)) continue;
        this.handledRequestIds.add(req.requestId);

        void this.acceptGuestInitiatedOffer({
          offerCode: req.offerCode,
          guestUid: req.guestUid,
          displayName: req.displayName,
          isStageDisplay: req.isStageDisplay,
          useStun: true,
        })
          .then(async ({ answerCode }) => {
            await apiFetch(buildPhpApiUrl('lan/answer'), {
              method: 'POST',
              body: JSON.stringify({
                roomCode,
                hostSecret,
                requestId: req.requestId,
                answerCode,
              }),
            });
          })
          .catch(() => {
            this.handledRequestIds.delete(req.requestId);
          });
      }
    } catch {
      // Transient Wi-Fi hiccup — stay silent, never disrupt gameplay or offline QR
    } finally {
      this.hostPollInFlight = false;
      if (this.shouldPollHostMailbox()) {
        this.scheduleHostMailboxPoll(HOST_POLL_INTERVAL_MS);
      }
    }
  }

  private attachHostDataChannel(slot: HostPeerSlot, dc: RTCDataChannel): void {
    slot.dc = dc;

    dc.onopen = () => {
      slot.state = 'connected';
      this.broadcastHostSnapshots();
      this.emit();
    };

    dc.onclose = () => {
      slot.state = 'disconnected';
      if (slot.peerUid && this.authority) {
        this.authority.markPeerDisconnected(slot.peerUid, slot.isStageDisplay);
        this.broadcastHostSnapshots();
      }
      this.emit();
    };

    dc.onmessage = (event) => {
      this.handleHostIncomingMessage(slot, String(event.data));
    };

    if (dc.readyState === 'open') {
      slot.state = 'connected';
      this.broadcastHostSnapshots();
      this.emit();
    }
  }

  private attachHostPcListeners(slot: HostPeerSlot): void {
    slot.pc.oniceconnectionstatechange = () => {
      slot.iceState = slot.pc.iceConnectionState;
      this.emit();
    };

    slot.pc.onconnectionstatechange = () => {
      if (slot.pc.connectionState === 'failed' || slot.pc.connectionState === 'disconnected') {
        slot.state = 'disconnected';
        if (slot.peerUid && this.authority) {
          this.authority.markPeerDisconnected(slot.peerUid, slot.isStageDisplay);
          this.broadcastHostSnapshots();
        }
        this.emit();
      }
    };
  }

  /**
   * Host responder for 6-Letter Quick-Code / BroadcastChannel (Guest-Initiated Offer -> Host Answer).
   */
  private async acceptGuestInitiatedOffer(params: {
    offerCode: string;
    guestUid: string;
    displayName: string;
    isStageDisplay: boolean;
    useStun: boolean;
  }): Promise<{ slotId: string; answerCode: string }> {
    if (this.role !== 'host' || !this.authority) {
      throw new Error('Hanya Host LAN yang dapat menerima pemain.');
    }

    const offerPacket = await decodeLanSignal(params.offerCode);
    if (offerPacket.t !== 'O') {
      throw new Error('Paket sinyal bukan Offer yang valid.');
    }

    const slotId = `qslot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const pc = createLanPeerConnection({ useStun: params.useStun });
    const slot: HostPeerSlot = {
      slotId,
      pc,
      dc: null,
      peerUid: params.guestUid,
      displayName: params.displayName,
      isStageDisplay: params.isStageDisplay,
      state: 'connecting',
      iceState: pc.iceConnectionState,
    };
    this.hostSlots.set(slotId, slot);
    this.attachHostPcListeners(slot);

    pc.ondatachannel = (ev) => {
      this.attachHostDataChannel(slot, ev.channel);
    };

    const releaseWarmUp = await warmUpLocalIpPermission();
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offerPacket.s });
      const answer = await pc.createAnswer();
      await setLocalDescriptionAndGatherIce(pc, answer, {
        timeoutMs: 3200,
        waitForStun: params.useStun,
      });
    } catch (err) {
      this.cancelHostSlot(slotId);
      throw err;
    } finally {
      releaseWarmUp();
    }

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.cancelHostSlot(slotId);
      throw new Error('Gagal membuat SDP Jawaban Host.');
    }

    const answerCode = await encodeLanSignal(
      {
        v: 1,
        t: 'A',
        s: localSdp,
      },
      { allowStun: params.useStun },
    );

    this.emit();
    return { slotId, answerCode };
  }

  /**
   * Host Step 1 (Offline 2-Way QR): Creates a fresh WebRTC Offer QR payload for 1 incoming Guest or Layar Panggung.
   */
  async createHostOfferSlot(): Promise<{
    slotId: string;
    offerCode: string;
    diagnostics: LanSdpDiagnostics;
  }> {
    if (this.role !== 'host' || !this.authority) {
      throw new Error('Hanya Host LAN yang bisa membuat QR undangan.');
    }

    const slotId = `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const pc = createZeroInternetPeerConnection();
    const dc = pc.createDataChannel('yukmain-lan', { ordered: true });

    const slot: HostPeerSlot = {
      slotId,
      pc,
      dc,
      peerUid: '',
      displayName: 'Menunggu scan...',
      isStageDisplay: false,
      state: 'pairing',
      iceState: pc.iceConnectionState,
    };
    this.hostSlots.set(slotId, slot);
    this.attachHostDataChannel(slot, dc);
    this.attachHostPcListeners(slot);

    const releaseWarmUp = await warmUpLocalIpPermission();
    try {
      const offer = await pc.createOffer();
      await setLocalDescriptionAndGatherIce(pc, offer, {
        timeoutMs: 3200,
        waitForStun: false,
      });
    } catch (err) {
      this.cancelHostSlot(slotId);
      throw err;
    } finally {
      releaseWarmUp();
    }

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.cancelHostSlot(slotId);
      throw new Error('Gagal membuat SDP lokal WebRTC. Pastikan Wi-Fi/Hotspot aktif.');
    }

    const diagnostics = inspectLanSdpCandidates(localSdp);
    const room = this.authority.getRoom();
    const hostPlayer = this.authority.getPlayersList().find((p) => p.uid === room.hostUid);

    const offerCode = await encodeLanSignal(
      {
        v: 1,
        t: 'O',
        s: localSdp,
        r: room.code,
        g: room.gameType,
        h: hostPlayer?.displayName ?? 'Host',
      },
      { allowStun: false },
    );

    this.emit();
    return { slotId, offerCode, diagnostics };
  }

  /**
   * Host Step 2 (Offline 2-Way QR): Applies Guest's Answer QR and waits up to 15s for DataChannel to open.
   * Cleanly destroys the slot on failure so retries never crash with InvalidStateError.
   */
  async acceptGuestAnswer(slotId: string, answerCode: string): Promise<{ peerName: string }> {
    const slot = this.hostSlots.get(slotId);
    if (!slot || !this.authority) {
      throw new Error('Sesi pairing sudah kedaluwarsa. Klik "Buat QR Baru" lalu scan ulang.');
    }

    if (slot.pc.signalingState !== 'have-local-offer') {
      this.cancelHostSlot(slotId);
      throw new Error('Slot QR sudah terpakai. Buat QR baru untuk menyambungkan teman.');
    }

    const packet = await decodeLanSignal(answerCode);
    if (packet.t !== 'A') {
      throw new Error('QR yang dipindai bukan QR Jawaban Pemain (Answer).');
    }

    slot.state = 'connecting';
    if (packet.u) slot.peerUid = packet.u;
    if (packet.n) slot.displayName = packet.n;
    slot.isStageDisplay = packet.st === 1;
    this.emit();

    try {
      await slot.pc.setRemoteDescription({ type: 'answer', sdp: packet.s });

      await new Promise<void>((resolve, reject) => {
        if (slot.dc && slot.dc.readyState === 'open') {
          resolve();
          return;
        }
        let finished = false;
        const finishOk = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve();
        };
        const finishErr = (msg: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          reject(new Error(msg));
        };

        const timer = setTimeout(() => {
          const iceNow = slot.pc.iceConnectionState;
          finishErr(
            `Koneksi Wi-Fi LAN gagal tersambung (ICE: ${iceNow}). Pastikan kedua HP di Wi-Fi/Hotspot sama, atau gunakan tab Kode 6 Huruf jika Wi-Fi punya internet.`,
          );
        }, HANDSHAKE_TIMEOUT_MS);

        const prevOnOpen = slot.dc?.onopen ?? null;
        if (slot.dc) {
          slot.dc.onopen = (ev) => {
            if (typeof prevOnOpen === 'function') {
              prevOnOpen.call(slot.dc!, ev);
            }
            finishOk();
          };
        }

        slot.pc.addEventListener('iceconnectionstatechange', () => {
          if (slot.pc.iceConnectionState === 'failed') {
            finishErr(
              'Jalur Wi-Fi lokal ditolak router (ICE failed — kemungkinan AP Isolation aktif atau hanya mDNS).',
            );
          }
        });
      });

      return { peerName: slot.displayName || 'Pemain LAN' };
    } catch (err) {
      this.cancelHostSlot(slotId);
      throw err;
    }
  }

  cancelHostSlot(slotId: string): void {
    const slot = this.hostSlots.get(slotId);
    if (!slot) return;
    try {
      slot.dc?.close();
      slot.pc.close();
    } catch {
      // Ignore close errors
    }
    this.hostSlots.delete(slotId);
    this.emit();
  }

  /**
   * Guest 1-Step Quick-Code Join (Home Wi-Fi PHP Mailbox + Instant Same-Browser BroadcastChannel).
   */
  async joinLanRoomByQuickCode(params: {
    roomCode: string;
    uid: string;
    displayName: string;
    avatarColor: string;
    isStageDisplay: boolean;
    onProgress?: (statusText: string, diagnostics?: LanSdpDiagnostics) => void;
    signal?: AbortSignal;
  }): Promise<{ roomId: string; diagnostics: LanSdpDiagnostics }> {
    const cleanCode = params.roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) {
      throw new Error('Kode ruang LAN harus 6 huruf/angka.');
    }

    this.teardown();

    const checkAborted = () => {
      if (params.signal?.aborted) {
        this.teardown();
        throw new Error('Proses gabung LAN dibatalkan.');
      }
    };

    const isOnlineNow = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    const pc = createLanPeerConnection({ useStun: isOnlineNow });
    const dc = pc.createDataChannel('yukmain-lan', { ordered: true });
    this.guestPc = pc;
    this.guestDc = dc;
    this.role = 'guest';
    this.localUid = params.uid;
    this.isStageDisplay = params.isStageDisplay;
    this.guestRoomClosed = false;
    this.guestSnapshot = null;

    let resolveConnected: ((res: { roomId: string }) => void) | null = null;
    let rejectConnected: ((err: Error) => void) | null = null;
    const connectedPromise = new Promise<{ roomId: string }>((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });

    dc.onopen = () => {
      const hello: LanPeerMessage = {
        type: 'HELLO',
        uid: params.uid,
        displayName: params.displayName,
        avatarColor: params.avatarColor,
        isStageDisplay: params.isStageDisplay,
      };
      dc.send(JSON.stringify(hello));
    };

    dc.onmessage = (msgEv) => {
      this.handleGuestIncomingMessage(String(msgEv.data), () => {
        if (resolveConnected && this.roomId) {
          const r = resolveConnected;
          resolveConnected = null;
          r({ roomId: this.roomId });
        }
      });
    };

    dc.onclose = () => {
      this.guestRoomClosed = true;
      this.rejectAllPending(new Error('Koneksi ke Host LAN terputus.'));
      if (rejectConnected) {
        const rj = rejectConnected;
        rejectConnected = null;
        rj(new Error('Koneksi ke Host LAN terputus.'));
      }
      this.emit();
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && rejectConnected) {
        const rj = rejectConnected;
        rejectConnected = null;
        rj(new Error('Koneksi P2P Wi-Fi gagal (ICE failed). Coba lagi atau pakai Mode Online.'));
      }
    };

    params.onProgress?.('Mengumpulkan alamat Wi-Fi lokal...');
    const releaseWarmUp = await warmUpLocalIpPermission();
    try {
      const offer = await pc.createOffer();
      await setLocalDescriptionAndGatherIce(pc, offer, {
        timeoutMs: 3200,
        waitForStun: isOnlineNow,
      });
    } finally {
      releaseWarmUp();
    }

    checkAborted();

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.teardown();
      throw new Error('Gagal membuat sinyal WebRTC lokal.');
    }

    const diagnostics = inspectLanSdpCandidates(localSdp);
    const offerCode = await encodeLanSignal(
      {
        v: 1,
        t: 'O',
        s: localSdp,
        r: cleanCode,
      },
      { allowStun: isOnlineNow },
    );

    // Fast path 1: Same-browser BroadcastChannel (instant split-screen / dual-tab join!)
    params.onProgress?.('Mencari Host LAN di perangkat / Wi-Fi...', diagnostics);
    let answerCode: string | null = await this.tryBroadcastChannelExchange({
      roomCode: cleanCode,
      guestUid: params.uid,
      displayName: params.displayName,
      avatarColor: params.avatarColor,
      isStageDisplay: params.isStageDisplay,
      offerCode,
      timeoutMs: 450,
    });

    checkAborted();

    // Fast path 2: Ephemeral InfinityFree PHP signaling mailbox
    if (!answerCode) {
      if (!isOnlineNow) {
        this.teardown();
        throw new Error(
          'Kamu sedang tanpa internet — gunakan tab "Scan QR / Manual (0% Internet)" untuk bergabung tanpa internet.',
        );
      }

      params.onProgress?.(`Menghubungi Host ruang ${cleanCode}...`, diagnostics);
      const reqRes = await apiFetch<{
        ok: boolean;
        requestId: string;
        peerSecret: string;
        hostName: string;
      }>(buildPhpApiUrl('lan/request'), {
        method: 'POST',
        body: JSON.stringify({
          roomCode: cleanCode,
          guestUid: params.uid,
          displayName: params.displayName,
          avatarColor: params.avatarColor,
          isStageDisplay: params.isStageDisplay,
          offerCode,
        }),
      });

      params.onProgress?.(`Menunggu jawaban dari ${reqRes.hostName}...`, diagnostics);
      const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        checkAborted();
        await new Promise((r) => setTimeout(r, GUEST_POLL_INTERVAL_MS));
        checkAborted();

        const statusRes = await apiFetch<{
          ok: boolean;
          status: 'pending' | 'answered';
          answerCode?: string;
        }>(buildPhpApiUrl('lan/status'), {
          method: 'POST',
          body: JSON.stringify({
            roomCode: cleanCode,
            requestId: reqRes.requestId,
            peerSecret: reqRes.peerSecret,
          }),
        });

        if (statusRes.status === 'answered' && statusRes.answerCode) {
          answerCode = statusRes.answerCode;
          break;
        }
      }

      if (!answerCode) {
        this.teardown();
        throw new Error(
          `Host ruang ${cleanCode} tidak merespons. Pastikan layar Host tetap aktif di Lobi atau modal Undang LAN.`,
        );
      }
    }

    checkAborted();
    params.onProgress?.('Membuka koneksi langsung lewat Wi-Fi lokal...', diagnostics);
    const answerPacket = await decodeLanSignal(answerCode);
    if (answerPacket.t !== 'A') {
      this.teardown();
      throw new Error('Jawaban sinyal dari Host tidak valid.');
    }

    this.roomId = `lan_${cleanCode}`;
    await pc.setRemoteDescription({ type: 'answer', sdp: answerPacket.s });

    const connected = await new Promise<{ roomId: string }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Jalur Wi-Fi P2P timeout (ICE: ${pc.iceConnectionState}). Pastikan kedua HP di Wi-Fi sama dan router tidak mengaktifkan AP Isolation.`,
          ),
        );
      }, HANDSHAKE_TIMEOUT_MS);

      connectedPromise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    }).catch((err) => {
      this.teardown();
      throw err;
    });

    return { roomId: connected.roomId, diagnostics };
  }

  private tryBroadcastChannelExchange(params: {
    roomCode: string;
    guestUid: string;
    displayName: string;
    avatarColor: string;
    isStageDisplay: boolean;
    offerCode: string;
    timeoutMs: number;
  }): Promise<string | null> {
    if (typeof BroadcastChannel === 'undefined') {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      let bc: BroadcastChannel | null = null;
      let settled = false;
      const requestId = `bc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const done = (val: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          bc?.close();
        } catch {
          // Ignore
        }
        resolve(val);
      };

      const timer = setTimeout(() => done(null), params.timeoutMs);

      try {
        bc = new BroadcastChannel(LAN_BROADCAST_CHANNEL);
        bc.onmessage = (event: MessageEvent<BroadcastSignalMessage>) => {
          const msg = event.data;
          if (
            msg &&
            msg.kind === 'LAN_BC_ANSWER' &&
            msg.roomCode === params.roomCode &&
            msg.requestId === requestId &&
            msg.answerCode
          ) {
            done(msg.answerCode);
          }
        };

        const offerMsg: BroadcastSignalMessage = {
          kind: 'LAN_BC_OFFER',
          roomCode: params.roomCode,
          requestId,
          guestUid: params.guestUid,
          displayName: params.displayName,
          avatarColor: params.avatarColor,
          isStageDisplay: params.isStageDisplay,
          offerCode: params.offerCode,
        };
        bc.postMessage(offerMsg);
      } catch {
        done(null);
      }
    });
  }

  /**
   * Guest / Layar Panggung Offline 2-Way QR:
   * Scans Host's Offer QR, prepares compact Answer QR, and resolves `waitForConnected` once Host scans back!
   */
  async createGuestAnswerFromOffer(params: {
    offerCode: string;
    uid: string;
    displayName: string;
    avatarColor: string;
    isStageDisplay: boolean;
  }): Promise<{
    answerCode: string;
    hostName: string;
    roomCode: string;
    gameType: GameType;
    diagnostics: LanSdpDiagnostics;
    waitForConnected: () => Promise<{ roomId: string }>;
    cancel: () => void;
  }> {
    this.teardown();

    const offerPacket = await decodeLanSignal(params.offerCode);
    if (offerPacket.t !== 'O') {
      throw new Error('QR yang dipindai bukan QR Undangan Host (Offer).');
    }

    const pc = createZeroInternetPeerConnection();
    this.guestPc = pc;
    this.role = 'guest';
    this.localUid = params.uid;
    this.isStageDisplay = params.isStageDisplay;
    this.guestRoomClosed = false;
    this.guestSnapshot = null;

    const targetRoomId = `lan_${offerPacket.r ?? 'LOCAL1'}`;
    let resolveConnected: ((res: { roomId: string }) => void) | null = null;
    let rejectConnected: ((err: Error) => void) | null = null;

    const connectedPromise = new Promise<{ roomId: string }>((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });

    pc.ondatachannel = (event) => {
      const dc = event.channel;
      this.guestDc = dc;

      dc.onopen = () => {
        const hello: LanPeerMessage = {
          type: 'HELLO',
          uid: params.uid,
          displayName: params.displayName,
          avatarColor: params.avatarColor,
          isStageDisplay: params.isStageDisplay,
        };
        dc.send(JSON.stringify(hello));
      };

      dc.onmessage = (msgEv) => {
        this.handleGuestIncomingMessage(String(msgEv.data), () => {
          if (resolveConnected && this.roomId) {
            const r = resolveConnected;
            resolveConnected = null;
            r({ roomId: this.roomId });
          }
        });
      };

      dc.onclose = () => {
        this.guestRoomClosed = true;
        this.rejectAllPending(new Error('Koneksi ke Host LAN terputus.'));
        if (rejectConnected) {
          const rj = rejectConnected;
          rejectConnected = null;
          rj(new Error('Koneksi ke Host LAN terputus.'));
        }
        this.emit();
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.guestRoomClosed = true;
        if (rejectConnected) {
          const rj = rejectConnected;
          rejectConnected = null;
          rj(new Error('Gagal membangun koneksi WebRTC lokal.'));
        }
        this.emit();
      }
    };

    const releaseWarmUp = await warmUpLocalIpPermission();
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offerPacket.s });
      const answer = await pc.createAnswer();
      await setLocalDescriptionAndGatherIce(pc, answer, {
        timeoutMs: 3200,
        waitForStun: false,
      });
    } catch (err) {
      this.teardown();
      throw err;
    } finally {
      releaseWarmUp();
    }

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.teardown();
      throw new Error('Gagal membuat SDP Jawaban lokal.');
    }

    const diagnostics = inspectLanSdpCandidates(localSdp);
    const answerCode = await encodeLanSignal(
      {
        v: 1,
        t: 'A',
        s: localSdp,
        u: params.uid,
        n: params.displayName.trim().slice(0, 32) || 'Pemain LAN',
        c: params.avatarColor,
        st: params.isStageDisplay ? 1 : undefined,
      },
      { allowStun: false },
    );

    this.roomId = targetRoomId;
    this.emit();

    return {
      answerCode,
      hostName: offerPacket.h ?? 'Host',
      roomCode: offerPacket.r ?? 'LAN',
      gameType: offerPacket.g ?? 'spyfall',
      diagnostics,
      waitForConnected: () => connectedPromise,
      cancel: () => {
        if (rejectConnected) {
          const rj = rejectConnected;
          rejectConnected = null;
          rj(new Error('Pairing dibatalkan.'));
        }
        this.teardown();
      },
    };
  }

  private handleHostIncomingMessage(slot: HostPeerSlot, raw: string): void {
    if (!this.authority) return;
    let msg: LanPeerMessage;
    try {
      msg = JSON.parse(raw) as LanPeerMessage;
    } catch {
      return;
    }

    if (msg.type === 'PING') {
      this.sendToSlot(slot, { type: 'PONG', ts: msg.ts });
      return;
    }

    if (msg.type === 'HELLO') {
      slot.peerUid = msg.uid;
      slot.displayName = msg.displayName;
      slot.isStageDisplay = msg.isStageDisplay;
      try {
        this.authority.registerPeer({
          uid: msg.uid,
          displayName: msg.displayName,
          avatarColor: msg.avatarColor,
          isStageDisplay: msg.isStageDisplay,
        });
        this.broadcastHostSnapshots();
      } catch (err) {
        this.sendToSlot(slot, {
          type: 'ROOM_CLOSED',
          reason: err instanceof Error ? err.message : 'Gagal bergabung ke ruang LAN.',
        });
        this.cancelHostSlot(slot.slotId);
      }
      this.emit();
      return;
    }

    if (msg.type === 'CHAT') {
      if (!slot.peerUid || slot.isStageDisplay) return;
      this.authority.addChatMessage({
        senderUid: msg.senderUid,
        senderName: msg.senderName,
        avatarColor: msg.avatarColor,
        text: msg.text,
      });
      this.broadcastHostSnapshots();
      this.emit();
      return;
    }

    if (msg.type === 'ACTION') {
      if (!slot.peerUid || slot.isStageDisplay) {
        this.sendToSlot(slot, {
          type: 'ACTION_RESULT',
          requestId: msg.requestId,
          ok: false,
          error: 'Layar Panggung tidak dapat mengirim aksi permainan.',
        });
        return;
      }
      try {
        const data = this.authority.handleAction(slot.peerUid, msg.action, msg.payload);
        this.sendToSlot(slot, {
          type: 'ACTION_RESULT',
          requestId: msg.requestId,
          ok: true,
          data,
        });
        this.broadcastHostSnapshots();
        this.syncHostPollLifecycle();
        this.emit();
      } catch (err) {
        this.sendToSlot(slot, {
          type: 'ACTION_RESULT',
          requestId: msg.requestId,
          ok: false,
          error: err instanceof Error ? err.message : 'Aksi ditolak oleh Host LAN.',
        });
      }
    }
  }

  private syncHostPollLifecycle(): void {
    if (this.shouldPollHostMailbox()) {
      if (!this.hostPollTimer && !this.hostPollInFlight) {
        this.scheduleHostMailboxPoll(HOST_POLL_INTERVAL_MS);
      }
    } else if (this.hostPollTimer) {
      clearTimeout(this.hostPollTimer);
      this.hostPollTimer = null;
    }
  }

  private handleGuestIncomingMessage(raw: string, onFirstSync: () => void): void {
    let msg: LanHostMessage;
    try {
      msg = JSON.parse(raw) as LanHostMessage;
    } catch {
      return;
    }

    if (msg.type === 'SYNC_STATE') {
      this.guestSnapshot = msg.snapshot;
      this.roomId = msg.snapshot.room.id;
      this.guestRoomClosed = false;
      onFirstSync();
      this.emit();
      return;
    }

    if (msg.type === 'ACTION_RESULT') {
      const pending = this.pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.requestId);
        if (msg.ok) {
          pending.resolve(msg.data ?? {});
        } else {
          pending.reject(new Error(msg.error || 'Aksi LAN gagal diproses.'));
        }
      }
      return;
    }

    if (msg.type === 'ROOM_CLOSED') {
      this.guestRoomClosed = true;
      this.rejectAllPending(new Error(msg.reason || 'Host menutup ruang LAN.'));
      this.emit();
    }
  }

  private sendToSlot(slot: HostPeerSlot, msg: LanHostMessage): void {
    if (!slot.dc || slot.dc.readyState !== 'open') return;
    try {
      slot.dc.send(JSON.stringify(msg));
    } catch {
      // Ignore transient write error
    }
  }

  private broadcastHostSnapshots(): void {
    if (this.role !== 'host' || !this.authority) return;
    for (const slot of this.hostSlots.values()) {
      if (slot.dc?.readyState === 'open' && slot.peerUid) {
        const snapshot = this.authority.getSnapshotForPeer(slot.peerUid, slot.isStageDisplay);
        this.sendToSlot(slot, { type: 'SYNC_STATE', snapshot });
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, p] of this.pendingRequests) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pendingRequests.clear();
  }

  /**
   * Returns current snapshot for `useRoomSession` when `roomId.startsWith('lan_')`.
   */
  getSnapshot(roomId: string): LanRoomSnapshot | null {
    if (this.roomId !== roomId) return null;
    if (this.role === 'host' && this.authority) {
      return this.authority.getSnapshotForPeer(this.localUid, false);
    }
    if (this.role === 'guest') {
      return this.guestSnapshot;
    }
    return null;
  }

  /**
   * Dispatches any game/session action seamlessly whether this device is Host or Guest.
   */
  async dispatchAction(
    roomId: string,
    action: LanActionName,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.roomId !== roomId) {
      throw new Error('Ruang LAN tidak aktif.');
    }

    if (this.role === 'host' && this.authority) {
      if (action === 'leaveRoom') {
        for (const slot of this.hostSlots.values()) {
          this.sendToSlot(slot, {
            type: 'ROOM_CLOSED',
            reason: 'Host menutup ruang LAN Party.',
          });
        }
        this.teardown();
        return {};
      }
      const data = this.authority.handleAction(this.localUid, action, payload);
      this.broadcastHostSnapshots();
      this.syncHostPollLifecycle();
      this.emit();
      return data;
    }

    if (this.role === 'guest') {
      if (action === 'leaveRoom') {
        if (this.guestDc?.readyState === 'open') {
          try {
            this.guestDc.send(
              JSON.stringify({
                type: 'ACTION',
                requestId: `leave_${Date.now()}`,
                action: 'leaveRoom',
                payload,
              } satisfies LanPeerMessage),
            );
          } catch {
            // Ignore
          }
        }
        this.teardown();
        return {};
      }

      if (!this.guestDc || this.guestDc.readyState !== 'open') {
        throw new Error('Koneksi Wi-Fi ke Host LAN terputus.');
      }

      const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error('Host LAN tidak merespons (timeout).'));
        }, 6000);

        this.pendingRequests.set(requestId, { resolve, reject, timer });
        this.guestDc!.send(
          JSON.stringify({
            type: 'ACTION',
            requestId,
            action,
            payload,
          } satisfies LanPeerMessage),
        );
      });
    }

    throw new Error('Sesi LAN belum dimulai.');
  }

  sendChat(
    roomId: string,
    params: { senderUid: string; senderName: string; avatarColor: string; text: string },
  ): void {
    if (this.roomId !== roomId) return;
    if (this.role === 'host' && this.authority) {
      this.authority.addChatMessage(params);
      this.broadcastHostSnapshots();
      this.emit();
      return;
    }
    if (this.role === 'guest' && this.guestDc?.readyState === 'open') {
      const msg: LanPeerMessage = {
        type: 'CHAT',
        ...params,
      };
      this.guestDc.send(JSON.stringify(msg));
    }
  }

  teardown(): void {
    if (this.hostPollTimer) {
      clearTimeout(this.hostPollTimer);
      this.hostPollTimer = null;
    }
    this.hostPollInFlight = false;
    this.hostInviteModalOpen = false;

    // Best-effort cleanup of ephemeral signaling room row on InfinityFree
    if (this.role === 'host' && this.authority && this.hostSignalSecret) {
      const closeCode = this.authority.getRoom().code;
      const closeSecret = this.hostSignalSecret;
      void apiFetch(buildPhpApiUrl('lan/close'), {
        method: 'POST',
        body: JSON.stringify({ roomCode: closeCode, hostSecret: closeSecret }),
      }).catch(() => {});
    }
    this.hostSignalSecret = null;
    this.hostQuickCodeStatus = 'idle';
    this.hostQuickCodeError = null;
    this.handledRequestIds.clear();

    if (this.hostBroadcastChannel) {
      try {
        this.hostBroadcastChannel.close();
      } catch {
        // Ignore
      }
      this.hostBroadcastChannel = null;
    }

    for (const slot of this.hostSlots.values()) {
      try {
        slot.dc?.close();
        slot.pc.close();
      } catch {
        // Ignore
      }
    }
    this.hostSlots.clear();
    try {
      this.guestDc?.close();
      this.guestPc?.close();
    } catch {
      // Ignore
    }
    this.guestDc = null;
    this.guestPc = null;
    this.guestSnapshot = null;
    this.guestRoomClosed = false;
    this.authority = null;
    this.role = 'idle';
    this.roomId = null;
    this.rejectAllPending(new Error('Sesi LAN ditutup.'));
    this.emit();
  }
}

export const lanRuntime = new LanPartyRuntime();
