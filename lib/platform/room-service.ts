'use client';

import { sanitizeMalamSilumanSettings } from '@/lib/games/malam-siluman/engine';
import { sanitizeCumaBercandaSettings } from '@/lib/games/cuma-bercanda/packs';
import { sanitizeMejaPembohongSettings } from '@/lib/games/meja-pembohong/engine';
import { sanitizeUlarTanggaSettings } from '@/lib/games/ular-tangga/packs';
import type {
  CumaBercandaSettings,
  CumaBercandaVoteKind,
  CustomBercandaCard,
  CustomDrawingPrompt,
  CustomFactItem,
  CustomLocation,
  CustomSpectrum,
  CustomWordPair,
  GameType,
  MalamSilumanSettings,
  MejaPembohongSettings,
  PlayerSecretDoc,
  RoomDoc,
  RoomPlayerDoc,
  SpyMode,
  SuitPick,
  UlarHeroClassId,
  UlarItemId,
  UlarTanggaSettings,
} from '@/lib/games/types';
import { isLanRoomId, type LanActionName } from '@/lib/lan/lan-protocol';
import { lanRuntime } from '@/lib/lan/lan-runtime';
import { apiFetch, buildPhpApiUrl, notifyRoomMutated } from './api-client';
import { pickAvatarColor } from './user-profile';

export { pickAvatarColor };

interface RoomActionApiResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  systemMessage?: string | null;
}

async function dispatchRoomAction(
  roomId: string,
  action: LanActionName,
  payload: Record<string, unknown>,
): Promise<RoomActionApiResponse> {
  if (isLanRoomId(roomId)) {
    const result = await lanRuntime.dispatchAction(roomId, action, payload);
    return { ok: true, result, systemMessage: null };
  }

  const res = await apiFetch<RoomActionApiResponse>(buildPhpApiUrl('rooms/action'), {
    method: 'POST',
    body: JSON.stringify({ roomId, action, payload }),
  });
  notifyRoomMutated(roomId);
  return res;
}

export async function createRoom(params: {
  hostUid: string;
  hostName: string;
  avatarColor: string;
  gameType?: GameType;
}): Promise<{ roomId: string; code: string }> {
  return apiFetch<{ roomId: string; code: string }>(buildPhpApiUrl('rooms/create'), {
    method: 'POST',
    body: JSON.stringify({ gameType: params.gameType ?? 'spyfall' }),
  });
}

export async function checkAndResetExpiredRoomSession(
  roomId: string,
  _actorUid: string,
): Promise<{ resetPerformed: boolean; roomData: RoomDoc | null }> {
  if (isLanRoomId(roomId)) {
    return { resetPerformed: false, roomData: null };
  }
  const res = await apiFetch<{ resetPerformed: boolean; roomData: RoomDoc | null }>(
    buildPhpApiUrl('rooms/check-reset'),
    {
      method: 'POST',
      body: JSON.stringify({ roomId }),
    },
  );
  if (res.resetPerformed) {
    notifyRoomMutated(roomId);
  }
  return res;
}

export async function joinRoomAsStageDisplay(params: {
  code: string;
}): Promise<{ roomId: string; code: string }> {
  return apiFetch<{ roomId: string; code: string }>(buildPhpApiUrl('rooms/join'), {
    method: 'POST',
    body: JSON.stringify({ code: params.code, stage: true }),
  });
}

export async function joinRoomByCode(params: {
  code: string;
  uid: string;
  displayName: string;
  avatarColor: string;
}): Promise<string> {
  const res = await apiFetch<{ roomId: string; code: string }>(buildPhpApiUrl('rooms/join'), {
    method: 'POST',
    body: JSON.stringify({ code: params.code, stage: false }),
  });
  return res.roomId;
}

export async function addNumpangPlayer(params: {
  roomId: string;
  hostDeviceUid: string;
  hostDeviceName: string;
  displayName: string;
  avatarColor: string;
  existingPlayers: RoomPlayerDoc[];
}): Promise<string> {
  const res = await dispatchRoomAction(params.roomId, 'addNumpangPlayer', {
    guestName: params.displayName,
    displayName: params.displayName,
    avatarColor: params.avatarColor,
  });
  return String(res.result?.numpangUid ?? '');
}

