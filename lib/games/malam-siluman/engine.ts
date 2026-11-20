import type {
  MalamSilumanDeadPlayer,
  MalamSilumanPeekRecord,
  MalamSilumanSettings,
  MalamSilumanWolfCountMode,
  PlayerSecretDoc,
  WerewolfRoleId,
  WerewolfTeam,
} from '../types';
import { MALAM_SILUMAN_ROLES } from './roles-id';

export const DEFAULT_MALAM_SILUMAN_SETTINGS: MalamSilumanSettings = {
  wolfCountMode: 'auto',
  revealRoleOnDeath: true,
  enabledRoles: {
    seer: true,
    doctor: true,
    hunter: false,
    mayor: false,
    stealthWolf: false,
    jester: false,
  },
};

function createRng(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function sanitizeMalamSilumanSettings(raw: unknown): MalamSilumanSettings {
  if (!raw || typeof raw !== 'object') {
    return {
      wolfCountMode: DEFAULT_MALAM_SILUMAN_SETTINGS.wolfCountMode,
      revealRoleOnDeath: DEFAULT_MALAM_SILUMAN_SETTINGS.revealRoleOnDeath,
      enabledRoles: { ...DEFAULT_MALAM_SILUMAN_SETTINGS.enabledRoles },
    };
  }
  const obj = raw as Record<string, unknown>;
  const rawMode = obj.wolfCountMode;
  const wolfCountMode: MalamSilumanWolfCountMode =
    rawMode === 1 || rawMode === 2 || rawMode === 3 ? rawMode : 'auto';
  const revealRoleOnDeath =
    typeof obj.revealRoleOnDeath === 'boolean'
      ? obj.revealRoleOnDeath
      : DEFAULT_MALAM_SILUMAN_SETTINGS.revealRoleOnDeath;

  const rawRoles =
    obj.enabledRoles && typeof obj.enabledRoles === 'object'
      ? (obj.enabledRoles as Record<string, unknown>)
      : {};

  return {
    wolfCountMode,
    revealRoleOnDeath,
    enabledRoles: {
      seer: typeof rawRoles.seer === 'boolean' ? rawRoles.seer : true,
      doctor: typeof rawRoles.doctor === 'boolean' ? rawRoles.doctor : true,
      hunter: typeof rawRoles.hunter === 'boolean' ? rawRoles.hunter : false,
      mayor: typeof rawRoles.mayor === 'boolean' ? rawRoles.mayor : false,
      stealthWolf: typeof rawRoles.stealthWolf === 'boolean' ? rawRoles.stealthWolf : false,
      jester: typeof rawRoles.jester === 'boolean' ? rawRoles.jester : false,
    },
  };
}

export function getRoleTeam(role: WerewolfRoleId): WerewolfTeam {
  return MALAM_SILUMAN_ROLES[role].team;
}

export function isSilumanRole(role: WerewolfRoleId): boolean {
  return role === 'siluman' || role === 'siluman_bayangan';
}

export function resolveWolfCount(
  playerCount: number,
  mode: MalamSilumanWolfCountMode,
): number {
  const safePlayers = Math.max(4, Math.min(12, playerCount));
  // Ensure wolves never start outnumbering or equaling non-wolves
  const maxAllowedWolves = Math.max(1, Math.floor((safePlayers - 1) / 2));

  if (mode === 1 || mode === 2 || mode === 3) {
    return Math.min(mode, maxAllowedWolves);
  }

  // Auto scaling: 4-5p -> 1, 6-8p -> 2, 9-12p -> 3
  const autoCount = safePlayers >= 9 ? 3 : safePlayers >= 6 ? 2 : 1;
  return Math.min(autoCount, maxAllowedWolves);
}

/**
 * Builds a slot-safe role deck guaranteed to include:
 * - At least 1 Siluman (promoting 1 to Siluman Bayangan ONLY when stealthWolf is ON and wolfTotal >= 2)
 * - At least 1 Warga base role (left unallocated by optional power roles)
 * - Deterministic priority assignment for optional roles (`seer`, `doctor`, `hunter`, `mayor`, `jester`)
 */
export function buildMalamSilumanDeck(
  playerCount: number,
  rawSettings?: MalamSilumanSettings | null,
): {
  deck: WerewolfRoleId[];
  wolfTotal: number;
  stealthWolfApplied: boolean;
  droppedOptionalRoles: WerewolfRoleId[];
} {
  const settings = sanitizeMalamSilumanSettings(rawSettings);
  const safeCount = Math.max(4, Math.min(12, playerCount));
  const wolfTotal = resolveWolfCount(safeCount, settings.wolfCountMode);

  const deck: WerewolfRoleId[] = [];
  const stealthWolfApplied = settings.enabledRoles.stealthWolf && wolfTotal >= 2;
  if (stealthWolfApplied) {
    deck.push('siluman_bayangan');
    for (let i = 1; i < wolfTotal; i++) {
      deck.push('siluman');
    }
  } else {
    for (let i = 0; i < wolfTotal; i++) {
      deck.push('siluman');
    }
  }

  // Reserve >= 1 guaranteed Warga base role so pure Siluman+Warga or tight 4p rooms stay balanced
  const guaranteedWargaSlots = 1;
  const maxOptionalNonWolfSlots = Math.max(0, safeCount - wolfTotal - guaranteedWargaSlots);

  const requestedOptional: WerewolfRoleId[] = [];
  if (settings.enabledRoles.seer) requestedOptional.push('penerawang');
  if (settings.enabledRoles.doctor) requestedOptional.push('tabib');
  if (settings.enabledRoles.hunter) requestedOptional.push('pemburu');
  if (settings.enabledRoles.mayor) requestedOptional.push('pak_rt');
  if (settings.enabledRoles.jester) requestedOptional.push('tumbal');

  const assignedOptional = requestedOptional.slice(0, maxOptionalNonWolfSlots);
  const droppedOptionalRoles = requestedOptional.slice(maxOptionalNonWolfSlots);

  for (const role of assignedOptional) {
    deck.push(role);
  }

  while (deck.length < safeCount) {
    deck.push('warga');
  }

  return {
    deck,
    wolfTotal,
    stealthWolfApplied,
    droppedOptionalRoles,
  };
}

export function dealMalamSilumanRound(params: {
  playerUids: string[];
  playerNamesByUid: Record<string, string>;
  settings?: MalamSilumanSettings | null;
  roundId: string;
}): {
  rolesByUid: Record<string, WerewolfRoleId>;
  wolfUids: string[];
  wolfNames: string[];
  secretsByUid: Record<string, PlayerSecretDoc>;
  deckComposition: WerewolfRoleId[];
} {
  const rng = createRng(`${params.roundId}:${params.playerUids.join(',')}`);
  const { deck } = buildMalamSilumanDeck(params.playerUids.length, params.settings);
  const shuffledRoles = shuffleWithRng(deck, rng);

  const rolesByUid: Record<string, WerewolfRoleId> = {};
  const wolfUids: string[] = [];

  params.playerUids.forEach((uid, idx) => {
    const role = shuffledRoles[idx] ?? 'warga';
    rolesByUid[uid] = role;
    if (isSilumanRole(role)) {
      wolfUids.push(uid);
    }
  });

  const wolfNames = wolfUids.map((uid) => params.playerNamesByUid[uid] ?? 'Siluman');
  const secretsByUid: Record<string, PlayerSecretDoc> = {};

  for (const uid of params.playerUids) {
    const role = rolesByUid[uid];
    const team = getRoleTeam(role);
    const fellowWolves = isSilumanRole(role)
      ? wolfUids.map((wUid) => ({
          uid: wUid,
          displayName: params.playerNamesByUid[wUid] ?? 'Siluman',
          role: rolesByUid[wUid],
        }))
      : [];

    secretsByUid[uid] = {
      uid,
      roundId: params.roundId,
      gameType: 'malam_siluman',
      wolfRole: role,
      wolfTeam: team,
      fellowWolves,
      peekHistory: [],
      lastProtectedUid: null,
    };
  }

  return {
    rolesByUid,
    wolfUids,
    wolfNames,
    secretsByUid,
    deckComposition: deck,
  };
}

export interface NightResolutionOutput {
  wolfTargetUid: string | null;
  protectedUid: string | null;
  eliminatedUid: string | null;
  savedByDoctor: boolean;
  seerPeek: {
    seerUid: string;
    record: MalamSilumanPeekRecord;
  } | null;
  nextDoctorLastProtectedUid: string | null;
  dawnMessage: string;
}

export function resolveMalamSilumanNight(params: {
  nightNumber: number;
  livingUids: string[];
  rolesByUid: Record<string, WerewolfRoleId>;
  namesByUid: Record<string, string>;
  nightTargetsByUid: Record<string, string>;
  previousDoctorProtectedUid?: string | null;
  seed?: string;
}): NightResolutionOutput {
  const livingSet = new Set(params.livingUids);
  const wolfTargets: Record<string, number> = {};
  let doctorUid: string | null = null;
  let doctorPick: string | null = null;
  let seerUid: string | null = null;
  let seerPick: string | null = null;

  for (const uid of params.livingUids) {
    const role = params.rolesByUid[uid];
    const target = params.nightTargetsByUid[uid];

    if (isSilumanRole(role)) {
      if (target && livingSet.has(target) && !isSilumanRole(params.rolesByUid[target])) {
        wolfTargets[target] = (wolfTargets[target] ?? 0) + 1;
      }
    } else if (role === 'tabib') {
      doctorUid = uid;
      if (
        target &&
        livingSet.has(target) &&
        target !== params.previousDoctorProtectedUid
      ) {
        doctorPick = target;
      }
    } else if (role === 'penerawang') {
      seerUid = uid;
      if (target && livingSet.has(target) && target !== uid) {
        seerPick = target;
      }
    }
  }

  // Pick wolf target with highest vote; tie-break deterministically via RNG
  let wolfTargetUid: string | null = null;
  const candidateEntries = Object.entries(wolfTargets);
  if (candidateEntries.length > 0) {
    const maxCount = Math.max(...candidateEntries.map(([, c]) => c));
    const tied = candidateEntries
      .filter(([, c]) => c === maxCount)
      .map(([uid]) => uid);
    if (tied.length === 1) {
      wolfTargetUid = tied[0];
    } else {
      const rng = createRng(`${params.seed ?? 'night'}:${params.nightNumber}:${tied.join(',')}`);
      wolfTargetUid = tied[Math.floor(rng() * tied.length)];
    }
  }

  const protectedUid = doctorPick;
  const savedByDoctor = Boolean(wolfTargetUid && protectedUid && wolfTargetUid === protectedUid);
  const eliminatedUid = wolfTargetUid && !savedByDoctor ? wolfTargetUid : null;

  let seerPeek: NightResolutionOutput['seerPeek'] = null;
  if (seerUid && seerPick) {
    const targetRole = params.rolesByUid[seerPick] ?? 'warga';
    // CRITICAL RULE: Siluman Bayangan reads as 'warga' (Aura Warga)! Only standard 'siluman' reads as 'siluman'.
    const apparentTeam: 'warga' | 'siluman' =
      targetRole === 'siluman' ? 'siluman' : 'warga';
    seerPeek = {
      seerUid,
      record: {
        night: params.nightNumber,
        targetUid: seerPick,
        targetName: params.namesByUid[seerPick] ?? 'Pemain',
        apparentTeam,
      },
    };
  }

  const nextDoctorLastProtectedUid = doctorUid ? protectedUid : null;

  let dawnMessage: string;
  if (!wolfTargetUid) {
    dawnMessage = `Malam #${params.nightNumber} berlalu tanpa serangan—semua warga selamat saat fajar menyingsing.`;
  } else if (savedByDoctor) {
    dawnMessage = `Terdengar lolongan di Malam #${params.nightNumber}, namun Tabib berhasil menyelamatkan target tepat waktu! Tidak ada korban jiwa.`;
  } else {
    const victimName = params.namesByUid[wolfTargetUid] ?? 'Seorang warga';
    dawnMessage = `Fajar berdarah di Malam #${params.nightNumber}: ${victimName} ditemukan gugur diterkam Siluman!`;
  }

  return {
    wolfTargetUid,
    protectedUid,
    eliminatedUid,
    savedByDoctor,
    seerPeek,
    nextDoctorLastProtectedUid,
    dawnMessage,
  };
}

export interface DayVoteTallyResult {
  executedUid: string | null;
  skipVotes: number;
  isTie: boolean;
  voteTally: Record<string, number>;
}

export function tallyMalamSilumanDayVotes(params: {
  votesByUid: Record<string, string>;
  livingUids: string[];
  rolesByUid: Record<string, WerewolfRoleId>;
}): DayVoteTallyResult {
  const livingSet = new Set(params.livingUids);
  const voteTally: Record<string, number> = {};
  let skipVotes = 0;

  for (const voterUid of params.livingUids) {
    const pick = params.votesByUid[voterUid];
    if (!pick) continue;

    // Mayor (Pak RT) vote weighs 2x
    const weight = params.rolesByUid[voterUid] === 'pak_rt' ? 2 : 1;

    if (pick === 'skip') {
      skipVotes += weight;
      continue;
    }

    if (livingSet.has(pick) && pick !== voterUid) {
      voteTally[pick] = (voteTally[pick] ?? 0) + weight;
    }
  }

  const targetEntries = Object.entries(voteTally);
  if (targetEntries.length === 0) {
    return {
      executedUid: null,
      skipVotes,
      isTie: false,
      voteTally,
    };
  }

  const maxTargetVotes = Math.max(...targetEntries.map(([, v]) => v));
  if (skipVotes >= maxTargetVotes) {
    return {
      executedUid: null,
      skipVotes,
      isTie: skipVotes === maxTargetVotes,
      voteTally,
    };
  }

  const topTargets = targetEntries
    .filter(([, v]) => v === maxTargetVotes)
    .map(([uid]) => uid);

  if (topTargets.length > 1) {
    return {
      executedUid: null,
      skipVotes,
      isTie: true,
      voteTally,
    };
  }

  return {
    executedUid: topTargets[0],
    skipVotes,
    isTie: false,
    voteTally,
  };
}

export interface VictoryEvaluation {
  winnerTeam: 'warga' | 'siluman' | 'tumbal' | null;
  tumbalWinnerUid: string | null;
  reason: string | null;
}

export function evaluateMalamSilumanVictory(params: {
  livingUids: string[];
  rolesByUid: Record<string, WerewolfRoleId>;
  namesByUid: Record<string, string>;
  dayExecutedUid?: string | null;
}): VictoryEvaluation {
  // 1. Immediate Solo Upset: Tumbal executed during Day Vote!
  if (
    params.dayExecutedUid &&
    params.rolesByUid[params.dayExecutedUid] === 'tumbal'
  ) {
    const jesterName = params.namesByUid[params.dayExecutedUid] ?? 'Tumbal';
    return {
      winnerTeam: 'tumbal',
      tumbalWinnerUid: params.dayExecutedUid,
      reason: `JEBAKAN BERHASIL! ${jesterName} ternyata adalah TUMBAL — ia memenangkan permainan sendirian (+4 poin) setelah dieksekusi desa!`,
    };
  }

  let livingWolves = 0;
  let livingNonWolves = 0;

  for (const uid of params.livingUids) {
    const role = params.rolesByUid[uid] ?? 'warga';
    if (isSilumanRole(role)) {
      livingWolves += 1;
    } else {
      livingNonWolves += 1;
    }
  }

  // 2. All Siluman eliminated -> Tim Warga wins
  if (livingWolves === 0) {
    return {
      winnerTeam: 'warga',
      tumbalWinnerUid: null,
      reason: 'Seluruh Siluman berhasil ditumpas! Desa kembali aman dan Tim Warga memenangkan permainan!',
    };
  }

  // 3. Living Siluman >= Living Non-Siluman -> Tim Siluman wins
  if (livingWolves >= livingNonWolves) {
    return {
      winnerTeam: 'siluman',
      tumbalWinnerUid: null,
      reason: `Jumlah Siluman (${livingWolves}) telah menyamai atau melebihi sisa penduduk (${livingNonWolves})! Kawanan Siluman menguasai desa!`,
    };
  }

  return {
    winnerTeam: null,
    tumbalWinnerUid: null,
    reason: null,
  };
}

/**
 * Scoring per round:
 * - Tumbal solo win: +4 only for the executed Tumbal
 * - Warga / Siluman team win: +3 for surviving winners, +2 for eliminated teammates
 */
export function calculateMalamSilumanScoreDeltas(params: {
  participantUids: string[];
  livingUids: string[];
  rolesByUid: Record<string, WerewolfRoleId>;
  winnerTeam: 'warga' | 'siluman' | 'tumbal';
  tumbalWinnerUid?: string | null;
}): Record<string, number> {
  const deltas: Record<string, number> = {};
  const livingSet = new Set(params.livingUids);

  for (const uid of params.participantUids) {
    deltas[uid] = 0;
  }

  if (params.winnerTeam === 'tumbal') {
    if (params.tumbalWinnerUid) {
      deltas[params.tumbalWinnerUid] = 4;
    }
    return deltas;
  }

  for (const uid of params.participantUids) {
    const role = params.rolesByUid[uid] ?? 'warga';
    const isWolf = isSilumanRole(role);
    const isCitizenSide = role !== 'tumbal' && !isWolf;

    const won =
      (params.winnerTeam === 'siluman' && isWolf) ||
      (params.winnerTeam === 'warga' && isCitizenSide);

    if (won) {
      deltas[uid] = livingSet.has(uid) ? 3 : 2;
    }
  }

  return deltas;
}

export function buildDeadPlayerEntry(params: {
  uid: string;
  displayName: string;
  cause: MalamSilumanDeadPlayer['cause'];
  dayOrNightNumber: number;
  role: WerewolfRoleId;
  revealRoleOnDeath: boolean;
}): MalamSilumanDeadPlayer {
  return {
    uid: params.uid,
    displayName: params.displayName,
    cause: params.cause,
    dayOrNightNumber: params.dayOrNightNumber,
    revealedRole: params.revealRoleOnDeath ? params.role : null,
    revealedTeam: params.revealRoleOnDeath ? getRoleTeam(params.role) : null,
  };
}
