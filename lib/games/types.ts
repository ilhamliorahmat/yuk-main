export type GameType = 'spyfall';

export type RoomStatus = 'lobby' | 'playing' | 'voting' | 'spy_guess' | 'round_end';

export type SpyMode = 'single' | 'double' | 'random';

export interface CustomLocation {
  id: string;
  name: string;
  category: string;
  roles: string[];
}

export interface SpyfallLocation extends CustomLocation {
  packId: string;
  packLabel: string;
}

export interface VoteState {
  initiatorUid: string;
  initiatorName: string;
  targetUid: string;
  targetName: string;
  startedAtMs: number;
  votes: Record<string, 'yes' | 'no'>;
}

export interface PendingSpyGuess {
  spyUid: string;
  spyName: string;
  guessedLocation: string;
  submittedAtMs: number;
}

export interface RoundResult {
  roundNumber: number;
  winnerTeam: 'warga' | 'mata_mata';
  reason: string;
  locationName: string;
  guessedLocation: string | null;
  spyUids: string[];
  spyNames: string[];
  resolvedAtMs: number;
  scoresApplied?: boolean;
}

export interface ServerRoundStateDoc {
  roundId: string;
  roundNumber: number;
  locationName: string;
  spyUids: string[];
  spyNames: string[];
  createdAtMs: number;
}

export interface RoomDoc {
  id: string;
  code: string;
  gameType: GameType;
  hostUid: string;
  status: RoomStatus;
  roundNumber: number;
  currentRoundId: string;
  roundDurationSec: number;
  roundEndsAtMs: number;
  firstSpeakerUid: string;
  spyMode: SpyMode;
  enabledPacks: string[];
  selectedLocationNames: string[];
  customLocations: CustomLocation[];
  activeVote: VoteState | null;
  pendingSpyGuess: PendingSpyGuess | null;
  lastRoundResult: RoundResult | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoomPlayerDoc {
  uid: string;
  roomId: string;
  displayName: string;
  avatarColor: string;
  isHost: boolean;
  score: number;
  isReady: boolean;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

export interface PlayerSecretDoc {
  uid: string;
  roundId: string;
  gameType: GameType;
  isSpy: boolean;
  locationName: string | null;
  roleName: string;
  createdAt?: unknown;
}

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  avatarColor: string;
  isAnonymous: boolean;
  gamesPlayed: number;
  wins: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  text: string;
  type: 'chat' | 'system';
  createdAt: number;
}

export interface PresenceEntry {
  uid: string;
  online: boolean;
  displayName: string;
  lastSeen: number;
}

export interface PartyGameDefinition {
  id: GameType;
  number: number;
  title: string;
  subtitle: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  durationLabel: string;
  available: boolean;
  rulesSummary: string[];
}