export async function removeNumpangPlayer(params: {
  roomId: string;
  seatUid: string;
  seatName: string;
  hostDeviceUid: string;
  hostDeviceName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'removeNumpangPlayer', {
    numpangUid: params.seatUid,
    seatUid: params.seatUid,
  });
}

export async function togglePlayerBrb(params: {
  roomId: string;
  targetUid: string;
  targetName: string;
  actorUid: string;
  isBrb: boolean;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'togglePlayerBrb', {
    uid: params.targetUid,
    targetUid: params.targetUid,
    isBrb: params.isBrb,
  });
}

export async function leaveRoom(params: {
  room: RoomDoc;
  uid: string;
  displayName: string;
  players: RoomPlayerDoc[];
}): Promise<void> {
  if (isLanRoomId(params.room.id)) {
    await lanRuntime.dispatchAction(params.room.id, 'leaveRoom', {
      uid: params.uid,
    });
    return;
  }

  await apiFetch(buildPhpApiUrl('rooms/leave'), {
    method: 'POST',
    body: JSON.stringify({ roomId: params.room.id }),
  });
}

export async function updateSpyfallSettings(params: {
  roomId: string;
  roundDurationSec: number;
  spyMode: SpyMode;
  enabledPacks: string[];
  customLocations: CustomLocation[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateSpyfallSettings', {
    roundDurationSec: params.roundDurationSec,
    spyMode: params.spyMode,
    enabledPacks: params.enabledPacks,
    customLocations: params.customLocations,
  });
}

export async function updateKataKataSettings(params: {
  roomId: string;
  roundDurationSec: number;
  spyMode: SpyMode;
  enabledPacks: string[];
  customWordPairs: CustomWordPair[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateKataKataSettings', {
    roundDurationSec: params.roundDurationSec,
    spyMode: params.spyMode,
    enabledPacks: params.enabledPacks,
    customWordPairs: params.customWordPairs,
  });
}

export async function togglePlayerReady(params: {
  roomId: string;
  uid: string;
  isReady: boolean;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'togglePlayerReady', {
    uid: params.uid,
    isReady: params.isReady,
  });
}

// --- Server Game Master Actions: Game #1 (Yang Bener Yang Mana / spyfall) ---

export async function startSpyfallRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startSpyfallRound', {});
}

export async function initiateAccusationVote(params: {
  roomId: string;
  initiatorUid: string;
  initiatorName: string;
  targetUid: string;
  targetName?: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'initiateAccusationVote', {
    targetUid: params.targetUid,
    actAsUid: params.initiatorUid,
  });
}

export async function castAccusationVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  choice: 'yes' | 'no';
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'castAccusationVote', {
    choice: params.choice,
    vote: params.choice,
    actAsUid: params.voterUid,
  });
}

export async function cancelActiveVoteOrSpyGuess(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'cancelActiveVoteOrSpyGuess', {});
}

export async function submitSpyLocationGuess(params: {
  roomId: string;
  spyUid: string;
  spyName: string;
  guessedLocation: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitSpyLocationGuess', {
    guessedLocation: params.guessedLocation,
    actAsUid: params.spyUid,
  });
}

export async function resolveRoundTimeout(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolveRoundTimeout', {});
}

export async function returnRoomToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnRoomToLobby', {});
}

// --- Server Game Master Actions: Game #2 (Kata-Kata Hari Ini / kata_kata) ---

export async function startKataKataRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startKataKataRound', {});
}

export async function initiateKataKataVote(params: {
  roomId: string;
  initiatorUid: string;
  initiatorName: string;
  targetUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'initiateKataKataVote', {
    targetUid: params.targetUid,
    actAsUid: params.initiatorUid,
  });
}

export async function castKataKataVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  choice: 'yes' | 'no';
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'castKataKataVote', {
    choice: params.choice,
    vote: params.choice,
    actAsUid: params.voterUid,
  });
}

