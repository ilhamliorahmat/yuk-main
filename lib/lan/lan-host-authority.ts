import {
  calculateFaktaHariIniScoreDeltas,
  dealFaktaHariIniRound,
  mergeFactPool,
  sanitizeCustomFact,
  selectFaktaPhaseController,
} from '../games/fakta-hari-ini/engine';
import {
  calculateKataKataScoreDeltas,
  dealKataKataRound,
  evaluateKataKataAfterElimination,
  evaluateKataKataLastChanceGuess,
  evaluateKataKataVoteProgress,
  mergeWordPairPool,
  sanitizeCustomWordPair,
} from '../games/kata-kata/engine';
import {
  dealSatuFrekuensiRound,
  mergeSpectrumPool,
  sanitizeCustomSpectrum,
  scoreSatuFrekuensiRound,
} from '../games/satu-frekuensi/engine';
import {
  buildSessionRecap,
  evaluateSuitClash,
  filterActivePlayers,
  finalizeCompletedGameRecord,
  getDefaultPacksForGame,
} from '../games/session/engine';
import {
  buildDeadPlayerEntry,
  calculateMalamSilumanScoreDeltas,
  dealMalamSilumanRound,
  DEFAULT_MALAM_SILUMAN_SETTINGS,
  evaluateMalamSilumanVictory,
  resolveMalamSilumanNight,
  sanitizeMalamSilumanSettings,
  tallyMalamSilumanDayVotes,
} from '../games/malam-siluman/engine';
import { MALAM_SILUMAN_ROLES } from '../games/malam-siluman/roles-id';
import {
  calculatePelukisScoreDeltas,
  dealPelukisGadunganRound,
  evaluatePelukisWordGuess,
  mergeDrawingPromptPool,
  normalizeAndSimplifyPoints,
  sanitizeCustomDrawingPrompt,
  tallyPelukisVotes,
} from '../games/pelukis-gadungan/engine';
import {
  calculateRoundScoreDeltas,
  dealSpyfallRound,
  evaluateSpyGuess,
  evaluateVoteProgress,
  generateRoomCode,
  mergeLocationPool,
  sanitizeCustomLocation,
} from '../games/spyfall/engine';
import type {
  ChatMessage,
  CustomDrawingPrompt,
  CustomFactItem,
  CustomLocation,
  CustomSpectrum,
  CustomWordPair,
  GameType,
  LukisanPhase,
  LukisanStroke,
  MalamSilumanDeadPlayer,
  MalamSilumanState,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
  SpyMode,
  SuitPick,
  WerewolfRoleId,
} from '../games/types';
import {
  LAN_ROOM_PREFIX,
  pickLanAvatarColor,
  type LanActionName,
  type LanRoomSnapshot,
} from './lan-protocol';

/**
 * Pure In-Memory Authoritative LAN Party Game Master.
 *
 * Runs strictly on the Host device during Zero-Internet LAN Party Mode.
 * Reuses the exact same pure engines across all 5 games + v3.1.0 session platform,
 * enforcing actor/seat ownership and guaranteeing per-peer secret isolation.
 */
export interface HydratedAuthorityState {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  secretsByRound?: Record<string, Record<string, PlayerSecretDoc>>;
  serverState: ServerRoundStateDoc | null;
  frequencyGuesses?: Record<string, Record<string, number>>;
  pelukisVotes?: Record<string, Record<string, string>>;
  malamSilumanNightActions?: Record<string, Record<string, string>>;
  malamSilumanVotes?: Record<string, Record<string, string>>;
  suitPicks?: Record<string, Record<string, SuitPick>>;
  messages?: ChatMessage[];
  presence?: Record<string, PresenceEntry>;
}

export class LanHostAuthority {
  private room: RoomDoc;
  private players: Map<string, RoomPlayerDoc> = new Map();
  private secretsByRound: Map<string, Map<string, PlayerSecretDoc>> = new Map();
  private serverState: ServerRoundStateDoc | null = null;
  private frequencyGuessesByRound: Map<string, Map<string, number>> = new Map();
  private pelukisVotesByRound: Map<string, Map<string, string>> = new Map();
  private malamSilumanNightActionsByRound: Map<string, Map<string, string>> = new Map();
  private malamSilumanVotesByRound: Map<string, Map<string, string>> = new Map();
  private suitPicksByClash: Map<string, Map<string, SuitPick>> = new Map();
  private messages: ChatMessage[] = [];
  private pendingSystemMessages: string[] = [];
  private presence: Record<string, PresenceEntry> = {};

