export type GameType = 'spyfall' | 'kata_kata' | 'satu_frekuensi' | 'fakta_hari_ini';

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

export interface CustomWordPair {
  id: string;
  citizenWord: string;
  spyWord: string;
  category: string;
}

export interface WordPairItem extends CustomWordPair {
  packId: string;
  packLabel: string;
}

export interface CustomSpectrum {
  id: string;
  leftLabel: string;
  rightLabel: string;
  category: string;
}

export interface SpectrumItem extends CustomSpectrum {
  packId: string;
  packLabel: string;
}

export type FrequencyPhase = 'clue' | 'dialing' | 'reveal';

export type FrequencyTier = 'bullseye' | 'close' | 'near' | 'miss';

export interface FrequencyGuessReveal {
  uid: string;
  displayName: string;
  avatarColor: string;
  value: number;
  points: number;
  tier: FrequencyTier;
}

export interface FrequencyState {
  phase: FrequencyPhase;
  psychicUid: string;
  psychicName: string;
  rotationIndex: number;
  leftLabel: string;
  rightLabel: string;
  category: string;
  clueText: string;
  lockedUids: string[];
  revealedTarget: number | null;
  revealedGuesses: FrequencyGuessReveal[];
  psychicBonus: number;
}

export interface CustomFactItem {
  id: string;
  prefix: string;
  twist: string;
  suffix: string;
  category: string;
}

export interface FactItem extends CustomFactItem {
  packId: string;
  packLabel: string;
}

export type FaktaPhase = 'discussion' | 'guessing' | 'reveal';

export interface FaktaState {
  phase: FaktaPhase;
  guesserUid: string;
  guesserName: string;
  rotationIndex: number;
  phaseControllerUid: string;
  phaseControllerName: string;
  pickedUid: string | null;
  pickedName: string | null;
  guesserWon: boolean | null;
  revealedFactPrefix?: string;
  revealedFactTwist?: string;
  revealedFactSuffix?: string;
  revealedCategory?: string;
  revealedTruthTellerUid?: string;
  revealedTruthTellerName?: string;
  guesserPoints?: number;
  blufferPointsEach?: number;
}

export interface EliminationEntry {
  uid: string;
  displayName: string;
  wasSpy: boolean;
  eliminatedAtMs: number;
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
  winnerTeam: 'warga' | 'mata_mata' | 'penebak' | 'bluffer' | 'frekuensi';
  reason: string;
  locationName: string;
  guessedLocation: string | null;
  citizenWord?: string;
  spyWord?: string;
  guessedWord?: string | null;
  spyUids: string[];
  spyNames: string[];
  resolvedAtMs: number;
  scoresApplied?: boolean;
}

export interface ServerRoundStateDoc {
  roundId: string;
  roundNumber: number;
  locationName: string;
  citizenWord?: string;
  spyWord?: string;
  spyUids: string[];
  spyNames: string[];
  // Satu Frekuensi secret target (0..100)
  targetValue?: number;
  // Fakta Hari Ini secret fact & assigned truth-teller
  factPrefix?: string;
  factTwist?: string;
  factSuffix?: string;
  factCategory?: string;
  truthTellerUid?: string;
  truthTellerName?: string;
  createdAtMs: number;
}

export type SuitPick = 'batu' | 'gunting' | 'kertas';

export interface SuitClashRecord {
  clashNumber: number;
  picksByUid: Record<string, SuitPick>;
  winnerUids: string[];
  isDraw: boolean;
}

export interface SuitDuelState {
  duelId: string;
  status: 'picking' | 'clash_reveal' | 'finished';
  duelistUids: string[];
  duelistNames: Record<string, string>;
  clashNumber: number;
  targetWins: number;
  winsByUid: Record<string, number>;
  submittedUids: string[];
  lastClash: SuitClashRecord | null;
  history: SuitClashRecord[];
  championUids: string[];
}

export interface CompletedGameRecord {
  matchIndex: number;
  gameType: GameType;
  roundsPlayed: number;
  scoresByUid: Record<string, number>;
  playerNamesByUid: Record<string, string>;
  winnerUids: string[];
  winnerNames: string[];
  finishedAtMs: number;
}

export interface SessionPlayerStanding {
  uid: string;
  displayName: string;
  avatarColor: string;
  gamesWon: number;
  overallXp: number;
  wonGameTypes: GameType[];
}

export interface SessionRecapDoc {
  recapId: string;
  generatedAtMs: number;
  completedGames: CompletedGameRecord[];
  standings: SessionPlayerStanding[];
  mvpUids: string[];
  mvpNames: string[];
  resolvedBy: 'games_won' | 'overall_xp' | 'suit_duel' | 'none';
  tiebreakerDuel: SuitDuelState | null;
}

export interface RoomDoc {
  id: string;
  code: string;
  gameType: GameType;
  hostUid: string;
  status: RoomStatus;
  roundNumber: number;
  currentMatchRounds?: number;
  currentRoundId: string;
  roundDurationSec: number;
  roundEndsAtMs: number;
  firstSpeakerUid: string;
  spyMode: SpyMode;
  enabledPacks: string[];
  selectedLocationNames: string[];
  customLocations: CustomLocation[];
  customWordPairs?: CustomWordPair[];
  customSpectrums?: CustomSpectrum[];
  customFacts?: CustomFactItem[];
  eliminatedUids?: string[];
  eliminationLog?: EliminationEntry[];
  frequencyState?: FrequencyState | null;
  faktaState?: FaktaState | null;
  activeVote: VoteState | null;
  pendingSpyGuess: PendingSpyGuess | null;
  lastRoundResult: RoundResult | null;
  completedGames?: CompletedGameRecord[];
  activeRecap?: SessionRecapDoc | null;
  lastEmptyAtMs?: number | null;
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
  controllerUid?: string;
  isNumpang?: boolean;
  isBrb?: boolean;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

/**
 * Isolated per-player secret document.
 * - Game #1 (`spyfall`): `isSpy`, `locationName`, `roleName`.
 * - Game #2 (`kata_kata`): strictly omits `isSpy`, only `secretWord`.
 * - Game #3 (`satu_frekuensi`): `isPsychic`, plus `targetValue` ONLY for the Psychic.
 * - Game #4 (`fakta_hari_ini`): `isGuesser`; for Bluffers ONLY (`isGuesser === false`),
 *   includes `isTruthTeller`, `truthTellerUid`, `truthTellerName`, and fact parts.
 *   For the Guesser (`isGuesser === true`), strictly omits ALL fact and truth-teller fields!
 */
export interface PlayerSecretDoc {
  uid: string;
  roundId: string;
  gameType: GameType;
  isSpy?: boolean;
  locationName?: string | null;
  roleName?: string;
  secretWord?: string;
  isPsychic?: boolean;
  targetValue?: number;
  isGuesser?: boolean;
  isTruthTeller?: boolean;
  truthTellerUid?: string;
  truthTellerName?: string;
  factPrefix?: string;
  factTwist?: string;
  factSuffix?: string;
  factCategory?: string;
  createdAt?: unknown;
}

export interface PlayerSubmissionDoc {
  uid: string;
  roundId: string;
  gameType: GameType | 'suit_duel';
  guessValue?: number;
  suitPick?: SuitPick;
  updatedAt?: unknown;
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
  isStage?: boolean;
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
