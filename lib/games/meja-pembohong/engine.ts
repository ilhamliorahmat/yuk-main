import type {
  MejaCard,
  MejaCardRank,
  MejaChallengeReveal,
  MejaPembohongSettings,
  MejaPembohongState,
  MejaTableRank,
  PlayerSecretDoc,
  RoomPlayerDoc,
  RoundResult,
  ServerRoundStateDoc,
} from '../types';

export const MEJA_MIN_PLAYERS = 2;
export const MEJA_HAND_SIZE = 5;
export const MEJA_MAX_PLAY_CARDS = 3;
export const MEJA_CEPAT_MAX_SUBROUNDS = 5;

export const MEJA_PEMBOHONG_QUICK_PROMPTS_ID: string[] = [
  'Muka lo keliatan bohong banget barusan!',
  'Serius itu semua sesuai meja? Jangan ngasal!',
  'Gue jujur 100%, berani coba teriak BOHONG?',
  'Hati-hati narik pelatuk silinder peluru rahasia!',
  'Kartu Joker tuh penyelamat meja malam ini.',
];

export const MEJA_RANK_LABELS: Record<MejaCardRank, string> = {
  raja: 'Raja',
  ratu: 'Ratu',
  as: 'As',
  joker: 'Joker',
};

export const MEJA_TABLE_RANKS: MejaTableRank[] = ['raja', 'ratu', 'as'];

export function defaultMejaPembohongSettings(): MejaPembohongSettings {
  return {
    mode: 'silinder',
  };
}

export function sanitizeMejaPembohongSettings(raw: unknown): MejaPembohongSettings {
  if (!raw || typeof raw !== 'object') {
    return defaultMejaPembohongSettings();
  }
  const obj = raw as Record<string, unknown>;
  return {
    mode: obj.mode === 'cepat' ? 'cepat' : 'silinder',
  };
}

