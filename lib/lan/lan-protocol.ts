import type {
  ChatMessage,
  GameType,
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '../games/types';

export type NetworkMode = 'online' | 'lan';

export const LAN_ROOM_PREFIX = 'lan_';

const LAN_AVATAR_PALETTE = [
  '#DC2626',
  '#EA580C',
  '#D97706',
  '#059669',
  '#0891B2',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
];

export function pickLanAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return LAN_AVATAR_PALETTE[hash % LAN_AVATAR_PALETTE.length];
}

export function isLanRoomId(roomId: string | null | undefined): boolean {
  return Boolean(roomId && roomId.startsWith(LAN_ROOM_PREFIX));
}

export interface LocalLanProfile {
  uid: string;
  displayName: string;
  avatarColor: string;
}

const LOCAL_LAN_UID_KEY = 'yukmain_lan_uid';
const LOCAL_NICKNAME_KEY = 'yukmain_nickname';

export function getOrCreateLocalLanUid(): string {
  if (typeof window === 'undefined') return 'lan_local_player';
  const existing = window.localStorage.getItem(LOCAL_LAN_UID_KEY);
  if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
    return existing;
  }
  const generated = `lanp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  window.localStorage.setItem(LOCAL_LAN_UID_KEY, generated);
  return generated;
}

export function getLocalLanProfile(preferredName?: string): LocalLanProfile {
  const uid = getOrCreateLocalLanUid();
  const savedName =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LOCAL_NICKNAME_KEY) ?? ''
      : '';
  const cleanName = (preferredName ?? savedName).trim().slice(0, 40) || 'Pemain LAN';
  return {
    uid,
    displayName: cleanName,
    avatarColor: pickLanAvatarColor(uid),
  };
}

export function saveLocalLanNickname(nickname: string): LocalLanProfile {
  const clean = nickname.trim().slice(0, 40) || 'Pemain LAN';
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_NICKNAME_KEY, clean);
  }
  return getLocalLanProfile(clean);
}

/**
 * Compact QR-encoded WebRTC signaling payload for zero-internet LAN handshake.
 * `t: 'O'` = Host Offer, `t: 'A'` = Guest Answer.
 */
export interface LanSignalPacket {
  v: 1;
  t: 'O' | 'A';
  /** Compacted SDP string */
  s: string;
  /** Room code (Offer only) */
  r?: string;
  /** Game type (Offer only) */
  g?: GameType;
  /** Host display name (Offer only) */
  h?: string;
  /** Guest UID (Answer only) */
  u?: string;
  /** Guest display name (Answer only) */
  n?: string;
  /** Guest avatar color (Answer only) */
  c?: string;
  /** True if joining as read-only Layar Panggung (Answer only) */
  st?: 1;
}

export type LanActionName =
  | 'addNumpangPlayer'
  | 'removeNumpangPlayer'
  | 'togglePlayerBrb'
  | 'togglePlayerReady'
  | 'leaveRoom'
  | 'updateSpyfallSettings'
  | 'updateKataKataSettings'
  | 'updateSatuFrekuensiSettings'
  | 'updateFaktaHariIniSettings'
  | 'updatePelukisSettings'
  | 'startSpyfallRound'
  | 'initiateAccusationVote'
  | 'castAccusationVote'
  | 'cancelActiveVoteOrSpyGuess'
  | 'submitSpyLocationGuess'
  | 'resolveRoundTimeout'
  | 'returnRoomToLobby'
  | 'startKataKataRound'
  | 'initiateKataKataVote'
  | 'castKataKataVote'
  | 'cancelKataKataVote'
  | 'submitKataKataLastChanceGuess'
  | 'resolveKataKataTimeout'
  | 'returnKataKataToLobby'
  | 'startSatuFrekuensiRound'
  | 'submitSatuFrekuensiClue'
  | 'submitSatuFrekuensiGuess'
  | 'advanceSatuFrekuensiPhase'
  | 'returnSatuFrekuensiToLobby'
  | 'startFaktaHariIniRound'
  | 'advanceFaktaHariIniPhase'
  | 'submitFaktaHariIniGuess'
  | 'returnFaktaHariIniToLobby'
  | 'startPelukisRound'
  | 'submitPelukisStroke'
  | 'skipPelukisTurn'
  | 'castPelukisVote'
  | 'resolvePelukisVote'
  | 'submitPelukisGuess'
  | 'returnPelukisToLobby'
  | 'updateMalamSilumanSettings'
  | 'startMalamSilumanRound'
  | 'submitMalamSilumanNightAction'
  | 'resolveMalamSilumanNight'
  | 'advanceMalamSilumanDayPhase'
  | 'castMalamSilumanVote'
  | 'resolveMalamSilumanVote'
  | 'submitMalamSilumanHunterShot'
  | 'returnMalamSilumanToLobby'
  | 'updateUlarTanggaSettings'
  | 'selectUlarTanggaClass'
  | 'startUlarTanggaRound'
  | 'useUlarTanggaSkill'
  | 'useUlarTanggaItem'
  | 'rollUlarTanggaDice'
  | 'resolveUlarTanggaEncounter'
  | 'returnUlarTanggaToLobby'
  | 'switchRoomGameType'
  | 'openSessionRecap'
  | 'closeSessionRecap'
  | 'submitSuitDuelPick'
  | 'advanceSuitDuelClash';

export interface LanRoomSnapshot {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  /** Personalized strictly for the receiving peer's owned seat(s); always empty on Layar Panggung */
  secretsByOwnedSeat: Record<string, PlayerSecretDoc | null>;
  /** Populated ONLY when room.status === 'round_end' */
  revealedSecrets: Record<string, PlayerSecretDoc>;
  messages: ChatMessage[];
  presence: Record<string, PresenceEntry>;
}

export type LanHostMessage =
  | {
      type: 'SYNC_STATE';
      snapshot: LanRoomSnapshot;
    }
  | {
      type: 'ACTION_RESULT';
      requestId: string;
      ok: boolean;
      error?: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'ROOM_CLOSED';
      reason: string;
    }
  | {
      type: 'PONG';
      ts: number;
    };

export type LanPeerMessage =
  | {
      type: 'HELLO';
      uid: string;
      displayName: string;
      avatarColor: string;
      isStageDisplay: boolean;
    }
  | {
      type: 'ACTION';
      requestId: string;
      action: LanActionName;
      payload: Record<string, unknown>;
    }
  | {
      type: 'CHAT';
      senderUid: string;
      senderName: string;
      avatarColor: string;
      text: string;
    }
  | {
      type: 'PING';
      ts: number;
    };