export async function cancelKataKataVote(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'cancelKataKataVote', {});
}

export async function submitKataKataLastChanceGuess(params: {
  roomId: string;
  spyUid: string;
  spyName: string;
  guessedWord?: string;
  surrender?: boolean;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitKataKataLastChanceGuess', {
    guessedWord: params.guessedWord ?? '',
    surrender: Boolean(params.surrender),
    actAsUid: params.spyUid,
  });
}

export async function resolveKataKataTimeout(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolveKataKataTimeout', {});
}

export async function returnKataKataToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnKataKataToLobby', {});
}

// --- Settings & Actions: Game #3 (Satu Frekuensi / satu_frekuensi) ---

export async function updateSatuFrekuensiSettings(params: {
  roomId: string;
  enabledPacks: string[];
  customSpectrums: CustomSpectrum[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateSatuFrekuensiSettings', {
    enabledPacks: params.enabledPacks,
    customSpectrums: params.customSpectrums,
  });
}

export async function startSatuFrekuensiRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startSatuFrekuensiRound', {});
}

export async function submitSatuFrekuensiClue(params: {
  roomId: string;
  psychicUid: string;
  psychicName: string;
  clueText: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitSatuFrekuensiClue', {
    clueText: params.clueText,
    actAsUid: params.psychicUid,
  });
}

export async function submitSatuFrekuensiGuess(params: {
  roomId: string;
  guessValue: number;
  actAsUid?: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitSatuFrekuensiGuess', {
    guessValue: params.guessValue,
    ...(params.actAsUid ? { actAsUid: params.actAsUid } : {}),
  });
}

export async function advanceSatuFrekuensiPhase(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'advanceSatuFrekuensiPhase', {});
}

export async function returnSatuFrekuensiToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnSatuFrekuensiToLobby', {});
}

// --- Settings & Actions: Game #4 (Fakta Hari Ini / fakta_hari_ini) ---

export async function updateFaktaHariIniSettings(params: {
  roomId: string;
  enabledPacks: string[];
  customFacts: CustomFactItem[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateFaktaHariIniSettings', {
    enabledPacks: params.enabledPacks,
    customFacts: params.customFacts,
  });
}

export async function startFaktaHariIniRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startFaktaHariIniRound', {});
}

export async function advanceFaktaHariIniPhase(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  direction?: 'advance' | 'back';
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'advanceFaktaHariIniPhase', {
    direction: params.direction ?? 'advance',
    actAsUid: params.actorUid,
  });
}

export async function submitFaktaHariIniGuess(params: {
  roomId: string;
  guesserUid: string;
  guesserName: string;
  pickedUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitFaktaHariIniGuess', {
    pickedUid: params.pickedUid,
    actAsUid: params.guesserUid,
  });
}

export async function returnFaktaHariIniToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnFaktaHariIniToLobby', {});
}

// --- Settings & Actions: Game #5 (Pelukis Gadungan / pelukis_gadungan) ---

export async function updatePelukisGadunganSettings(params: {
  roomId: string;
  enabledPacks: string[];
  spyMode: SpyMode;
  pelukisStrokeRounds: 1 | 2;
  customDrawingPrompts: CustomDrawingPrompt[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updatePelukisSettings', {
    enabledPacks: params.enabledPacks,
    spyMode: params.spyMode,
    pelukisStrokeRounds: params.pelukisStrokeRounds,
    customDrawingPrompts: params.customDrawingPrompts,
  });
}

export async function startPelukisRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startPelukisRound', {});
}

export async function submitPelukisStroke(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  points: number[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitPelukisStroke', {
    action: 'draw',
    points: params.points,
    actAsUid: params.actorUid,
  });
}

export async function skipPelukisTurn(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'skipPelukisTurn', {
    action: 'skip',
    actAsUid: params.actorUid,
  });
}

export async function castPelukisVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  targetUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'castPelukisVote', {
    targetUid: params.targetUid,
    actAsUid: params.voterUid,
  });
}