export function shuffleArray<T>(items: T[], rng: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildMejaDeck(
  playerCount: number,
  subRoundNumber: number,
  rng: () => number = Math.random,
): MejaCard[] {
  const multiplier = playerCount > 6 ? 2 : 1;
  const ranks: MejaCard[] = [];
  let seq = 1;

  for (let m = 0; m < multiplier; m++) {
    for (let i = 0; i < 12; i++) {
      ranks.push({ id: `m_${subRoundNumber}_r_${seq++}`, rank: 'raja' });
    }
    for (let i = 0; i < 12; i++) {
      ranks.push({ id: `m_${subRoundNumber}_q_${seq++}`, rank: 'ratu' });
    }
    for (let i = 0; i < 12; i++) {
      ranks.push({ id: `m_${subRoundNumber}_a_${seq++}`, rank: 'as' });
    }
    for (let i = 0; i < 4; i++) {
      ranks.push({ id: `m_${subRoundNumber}_j_${seq++}`, rank: 'joker' });
    }
  }

  return shuffleArray(ranks, rng);
}

export function pickTableRank(rng: () => number = Math.random): MejaTableRank {
  return MEJA_TABLE_RANKS[Math.floor(rng() * MEJA_TABLE_RANKS.length)] ?? 'raja';
}

export function isClaimHonest(cards: MejaCard[], tableRank: MejaTableRank): boolean {
  if (cards.length === 0) return false;
  return cards.every((card) => card.rank === tableRank || card.rank === 'joker');
}

export function pickNextTurnUid(params: {
  turnOrder: string[];
  livingUids: string[];
  handCountByUid: Record<string, number>;
  afterUid: string;
}): string {
  const livingSet = new Set(params.livingUids);
  const orderedLiving = params.turnOrder.filter((uid) => livingSet.has(uid));
  if (orderedLiving.length === 0) return '';

  const startIdx = orderedLiving.indexOf(params.afterUid);
  const rotated: string[] = [];
  for (let offset = 1; offset <= orderedLiving.length; offset++) {
    const idx = ((startIdx >= 0 ? startIdx : 0) + offset) % orderedLiving.length;
    rotated.push(orderedLiving[idx]);
  }

  // Prefer the next OTHER living player who still holds cards
  const otherWithCards = rotated.find(
    (uid) => uid !== params.afterUid && (params.handCountByUid[uid] ?? 0) > 0,
  );
  if (otherWithCards) return otherWithCards;

  // Otherwise fall back to the next OTHER living player (can challenge or accept redeal)
  const otherLiving = rotated.find((uid) => uid !== params.afterUid);
  if (otherLiving) return otherLiving;

  return orderedLiving[0];
}

export interface DealMejaRoundParams {
  roundId: string;
  roundNumber: number;
  players: RoomPlayerDoc[];
  settings?: MejaPembohongSettings | null;
  createdAtMs?: number;
  rng?: () => number;
}

export interface DealMejaRoundOutput {
  mejaPembohongState: MejaPembohongState;
  serverState: ServerRoundStateDoc;
  playerSecrets: Record<string, PlayerSecretDoc>;
}

export function dealMejaPembohongRound(params: DealMejaRoundParams): DealMejaRoundOutput {
  const rng = params.rng ?? Math.random;
  const createdAtMs = params.createdAtMs ?? Date.now();
  const settings = sanitizeMejaPembohongSettings(params.settings);
  const active = params.players.filter((p) => !p.isBrb);

  if (active.length < MEJA_MIN_PLAYERS) {
    throw new Error(`Minimal ${MEJA_MIN_PLAYERS} pemain aktif dibutuhkan untuk memulai Meja Pembohong.`);
  }

  const participantUids = active.map((p) => p.uid);
  const participantNamesByUid: Record<string, string> = {};
  for (const p of active) {
    participantNamesByUid[p.uid] = p.displayName;
  }

  const turnOrder = shuffleArray(participantUids, rng);
  const tableRank = pickTableRank(rng);
  const deck = buildMejaDeck(active.length, 1, rng);

  const mejaHandsByUid: Record<string, MejaCard[]> = {};
  const mejaTrapSlotByUid: Record<string, number> = {};
  const handCountByUid: Record<string, number> = {};
  const shotsTakenByUid: Record<string, number> = {};
  const playerSecrets: Record<string, PlayerSecretDoc> = {};

  let cursor = 0;
  for (const uid of turnOrder) {
    const hand = deck.slice(cursor, cursor + MEJA_HAND_SIZE);
    cursor += MEJA_HAND_SIZE;
    mejaHandsByUid[uid] = hand;
    handCountByUid[uid] = hand.length;
    shotsTakenByUid[uid] = 0;
    mejaTrapSlotByUid[uid] = Math.floor(rng() * 6) + 1;

    playerSecrets[uid] = {
      uid,
      roundId: params.roundId,
      gameType: 'meja_pembohong',
      mejaHand: hand,
      createdAt: createdAtMs,
    };
  }

  const firstUid = turnOrder[0];
  const firstName = participantNamesByUid[firstUid] ?? 'Pemain';

  const mejaPembohongState: MejaPembohongState = {
    phase: 'playing',
    mode: settings.mode,
    subRoundNumber: 1,
    maxSubRounds: settings.mode === 'cepat' ? MEJA_CEPAT_MAX_SUBROUNDS : null,
    tableRank,
    participantUids,
    participantNamesByUid,
    livingUids: [...turnOrder],
    eliminatedUids: [],
    turnOrder,
    currentTurnUid: firstUid,
    currentTurnName: firstName,
    handCountByUid,
    shotsTakenByUid,
    pileCardCount: 0,
    lastClaim: null,
    lastChallenge: null,
    winnerUids: [],
    winnerNames: [],
    eventLog: [
      `Meja dibuka! Pangkat meja: ${MEJA_RANK_LABELS[tableRank].toUpperCase()}. Giliran pertama: ${firstName}.`,
    ],
  };

  const serverState: ServerRoundStateDoc = {
    roundId: params.roundId,
    roundNumber: params.roundNumber,
    locationName: `Meja ${MEJA_RANK_LABELS[tableRank]}`,
    spyUids: [],
    spyNames: [],
    mejaHandsByUid,
    mejaPendingClaimCards: [],
    mejaTrapSlotByUid,
    createdAtMs,
  };

  return {
    mejaPembohongState,
    serverState,
    playerSecrets,
  };
}

export function playMejaCards(params: {
  state: MejaPembohongState;
  handsByUid: Record<string, MejaCard[]>;
  actorUid: string;
  cardIds: string[];
  claimId: string;
}): {
  nextState: MejaPembohongState;
  nextHandsByUid: Record<string, MejaCard[]>;
  playedCards: MejaCard[];
} {
  const { state, handsByUid, actorUid, cardIds, claimId } = params;
  if (state.phase !== 'playing') {
    throw new Error('Tidak dapat menaruh kartu saat ini.');
  }
  if (state.currentTurnUid !== actorUid) {
    throw new Error('Belum giliranmu untuk mengambil aksi.');
  }
  if (!state.livingUids.includes(actorUid)) {
    throw new Error('Pemain yang sudah tereliminasi tidak dapat bermain.');
  }

  const uniqueIds = Array.from(new Set(cardIds.filter((id) => typeof id === 'string' && id.trim() !== '')));
  if (uniqueIds.length < 1 || uniqueIds.length > MEJA_MAX_PLAY_CARDS) {
    throw new Error(`Pilih antara 1 hingga ${MEJA_MAX_PLAY_CARDS} kartu untuk ditaruh.`);
  }

  const currentHand = handsByUid[actorUid] ?? [];
  const cardById = new Map(currentHand.map((c) => [c.id, c]));
  const playedCards: MejaCard[] = [];
  for (const id of uniqueIds) {
    const found = cardById.get(id);
    if (!found) {
      throw new Error('Salah satu kartu yang dipilih tidak ada di tanganmu.');
    }
    playedCards.push(found);
  }

  const playedSet = new Set(uniqueIds);
  const remainingHand = currentHand.filter((c) => !playedSet.has(c.id));
  const nextHandsByUid: Record<string, MejaCard[]> = {
    ...handsByUid,
    [actorUid]: remainingHand,
  };
  const nextHandCountByUid: Record<string, number> = {
    ...state.handCountByUid,
    [actorUid]: remainingHand.length,
  };

  const actorName = state.participantNamesByUid[actorUid] ?? 'Pemain';
  const nextTurnUid = pickNextTurnUid({
    turnOrder: state.turnOrder,
    livingUids: state.livingUids,
    handCountByUid: nextHandCountByUid,
    afterUid: actorUid,
  });
  const nextTurnName = state.participantNamesByUid[nextTurnUid] ?? 'Pemain';
  const rankLabel = MEJA_RANK_LABELS[state.tableRank];

  const logEntry = `${actorName} menaruh ${playedCards.length} kartu tertutup & mengklaim "${playedCards.length}x ${rankLabel}".`;

  return {
    nextState: {
      ...state,
      currentTurnUid: nextTurnUid,
      currentTurnName: nextTurnName,
      handCountByUid: nextHandCountByUid,
      pileCardCount: state.pileCardCount + playedCards.length,
      lastClaim: {
        claimId,
        byUid: actorUid,
        byName: actorName,
        cardCount: playedCards.length,
        claimedRank: state.tableRank,
      },
      eventLog: [logEntry, ...state.eventLog].slice(0, 12),
    },
    nextHandsByUid,
    playedCards,
  };
}

export function resolveMejaChallenge(params: {
  state: MejaPembohongState;
  challengerUid: string;
  pendingClaimCards: MejaCard[];
  trapSlotByUid: Record<string, number>;
  playerScoresByUid?: Record<string, number>;
}): {
  nextState: MejaPembohongState;
  challengeReveal: MejaChallengeReveal;
  scoreDeltas: Record<string, number>;
  matchFinished: boolean;
  roundResult: RoundResult | null;
} {
  const { state, challengerUid, pendingClaimCards, trapSlotByUid, playerScoresByUid } = params;
  if (state.phase !== 'playing') {
    throw new Error('Tuduhan BOHONG hanya dapat dilakukan saat fase bermain.');
  }
  if (state.currentTurnUid !== challengerUid) {
    throw new Error('Hanya pemain yang sedang mendapat giliran yang dapat berteriak BOHONG.');
  }
  if (!state.lastClaim || pendingClaimCards.length === 0) {
    throw new Error('Belum ada kartu taruhan di meja untuk dituduh.');
  }
  if (state.lastClaim.byUid === challengerUid) {
    throw new Error('Kamu tidak bisa menuduh taruhanmu sendiri.');
  }

  const accusedUid = state.lastClaim.byUid;
  const accusedName = state.lastClaim.byName;
  const challengerName = state.participantNamesByUid[challengerUid] ?? 'Pemain';

  const honest = isClaimHonest(pendingClaimCards, state.lastClaim.claimedRank);
  const wasLie = !honest;

  const loserUid = wasLie ? accusedUid : challengerUid;
  const loserName = wasLie ? accusedName : challengerName;
  const winnerUid = wasLie ? challengerUid : accusedUid;
  const winnerName = wasLie ? challengerName : accusedName;

  const scoreDeltas: Record<string, number> = {};
  const nextShots = { ...state.shotsTakenByUid };
  let nextLiving = [...state.livingUids];
  let nextEliminated = [...state.eliminatedUids];
  let chamberStep: number | null = null;
  let hitBullet = false;
  let eliminatedUid: string | null = null;
  let summary = '';

  const rankLabel = MEJA_RANK_LABELS[state.lastClaim.claimedRank];

  if (state.mode === 'silinder') {
    const prevShots = nextShots[loserUid] ?? 0;
    chamberStep = Math.min(6, prevShots + 1);
    nextShots[loserUid] = chamberStep;
    const trapSlot = Math.max(1, Math.min(6, trapSlotByUid[loserUid] ?? 6));
    hitBullet = chamberStep >= trapSlot;

    if (hitBullet) {
      eliminatedUid = loserUid;
      nextLiving = nextLiving.filter((uid) => uid !== loserUid);
      if (!nextEliminated.includes(loserUid)) {
        nextEliminated = [...nextEliminated, loserUid];
      }
      for (const uid of nextLiving) {
        scoreDeltas[uid] = (scoreDeltas[uid] ?? 0) + 1;
      }
      scoreDeltas[winnerUid] = (scoreDeltas[winnerUid] ?? 0) + 1;
      summary = wasLie
        ? `${challengerName} membongkar kebohongan ${accusedName} (bukan ${rankLabel})! Pelatuk ke-${chamberStep}/6 MELETUS — ${loserName} tereliminasi!`
        : `${accusedName} ternyata JUJUR! ${challengerName} salah tuduh dan pelatuk ke-${chamberStep}/6 MELETUS — ${loserName} tereliminasi!`;
    } else {
      scoreDeltas[loserUid] = (scoreDeltas[loserUid] ?? 0) + 1;
      scoreDeltas[winnerUid] = (scoreDeltas[winnerUid] ?? 0) + 1;
      summary = wasLie
        ? `${challengerName} membongkar kebohongan ${accusedName}! Pelatuk ke-${chamberStep}/6 hanya berbunyi *KLIK* — ${loserName} masih selamat!`
        : `${accusedName} ternyata JUJUR! Pelatuk ke-${chamberStep}/6 untuk ${challengerName} hanya berbunyi *KLIK* — nyaris kena!`;
    }
  } else {
    scoreDeltas[winnerUid] = 2;
    summary = wasLie
      ? `TERBONGKAR! ${accusedName} berbohong — ${challengerName} menang duel (+2 poin)!`
      : `JUJUR 100%! ${accusedName} lolos dari tuduhan ${challengerName} (+2 poin)!`;
  }

  const challengeReveal: MejaChallengeReveal = {
    challengerUid,
    challengerName,
    accusedUid,
    accusedName,
    claimedRank: state.lastClaim.claimedRank,
    revealedCards: pendingClaimCards,
    wasLie,
    loserUid,
    loserName,
    winnerUid,
    winnerName,
    chamberStep,
    hitBullet,
    eliminatedUid,
    summary,
  };

  let matchFinished = false;
  let winnerUids: string[] = [];
  let winnerNames: string[] = [];

  if (state.mode === 'silinder' && nextLiving.length <= 1) {
    matchFinished = true;
    winnerUids = nextLiving;
    winnerNames = nextLiving.map((uid) => state.participantNamesByUid[uid] ?? 'Juara');
    if (nextLiving[0]) {
      scoreDeltas[nextLiving[0]] = (scoreDeltas[nextLiving[0]] ?? 0) + 4;
    }
  } else if (
    state.mode === 'cepat' &&
    state.maxSubRounds !== null &&
    state.subRoundNumber >= state.maxSubRounds
  ) {
    matchFinished = true;
    const leaders = computeMejaScoreLeaders({
      participantUids: state.participantUids,
      participantNamesByUid: state.participantNamesByUid,
      playerScoresByUid: playerScoresByUid ?? {},
      scoreDeltas,
    });
    winnerUids = leaders.winnerUids;
    winnerNames = leaders.winnerNames;
  }

  const nextState: MejaPembohongState = {
    ...state,
    phase: matchFinished ? 'reveal' : 'challenge_reveal',
    livingUids: nextLiving,
    eliminatedUids: nextEliminated,
    shotsTakenByUid: nextShots,
    lastChallenge: challengeReveal,
    winnerUids,
    winnerNames,
    eventLog: [summary, ...state.eventLog].slice(0, 12),
  };

  let roundResult: RoundResult | null = null;
  if (matchFinished && state.mode === 'silinder') {
    const champName = winnerNames[0] ?? 'Pemain';
    roundResult = {
      roundNumber: 0,
      winnerTeam: 'pembohong',
      reason: `${summary} ${champName} bertahan paling akhir dan menjuarai Meja Pembohong (+4 poin juara)!`,
      locationName: `Meja ${MEJA_RANK_LABELS[state.tableRank]}`,
      guessedLocation: null,
      spyUids: winnerUids,
      spyNames: winnerNames,
      resolvedAtMs: 0,
      scoresApplied: true,
    };
  } else if (matchFinished && state.mode === 'cepat') {
    const label = winnerNames.length > 0 ? winnerNames.join(' & ') : winnerName;
    roundResult = {
      roundNumber: 0,
      winnerTeam: 'pembohong',
      reason: `${summary} 5 Tangan Skor Cepat selesai — Pemenang poin tertinggi: ${label}!`,
      locationName: `Meja ${MEJA_RANK_LABELS[state.tableRank]}`,
      guessedLocation: null,
      spyUids: winnerUids,
      spyNames: winnerNames,
      resolvedAtMs: 0,
      scoresApplied: true,
    };
  }

  return {
    nextState,
    challengeReveal,
    scoreDeltas,
    matchFinished,
    roundResult,
  };
}

export function computeMejaScoreLeaders(params: {
  participantUids: string[];
  participantNamesByUid: Record<string, string>;
  playerScoresByUid: Record<string, number>;
  scoreDeltas?: Record<string, number>;
}): { winnerUids: string[]; winnerNames: string[] } {
  const deltas = params.scoreDeltas ?? {};
  let maxScore = -1;
  for (const uid of params.participantUids) {
    const total = (params.playerScoresByUid[uid] ?? 0) + (deltas[uid] ?? 0);
    if (total > maxScore) maxScore = total;
  }
  const winnerUids = params.participantUids.filter(
    (uid) => (params.playerScoresByUid[uid] ?? 0) + (deltas[uid] ?? 0) === maxScore,
  );
  const winnerNames = winnerUids.map((uid) => params.participantNamesByUid[uid] ?? 'Pemain');
  return { winnerUids, winnerNames };
}

export function startNextMejaSubRound(params: {
  state: MejaPembohongState;
  trapSlotByUid: Record<string, number>;
  rng?: () => number;
}): {
  nextState: MejaPembohongState;
  nextHandsByUid: Record<string, MejaCard[]>;
  matchFinished: boolean;
} {
  const { state } = params;
  const rng = params.rng ?? Math.random;

  if (state.mode === 'silinder' && state.livingUids.length <= 1) {
    return {
      nextState: { ...state, phase: 'reveal' },
      nextHandsByUid: {},
      matchFinished: true,
    };
  }

  const nextSubRound = state.subRoundNumber + 1;
  if (state.mode === 'cepat' && state.maxSubRounds !== null && nextSubRound > state.maxSubRounds) {
    return {
      nextState: { ...state, phase: 'reveal' },
      nextHandsByUid: {},
      matchFinished: true,
    };
  }

  const nextTurnOrder = state.turnOrder.filter((uid) => state.livingUids.includes(uid));
  const tableRank = pickTableRank(rng);
  const deck = buildMejaDeck(nextTurnOrder.length, nextSubRound, rng);

  const nextHandsByUid: Record<string, MejaCard[]> = {};
  const nextHandCountByUid: Record<string, number> = { ...state.handCountByUid };
  for (const uid of state.participantUids) {
    nextHandCountByUid[uid] = 0;
  }

  let cursor = 0;
  for (const uid of nextTurnOrder) {
    const hand = deck.slice(cursor, cursor + MEJA_HAND_SIZE);
    cursor += MEJA_HAND_SIZE;
    nextHandsByUid[uid] = hand;
    nextHandCountByUid[uid] = hand.length;
  }

  // Rotate starting player cleanly across sub-rounds among living players
  const startIdx = nextTurnOrder.length > 0 ? (nextSubRound - 1) % nextTurnOrder.length : 0;
  const firstUid = nextTurnOrder[startIdx] ?? state.livingUids[0] ?? '';
  const firstName = state.participantNamesByUid[firstUid] ?? 'Pemain';

  const nextState: MejaPembohongState = {
    ...state,
    phase: 'playing',
    subRoundNumber: nextSubRound,
    tableRank,
    turnOrder: nextTurnOrder,
    currentTurnUid: firstUid,
    currentTurnName: firstName,
    handCountByUid: nextHandCountByUid,
    pileCardCount: 0,
    lastClaim: null,
    lastChallenge: null,
    eventLog: [
      `Tangan #${nextSubRound} dibuka! Meja: ${MEJA_RANK_LABELS[tableRank].toUpperCase()}. Giliran: ${firstName}.`,
      ...state.eventLog,
    ].slice(0, 12),
  };

  return {
    nextState,
    nextHandsByUid,
    matchFinished: false,
  };
}