  static hydrate(state: HydratedAuthorityState): LanHostAuthority {
    const firstPlayer = state.players[0];
    const instance = new LanHostAuthority({
      hostUid: state.room.hostUid,
      hostName: firstPlayer?.displayName ?? 'Host',
      avatarColor: firstPlayer?.avatarColor ?? '#DC2626',
      gameType: state.room.gameType,
      code: state.room.code,
    });
    instance.room = structuredClone(state.room);
    instance.players = new Map(state.players.map((p) => [p.uid, structuredClone(p)]));
    instance.secretsByRound = new Map(
      Object.entries(state.secretsByRound ?? {}).map(([roundId, entries]) => [
        roundId,
        new Map(Object.entries(entries).map(([uid, sec]) => [uid, structuredClone(sec)])),
      ]),
    );
    instance.serverState = state.serverState ? structuredClone(state.serverState) : null;
    instance.frequencyGuessesByRound = new Map(
      Object.entries(state.frequencyGuesses ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]),
    );
    instance.pelukisVotesByRound = new Map(
      Object.entries(state.pelukisVotes ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]),
    );
    instance.malamSilumanNightActionsByRound = new Map(
      Object.entries(state.malamSilumanNightActions ?? {}).map(([k, v]) => [
        k,
        new Map(Object.entries(v)),
      ]),
    );
    instance.malamSilumanVotesByRound = new Map(
      Object.entries(state.malamSilumanVotes ?? {}).map(([k, v]) => [
        k,
        new Map(Object.entries(v)),
      ]),
    );
    instance.suitPicksByClash = new Map(
      Object.entries(state.suitPicks ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]),
    );
    instance.messages = structuredClone(state.messages ?? []);
    instance.pendingSystemMessages = [];
    instance.presence = structuredClone(state.presence ?? {});
    return instance;
  }

  constructor(params: {
    hostUid: string;
    hostName: string;
    avatarColor: string;
    gameType: GameType;
    code?: string;
  }) {
    const now = Date.now();
    const code = params.code ?? generateRoomCode();
    const roomId = `${LAN_ROOM_PREFIX}${code}`;

    this.room = {
      id: roomId,
      code,
      gameType: params.gameType,
      hostUid: params.hostUid,
      status: 'lobby',
      roundNumber: 0,
      currentMatchRounds: 0,
      currentRoundId: '',
      roundDurationSec: 480,
      roundEndsAtMs: 0,
      firstSpeakerUid: '',
      spyMode: 'single',
      enabledPacks: getDefaultPacksForGame(params.gameType),
      selectedLocationNames: [],
      customLocations: [],
      customWordPairs: [],
      customSpectrums: [],
      customFacts: [],
      customDrawingPrompts: [],
      pelukisStrokeRounds: 2,
      malamSilumanSettings: DEFAULT_MALAM_SILUMAN_SETTINGS,
      eliminatedUids: [],
      eliminationLog: [],
      frequencyState: null,
      faktaState: null,
      lukisanState: null,
      malamSilumanState: null,
      activeVote: null,
      pendingSpyGuess: null,
      lastRoundResult: null,
      completedGames: [],
      activeRecap: null,
      lastEmptyAtMs: null,
      createdAt: now,
      updatedAt: now,
    };

    const cleanName = params.hostName.trim().slice(0, 40) || 'Host';
    this.players.set(params.hostUid, {
      uid: params.hostUid,
      roomId,
      displayName: cleanName,
      avatarColor: params.avatarColor || pickLanAvatarColor(params.hostUid),
      isHost: true,
      score: 0,
      isReady: true,
      controllerUid: params.hostUid,
      isNumpang: false,
      isBrb: false,
      joinedAt: now,
      updatedAt: now,
    });

    this.presence[params.hostUid] = {
      uid: params.hostUid,
      displayName: cleanName,
      online: true,
      isStage: false,
      lastSeen: now,
    };

    this.pushSystemMessage(
      `Ruang LAN Party ${code} siap! Hubungkan teman lewat Wi-Fi/Hotspot tanpa internet.`,
    );
  }

  getRoom(): RoomDoc {
    return this.room;
  }

  getRoomId(): string {
    return this.room.id;
  }

  getPlayersList(): RoomPlayerDoc[] {
    return Array.from(this.players.values()).sort(
      (a, b) => Number(a.joinedAt ?? 0) - Number(b.joinedAt ?? 0),
    );
  }

  exportState(): HydratedAuthorityState {
    const mapToRecord = <T>(m: Map<string, Map<string, T>>): Record<string, Record<string, T>> => {
      const out: Record<string, Record<string, T>> = {};
      for (const [k, inner] of m.entries()) {
        out[k] = Object.fromEntries(inner.entries());
      }
      return out;
    };

    return {
      room: structuredClone(this.room),
      players: structuredClone(this.getPlayersList()),
      secretsByRound: mapToRecord(this.secretsByRound),
      serverState: this.serverState ? structuredClone(this.serverState) : null,
      frequencyGuesses: mapToRecord(this.frequencyGuessesByRound),
      pelukisVotes: mapToRecord(this.pelukisVotesByRound),
      malamSilumanNightActions: mapToRecord(this.malamSilumanNightActionsByRound),
      malamSilumanVotes: mapToRecord(this.malamSilumanVotesByRound),
      suitPicks: mapToRecord(this.suitPicksByClash),
      messages: [...this.messages],
      presence: structuredClone(this.presence),
    };
  }

  consumeEmittedSystemMessages(): string[] {
    const msgs = [...this.pendingSystemMessages];
    this.pendingSystemMessages = [];
    return msgs;
  }

  private pushSystemMessage(text: string): void {
    const now = Date.now();
    const clean = text.slice(0, 280);
    this.pendingSystemMessages.push(clean);
    this.messages.push({
      id: `sys_${now}_${Math.random().toString(36).slice(2, 6)}`,
      senderUid: 'system',
      senderName: 'Yuk Main',
      text: clean,
      type: 'system',
      createdAt: now,
    });
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
  }

  addChatMessage(params: {
    senderUid: string;
    senderName: string;
    avatarColor?: string;
    text: string;
  }): void {
    const clean = params.text.trim().slice(0, 280);
    if (!clean) return;
    const now = Date.now();
    this.messages.push({
      id: `msg_${now}_${Math.random().toString(36).slice(2, 6)}`,
      senderUid: params.senderUid,
      senderName: params.senderName.trim().slice(0, 40) || 'Pemain',
      text: clean,
      type: 'chat',
      createdAt: now,
    });
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
  }

  registerPeer(params: {
    uid: string;
    displayName: string;
    avatarColor: string;
    isStageDisplay: boolean;
  }): void {
    const now = Date.now();
    const cleanName = params.displayName.trim().slice(0, 40) || 'Pemain LAN';

    if (params.isStageDisplay) {
      const stageKey = `stage_${params.uid}`;
      this.presence[stageKey] = {
        uid: stageKey,
        displayName: 'Layar Panggung',
        online: true,
        isStage: true,
        lastSeen: now,
      };
      this.pushSystemMessage('Layar Panggung terhubung via Wi-Fi LAN.');
      return;
    }

    const existing = this.players.get(params.uid);
    if (existing) {
      this.players.set(params.uid, {
        ...existing,
        displayName: cleanName,
        avatarColor: params.avatarColor || existing.avatarColor,
        updatedAt: now,
      });
    } else {
      if (this.room.status !== 'lobby') {
        throw new Error('Permainan sedang berlangsung. Tunggu Host kembali ke lobi.');
      }
      if (this.players.size >= 12) {
        throw new Error('Ruang sudah penuh (maksimal 12 pemain).');
      }
      this.players.set(params.uid, {
        uid: params.uid,
        roomId: this.room.id,
        displayName: cleanName,
        avatarColor: params.avatarColor || pickLanAvatarColor(params.uid),
        isHost: false,
        score: 0,
        isReady: false,
        controllerUid: params.uid,
        isNumpang: false,
        isBrb: false,
        joinedAt: now,
        updatedAt: now,
      });
      this.pushSystemMessage(`${cleanName} bergabung lewat LAN Party.`);
    }

    this.presence[params.uid] = {
      uid: params.uid,
      displayName: cleanName,
      online: true,
      isStage: false,
      lastSeen: now,
    };
  }

  markPeerDisconnected(peerUid: string, isStageDisplay: boolean): void {
    const now = Date.now();
    const key = isStageDisplay ? `stage_${peerUid}` : peerUid;
    if (this.presence[key]) {
      this.presence[key] = {
        ...this.presence[key],
        online: false,
        lastSeen: now,
      };
    }
  }

  /**
   * Builds a strictly isolated snapshot for a specific peer device.
   * ZERO secret leakage:
   * - Layar Panggung gets `{}` for `secretsByOwnedSeat` and only sees `revealedSecrets` on `round_end`.
   * - Each player device receives ONLY the secret(s) belonging to seats controlled by `peerUid`.
   */
  getSnapshotForPeer(peerUid: string, isStageDisplay: boolean): LanRoomSnapshot {
    const players = this.getPlayersList();
    const secretsByOwnedSeat: Record<string, PlayerSecretDoc | null> = {};
    const roundSecrets = this.room.currentRoundId
      ? this.secretsByRound.get(this.room.currentRoundId)
      : undefined;

    if (!isStageDisplay && this.room.status !== 'lobby' && roundSecrets) {
      for (const p of players) {
        const owned = p.uid === peerUid || (p.isNumpang && p.controllerUid === peerUid);
        if (owned) {
          secretsByOwnedSeat[p.uid] = roundSecrets.get(p.uid) ?? null;
        }
      }
    }

    const revealedSecrets: Record<string, PlayerSecretDoc> = {};
    if (this.room.status === 'round_end' && roundSecrets) {
      for (const [uid, secret] of roundSecrets.entries()) {
        revealedSecrets[uid] = secret;
      }
    }

    return {
      room: structuredClone(this.room),
      players: structuredClone(players),
      secretsByOwnedSeat: structuredClone(secretsByOwnedSeat),
      revealedSecrets: structuredClone(revealedSecrets),
      messages: [...this.messages],
      presence: structuredClone(this.presence),
    };
  }

  private ownsSeat(deviceUid: string, targetUid: string): boolean {
    if (deviceUid === targetUid) return true;
    const p = this.players.get(targetUid);
    return Boolean(p && p.isNumpang && p.controllerUid === deviceUid);
  }

  private resolveActor(senderDeviceUid: string, payload: Record<string, unknown>): RoomPlayerDoc {
    const requestedUid =
      typeof payload.actAsUid === 'string' && payload.actAsUid
        ? payload.actAsUid
        : typeof payload.actorUid === 'string' && payload.actorUid
          ? payload.actorUid
          : typeof payload.uid === 'string' && payload.uid
            ? payload.uid
            : typeof payload.voterUid === 'string' && payload.voterUid
              ? payload.voterUid
              : typeof payload.initiatorUid === 'string' && payload.initiatorUid
                ? payload.initiatorUid
                : typeof payload.spyUid === 'string' && payload.spyUid
                  ? payload.spyUid
                  : typeof payload.psychicUid === 'string' && payload.psychicUid
                    ? payload.psychicUid
                    : typeof payload.guesserUid === 'string' && payload.guesserUid
                      ? payload.guesserUid
                      : senderDeviceUid;

    if (!this.ownsSeat(senderDeviceUid, requestedUid)) {
      throw new Error('Tidak memiliki izin untuk kursi pemain tersebut.');
    }
    const actor = this.players.get(requestedUid);
    if (!actor) {
      throw new Error('Pemain tidak ditemukan di ruang LAN.');
    }
    return actor;
  }

  private requireHost(senderDeviceUid: string): void {
    if (this.room.hostUid !== senderDeviceUid) {
      throw new Error('Hanya Host yang dapat melakukan aksi ini.');
    }
  }

  private applyScoreDeltas(deltas: Record<string, number>): void {
    const now = Date.now();
    for (const [uid, delta] of Object.entries(deltas)) {
      if (!delta || delta <= 0) continue;
      const p = this.players.get(uid);
      if (p) {
        this.players.set(uid, { ...p, score: p.score + delta, updatedAt: now });
      }
    }
  }

  /**
   * Executes any room action atomically on the LAN Host and returns an optional response payload.
   */
  handleAction(
    senderDeviceUid: string,
    action: LanActionName,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const now = Date.now();

    switch (action) {
      // ===================== LOBBY / SEAT / PRESENCE =====================
      case 'addNumpangPlayer': {
        if (this.room.status !== 'lobby') {
          throw new Error('Pemain Numpang hanya bisa ditambahkan saat berada di Lobi.');
        }
        const hostDevice = this.players.get(senderDeviceUid);
        if (!hostDevice) throw new Error('Kamu tidak terdaftar di ruang LAN.');

        const currentAll = this.getPlayersList();
        if (currentAll.length >= 12) {
          throw new Error('Ruang sudah penuh (maksimal 12 pemain termasuk Numpang).');
        }
        const ownedNumpang = currentAll.filter(
          (p) => p.isNumpang && p.controllerUid === senderDeviceUid,
        );
        if (ownedNumpang.length >= 2) {
          throw new Error('Maksimal 2 kursi Numpang per perangkat.');
        }
        const cleanName = String(payload.guestName ?? payload.displayName ?? '').trim().slice(0, 40);
        if (cleanName.length < 2) {
          throw new Error('Nama pemain Numpang minimal 2 karakter.');
        }

        const numpangUid = `numpang_${senderDeviceUid.slice(0, 12)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        this.players.set(numpangUid, {
          uid: numpangUid,
          roomId: this.room.id,
          displayName: cleanName,
          avatarColor:
            typeof payload.avatarColor === 'string' && payload.avatarColor
              ? payload.avatarColor.slice(0, 24)
              : pickLanAvatarColor(numpangUid),
          isHost: false,
          score: 0,
          isReady: true,
          controllerUid: senderDeviceUid,
          isNumpang: true,
          isBrb: false,
          joinedAt: now,
          updatedAt: now,
        });
        this.pushSystemMessage(`${cleanName} ikut main (Numpang di HP ${hostDevice.displayName}).`);
        return { numpangUid };
      }

      case 'removeNumpangPlayer': {
        const targetUid = String(payload.numpangUid ?? payload.seatUid ?? '');
        const target = this.players.get(targetUid);
        if (!target || !target.isNumpang) return {};
        if (target.controllerUid !== senderDeviceUid && this.room.hostUid !== senderDeviceUid) {
          throw new Error('Tidak memiliki izin menghapus kursi Numpang ini.');
        }
        this.players.delete(targetUid);
        this.pushSystemMessage(`${target.displayName} (Numpang) keluar dari ruang.`);
        return {};
      }

      case 'togglePlayerBrb': {
        const targetUid = String(payload.uid ?? payload.targetUid ?? senderDeviceUid);
        if (!this.ownsSeat(senderDeviceUid, targetUid)) {
          throw new Error('Tidak memiliki izin mengubah status BRB kursi ini.');
        }
        const target = this.players.get(targetUid);
        if (!target) throw new Error('Pemain tidak ditemukan.');
        const nextBrb = Boolean(payload.isBrb);
        this.players.set(targetUid, { ...target, isBrb: nextBrb, updatedAt: now });
        this.pushSystemMessage(
          nextBrb
            ? `${target.displayName} lagi BRB sebentar (dilewati di ronde baru).`
            : `${target.displayName} sudah balik dan siap ikut ronde berikutnya!`,
        );
        return {};
      }

      case 'togglePlayerReady': {
        const targetUid = String(payload.uid ?? senderDeviceUid);
        if (!this.ownsSeat(senderDeviceUid, targetUid)) {
          throw new Error('Tidak memiliki izin mengubah status siap.');
        }
        const target = this.players.get(targetUid);
        if (!target) throw new Error('Pemain tidak ditemukan.');
        this.players.set(targetUid, {
          ...target,
          isReady: Boolean(payload.isReady),
          updatedAt: now,
        });
        return {};
      }

      case 'leaveRoom': {
        const leavingUid = senderDeviceUid;
        const leaving = this.players.get(leavingUid);
        // Remove device owner + any Numpang seats controlled by them
        for (const p of this.getPlayersList()) {
          if (p.uid === leavingUid || (p.isNumpang && p.controllerUid === leavingUid)) {
            this.players.delete(p.uid);
          }
        }
        delete this.presence[leavingUid];
        this.ensureFaktaControllerFailover();
        if (leaving) {
          this.pushSystemMessage(`${leaving.displayName} keluar dari ruang LAN.`);
        }
        return {};
      }

      // ===================== SETTINGS =====================
      case 'updateSpyfallSettings': {
        this.requireHost(senderDeviceUid);
        const duration = Math.min(1200, Math.max(120, Math.round(Number(payload.roundDurationSec ?? 480))));
        const spyMode = (['single', 'double', 'random'].includes(String(payload.spyMode))
          ? payload.spyMode
          : 'single') as SpyMode;
        const rawPacks = Array.isArray(payload.enabledPacks)
          ? (payload.enabledPacks as string[])
          : ['nusantara', 'klasik'];
        const customLocations = (Array.isArray(payload.customLocations)
          ? (payload.customLocations as CustomLocation[])
          : []
        )
          .map((loc) => sanitizeCustomLocation(loc))
          .filter((loc): loc is CustomLocation => loc !== null)
          .slice(0, 20);
        this.room = {
          ...this.room,
          roundDurationSec: duration,
          spyMode,
          enabledPacks: rawPacks.length > 0 ? rawPacks.slice(0, 10) : ['nusantara'],
          customLocations,
          updatedAt: now,
        };
        return {};
      }

      case 'updateKataKataSettings': {
        this.requireHost(senderDeviceUid);
        const duration = Math.min(1200, Math.max(120, Math.round(Number(payload.roundDurationSec ?? 480))));
        const spyMode = (['single', 'double', 'random'].includes(String(payload.spyMode))
          ? payload.spyMode
          : 'single') as SpyMode;
        const rawPacks = Array.isArray(payload.enabledPacks)
          ? (payload.enabledPacks as string[])
          : ['kuliner', 'keseharian'];
        const customWordPairs = (Array.isArray(payload.customWordPairs)
          ? (payload.customWordPairs as CustomWordPair[])
          : []
        )
          .map((p) => sanitizeCustomWordPair(p))
          .filter((p): p is CustomWordPair => p !== null)
          .slice(0, 30);
        this.room = {
          ...this.room,
          roundDurationSec: duration,
          spyMode,
          enabledPacks: rawPacks.length > 0 ? rawPacks.slice(0, 10) : ['kuliner'],
          customWordPairs,
          updatedAt: now,
        };
        return {};
      }

      case 'updateSatuFrekuensiSettings': {
        this.requireHost(senderDeviceUid);
        const rawPacks = Array.isArray(payload.enabledPacks)
          ? (payload.enabledPacks as string[])
          : ['tongkrongan', 'kuliner'];
        const customSpectrums = (Array.isArray(payload.customSpectrums)
          ? (payload.customSpectrums as CustomSpectrum[])
          : []
        )
          .map((s) => sanitizeCustomSpectrum(s))
          .filter((s): s is CustomSpectrum => s !== null)
          .slice(0, 25);
        this.room = {
          ...this.room,
          enabledPacks: rawPacks.length > 0 ? rawPacks.slice(0, 10) : ['tongkrongan'],
          customSpectrums,
          updatedAt: now,
        };
        return {};
      }

      case 'updateFaktaHariIniSettings': {
        this.requireHost(senderDeviceUid);
        const rawPacks = Array.isArray(payload.enabledPacks)
          ? (payload.enabledPacks as string[])
          : ['hukum_sejarah', 'nusantara'];
        const customFacts = (Array.isArray(payload.customFacts)
          ? (payload.customFacts as CustomFactItem[])
          : []
        )
          .map((f) => sanitizeCustomFact(f))
          .filter((f): f is CustomFactItem => f !== null)
          .slice(0, 30);
        this.room = {
          ...this.room,
          enabledPacks: rawPacks.length > 0 ? rawPacks.slice(0, 10) : ['hukum_sejarah'],
          customFacts,
          updatedAt: now,
        };
        return {};
      }

      case 'updatePelukisSettings': {
        this.requireHost(senderDeviceUid);
        const rawPacks = Array.isArray(payload.enabledPacks)
          ? (payload.enabledPacks as string[])
          : ['kuliner', 'tongkrongan', 'hewan_alam'];
        const spyMode = (['single', 'double', 'random'].includes(String(payload.spyMode))
          ? payload.spyMode
          : 'single') as SpyMode;
        const pelukisStrokeRounds: 1 | 2 = Number(payload.pelukisStrokeRounds) === 1 ? 1 : 2;
        const customDrawingPrompts = (Array.isArray(payload.customDrawingPrompts)
          ? (payload.customDrawingPrompts as CustomDrawingPrompt[])
          : []
        )
          .map((item) => sanitizeCustomDrawingPrompt(item))
          .filter((item): item is CustomDrawingPrompt => item !== null)
          .slice(0, 30);
        this.room = {
          ...this.room,
          enabledPacks: rawPacks.length > 0 ? rawPacks.slice(0, 10) : ['kuliner'],
          spyMode,
          pelukisStrokeRounds,
          customDrawingPrompts,
          updatedAt: now,
        };
        return {};
      }

      case 'updateMalamSilumanSettings': {
        this.requireHost(senderDeviceUid);
        const settings = sanitizeMalamSilumanSettings(payload.settings ?? payload);
        this.room = {
          ...this.room,
          malamSilumanSettings: settings,
          updatedAt: now,
        };
        return {};
      }

      // ===================== GAME #1: SPYFALL =====================
      case 'startSpyfallRound': {
        this.requireHost(senderDeviceUid);
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 3) {
          throw new Error('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Yang Bener Yang Mana.');
        }
        const pool = mergeLocationPool(this.room.enabledPacks, this.room.customLocations);
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;
        const dealt = dealSpyfallRound({
          playerUids: activePlayers.map((p) => p.uid),
          pool,
          previousLocationName: this.serverState?.locationName ?? null,
          spyMode: this.room.spyMode,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);

        const spyNames = dealt.spyUids.map(
          (uid) => this.players.get(uid)?.displayName ?? 'Mata-Mata',
        );
        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: dealt.location.name,
          spyUids: dealt.spyUids,
          spyNames,
          createdAtMs: now,
        };

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: now + this.room.roundDurationSec * 1000,
          firstSpeakerUid: dealt.firstSpeakerUid,
          selectedLocationNames: dealt.selectedLocationNames,
          activeVote: null,
          pendingSpyGuess: null,
          activeRecap: null,
          updatedAt: now,
        };
        const firstName = this.players.get(dealt.firstSpeakerUid)?.displayName ?? 'Pemain';
        this.pushSystemMessage(`Ronde ${nextRound} dimulai! ${firstName} bertanya pertama.`);
        return { roundNumber: nextRound, roundId };
      }

      case 'initiateAccusationVote': {
        const initiator = this.resolveActor(senderDeviceUid, payload);
        if (this.room.status !== 'playing') {
          throw new Error('Voting tuduhan hanya bisa dimulai saat ronde berjalan.');
        }
        const targetUid = String(payload.targetUid ?? '');
        const target = this.players.get(targetUid);
        if (!target || target.isBrb || target.uid === initiator.uid) {
          throw new Error('Target tuduhan tidak valid.');
        }
        this.room = {
          ...this.room,
          status: 'voting',
          activeVote: {
            initiatorUid: initiator.uid,
            initiatorName: initiator.displayName,
            targetUid: target.uid,
            targetName: target.displayName,
            startedAtMs: now,
            votes: { [initiator.uid]: 'yes' },
          },
          updatedAt: now,
        };
        this.pushSystemMessage(`${initiator.displayName} menuduh ${target.displayName} sebagai Mata-Mata!`);
        return {};
      }

      case 'castAccusationVote': {
        const voter = this.resolveActor(senderDeviceUid, payload);
        if (this.room.status !== 'voting' || !this.room.activeVote || !this.serverState) {
          throw new Error('Tidak ada voting aktif.');
        }
        const vote: 'yes' | 'no' = (payload.vote ?? payload.choice) === 'no' ? 'no' : 'yes';
        const activeVote = {
          ...this.room.activeVote,
          votes: { ...this.room.activeVote.votes, [voter.uid]: vote },
        };

        const activePlayers = filterActivePlayers(this.getPlayersList());
        const eligibleVoters = activePlayers
          .filter((p) => p.uid !== activeVote.targetUid)
          .map((p) => p.uid);

        const progress = evaluateVoteProgress(activeVote.votes, eligibleVoters);

        if (progress.outcome === 'pending') {
          this.room = { ...this.room, activeVote, updatedAt: now };
          return { outcome: 'pending' };
        }

        if (progress.outcome === 'acquitted') {
          this.room = { ...this.room, status: 'playing', activeVote: null, updatedAt: now };
          this.pushSystemMessage(`Tuduhan terhadap ${activeVote.targetName} ditolak. Diskusi lanjut!`);
          return { outcome: 'acquitted' };
        }

        // Convicted!
        const isSpy = this.serverState.spyUids.includes(activeVote.targetUid);
        const winnerTeam: 'warga' | 'mata_mata' = isSpy ? 'warga' : 'mata_mata';
        const deltas = calculateRoundScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          spyUids: this.serverState.spyUids,
          winnerTeam,
          initiatorUid: activeVote.initiatorUid,
          victoryType: isSpy ? 'caught_no_guess' : 'false_accusation',
        });
        this.applyScoreDeltas(deltas);

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam,
            reason: isSpy
              ? `${activeVote.targetName} terbukti Mata-Mata! Warga menang.`
              : `${activeVote.targetName} ternyata Warga! Tim Mata-Mata menang.`,
            locationName: this.serverState.locationName,
            guessedLocation: null,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return { outcome: 'convicted', winnerTeam };
      }

      case 'cancelActiveVoteOrSpyGuess': {
        this.requireHost(senderDeviceUid);
        if (this.room.status === 'voting' || this.room.status === 'spy_guess') {
          this.room = {
            ...this.room,
            status: 'playing',
            activeVote: null,
            pendingSpyGuess: null,
            updatedAt: now,
          };
          this.pushSystemMessage('Host membatalkan voting / tebakan. Ronde dilanjutkan.');
        }
        return {};
      }

      case 'submitSpyLocationGuess': {
        const spy = this.resolveActor(senderDeviceUid, payload);
        if (!this.serverState || !this.serverState.spyUids.includes(spy.uid)) {
          throw new Error('Hanya Mata-Mata yang dapat menebak lokasi.');
        }
        const guessedLocation = String(payload.guessedLocation ?? '').trim().slice(0, 80);
        if (!guessedLocation) throw new Error('Pilih lokasi terlebih dahulu.');

        const correct = evaluateSpyGuess(guessedLocation, this.serverState.locationName);
        const winnerTeam: 'warga' | 'mata_mata' = correct ? 'mata_mata' : 'warga';
        const activePlayers = filterActivePlayers(this.getPlayersList());
        const deltas = calculateRoundScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          spyUids: this.serverState.spyUids,
          winnerTeam,
          victoryType: correct ? 'spy_guess_correct' : 'spy_guess_wrong',
        });
        this.applyScoreDeltas(deltas);

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam,
            reason: correct
              ? `${spy.displayName} menebak lokasi "${guessedLocation}" dengan tepat! Mata-Mata menang.`
              : `${spy.displayName} salah menebak "${guessedLocation}" (aslinya: ${this.serverState.locationName}). Warga menang!`,
            locationName: this.serverState.locationName,
            guessedLocation,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return { correct, winnerTeam };
      }

      case 'resolveRoundTimeout': {
        if (this.room.status !== 'playing' || !this.serverState) return {};
        const activePlayers = filterActivePlayers(this.getPlayersList());
        const deltas = calculateRoundScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          spyUids: this.serverState.spyUids,
          winnerTeam: 'mata_mata',
          victoryType: 'timeout',
        });
        this.applyScoreDeltas(deltas);

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam: 'mata_mata',
            reason: 'Waktu habis! Mata-Mata berhasil bertahan sampai akhir.',
            locationName: this.serverState.locationName,
            guessedLocation: null,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return {};
      }

      // ===================== GAME #2: KATA-KATA HARI INI =====================
      case 'startKataKataRound': {
        this.requireHost(senderDeviceUid);
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 3) {
          throw new Error('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Kata-Kata Hari Ini.');
        }
        const pool = mergeWordPairPool(
          this.room.enabledPacks,
          this.room.customWordPairs ?? [],
        );
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;
        const dealt = dealKataKataRound({
          playerUids: activePlayers.map((p) => p.uid),
          pool,
          previousCitizenWord: this.serverState?.citizenWord ?? null,
          spyMode: this.room.spyMode,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);

        const spyNames = dealt.spyUids.map(
          (uid) => this.players.get(uid)?.displayName ?? 'Penyusup',
        );
        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: dealt.category,
          citizenWord: dealt.citizenWord,
          spyWord: dealt.spyWord,
          spyUids: dealt.spyUids,
          spyNames,
          createdAtMs: now,
        };

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: now + this.room.roundDurationSec * 1000,
          firstSpeakerUid: dealt.firstSpeakerUid,
          eliminatedUids: [],
          eliminationLog: [],
          activeVote: null,
          pendingSpyGuess: null,
          activeRecap: null,
          updatedAt: now,
        };
        const firstName = this.players.get(dealt.firstSpeakerUid)?.displayName ?? 'Pemain';
        this.pushSystemMessage(`Ronde ${nextRound} Kata-Kata Hari Ini dimulai! ${firstName} mulai memberi petunjuk.`);
        return { roundNumber: nextRound, roundId };
      }

      case 'initiateKataKataVote': {
        const initiator = this.resolveActor(senderDeviceUid, payload);
        if (this.room.status !== 'playing') {
          throw new Error('Voting hanya bisa dimulai saat diskusi berjalan.');
        }
        const eliminated = new Set(this.room.eliminatedUids ?? []);
        if (eliminated.has(initiator.uid)) {
          throw new Error('Pemain yang tereliminasi tidak bisa menuduh.');
        }
        const targetUid = String(payload.targetUid ?? '');
        const target = this.players.get(targetUid);
        if (!target || target.isBrb || eliminated.has(target.uid) || target.uid === initiator.uid) {
          throw new Error('Target tuduhan tidak valid.');
        }
        this.room = {
          ...this.room,
          status: 'voting',
          activeVote: {
            initiatorUid: initiator.uid,
            initiatorName: initiator.displayName,
            targetUid: target.uid,
            targetName: target.displayName,
            startedAtMs: now,
            votes: { [initiator.uid]: 'yes' },
          },
          updatedAt: now,
        };
        this.pushSystemMessage(`${initiator.displayName} menuduh ${target.displayName} sebagai Penyusup!`);
        return {};
      }

      case 'castKataKataVote': {
        const voter = this.resolveActor(senderDeviceUid, payload);
        if (this.room.status !== 'voting' || !this.room.activeVote || !this.serverState) {
          throw new Error('Tidak ada voting aktif.');
        }
        const eliminatedList = this.room.eliminatedUids ?? [];
        const eliminatedSet = new Set(eliminatedList);
        if (eliminatedSet.has(voter.uid)) {
          throw new Error('Pemain tereliminasi tidak bisa ikut voting.');
        }

        const vote: 'yes' | 'no' = (payload.vote ?? payload.choice) === 'no' ? 'no' : 'yes';
        const activeVote = {
          ...this.room.activeVote,
          votes: { ...this.room.activeVote.votes, [voter.uid]: vote },
        };

        const activePlayers = filterActivePlayers(this.getPlayersList());
        const eligibleAliveVoters = activePlayers
          .filter((p) => !eliminatedSet.has(p.uid) && p.uid !== activeVote.targetUid)
          .map((p) => p.uid);

        const progress = evaluateKataKataVoteProgress(activeVote.votes, eligibleAliveVoters);
        if (progress.outcome === 'pending') {
          this.room = { ...this.room, activeVote, updatedAt: now };
          return { outcome: 'pending' };
        }

        if (progress.outcome === 'acquitted') {
          this.room = { ...this.room, status: 'playing', activeVote: null, updatedAt: now };
          this.pushSystemMessage(`Tuduhan ke ${activeVote.targetName} ditolak. Diskusi lanjut!`);
          return { outcome: 'acquitted' };
        }

        // Eliminated!
        const elimEval = evaluateKataKataAfterElimination({
          allPlayerUids: activePlayers.map((p) => p.uid),
          previouslyEliminatedUids: eliminatedList,
          eliminatedUid: activeVote.targetUid,
          spyUids: this.serverState.spyUids,
        });
        const nextEliminatedUids = [...eliminatedList, activeVote.targetUid];
        const nextEliminationLog = [
          ...(this.room.eliminationLog ?? []),
          {
            uid: activeVote.targetUid,
            displayName: activeVote.targetName,
            wasSpy: elimEval.wasSpy,
            eliminatedAtMs: now,
          },
        ];

        if (elimEval.outcome === 'final_spy_last_chance') {
          this.room = {
            ...this.room,
            status: 'spy_guess',
            eliminatedUids: nextEliminatedUids,
            eliminationLog: nextEliminationLog,
            activeVote: null,
            pendingSpyGuess: {
              spyUid: activeVote.targetUid,
              spyName: activeVote.targetName,
              guessedLocation: '',
              submittedAtMs: now,
            },
            updatedAt: now,
          };
          this.pushSystemMessage(
            `${activeVote.targetName} adalah Penyusup terakhir! Dia dapat 1 Kesempatan Terakhir menebak Kata Warga!`,
          );
          return { outcome: 'final_spy_last_chance' };
        }

        if (elimEval.outcome === 'spies_outnumber') {
          const deltas = calculateKataKataScoreDeltas({
            playerUids: activePlayers.map((p) => p.uid),
            spyUids: this.serverState.spyUids,
            winnerTeam: 'mata_mata',
            victoryType: 'spies_outnumber',
          });
          this.applyScoreDeltas(deltas);
          this.room = {
            ...this.room,
            status: 'round_end',
            currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
            eliminatedUids: nextEliminatedUids,
            eliminationLog: nextEliminationLog,
            activeVote: null,
            pendingSpyGuess: null,
            lastRoundResult: {
              roundNumber: this.room.roundNumber,
              winnerTeam: 'mata_mata',
              reason: `${activeVote.targetName} tereliminasi! Jumlah Penyusup menyamai Warga — Tim Penyusup menang!`,
              locationName: this.serverState.locationName,
              guessedLocation: null,
              citizenWord: this.serverState.citizenWord,
              spyWord: this.serverState.spyWord,
              spyUids: this.serverState.spyUids,
              spyNames: this.serverState.spyNames,
              resolvedAtMs: now,
              scoresApplied: true,
            },
            updatedAt: now,
          };
          this.pushSystemMessage(this.room.lastRoundResult!.reason);
          return { outcome: 'spies_outnumber' };
        }

        this.room = {
          ...this.room,
          status: 'playing',
          eliminatedUids: nextEliminatedUids,
          eliminationLog: nextEliminationLog,
          activeVote: null,
          updatedAt: now,
        };
        this.pushSystemMessage(
          elimEval.wasSpy
            ? `${activeVote.targetName} (Penyusup) tereliminasi! Masih ada Penyusup lain.`
            : `${activeVote.targetName} (Warga) tereliminasi! Permainan berlanjut.`,
        );
        return { outcome: 'continue' };
      }

      case 'cancelKataKataVote': {
        this.requireHost(senderDeviceUid);
        if (this.room.status === 'voting') {
          this.room = { ...this.room, status: 'playing', activeVote: null, updatedAt: now };
          this.pushSystemMessage('Host membatalkan voting.');
        }
        return {};
      }

      case 'submitKataKataLastChanceGuess': {
        const spy = this.resolveActor(senderDeviceUid, payload);
        if (
          this.room.status !== 'spy_guess' ||
          !this.room.pendingSpyGuess ||
          !this.serverState ||
          this.room.pendingSpyGuess.spyUid !== spy.uid
        ) {
          throw new Error('Bukan giliranmu menebak Kata Warga.');
        }
        const surrender = Boolean(payload.surrender);
        const guessedWord = surrender ? '' : String(payload.guessedWord ?? '').trim().slice(0, 60);
        if (!surrender && !guessedWord) {
          throw new Error('Tulis tebakan Kata Warga terlebih dahulu.');
        }

        const actualCitizenWord = this.serverState.citizenWord ?? '';
        const correct = surrender
          ? false
          : evaluateKataKataLastChanceGuess(guessedWord, actualCitizenWord);
        const winnerTeam: 'warga' | 'mata_mata' = correct ? 'mata_mata' : 'warga';
        const activePlayers = filterActivePlayers(this.getPlayersList());
        const deltas = calculateKataKataScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          spyUids: this.serverState.spyUids,
          winnerTeam,
          victoryType: correct ? 'last_chance_correct' : 'last_chance_wrong',
        });
        this.applyScoreDeltas(deltas);

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          pendingSpyGuess: null,
          activeVote: null,
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam,
            reason: surrender
              ? `${spy.displayName} menyerah menebak Kata Warga (${actualCitizenWord}). Warga menang!`
              : correct
                ? `${spy.displayName} menebak Kata Warga "${guessedWord}" dengan TEPAT! Penyusup mencuri kemenangan!`
                : `${spy.displayName} menebak "${guessedWord}" (aslinya: ${actualCitizenWord}). Warga menang!`,
            locationName: this.serverState.locationName,
            guessedLocation: null,
            citizenWord: actualCitizenWord,
            spyWord: this.serverState.spyWord,
            guessedWord: surrender ? null : guessedWord,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return { correct, winnerTeam };
      }

      case 'resolveKataKataTimeout': {
        if (this.room.status !== 'playing' || !this.serverState) return {};
        const activePlayers = filterActivePlayers(this.getPlayersList());
        const deltas = calculateKataKataScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          spyUids: this.serverState.spyUids,
          winnerTeam: 'mata_mata',
          victoryType: 'timeout',
        });
        this.applyScoreDeltas(deltas);

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam: 'mata_mata',
            reason: 'Waktu habis! Penyusup berhasil menyamar sampai akhir.',
            locationName: this.serverState.locationName,
            guessedLocation: null,
            citizenWord: this.serverState.citizenWord,
            spyWord: this.serverState.spyWord,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return {};
      }

      // ===================== GAME #3: SATU FREKUENSI =====================
      case 'startSatuFrekuensiRound': {
        this.requireHost(senderDeviceUid);
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 2) {
          throw new Error('Minimal 2 pemain aktif (tidak BRB) dibutuhkan untuk Satu Frekuensi.');
        }
        const pool = mergeSpectrumPool(
          this.room.enabledPacks,
          this.room.customSpectrums ?? [],
        );
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;
        const prevKey = this.room.frequencyState
          ? `${this.room.frequencyState.leftLabel}|${this.room.frequencyState.rightLabel}`
          : null;

        const dealt = dealSatuFrekuensiRound({
          playerUids: activePlayers.map((p) => p.uid),
          pool,
          previousSpectrumKey: prevKey,
          previousRotationIndex: this.room.frequencyState?.rotationIndex ?? null,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);
        this.frequencyGuessesByRound.set(roundId, new Map());

        const psychicName = this.players.get(dealt.psychicUid)?.displayName ?? 'Penerawang';
        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: `${dealt.spectrum.leftLabel} ↔ ${dealt.spectrum.rightLabel}`,
          spyUids: [dealt.psychicUid],
          spyNames: [psychicName],
          targetValue: dealt.targetValue,
          createdAtMs: now,
        };

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: 0,
          firstSpeakerUid: dealt.psychicUid,
          frequencyState: {
            phase: 'clue',
            psychicUid: dealt.psychicUid,
            psychicName,
            rotationIndex: dealt.rotationIndex,
            leftLabel: dealt.spectrum.leftLabel,
            rightLabel: dealt.spectrum.rightLabel,
            category: dealt.spectrum.category,
            clueText: '',
            lockedUids: [],
            revealedTarget: null,
            revealedGuesses: [],
            psychicBonus: 0,
          },
          activeRecap: null,
          updatedAt: now,
        };
        this.pushSystemMessage(`Ronde ${nextRound} Satu Frekuensi! ${psychicName} menjadi Penerawang.`);
        return { roundNumber: nextRound, roundId };
      }

      case 'submitSatuFrekuensiClue': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        if (!this.room.frequencyState || this.room.frequencyState.psychicUid !== actor.uid) {
          throw new Error('Hanya Penerawang yang dapat mengirim petunjuk.');
        }
        const clueText = String(payload.clueText ?? '').trim().slice(0, 80);
        if (!clueText) throw new Error('Tulis petunjuk terlebih dahulu.');

        this.room = {
          ...this.room,
          frequencyState: {
            ...this.room.frequencyState,
            phase: 'dialing',
            clueText,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(`Petunjuk ${actor.displayName}: "${clueText}" — silakan putar dial!`);
        return {};
      }

      case 'submitSatuFrekuensiGuess': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        if (!this.room.frequencyState || this.room.frequencyState.phase !== 'dialing') {
          throw new Error('Fase putar dial belum aktif.');
        }
        if (actor.uid === this.room.frequencyState.psychicUid) {
          throw new Error('Penerawang tidak ikut menebak dial.');
        }
        const value = Math.min(100, Math.max(0, Math.round(Number(payload.guessValue ?? 50))));
        const guesses =
          this.frequencyGuessesByRound.get(this.room.currentRoundId) ?? new Map<string, number>();
        guesses.set(actor.uid, value);
        this.frequencyGuessesByRound.set(this.room.currentRoundId, guesses);

        const lockedSet = new Set(this.room.frequencyState.lockedUids);
        lockedSet.add(actor.uid);
        this.room = {
          ...this.room,
          frequencyState: {
            ...this.room.frequencyState,
            lockedUids: Array.from(lockedSet),
          },
          updatedAt: now,
        };
        return { value };
      }

      case 'advanceSatuFrekuensiPhase': {
        this.requireHost(senderDeviceUid);
        const fs = this.room.frequencyState;
        if (!fs || !this.serverState) throw new Error('Ronde Satu Frekuensi tidak aktif.');

        const direction = payload.direction === 'prev' ? 'prev' : 'next';
        if (direction === 'prev') {
          if (fs.phase === 'dialing') {
            this.room = {
              ...this.room,
              frequencyState: { ...fs, phase: 'clue' },
              updatedAt: now,
            };
          }
          return {};
        }

        if (fs.phase === 'clue') {
          this.room = {
            ...this.room,
            frequencyState: { ...fs, phase: 'dialing' },
            updatedAt: now,
          };
          return {};
        }

        if (fs.phase === 'dialing') {
          const targetValue = this.serverState.targetValue ?? 50;
          const activePlayers = filterActivePlayers(this.getPlayersList());
          const guessesMap = this.frequencyGuessesByRound.get(this.room.currentRoundId) ?? new Map();
          const submissionsByUid: Record<string, number> = {};
          for (const [uid, val] of guessesMap.entries()) {
            submissionsByUid[uid] = val;
          }

          const scored = scoreSatuFrekuensiRound({
            psychicUid: fs.psychicUid,
            targetValue,
            players: activePlayers.map((p) => ({
              uid: p.uid,
              displayName: p.displayName,
              avatarColor: p.avatarColor,
            })),
            submissionsByUid,
          });
          this.applyScoreDeltas(scored.deltas);

          this.room = {
            ...this.room,
            status: 'round_end',
            currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
            frequencyState: {
              ...fs,
              phase: 'reveal',
              revealedTarget: targetValue,
              revealedGuesses: scored.revealedGuesses,
              psychicBonus: scored.psychicBonus,
            },
            lastRoundResult: {
              roundNumber: this.room.roundNumber,
              winnerTeam: 'frekuensi',
              reason: `Target frekuensi berada di angka ${targetValue}! Penerawang dapat +${scored.psychicBonus} poin.`,
              locationName: `${fs.leftLabel} ↔ ${fs.rightLabel}`,
              guessedLocation: null,
              spyUids: [fs.psychicUid],
              spyNames: [fs.psychicName],
              resolvedAtMs: now,
              scoresApplied: true,
            },
            updatedAt: now,
          };
          this.pushSystemMessage(this.room.lastRoundResult!.reason);
        }
        return {};
      }

      // ===================== GAME #4: FAKTA HARI INI =====================
      case 'startFaktaHariIniRound': {
        this.requireHost(senderDeviceUid);
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 3) {
          throw new Error('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Fakta Hari Ini.');
        }
        const pool = mergeFactPool(this.room.enabledPacks, this.room.customFacts ?? []);
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;

        const dealt = dealFaktaHariIniRound({
          players: activePlayers.map((p) => ({
            uid: p.uid,
            displayName: p.displayName,
            controllerUid: p.controllerUid ?? p.uid,
          })),
          hostUid: this.room.hostUid,
          pool,
          previousFactTwist: this.serverState?.factTwist ?? null,
          previousRotationIndex: this.room.faktaState?.rotationIndex ?? null,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);

        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: dealt.fact.category,
          spyUids: [dealt.truthTellerUid],
          spyNames: [dealt.truthTellerName],
          factPrefix: dealt.fact.prefix,
          factTwist: dealt.fact.twist,
          factSuffix: dealt.fact.suffix,
          factCategory: dealt.fact.category,
          truthTellerUid: dealt.truthTellerUid,
          truthTellerName: dealt.truthTellerName,
          createdAtMs: now,
        };

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: 0,
          firstSpeakerUid: dealt.guesserUid,
          faktaState: {
            phase: 'discussion',
            guesserUid: dealt.guesserUid,
            guesserName: dealt.guesserName,
            rotationIndex: dealt.rotationIndex,
            phaseControllerUid: dealt.phaseControllerUid,
            phaseControllerName: dealt.phaseControllerName,
            pickedUid: null,
            pickedName: null,
            guesserWon: null,
          },
          activeRecap: null,
          updatedAt: now,
        };
        this.pushSystemMessage(`Ronde ${nextRound} Fakta Hari Ini! ${dealt.guesserName} jadi Penebak!`);
        return { roundNumber: nextRound, roundId };
      }

      case 'advanceFaktaHariIniPhase': {
        const fs = this.room.faktaState;
        if (!fs) throw new Error('Ronde Fakta Hari Ini tidak aktif.');
        if (!this.ownsSeat(senderDeviceUid, fs.phaseControllerUid)) {
          throw new Error(`Hanya ${fs.phaseControllerName} yang dapat mengontrol fase ronde ini.`);
        }
        const direction =
          payload.direction === 'prev' || payload.direction === 'back' ? 'prev' : 'next';
        const nextPhase = direction === 'prev' ? 'discussion' : 'guessing';
        this.room = {
          ...this.room,
          faktaState: { ...fs, phase: nextPhase },
          updatedAt: now,
        };
        if (nextPhase === 'guessing') {
          this.pushSystemMessage(`Saatnya ${fs.guesserName} memilih siapa Pembawa Fakta Asli!`);
        }
        return {};
      }

      case 'submitFaktaHariIniGuess': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        const fs = this.room.faktaState;
        if (!fs || !this.serverState || fs.phase !== 'guessing') {
          throw new Error('Fase menebak belum aktif.');
        }
        if (actor.uid !== fs.guesserUid) {
          throw new Error('Hanya Penebak yang dapat menentukan pilihan.');
        }
        const pickedUid = String(payload.pickedUid ?? '');
        const picked = this.players.get(pickedUid);
        if (!picked || picked.uid === fs.guesserUid) {
          throw new Error('Pilihan tidak valid.');
        }

        const activePlayers = filterActivePlayers(this.getPlayersList());
        const truthTellerUid = this.serverState.truthTellerUid ?? '';
        const truthTellerName = this.serverState.truthTellerName ?? 'Pembawa Fakta';
        const scored = calculateFaktaHariIniScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          guesserUid: fs.guesserUid,
          truthTellerUid,
          pickedUid: picked.uid,
        });
        this.applyScoreDeltas(scored.deltas);

        const winnerTeam: 'penebak' | 'bluffer' = scored.guesserWon ? 'penebak' : 'bluffer';
        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          faktaState: {
            ...fs,
            phase: 'reveal',
            pickedUid: picked.uid,
            pickedName: picked.displayName,
            guesserWon: scored.guesserWon,
            revealedFactPrefix: this.serverState.factPrefix,
            revealedFactTwist: this.serverState.factTwist,
            revealedFactSuffix: this.serverState.factSuffix,
            revealedCategory: this.serverState.factCategory,
            revealedTruthTellerUid: truthTellerUid,
            revealedTruthTellerName: truthTellerName,
            guesserPoints: scored.guesserPoints,
            blufferPointsEach: scored.blufferPointsEach,
          },
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam,
            reason: scored.guesserWon
              ? `${fs.guesserName} menebak TEPAT! ${truthTellerName} adalah Pembawa Fakta (+${scored.guesserPoints} poin).`
              : `${fs.guesserName} tertipu oleh ${picked.displayName}! Pembawa Fakta aslinya ${truthTellerName}. Seluruh Tim Bluffer +1 poin!`,
            locationName: this.serverState.factCategory ?? 'Fakta Hari Ini',
            guessedLocation: null,
            spyUids: [truthTellerUid],
            spyNames: [truthTellerName],
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(this.room.lastRoundResult!.reason);
        return { guesserWon: scored.guesserWon };
      }

      // ===================== GAME #5: PELUKIS GADUNGAN =====================
      case 'startPelukisRound': {
        this.requireHost(senderDeviceUid);
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 3) {
          throw new Error('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Pelukis Gadungan.');
        }
        const pool = mergeDrawingPromptPool(
          this.room.enabledPacks,
          this.room.customDrawingPrompts ?? [],
        );
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;
        const totalStrokeRounds: 1 | 2 = this.room.pelukisStrokeRounds === 1 ? 1 : 2;

        const dealt = dealPelukisGadunganRound({
          players: activePlayers.map((p) => ({
            uid: p.uid,
            displayName: p.displayName,
            avatarColor: p.avatarColor,
          })),
          pool,
          spyMode: this.room.spyMode,
          previousWord: this.serverState?.drawingWord ?? null,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);
        this.pelukisVotesByRound.set(roundId, new Map());

        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: dealt.prompt.category,
          drawingCategory: dealt.prompt.category,
          drawingWord: dealt.prompt.word,
          spyUids: dealt.gadunganUids,
          spyNames: dealt.gadunganNames,
          createdAtMs: now,
        };

        const firstTurnUid = dealt.turnOrder[0];
        const firstTurnName = dealt.turnNamesByUid[firstTurnUid] ?? 'Pemain';

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: 0,
          firstSpeakerUid: firstTurnUid,
          lukisanState: {
            phase: 'drawing',
            category: dealt.prompt.category,
            totalStrokeRounds,
            strokeRound: 1,
            turnOrder: dealt.turnOrder,
            turnNamesByUid: dealt.turnNamesByUid,
            turnColorsByUid: dealt.turnColorsByUid,
            currentTurnIndex: 0,
            currentTurnUid: firstTurnUid,
            currentTurnName: firstTurnName,
            strokes: [],
            submittedVoteUids: [],
            accusedUid: null,
            accusedName: null,
          },
          activeRecap: null,
          updatedAt: now,
        };
        this.pushSystemMessage(
          `Ronde ${nextRound} Pelukis Gadungan dimulai! Tema: ${dealt.prompt.category}. Giliran pertama: ${firstTurnName}.`,
        );
        return { roundNumber: nextRound, roundId };
      }

      case 'submitPelukisStroke':
      case 'skipPelukisTurn': {
        const lukisan = this.room.lukisanState;
        if (!lukisan || this.room.status !== 'playing' || lukisan.phase !== 'drawing') {
          throw new Error('Fase menggambar sedang tidak aktif.');
        }

        const isSkip = action === 'skipPelukisTurn' || payload.action === 'skip';
        if (!isSkip) {
          const actor = this.resolveActor(senderDeviceUid, payload);
          if (actor.uid !== lukisan.currentTurnUid) {
            throw new Error(`Sekarang giliran ${lukisan.currentTurnName} untuk menggambar.`);
          }
        } else if (senderDeviceUid !== this.room.hostUid) {
          const actor = this.resolveActor(senderDeviceUid, payload);
          if (actor.uid !== lukisan.currentTurnUid) {
            throw new Error('Hanya pemain aktif atau Host yang dapat melewati giliran.');
          }
        }

        const nextStrokes: LukisanStroke[] = [...lukisan.strokes];
        if (!isSkip) {
          const rawPoints = Array.isArray(payload.points) ? (payload.points as number[]) : [];
          const cleanPoints = normalizeAndSimplifyPoints(rawPoints, 10, 50);
          if (cleanPoints.length < 4) {
            throw new Error('Buat minimal 1 tarikan garis pada kanvas sebelum mengirim.');
          }
          nextStrokes.push({
            strokeIndex: nextStrokes.length + 1,
            strokeRound: lukisan.strokeRound,
            uid: lukisan.currentTurnUid,
            displayName: lukisan.turnNamesByUid[lukisan.currentTurnUid] ?? lukisan.currentTurnName,
            color: lukisan.turnColorsByUid[lukisan.currentTurnUid] ?? '#F43F5E',
            points: cleanPoints,
          });
        }

        const nextIndex = lukisan.currentTurnIndex + 1;
        let nextPhase: LukisanPhase = lukisan.phase;
        let nextStrokeRound = lukisan.strokeRound;
        let nextTurnIndex = nextIndex;
        let nextTurnUid = '';
        let nextTurnName = '';

        if (nextIndex < lukisan.turnOrder.length) {
          nextTurnUid = lukisan.turnOrder[nextIndex];
          nextTurnName = lukisan.turnNamesByUid[nextTurnUid] ?? 'Pemain';
        } else if (lukisan.strokeRound < lukisan.totalStrokeRounds) {
          nextStrokeRound = lukisan.strokeRound + 1;
          nextTurnIndex = 0;
          nextTurnUid = lukisan.turnOrder[0];
          nextTurnName = lukisan.turnNamesByUid[nextTurnUid] ?? 'Pemain';
          this.pushSystemMessage(
            `Putaran #${nextStrokeRound} dimulai! Giliran ${nextTurnName} menambah 1 goresan.`,
          );
        } else {
          nextPhase = 'voting';
          nextTurnIndex = 0;
          nextTurnUid = '';
          nextTurnName = '';
          this.pushSystemMessage(
            'Semua goresan selesai! Saatnya berdiskusi dan memilih Pelukis Gadungan secara rahasia.',
          );
        }

        this.room = {
          ...this.room,
          lukisanState: {
            ...lukisan,
            phase: nextPhase,
            strokeRound: nextStrokeRound,
            currentTurnIndex: nextTurnIndex,
            currentTurnUid: nextTurnUid,
            currentTurnName: nextTurnName,
            strokes: nextStrokes,
          },
          updatedAt: now,
        };
        return { phase: nextPhase, strokeCount: nextStrokes.length };
      }

      case 'castPelukisVote': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        const lukisan = this.room.lukisanState;
        if (!lukisan || !this.serverState || lukisan.phase !== 'voting') {
          throw new Error('Voting Pelukis Gadungan belum aktif.');
        }
        if (!lukisan.turnOrder.includes(actor.uid)) {
          throw new Error('Hanya peserta ronde ini yang berhak memilih.');
        }
        const targetUid = String(payload.targetUid ?? '');
        if (!lukisan.turnOrder.includes(targetUid) || targetUid === actor.uid) {
          throw new Error('Pilihan tersangka tidak valid.');
        }

        const votesMap =
          this.pelukisVotesByRound.get(this.room.currentRoundId) ?? new Map<string, string>();
        votesMap.set(actor.uid, targetUid);
        this.pelukisVotesByRound.set(this.room.currentRoundId, votesMap);

        const nextSubmittedUids = lukisan.turnOrder.filter((uid) => votesMap.has(uid));
        if (nextSubmittedUids.length < lukisan.turnOrder.length) {
          this.room = {
            ...this.room,
            lukisanState: {
              ...lukisan,
              submittedVoteUids: nextSubmittedUids,
            },
            updatedAt: now,
          };
          return { allVoted: false };
        }

        return this.finalizePelukisVoteTally(nextSubmittedUids, now);
      }

      case 'resolvePelukisVote': {
        this.requireHost(senderDeviceUid);
        const lukisan = this.room.lukisanState;
        if (!lukisan || !this.serverState) {
          throw new Error('Ronde Pelukis Gadungan tidak aktif.');
        }
        if (this.room.status === 'round_end' || lukisan.phase === 'reveal' || lukisan.phase === 'gadungan_guess') {
          return {};
        }
        if (lukisan.phase !== 'voting') {
          throw new Error('Voting belum aktif.');
        }
        return this.finalizePelukisVoteTally(lukisan.submittedVoteUids, now);
      }

      case 'submitPelukisGuess': {
        const lukisan = this.room.lukisanState;
        if (!lukisan || !this.serverState || lukisan.phase !== 'gadungan_guess') {
          throw new Error('Tidak ada fase tebakan terakhir Pelukis Gadungan.');
        }
        const surrender = Boolean(payload.surrender);
        const guessedWord = surrender ? '' : String(payload.guessedWord ?? '').trim().slice(0, 60);
        if (!surrender && !guessedWord) {
          throw new Error('Ketik tebakan Kata Rahasia terlebih dahulu.');
        }

        let actorName = lukisan.accusedName ?? 'Pelukis Gadungan';
        if (!surrender || senderDeviceUid !== this.room.hostUid) {
          const actor = this.resolveActor(senderDeviceUid, payload);
          if (actor.uid !== lukisan.accusedUid) {
            throw new Error('Hanya Pelukis Gadungan yang tertangkap yang dapat menebak kata rahasia.');
          }
          actorName = actor.displayName;
        }

        const secretWord = this.serverState.drawingWord ?? this.serverState.locationName;
        const category = this.serverState.drawingCategory ?? lukisan.category;
        const isCorrect = !surrender && evaluatePelukisWordGuess(guessedWord, secretWord);
        const winnerTeam: 'pelukis' | 'gadungan' = isCorrect ? 'gadungan' : 'pelukis';

        const activePlayers = filterActivePlayers(this.getPlayersList());
        const deltas = calculatePelukisScoreDeltas({
          playerUids: activePlayers.map((p) => p.uid),
          gadunganUids: this.serverState.spyUids,
          winnerTeam,
        });
        this.applyScoreDeltas(deltas);

        const reason = surrender
          ? `${actorName} menyerah menebak! Pelukis Asli menangkap Pelukis Gadungan (${secretWord}) dan meraih +2 poin!`
          : isCorrect
            ? `${actorName} menebak "${guessedWord}" dengan TEPAT dan mencuri kemenangan (+3 poin)!`
            : `Tebakan ${actorName} ("${guessedWord}") meleset! Kata aslinya "${secretWord}". Semua Pelukis Asli +2 poin!`;

        this.room = {
          ...this.room,
          status: 'round_end',
          currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
          lukisanState: {
            ...lukisan,
            phase: 'reveal',
            revealedWord: secretWord,
            gadunganUids: this.serverState.spyUids,
            gadunganNames: this.serverState.spyNames,
            guessedWord: surrender ? null : guessedWord,
          },
          lastRoundResult: {
            roundNumber: this.room.roundNumber,
            winnerTeam,
            reason,
            locationName: secretWord,
            guessedLocation: surrender ? null : guessedWord,
            guessedWord: surrender ? null : guessedWord,
            drawingCategory: category,
            drawingWord: secretWord,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(reason);
        return { isCorrect, winnerTeam };
      }

      // ===================== GAME #6: MALAM SILUMAN =====================
      case 'startMalamSilumanRound': {
        this.requireHost(senderDeviceUid);
        if (this.room.status !== 'lobby' && this.room.status !== 'round_end') {
          throw new Error('Ronde sedang berlangsung.');
        }
        const activePlayers = filterActivePlayers(this.getPlayersList());
        if (activePlayers.length < 4) {
          throw new Error(
            'Minimal 4 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Malam Siluman.',
          );
        }

        const settings = sanitizeMalamSilumanSettings(this.room.malamSilumanSettings);
        const nextRound = this.room.roundNumber + 1;
        const roundId = `r${nextRound}_${now.toString(36)}`;

        const participantUids = activePlayers.map((p) => p.uid);
        const participantNamesByUid: Record<string, string> = {};
        for (const p of activePlayers) {
          participantNamesByUid[p.uid] = p.displayName.slice(0, 40);
        }

        const dealt = dealMalamSilumanRound({
          playerUids: participantUids,
          playerNamesByUid: participantNamesByUid,
          settings,
          roundId,
        });

        const secretMap = new Map<string, PlayerSecretDoc>();
        for (const [uid, sec] of Object.entries(dealt.secretsByUid)) {
          secretMap.set(uid, { ...sec, createdAt: now });
        }
        this.secretsByRound.set(roundId, secretMap);

        this.serverState = {
          roundId,
          roundNumber: nextRound,
          locationName: 'Desa Malam Siluman',
          spyUids: dealt.wolfUids,
          spyNames: dealt.wolfNames,
          wolfRolesByUid: dealt.rolesByUid,
          wolfNamesByUid: participantNamesByUid,
          lastProtectedByDoctor: null,
          createdAtMs: now,
        };

        const nextState: MalamSilumanState = {
          phase: 'night',
          nightNumber: 1,
          dayNumber: 0,
          participantUids,
          participantNamesByUid,
          livingUids: participantUids,
          deadPlayers: [],
          submittedNightUids: [],
          submittedVoteUids: [],
          lastNightSummary: null,
          lastDaySummary: null,
          lastHunterSummary: null,
          pendingHunterUid: null,
          pendingHunterName: null,
          hunterTrigger: null,
          activeDeckComposition: dealt.deckComposition,
        };

        this.room = {
          ...this.room,
          status: 'playing',
          roundNumber: nextRound,
          currentRoundId: roundId,
          roundEndsAtMs: 0,
          firstSpeakerUid: '',
          selectedLocationNames: [],
          eliminatedUids: [],
          eliminationLog: [],
          malamSilumanSettings: settings,
          malamSilumanState: nextState,
          activeVote: null,
          pendingSpyGuess: null,
          activeRecap: null,
          updatedAt: now,
        };

        this.pushSystemMessage(
          `Malam #1 turun di desa (${activePlayers.length} warga, ${dealt.wolfUids.length} Siluman). Semua pemain hidup silakan kirim aksi malamnya!`,
        );
        return { roundNumber: nextRound, roundId };
      }

      case 'submitMalamSilumanNightAction': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        const ms = this.room.malamSilumanState;
        if (!ms || !this.serverState || this.room.status !== 'playing' || ms.phase !== 'night') {
          throw new Error('Fase Malam sedang tidak aktif.');
        }
        if (!ms.livingUids.includes(actor.uid)) {
          throw new Error('Hanya pemain yang masih hidup yang dapat beraksi di malam hari.');
        }
        const targetUid = String(payload.targetUid ?? '').trim();
        if (!targetUid) {
          throw new Error('Pilih target atau kirim aksi Ronda Malam terlebih dahulu.');
        }

        const actorRole = this.serverState.wolfRolesByUid?.[actor.uid] ?? 'warga';
        if (
          actorRole === 'tabib' &&
          this.serverState.lastProtectedByDoctor &&
          targetUid === this.serverState.lastProtectedByDoctor
        ) {
          throw new Error('Tabib tidak boleh melindungi orang yang sama 2 malam berturut-turut.');
        }

        const nightKey = `${this.room.currentRoundId}_n${ms.nightNumber}`;
        const nightMap = this.malamSilumanNightActionsByRound.get(nightKey) ?? new Map<string, string>();
        nightMap.set(actor.uid, targetUid);
        this.malamSilumanNightActionsByRound.set(nightKey, nightMap);

        const nextSubmittedUids = ms.livingUids.filter((u) => nightMap.has(u));
        if (nextSubmittedUids.length < ms.livingUids.length) {
          this.room = {
            ...this.room,
            malamSilumanState: {
              ...ms,
              submittedNightUids: nextSubmittedUids,
            },
            updatedAt: now,
          };
          return { allSubmitted: false };
        }

        return this.finalizeMalamSilumanNight(nextSubmittedUids, now);
      }

      case 'resolveMalamSilumanNight': {
        this.requireHost(senderDeviceUid);
        const ms = this.room.malamSilumanState;
        if (!ms || !this.serverState) {
          throw new Error('Ronde Malam Siluman tidak aktif.');
        }
        if (this.room.status !== 'playing' || ms.phase !== 'night') {
          return {};
        }
        return this.finalizeMalamSilumanNight(ms.submittedNightUids, now);
      }

      case 'advanceMalamSilumanDayPhase': {
        this.requireHost(senderDeviceUid);
        const ms = this.room.malamSilumanState;
        if (!ms || this.room.status !== 'playing') {
          throw new Error('Ronde Malam Siluman sedang tidak berjalan.');
        }
        const nextPhase = payload.nextPhase;
        if (nextPhase !== 'day_discussion' && nextPhase !== 'day_voting') {
          throw new Error('Transisi fase tidak valid.');
        }

        if (nextPhase === 'day_discussion' && ms.phase === 'dawn') {
          this.room = {
            ...this.room,
            malamSilumanState: {
              ...ms,
              phase: 'day_discussion',
            },
            updatedAt: now,
          };
          this.pushSystemMessage(
            `Siang #${ms.dayNumber} dimulai! Warga desa berdiskusi mencari siapa Siluman.`,
          );
          return { phase: 'day_discussion' };
        }

        if (nextPhase === 'day_voting' && (ms.phase === 'day_discussion' || ms.phase === 'dawn')) {
          this.room = {
            ...this.room,
            malamSilumanState: {
              ...ms,
              phase: 'day_voting',
              submittedVoteUids: [],
            },
            updatedAt: now,
          };
          this.pushSystemMessage(
            `Voting Eksekusi Siang #${ms.dayNumber} dibuka! Setiap warga hidup memilih secara rahasia.`,
          );
          return { phase: 'day_voting' };
        }

        return {};
      }

      case 'castMalamSilumanVote': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        const ms = this.room.malamSilumanState;
        if (!ms || !this.serverState || this.room.status !== 'playing' || ms.phase !== 'day_voting') {
          throw new Error('Voting eksekusi sedang tidak aktif.');
        }
        if (!ms.livingUids.includes(actor.uid)) {
          throw new Error('Pemain yang sudah gugur tidak memiliki hak suara.');
        }
        const targetUid = String(payload.targetUid ?? '').trim();
        if (!targetUid) {
          throw new Error('Pilih salah satu tersangka atau "Lewati Eksekusi".');
        }
        if (targetUid === actor.uid) {
          throw new Error('Kamu tidak dapat memilih dirimu sendiri.');
        }
        if (targetUid !== 'skip' && !ms.livingUids.includes(targetUid)) {
          throw new Error('Target yang dipilih tidak valid atau sudah gugur.');
        }

        const voteKey = `${this.room.currentRoundId}_d${ms.dayNumber}`;
        const voteMap = this.malamSilumanVotesByRound.get(voteKey) ?? new Map<string, string>();
        voteMap.set(actor.uid, targetUid);
        this.malamSilumanVotesByRound.set(voteKey, voteMap);

        const nextSubmittedUids = ms.livingUids.filter((u) => voteMap.has(u));
        if (nextSubmittedUids.length < ms.livingUids.length) {
          this.room = {
            ...this.room,
            malamSilumanState: {
              ...ms,
              submittedVoteUids: nextSubmittedUids,
            },
            updatedAt: now,
          };
          return { allVoted: false };
        }

        return this.finalizeMalamSilumanVote(nextSubmittedUids, now);
      }

      case 'resolveMalamSilumanVote': {
        this.requireHost(senderDeviceUid);
        const ms = this.room.malamSilumanState;
        if (!ms || !this.serverState) {
          throw new Error('Ronde Malam Siluman tidak aktif.');
        }
        if (this.room.status !== 'playing' || ms.phase !== 'day_voting') {
          return {};
        }
        return this.finalizeMalamSilumanVote(ms.submittedVoteUids, now);
      }

      case 'submitMalamSilumanHunterShot': {
        const ms = this.room.malamSilumanState;
        if (!ms || !this.serverState || this.room.status !== 'playing' || ms.phase !== 'hunter_revenge' || !ms.pendingHunterUid) {
          throw new Error('Tidak ada fase Tembakan Terakhir Pemburu yang aktif.');
        }
        const skip = Boolean(payload.skip);
        const targetUid = String(payload.targetUid ?? '').trim();
        if (!skip && !targetUid) {
          throw new Error('Pilih 1 pemain hidup untuk ditembak atau lewati.');
        }
        if (!skip || senderDeviceUid !== this.room.hostUid) {
          const actor = this.resolveActor(senderDeviceUid, payload);
          if (actor.uid !== ms.pendingHunterUid) {
            throw new Error('Hanya Pemburu yang baru gugur yang dapat menembak.');
          }
        }

        const rolesByUid = this.serverState.wolfRolesByUid ?? {};
        const namesByUid = ms.participantNamesByUid;
        const settings = sanitizeMalamSilumanSettings(this.room.malamSilumanSettings);

        let nextLivingUids = [...ms.livingUids];
        const nextDeadPlayers = [...ms.deadPlayers];
        let hunterSummary: string;

        if (!skip) {
          if (!ms.livingUids.includes(targetUid)) {
            throw new Error('Target tembakan bukan pemain yang masih hidup.');
          }
          const targetName = namesByUid[targetUid] ?? 'Pemain';
          const targetRole: WerewolfRoleId = rolesByUid[targetUid] ?? 'warga';
          nextLivingUids = nextLivingUids.filter((u) => u !== targetUid);
          nextDeadPlayers.push(
            buildDeadPlayerEntry({
              uid: targetUid,
              displayName: targetName,
              cause: 'hunter_shot',
              dayOrNightNumber: ms.dayNumber,
              role: targetRole,
              revealRoleOnDeath: settings.revealRoleOnDeath,
            }),
          );
          hunterSummary = `${ms.pendingHunterName ?? 'Pemburu'} menembak ${targetName} dengan Tembakan Terakhir${
            settings.revealRoleOnDeath ? ` (${MALAM_SILUMAN_ROLES[targetRole].name})` : ''
          }!`;
        } else {
          hunterSummary = `${ms.pendingHunterName ?? 'Pemburu'} menahan Tembakan Terakhirnya.`;
        }

        const victory = evaluateMalamSilumanVictory({
          livingUids: nextLivingUids,
          rolesByUid,
          namesByUid,
        });

        if (victory.winnerTeam && victory.reason) {
          const deltas = calculateMalamSilumanScoreDeltas({
            participantUids: ms.participantUids,
            livingUids: nextLivingUids,
            rolesByUid,
            winnerTeam: victory.winnerTeam,
            tumbalWinnerUid: null,
          });
          this.applyScoreDeltas(deltas);

          const roundResult: RoundResult = {
            roundNumber: this.room.roundNumber,
            winnerTeam: victory.winnerTeam,
            reason: `${hunterSummary} ${victory.reason}`,
            locationName: 'Desa Malam Siluman',
            guessedLocation: null,
            spyUids: this.serverState.spyUids,
            spyNames: this.serverState.spyNames,
            resolvedAtMs: now,
            scoresApplied: true,
          };

          this.room = {
            ...this.room,
            status: 'round_end',
            currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
            malamSilumanState: {
              ...ms,
              phase: 'reveal',
              livingUids: nextLivingUids,
              deadPlayers: nextDeadPlayers,
              lastHunterSummary: hunterSummary,
              pendingHunterUid: null,
              pendingHunterName: null,
              hunterTrigger: null,
              revealedRolesByUid: rolesByUid,
            },
            lastRoundResult: roundResult,
            updatedAt: now,
          };
          this.pushSystemMessage(roundResult.reason);
          return { winnerTeam: victory.winnerTeam };
        }

        if (ms.hunterTrigger === 'night') {
          this.room = {
            ...this.room,
            malamSilumanState: {
              ...ms,
              phase: 'day_discussion',
              livingUids: nextLivingUids,
              deadPlayers: nextDeadPlayers,
              lastHunterSummary: hunterSummary,
              pendingHunterUid: null,
              pendingHunterName: null,
              hunterTrigger: null,
            },
            updatedAt: now,
          };
          this.pushSystemMessage(`${hunterSummary} Diskusi Siang #${ms.dayNumber} dimulai!`);
          return { phase: 'day_discussion' };
        }

        const nextNightNumber = ms.nightNumber + 1;
        this.room = {
          ...this.room,
          malamSilumanState: {
            ...ms,
            phase: 'night',
            nightNumber: nextNightNumber,
            livingUids: nextLivingUids,
            deadPlayers: nextDeadPlayers,
            submittedNightUids: [],
            submittedVoteUids: [],
            lastHunterSummary: hunterSummary,
            pendingHunterUid: null,
            pendingHunterName: null,
            hunterTrigger: null,
          },
          updatedAt: now,
        };
        this.pushSystemMessage(`${hunterSummary} Malam #${nextNightNumber} pun turun...`);
        return { phase: 'night', nightNumber: nextNightNumber };
      }

      // ===================== RETURN TO LOBBY =====================
      case 'returnRoomToLobby':
      case 'returnKataKataToLobby':
      case 'returnSatuFrekuensiToLobby':
      case 'returnFaktaHariIniToLobby':
      case 'returnPelukisToLobby':
      case 'returnMalamSilumanToLobby': {
        this.requireHost(senderDeviceUid);
        this.room = {
          ...this.room,
          status: 'lobby',
          activeVote: null,
          pendingSpyGuess: null,
          eliminatedUids: [],
          eliminationLog: [],
          frequencyState: null,
          faktaState: null,
          lukisanState: null,
          malamSilumanState: null,
          updatedAt: now,
        };
        return {};
      }

      // ===================== v3.1.0 SESSION PLATFORM =====================
      case 'switchRoomGameType': {
        this.requireHost(senderDeviceUid);
        if (this.room.status !== 'lobby' && this.room.status !== 'round_end') {
          throw new Error('Selesaikan atau kembali ke lobi terlebih dahulu sebelum ganti game.');
        }
        const nextGameType = payload.nextGameType as GameType;
        if (
          ![
            'spyfall',
            'kata_kata',
            'satu_frekuensi',
            'fakta_hari_ini',
            'pelukis_gadungan',
            'malam_siluman',
          ].includes(nextGameType)
        ) {
          throw new Error('Jenis permainan tidak valid.');
        }

        const existingCompleted = [...(this.room.completedGames ?? [])];
        const recorded = finalizeCompletedGameRecord({
          matchIndex: existingCompleted.length + 1,
          gameType: this.room.gameType,
          roundsPlayed: this.room.currentMatchRounds ?? 0,
          players: this.getPlayersList(),
          finishedAtMs: now,
        });
        if (recorded) {
          existingCompleted.push(recorded);
        }

        // Reset every player's per-game score cleanly to 0 for the newly selected match
        for (const p of this.getPlayersList()) {
          this.players.set(p.uid, { ...p, score: 0, updatedAt: now });
        }

        this.serverState = null;
        this.room = {
          ...this.room,
          gameType: nextGameType,
          status: 'lobby',
          roundNumber: 0,
          currentMatchRounds: 0,
          currentRoundId: '',
          roundEndsAtMs: 0,
          firstSpeakerUid: '',
          enabledPacks: getDefaultPacksForGame(nextGameType),
          selectedLocationNames: [],
          eliminatedUids: [],
          eliminationLog: [],
          frequencyState: null,
          faktaState: null,
          lukisanState: null,
          malamSilumanState: null,
          activeVote: null,
          pendingSpyGuess: null,
          lastRoundResult: null,
          completedGames: existingCompleted,
          activeRecap: null,
          updatedAt: now,
        };
        this.pushSystemMessage('Host mengganti permainan di ruang LAN. Skor dimulai dari 0.');
        return { recordedPreviousMatch: Boolean(recorded) };
      }

      case 'openSessionRecap': {
        this.requireHost(senderDeviceUid);
        if (this.room.status !== 'lobby' && this.room.status !== 'round_end') {
          throw new Error('Rekap Permainan hanya bisa dibuka di Lobi atau setelah ronde selesai.');
        }

        const completedGames = [...(this.room.completedGames ?? [])];
        const recordedCurrent = finalizeCompletedGameRecord({
          matchIndex: completedGames.length + 1,
          gameType: this.room.gameType,
          roundsPlayed: this.room.currentMatchRounds ?? 0,
          players: this.getPlayersList(),
          finishedAtMs: now,
        });
        if (recordedCurrent) {
          completedGames.push(recordedCurrent);
          for (const p of this.getPlayersList()) {
            this.players.set(p.uid, { ...p, score: 0, updatedAt: now });
          }
        }

        if (completedGames.length === 0) {
          throw new Error('Belum ada ronde yang selesai untuk direkap.');
        }

        const recap = buildSessionRecap({
          completedGames,
          players: this.getPlayersList(),
          generatedAtMs: now,
        });

        this.room = {
          ...this.room,
          status: 'lobby',
          currentMatchRounds: 0,
          completedGames,
          activeRecap: recap,
          updatedAt: now,
        };
        this.pushSystemMessage('Rekap Permainan dibuka untuk seluruh layar!');
        return { recapId: recap.recapId };
      }

      case 'closeSessionRecap': {
        this.requireHost(senderDeviceUid);
        this.room = {
          ...this.room,
          activeRecap: null,
          updatedAt: now,
        };
        return {};
      }

      case 'submitSuitDuelPick': {
        const actor = this.resolveActor(senderDeviceUid, payload);
        const recap = this.room.activeRecap;
        const duel = recap?.tiebreakerDuel;
        if (!recap || !duel || duel.status !== 'picking') {
          throw new Error('Duel Suit sedang tidak menerima pilihan.');
        }
        if (!duel.duelistUids.includes(actor.uid)) {
          throw new Error('Kamu bukan peserta Duel Suit ini.');
        }
        const pick = payload.pick as SuitPick;
        if (!['batu', 'gunting', 'kertas'].includes(pick)) {
          throw new Error('Pilihan Suit tidak valid.');
        }

        const clashKey = `${duel.duelId}_c${duel.clashNumber}`;
        const clashMap = this.suitPicksByClash.get(clashKey) ?? new Map<string, SuitPick>();
        clashMap.set(actor.uid, pick);
        this.suitPicksByClash.set(clashKey, clashMap);

        const submittedUids = duel.duelistUids.filter((uid) => clashMap.has(uid));

        if (submittedUids.length < duel.duelistUids.length) {
          this.room = {
            ...this.room,
            activeRecap: {
              ...recap,
              tiebreakerDuel: { ...duel, submittedUids },
            },
            updatedAt: now,
          };
          return { allSubmitted: false };
        }

        const picksByUid: Record<string, SuitPick> = {};
        for (const uid of duel.duelistUids) {
          const val = clashMap.get(uid);
          if (val) picksByUid[uid] = val;
        }

        const evaluated = evaluateSuitClash({ duel, picksByUid });
        const finished = evaluated.status === 'finished';

        this.room = {
          ...this.room,
          activeRecap: {
            ...recap,
            tiebreakerDuel: evaluated,
            mvpUids: finished ? evaluated.championUids : recap.mvpUids,
            mvpNames: finished
              ? evaluated.championUids.map((uid) => evaluated.duelistNames[uid] ?? 'MVP')
              : recap.mvpNames,
            resolvedBy: finished ? 'suit_duel' : recap.resolvedBy,
          },
          updatedAt: now,
        };
        return { allSubmitted: true, finished };
      }

      case 'advanceSuitDuelClash': {
        this.requireHost(senderDeviceUid);
        const recap = this.room.activeRecap;
        const duel = recap?.tiebreakerDuel;
        if (!recap || !duel || duel.status !== 'clash_reveal') {
          throw new Error('Tidak dapat melanjutkan bentrok Suit saat ini.');
        }
        this.room = {
          ...this.room,
          activeRecap: {
            ...recap,
            tiebreakerDuel: {
              ...duel,
              status: 'picking',
              clashNumber: duel.clashNumber + 1,
              submittedUids: [],
              lastClash: null,
            },
          },
          updatedAt: now,
        };
        return {};
      }

      default:
        throw new Error(`Aksi LAN tidak dikenal: ${String(action)}`);
    }
  }

  /**
   * Ensures Fakta Hari Ini phaseControllerUid fails over cleanly if needed.
   */
  ensureFaktaControllerFailover(): void {
    const fs = this.room.faktaState;
    if (!fs || this.room.status !== 'playing') return;
    if (this.players.has(fs.phaseControllerUid)) return;
    const active = filterActivePlayers(this.getPlayersList());
    const nextControllerUid = selectFaktaPhaseController({
      playerUids: active.map((p) => p.uid),
      hostUid: this.room.hostUid,
      guesserUid: fs.guesserUid,
    });
    const nextController = this.players.get(nextControllerUid);
    if (nextController) {
      this.room = {
        ...this.room,
        faktaState: {
          ...fs,
          phaseControllerUid: nextController.uid,
          phaseControllerName: nextController.displayName,
        },
        updatedAt: Date.now(),
      };
    }
  }

  private finalizePelukisVoteTally(
    submittedVoteUids: string[],
    now: number,
  ): Record<string, unknown> {
    const lukisan = this.room.lukisanState!;
    const serverState = this.serverState!;
    const votesMap = this.pelukisVotesByRound.get(this.room.currentRoundId) ?? new Map();
    const votesByUid: Record<string, string> = {};
    for (const [voterUid, targetUid] of votesMap.entries()) {
      votesByUid[voterUid] = targetUid;
    }

    const tally = tallyPelukisVotes({
      votesByUid,
      eligibleVoterUids: lukisan.turnOrder,
      gadunganUids: serverState.spyUids,
    });
    const accusedName = tally.accusedUid
      ? lukisan.turnNamesByUid[tally.accusedUid] ?? 'Pemain'
      : null;

    if (tally.caughtGadungan && tally.accusedUid) {
      this.room = {
        ...this.room,
        lukisanState: {
          ...lukisan,
          phase: 'gadungan_guess',
          submittedVoteUids,
          accusedUid: tally.accusedUid,
          accusedName,
          voteTally: tally.voteTally,
          votesByUid,
        },
        updatedAt: now,
      };
      this.pushSystemMessage(
        `${accusedName} tertuduh sebagai Pelukis Gadungan! Dia mendapat 1 Kesempatan Terakhir menebak Kata Rahasia!`,
      );
      return { allVoted: true, caughtGadungan: true, accusedUid: tally.accusedUid };
    }

    const secretWord = serverState.drawingWord ?? serverState.locationName;
    const category = serverState.drawingCategory ?? lukisan.category;
    const activePlayers = filterActivePlayers(this.getPlayersList());
    const deltas = calculatePelukisScoreDeltas({
      playerUids: activePlayers.map((p) => p.uid),
      gadunganUids: serverState.spyUids,
      winnerTeam: 'gadungan',
    });
    this.applyScoreDeltas(deltas);

    const reason = tally.isTie || !tally.accusedUid
      ? `Suara voting seri! Pelukis Gadungan (${serverState.spyNames.join(', ')}) lolos dan meraih +3 poin!`
      : `Salah tuduh! ${accusedName} ternyata Pelukis Asli! Pelukis Gadungan (${serverState.spyNames.join(', ')}) menang +3 poin!`;

    this.room = {
      ...this.room,
      status: 'round_end',
      currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
      lukisanState: {
        ...lukisan,
        phase: 'reveal',
        submittedVoteUids,
        accusedUid: tally.accusedUid,
        accusedName,
        voteTally: tally.voteTally,
        votesByUid,
        revealedWord: secretWord,
        gadunganUids: serverState.spyUids,
        gadunganNames: serverState.spyNames,
      },
      lastRoundResult: {
        roundNumber: this.room.roundNumber,
        winnerTeam: 'gadungan',
        reason,
        locationName: secretWord,
        guessedLocation: null,
        drawingCategory: category,
        drawingWord: secretWord,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: now,
        scoresApplied: true,
      },
      updatedAt: now,
    };
    this.pushSystemMessage(reason);
    return { allVoted: true, caughtGadungan: false };
  }

  private finalizeMalamSilumanNight(
    submittedNightUids: string[],
    now: number,
  ): Record<string, unknown> {
    const ms = this.room.malamSilumanState!;
    const serverState = this.serverState!;
    const rolesByUid = serverState.wolfRolesByUid ?? {};
    const namesByUid = ms.participantNamesByUid;
    const settings = sanitizeMalamSilumanSettings(this.room.malamSilumanSettings);

    const nightKey = `${this.room.currentRoundId}_n${ms.nightNumber}`;
    const nightMap = this.malamSilumanNightActionsByRound.get(nightKey) ?? new Map<string, string>();
    const nightTargetsByUid: Record<string, string> = {};
    for (const [uid, targetUid] of nightMap.entries()) {
      nightTargetsByUid[uid] = targetUid;
    }

    const nightRes = resolveMalamSilumanNight({
      nightNumber: ms.nightNumber,
      livingUids: ms.livingUids,
      rolesByUid,
      namesByUid,
      nightTargetsByUid,
      previousDoctorProtectedUid: serverState.lastProtectedByDoctor ?? null,
      seed: this.room.currentRoundId,
    });

    const roundSecrets = this.secretsByRound.get(this.room.currentRoundId);
    if (roundSecrets && nightRes.seerPeek) {
      const seerSecret = roundSecrets.get(nightRes.seerPeek.seerUid);
      if (seerSecret) {
        roundSecrets.set(nightRes.seerPeek.seerUid, {
          ...seerSecret,
          peekHistory: [...(seerSecret.peekHistory ?? []), nightRes.seerPeek.record],
        });
      }
    }

    const nextDoctorProtected = nightRes.nextDoctorLastProtectedUid ?? null;
    this.serverState = {
      ...serverState,
      lastProtectedByDoctor: nextDoctorProtected,
    };
    const doctorUid = ms.livingUids.find((u) => rolesByUid[u] === 'tabib') ?? null;
    if (roundSecrets && doctorUid) {
      const docSecret = roundSecrets.get(doctorUid);
      if (docSecret) {
        roundSecrets.set(doctorUid, {
          ...docSecret,
          lastProtectedUid: nextDoctorProtected,
        });
      }
    }

    const nextLivingUids = nightRes.eliminatedUid
      ? ms.livingUids.filter((u) => u !== nightRes.eliminatedUid)
      : [...ms.livingUids];

    const nextDeadPlayers: MalamSilumanDeadPlayer[] = [...ms.deadPlayers];
    let killedHunter = false;
    if (nightRes.eliminatedUid) {
      const victimRole: WerewolfRoleId = rolesByUid[nightRes.eliminatedUid] ?? 'warga';
      if (victimRole === 'pemburu') {
        killedHunter = true;
      }
      nextDeadPlayers.push(
        buildDeadPlayerEntry({
          uid: nightRes.eliminatedUid,
          displayName: namesByUid[nightRes.eliminatedUid] ?? 'Pemain',
          cause: 'night_kill',
          dayOrNightNumber: ms.nightNumber,
          role: victimRole,
          revealRoleOnDeath: settings.revealRoleOnDeath,
        }),
      );
    }

    if (killedHunter && nightRes.eliminatedUid && nextLivingUids.length > 0) {
      const hunterName = namesByUid[nightRes.eliminatedUid] ?? 'Pemburu';
      this.room = {
        ...this.room,
        malamSilumanState: {
          ...ms,
          phase: 'hunter_revenge',
          dayNumber: ms.nightNumber,
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          submittedNightUids,
          submittedVoteUids: [],
          lastNightSummary: nightRes.dawnMessage,
          lastHunterSummary: null,
          pendingHunterUid: nightRes.eliminatedUid,
          pendingHunterName: hunterName,
          hunterTrigger: 'night',
        },
        updatedAt: now,
      };
      this.pushSystemMessage(
        `${nightRes.dawnMessage} ${hunterName} adalah PEMBURU dan langsung membidik Tembakan Terakhir!`,
      );
      return { phase: 'hunter_revenge' };
    }

    const victory = evaluateMalamSilumanVictory({
      livingUids: nextLivingUids,
      rolesByUid,
      namesByUid,
    });

    if (victory.winnerTeam && victory.reason) {
      const deltas = calculateMalamSilumanScoreDeltas({
        participantUids: ms.participantUids,
        livingUids: nextLivingUids,
        rolesByUid,
        winnerTeam: victory.winnerTeam,
        tumbalWinnerUid: victory.tumbalWinnerUid,
      });
      this.applyScoreDeltas(deltas);

      const roundResult: RoundResult = {
        roundNumber: this.room.roundNumber,
        winnerTeam: victory.winnerTeam,
        reason: `${nightRes.dawnMessage} ${victory.reason}`,
        locationName: 'Desa Malam Siluman',
        guessedLocation: null,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: now,
        scoresApplied: true,
      };

      this.room = {
        ...this.room,
        status: 'round_end',
        currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
        malamSilumanState: {
          ...ms,
          phase: 'reveal',
          dayNumber: ms.nightNumber,
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          submittedNightUids,
          submittedVoteUids: [],
          lastNightSummary: nightRes.dawnMessage,
          revealedRolesByUid: rolesByUid,
        },
        lastRoundResult: roundResult,
        updatedAt: now,
      };
      this.pushSystemMessage(roundResult.reason);
      return { winnerTeam: victory.winnerTeam };
    }

    this.room = {
      ...this.room,
      malamSilumanState: {
        ...ms,
        phase: 'dawn',
        dayNumber: ms.nightNumber,
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids,
        submittedVoteUids: [],
        lastNightSummary: nightRes.dawnMessage,
        lastHunterSummary: null,
        pendingHunterUid: null,
        pendingHunterName: null,
        hunterTrigger: null,
      },
      updatedAt: now,
    };
    this.pushSystemMessage(nightRes.dawnMessage);
    return { phase: 'dawn' };
  }

  private finalizeMalamSilumanVote(
    submittedVoteUids: string[],
    now: number,
  ): Record<string, unknown> {
    const ms = this.room.malamSilumanState!;
    const serverState = this.serverState!;
    const rolesByUid = serverState.wolfRolesByUid ?? {};
    const namesByUid = ms.participantNamesByUid;
    const settings = sanitizeMalamSilumanSettings(this.room.malamSilumanSettings);

    const voteKey = `${this.room.currentRoundId}_d${ms.dayNumber}`;
    const voteMap = this.malamSilumanVotesByRound.get(voteKey) ?? new Map<string, string>();
    const votesByUid: Record<string, string> = {};
    for (const [uid, targetUid] of voteMap.entries()) {
      votesByUid[uid] = targetUid;
    }

    const tally = tallyMalamSilumanDayVotes({
      votesByUid,
      livingUids: ms.livingUids,
      rolesByUid,
    });

    if (!tally.executedUid) {
      const reason = tally.isTie
        ? `Suara voting Siang #${ms.dayNumber} seri! Tidak ada warga yang dieksekusi.`
        : `Desa sepakat melewati eksekusi Siang #${ms.dayNumber}. Tidak ada yang dihukum.`;

      const nextNightNumber = ms.nightNumber + 1;
      this.room = {
        ...this.room,
        malamSilumanState: {
          ...ms,
          phase: 'night',
          nightNumber: nextNightNumber,
          submittedNightUids: [],
          submittedVoteUids,
          lastDaySummary: reason,
          lastHunterSummary: null,
          lastVoteTally: tally.voteTally,
        },
        updatedAt: now,
      };
      this.pushSystemMessage(`${reason} Malam #${nextNightNumber} segera tiba...`);
      return { phase: 'night', nightNumber: nextNightNumber };
    }

    const executedUid = tally.executedUid;
    const executedName = namesByUid[executedUid] ?? 'Pemain';
    const executedRole: WerewolfRoleId = rolesByUid[executedUid] ?? 'warga';
    const nextLivingUids = ms.livingUids.filter((u) => u !== executedUid);
    const nextDeadPlayers: MalamSilumanDeadPlayer[] = [
      ...ms.deadPlayers,
      buildDeadPlayerEntry({
        uid: executedUid,
        displayName: executedName,
        cause: 'day_vote',
        dayOrNightNumber: ms.dayNumber,
        role: executedRole,
        revealRoleOnDeath: settings.revealRoleOnDeath,
      }),
    ];
    const daySummary = `${executedName} dieksekusi oleh keputusan voting desa pada Siang #${ms.dayNumber}${
      settings.revealRoleOnDeath ? ` (ternyata ${MALAM_SILUMAN_ROLES[executedRole].name})` : ''
    }.`;

    const victoryAfterVote = evaluateMalamSilumanVictory({
      livingUids: nextLivingUids,
      rolesByUid,
      namesByUid,
      dayExecutedUid: executedUid,
    });

    if (victoryAfterVote.winnerTeam === 'tumbal' && victoryAfterVote.reason) {
      const deltas = calculateMalamSilumanScoreDeltas({
        participantUids: ms.participantUids,
        livingUids: nextLivingUids,
        rolesByUid,
        winnerTeam: 'tumbal',
        tumbalWinnerUid: victoryAfterVote.tumbalWinnerUid,
      });
      this.applyScoreDeltas(deltas);

      const roundResult: RoundResult = {
        roundNumber: this.room.roundNumber,
        winnerTeam: 'tumbal',
        reason: victoryAfterVote.reason,
        locationName: 'Desa Malam Siluman',
        guessedLocation: null,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: now,
        scoresApplied: true,
      };

      this.room = {
        ...this.room,
        status: 'round_end',
        currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
        malamSilumanState: {
          ...ms,
          phase: 'reveal',
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          submittedNightUids: [],
          submittedVoteUids,
          lastDaySummary: daySummary,
          lastVoteTally: tally.voteTally,
          revealedRolesByUid: rolesByUid,
        },
        lastRoundResult: roundResult,
        updatedAt: now,
      };
      this.pushSystemMessage(victoryAfterVote.reason);
      return { winnerTeam: 'tumbal' };
    }

    if (executedRole === 'pemburu' && nextLivingUids.length > 0) {
      this.room = {
        ...this.room,
        malamSilumanState: {
          ...ms,
          phase: 'hunter_revenge',
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          submittedNightUids: [],
          submittedVoteUids,
          lastDaySummary: daySummary,
          lastHunterSummary: null,
          lastVoteTally: tally.voteTally,
          pendingHunterUid: executedUid,
          pendingHunterName: executedName,
          hunterTrigger: 'day',
        },
        updatedAt: now,
      };
      this.pushSystemMessage(
        `${daySummary} Sebagai PEMBURU, ${executedName} berhak melepaskan Tembakan Terakhir!`,
      );
      return { phase: 'hunter_revenge' };
    }

    if (victoryAfterVote.winnerTeam && victoryAfterVote.reason) {
      const deltas = calculateMalamSilumanScoreDeltas({
        participantUids: ms.participantUids,
        livingUids: nextLivingUids,
        rolesByUid,
        winnerTeam: victoryAfterVote.winnerTeam,
        tumbalWinnerUid: null,
      });
      this.applyScoreDeltas(deltas);

      const roundResult: RoundResult = {
        roundNumber: this.room.roundNumber,
        winnerTeam: victoryAfterVote.winnerTeam,
        reason: `${daySummary} ${victoryAfterVote.reason}`,
        locationName: 'Desa Malam Siluman',
        guessedLocation: null,
        spyUids: serverState.spyUids,
        spyNames: serverState.spyNames,
        resolvedAtMs: now,
        scoresApplied: true,
      };

      this.room = {
        ...this.room,
        status: 'round_end',
        currentMatchRounds: (this.room.currentMatchRounds ?? 0) + 1,
        malamSilumanState: {
          ...ms,
          phase: 'reveal',
          livingUids: nextLivingUids,
          deadPlayers: nextDeadPlayers,
          submittedNightUids: [],
          submittedVoteUids,
          lastDaySummary: daySummary,
          lastVoteTally: tally.voteTally,
          revealedRolesByUid: rolesByUid,
        },
        lastRoundResult: roundResult,
        updatedAt: now,
      };
      this.pushSystemMessage(roundResult.reason);
      return { winnerTeam: victoryAfterVote.winnerTeam };
    }

    const nextNightNumber = ms.nightNumber + 1;
    this.room = {
      ...this.room,
      malamSilumanState: {
        ...ms,
        phase: 'night',
        nightNumber: nextNightNumber,
        livingUids: nextLivingUids,
        deadPlayers: nextDeadPlayers,
        submittedNightUids: [],
        submittedVoteUids,
        lastDaySummary: daySummary,
        lastHunterSummary: null,
        lastVoteTally: tally.voteTally,
      },
      updatedAt: now,
    };
    this.pushSystemMessage(`${daySummary} Malam #${nextNightNumber} pun turun kembali...`);
    return { phase: 'night', nightNumber: nextNightNumber };
  }
}