export async function resolvePelukisVote(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolvePelukisVote', {});
}

export async function submitPelukisGuess(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  guessedWord?: string;
  surrender?: boolean;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitPelukisGuess', {
    guessedWord: params.guessedWord ?? '',
    surrender: Boolean(params.surrender),
    actAsUid: params.actorUid,
  });
}

export async function returnPelukisToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnPelukisToLobby', {});
}

// --- Settings & Actions: Game #6 (Malam Siluman / malam_siluman) ---

export async function updateMalamSilumanSettings(params: {
  roomId: string;
  settings: MalamSilumanSettings;
}): Promise<void> {
  const clean = sanitizeMalamSilumanSettings(params.settings);
  await dispatchRoomAction(params.roomId, 'updateMalamSilumanSettings', {
    settings: clean,
  });
}

export async function startMalamSilumanRound(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startMalamSilumanRound', {});
}

export async function submitMalamSilumanNightAction(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  targetUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitMalamSilumanNightAction', {
    targetUid: params.targetUid,
    actAsUid: params.actorUid,
  });
}

export async function resolveMalamSilumanNight(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolveMalamSilumanNight', {});
}

export async function advanceMalamSilumanDayPhase(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
  nextPhase: 'day_discussion' | 'day_voting';
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'advanceMalamSilumanDayPhase', {
    nextPhase: params.nextPhase,
  });
}

export async function castMalamSilumanVote(params: {
  roomId: string;
  voterUid: string;
  voterName: string;
  targetUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'castMalamSilumanVote', {
    targetUid: params.targetUid,
    actAsUid: params.voterUid,
  });
}

export async function resolveMalamSilumanVote(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolveMalamSilumanVote', {});
}

export async function submitMalamSilumanHunterShot(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  targetUid?: string;
  skip?: boolean;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitMalamSilumanHunterShot', {
    targetUid: params.targetUid ?? '',
    skip: Boolean(params.skip),
    actAsUid: params.actorUid,
  });
}

export async function returnMalamSilumanToLobby(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnMalamSilumanToLobby', {});
}

// --- Settings & Actions: Game #7 (Ular Tangga RP / ular_tangga) ---

export async function updateUlarTanggaSettings(params: {
  roomId: string;
  settings: Partial<UlarTanggaSettings>;
}): Promise<void> {
  const clean = sanitizeUlarTanggaSettings(params.settings);
  await dispatchRoomAction(params.roomId, 'updateUlarTanggaSettings', {
    settings: clean,
  });
}

export async function selectUlarTanggaClass(params: {
  roomId: string;
  actorUid: string;
  heroClass: UlarHeroClassId | 'acak';
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'selectUlarTanggaClass', {
    heroClass: params.heroClass,
    actAsUid: params.actorUid,
  });
}

export async function startUlarTanggaRound(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startUlarTanggaRound', {});
}

export async function activateUlarTanggaSkill(params: {
  roomId: string;
  actorUid: string;
  targetUid?: string | null;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'useUlarTanggaSkill', {
    targetUid: params.targetUid ?? '',
    actAsUid: params.actorUid,
  });
}

export async function activateUlarTanggaItem(params: {
  roomId: string;
  actorUid: string;
  itemId: UlarItemId;
  targetUid?: string | null;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'useUlarTanggaItem', {
    itemId: params.itemId,
    targetUid: params.targetUid ?? '',
    actAsUid: params.actorUid,
  });
}

export async function rollUlarTanggaDice(params: {
  roomId: string;
  actorUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'rollUlarTanggaDice', {
    actAsUid: params.actorUid,
  });
}

export async function resolveUlarTanggaEncounter(params: {
  roomId: string;
  actorUid: string;
  decision: 'attack' | 'buy' | 'skip';
  buyItemId?: UlarItemId | null;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'resolveUlarTanggaEncounter', {
    decision: params.decision,
    buyItemId: params.buyItemId ?? '',
    actAsUid: params.actorUid,
  });
}

