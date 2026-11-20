import type { GameType } from '../games/types';
import { LanHostAuthority } from './lan-host-authority';
import type {
  LanActionName,
  LanHostMessage,
  LanPeerMessage,
  LanRoomSnapshot,
} from './lan-protocol';
import {
  createZeroInternetPeerConnection,
  decodeLanSignal,
  encodeLanSignal,
  waitForLocalIceGathering,
} from './lan-signaling';

export interface LanPeerConnectionInfo {
  slotId: string;
  peerUid: string;
  displayName: string;
  isStageDisplay: boolean;
  state: 'pairing' | 'connecting' | 'connected' | 'disconnected';
}

interface HostPeerSlot {
  slotId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  peerUid: string;
  displayName: string;
  isStageDisplay: boolean;
  state: 'pairing' | 'connecting' | 'connected' | 'disconnected';
}

interface PendingActionPromise {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type RuntimeListener = () => void;

/**
 * Browser-side Zero-Internet WebRTC LAN Party Runtime.
 *
 * Manages either:
 * - Host Role: owns `LanHostAuthority` + star-topology `RTCPeerConnection`s to every phone/TV on local Wi-Fi.
 * - Guest / Stage Role: owns 1 `RTCPeerConnection` to the Host and relays all actions/chat over `RTCDataChannel`.
 */
class LanPartyRuntime {
  private role: 'idle' | 'host' | 'guest' = 'idle';
  private roomId: string | null = null;
  private localUid: string = '';
  private isStageDisplay: boolean = false;

  // Host state
  private authority: LanHostAuthority | null = null;
  private hostSlots: Map<string, HostPeerSlot> = new Map();

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
    }));
  }

  /**
   * Starts a brand-new Zero-Internet LAN Party room as the Host device.
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
    this.emit();

    return {
      roomId: this.authority.getRoomId(),
      code: this.authority.getRoom().code,
    };
  }

  /**
   * Host Step 1: Creates a fresh WebRTC Offer QR payload for 1 incoming Guest or Layar Panggung.
   */
  async createHostOfferSlot(): Promise<{ slotId: string; offerCode: string }> {
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
    };
    this.hostSlots.set(slotId, slot);

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

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        slot.state = 'disconnected';
        if (slot.peerUid && this.authority) {
          this.authority.markPeerDisconnected(slot.peerUid, slot.isStageDisplay);
          this.broadcastHostSnapshots();
        }
        this.emit();
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForLocalIceGathering(pc);

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.cancelHostSlot(slotId);
      throw new Error('Gagal membuat SDP lokal WebRTC. Pastikan Wi-Fi/Hotspot aktif.');
    }

    const room = this.authority.getRoom();
    const hostPlayer = this.authority.getPlayersList().find((p) => p.uid === room.hostUid);

    const offerCode = await encodeLanSignal({
      v: 1,
      t: 'O',
      s: localSdp,
      r: room.code,
      g: room.gameType,
      h: hostPlayer?.displayName ?? 'Host',
    });

    this.emit();
    return { slotId, offerCode };
  }

  /**
   * Host Step 2: Applies the Guest's scanned Answer QR code and waits for the local Wi-Fi DataChannel to open.
   */
  async acceptGuestAnswer(slotId: string, answerCode: string): Promise<{ peerName: string }> {
    const slot = this.hostSlots.get(slotId);
    if (!slot || !this.authority) {
      throw new Error('Sesi pairing tidak ditemukan. Buat QR Offer baru.');
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

    await slot.pc.setRemoteDescription({ type: 'answer', sdp: packet.s });

    // Wait up to 8s for local Wi-Fi DataChannel to open
    await new Promise<void>((resolve, reject) => {
      if (slot.dc && slot.dc.readyState === 'open') {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        reject(
          new Error(
            'Koneksi Wi-Fi LAN gagal tersambung (timeout). Pastikan kedua HP di Wi-Fi atau Hotspot yang sama dan tidak diblokir AP Isolation.',
          ),
        );
      }, 8000);

      const prevOnOpen = slot.dc?.onopen ?? null;
      if (slot.dc) {
        slot.dc.onopen = (ev) => {
          clearTimeout(timer);
          if (typeof prevOnOpen === 'function') {
            prevOnOpen.call(slot.dc!, ev);
          }
          resolve();
        };
      }
    });

    return { peerName: slot.displayName || 'Pemain LAN' };
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
   * Guest / Layar Panggung Step 1 & 2:
   * Scans Host's Offer QR, prepares Answer QR, and resolves `waitForConnected` once Host scans back!
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

    await pc.setRemoteDescription({ type: 'offer', sdp: offerPacket.s });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForLocalIceGathering(pc);

    const localSdp = pc.localDescription?.sdp;
    if (!localSdp) {
      this.teardown();
      throw new Error('Gagal membuat SDP Jawaban lokal.');
    }

    const answerCode = await encodeLanSignal({
      v: 1,
      t: 'A',
      s: localSdp,
      u: params.uid,
      n: params.displayName.trim().slice(0, 32) || 'Pemain LAN',
      c: params.avatarColor,
      st: params.isStageDisplay ? 1 : undefined,
    });

    this.roomId = targetRoomId;
    this.emit();

    return {
      answerCode,
      hostName: offerPacket.h ?? 'Host',
      roomCode: offerPacket.r ?? 'LAN',
      gameType: offerPacket.g ?? 'spyfall',
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