export async function returnUlarTanggaToLobby(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnUlarTanggaToLobby', {});
}

// --- Settings & Actions: Game #8 (Cuma Bercanda / cuma_bercanda) ---

export async function updateCumaBercandaSettings(params: {
  roomId: string;
  enabledPacks: string[];
  customCards: CustomBercandaCard[];
  settings: Partial<CumaBercandaSettings>;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateCumaBercandaSettings', {
    enabledPacks: params.enabledPacks,
    customCards: params.customCards,
    settings: sanitizeCumaBercandaSettings(params.settings),
  });
}

export async function startCumaBercandaRound(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startCumaBercandaRound', {});
}

export async function submitCumaBercandaCard(params: {
  roomId: string;
  actorUid: string;
  cardId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitCumaBercandaCard', {
    cardId: params.cardId,
    actAsUid: params.actorUid,
  });
}

export async function advanceCumaBercandaToVoting(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'advanceCumaBercandaToVoting', {});
}

export async function castCumaBercandaUpvoteAction(params: {
  roomId: string;
  actorUid: string;
  kind: CumaBercandaVoteKind;
  targetEntryId?: string | null;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'castCumaBercandaUpvote', {
    kind: params.kind,
    targetEntryId: params.targetEntryId ?? null,
    actAsUid: params.actorUid,
  });
}

export async function revealCumaBercandaRound(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'revealCumaBercandaRound', {});
}

export async function returnCumaBercandaToLobby(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnCumaBercandaToLobby', {});
}

// --- Settings & Actions: Game #9 (Meja Pembohong / meja_pembohong) ---

export async function updateMejaPembohongSettings(params: {
  roomId: string;
  settings: Partial<MejaPembohongSettings>;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'updateMejaPembohongSettings', {
    settings: sanitizeMejaPembohongSettings(params.settings),
  });
}

export async function startMejaPembohongRound(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'startMejaPembohongRound', {});
}

export async function playMejaPembohongCards(params: {
  roomId: string;
  actorUid: string;
  cardIds: string[];
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'playMejaPembohongCards', {
    cardIds: params.cardIds,
    actAsUid: params.actorUid,
  });
}

export async function callMejaPembohongLiar(params: {
  roomId: string;
  actorUid: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'callMejaPembohongLiar', {
    actAsUid: params.actorUid,
  });
}

export async function nextMejaPembohongSubRound(params: {
  roomId: string;
  actorUid?: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'nextMejaPembohongSubRound', {
    ...(params.actorUid ? { actAsUid: params.actorUid } : {}),
  });
}

export async function returnMejaPembohongToLobby(params: {
  roomId: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'returnMejaPembohongToLobby', {});
}

// --- Session & Cross-Game Actions (v3.1.0) ---

export async function switchRoomGameType(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
  nextGameType: GameType;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'switchRoomGameType', {
    nextGameType: params.nextGameType,
  });
}

export async function openSessionRecap(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'openSessionRecap', {});
}

export async function closeSessionRecap(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'closeSessionRecap', {});
}

export async function submitSuitDuelPick(params: {
  roomId: string;
  actorUid: string;
  actorName: string;
  pick: SuitPick;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'submitSuitDuelPick', {
    pick: params.pick,
    actAsUid: params.actorUid,
  });
}

export async function advanceSuitDuelClash(params: {
  roomId: string;
  hostUid: string;
  hostName: string;
}): Promise<void> {
  await dispatchRoomAction(params.roomId, 'advanceSuitDuelClash', {});
}

export async function fetchAllRoundSecrets(
  roomId: string,
  _roundId: string,
  _playerUids: string[],
): Promise<Record<string, PlayerSecretDoc>> {
  if (isLanRoomId(roomId)) {
    return lanRuntime.getSnapshot(roomId)?.revealedSecrets ?? {};
  }
  const snap = await apiFetch<{ revealedSecrets?: Record<string, PlayerSecretDoc> }>(
    buildPhpApiUrl('rooms/snapshot', { roomId }),
  );
  return snap.revealedSecrets ?? {};
}
