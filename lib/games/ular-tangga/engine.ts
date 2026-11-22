import type {
  PlayerSecretDoc,
  RoomPlayerDoc,
  UlarHeroClassId,
  UlarHeroState,
  UlarItemId,
  UlarTanggaSettings,
  UlarTanggaState,
} from '../types';
import {
  getActiveSnakesForScenario,
  getUlarScenarioPack,
  sanitizeUlarTanggaSettings,
  ULAR_HERO_CLASSES,
  ULAR_HERO_CLASS_ORDER,
  ULAR_ITEM_IDS,
  ULAR_RPG_ITEMS,
} from './packs';

export type UlarRngFn = (minInclusive: number, maxInclusive: number) => number;

const defaultRng: UlarRngFn = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function appendLog(log: string[], line: string): string[] {
  return [line, ...log].slice(0, 12);
}

function resolveHeroClass(
  choice: UlarHeroClassId | 'acak' | undefined,
  rng: UlarRngFn,
): UlarHeroClassId {
  if (choice && choice !== 'acak' && choice in ULAR_HERO_CLASSES) {
    return choice;
  }
  return ULAR_HERO_CLASS_ORDER[rng(0, ULAR_HERO_CLASS_ORDER.length - 1)];
}

function applyKoIfNeeded(hero: UlarHeroState, log: string[]): { hero: UlarHeroState; log: string[]; knockedOut: boolean } {
  if (hero.hp > 0) {
    return { hero, log, knockedOut: false };
  }
  const nextTile = Math.max(1, hero.tile - 8);
  const nextGold = Math.floor(hero.gold / 2);
  const revived: UlarHeroState = {
    ...hero,
    tile: nextTile,
    hp: hero.maxHp,
    gold: nextGold,
    shielded: false,
    bonusSteps: 0,
    koCount: hero.koCount + 1,
  };
  return {
    hero: revived,
    log: appendLog(
      log,
      `${hero.displayName} PINGSAN! Jatuh ke Petak ${nextTile}, kehilangan separuh Koin, dan bangkit dengan HP penuh.`,
    ),
    knockedOut: true,
  };
}

export function createInitialUlarTanggaRound(params: {
  players: RoomPlayerDoc[];
  settings: UlarTanggaSettings | null | undefined;
  roundId: string;
  rng?: UlarRngFn;
}): {
  state: UlarTanggaState;
  secretsByUid: Record<string, PlayerSecretDoc>;
} {
  const rng = params.rng ?? defaultRng;
  const cleanSettings = sanitizeUlarTanggaSettings(params.settings);
  const activePlayers = params.players.filter((p) => !p.isBrb);
  if (activePlayers.length < 2) {
    throw new Error('Minimal 2 pemain aktif (tidak BRB) untuk memulai Ular Tangga RP.');
  }

  // Shuffle turn order fairly
  const turnOrder = activePlayers.map((p) => p.uid);
  for (let i = turnOrder.length - 1; i > 0; i--) {
    const j = rng(0, i);
    [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
  }

  const heroesByUid: Record<string, UlarHeroState> = {};
  const secretsByUid: Record<string, PlayerSecretDoc> = {};

  for (const p of activePlayers) {
    const heroClass = resolveHeroClass(cleanSettings.classSelectionByUid[p.uid], rng);
    const meta = ULAR_HERO_CLASSES[heroClass];
    const starterItem: UlarItemId = rng(0, 1) === 0 ? 'ramuan_hp' : 'sepatu_kilat';

    heroesByUid[p.uid] = {
      uid: p.uid,
      displayName: p.displayName,
      avatarColor: p.avatarColor,
      heroClass,
      tile: 1,
      hp: meta.maxHp,
      maxHp: meta.maxHp,
      gold: 25,
      shielded: false,
      bonusSteps: 0,
      skillCooldown: 0,
      bagCount: 1,
      koCount: 0,
      monstersDefeated: 0,
    };

    secretsByUid[p.uid] = {
      uid: p.uid,
      roundId: params.roundId,
      gameType: 'ular_tangga',
      ularHeroClass: heroClass,
      ularBag: [starterItem],
    };
  }

  const pack = getUlarScenarioPack(cleanSettings.scenarioId);
  const firstUid = turnOrder[0];
  const firstName = heroesByUid[firstUid]?.displayName ?? 'Pemain';

  return {
    state: {
      scenarioId: cleanSettings.scenarioId,
      boardMode: cleanSettings.boardMode,
      exactFinishBounce: cleanSettings.exactFinishBounce,
      phase: 'turn_action',
      turnOrder,
      currentTurnIndex: 0,
      currentTurnUid: firstUid,
      currentTurnName: firstName,
      turnNumber: 1,
      usedSkillThisTurn: false,
      usedItemThisTurn: false,
      lastRoll: null,
      activeEncounter: null,
      heroesByUid,
      eventLog: [
        `Petualangan dimulai di ${pack.name}! Giliran pertama: ${firstName}.`,
      ],
      winnerUid: null,
      winnerName: null,
    },
    secretsByUid,
  };
}

export function advanceUlarTurn(
  state: UlarTanggaState,
  activeBrbUids: Set<string> = new Set(),
): UlarTanggaState {
  if (state.phase === 'reveal' || state.turnOrder.length === 0) {
    return state;
  }

  const nextHeroes = { ...state.heroesByUid };
  const currentUid = state.currentTurnUid;
  if (nextHeroes[currentUid] && nextHeroes[currentUid].skillCooldown > 0) {
    nextHeroes[currentUid] = {
      ...nextHeroes[currentUid],
      skillCooldown: Math.max(0, nextHeroes[currentUid].skillCooldown - 1),
    };
  }

  let nextIdx = (state.currentTurnIndex + 1) % state.turnOrder.length;
  for (let tries = 0; tries < state.turnOrder.length; tries++) {
    const candidate = state.turnOrder[nextIdx];
    if (!activeBrbUids.has(candidate) && nextHeroes[candidate]) {
      break;
    }
    nextIdx = (nextIdx + 1) % state.turnOrder.length;
  }

  const nextUid = state.turnOrder[nextIdx];
  const nextName = nextHeroes[nextUid]?.displayName ?? 'Pemain';

  return {
    ...state,
    phase: 'turn_action',
    currentTurnIndex: nextIdx,
    currentTurnUid: nextUid,
    currentTurnName: nextName,
    turnNumber: state.turnNumber + 1,
    usedSkillThisTurn: false,
    usedItemThisTurn: false,
    activeEncounter: null,
    heroesByUid: nextHeroes,
  };
}

export function applyUlarSkill(params: {
  state: UlarTanggaState;
  actorUid: string;
  targetUid?: string | null;
}): { state: UlarTanggaState; message: string } {
  const { state, actorUid, targetUid } = params;
  if (state.phase !== 'turn_action' || state.currentTurnUid !== actorUid) {
    throw new Error('Skill hanya bisa dipakai saat giliranmu sebelum melempar dadu.');
  }
  if (state.usedSkillThisTurn) {
    throw new Error('Kamu sudah memakai Skill di giliran ini.');
  }
  const actor = state.heroesByUid[actorUid];
  if (!actor) throw new Error('Hero tidak ditemukan.');
  if (actor.skillCooldown > 0) {
    throw new Error(`Skill masih cooldown ${actor.skillCooldown} giliran lagi.`);
  }

  const classMeta = ULAR_HERO_CLASSES[actor.heroClass];
  const nextHeroes = { ...state.heroesByUid };
  let log = [...state.eventLog];
  let message = '';

  const validTargetUid =
    targetUid && targetUid !== actorUid && nextHeroes[targetUid] ? targetUid : null;

  if (actor.heroClass === 'tabib') {
    const healedHp = clamp(actor.hp + 5, 1, actor.maxHp);
    nextHeroes[actorUid] = {
      ...actor,
      hp: healedHp,
      shielded: true,
      skillCooldown: classMeta.skillCooldown,
    };
    message = `${actor.displayName} merapal Doa Pelindung (+5 HP & Perisai Anti-Ular aktif)!`;
  } else if (actor.heroClass === 'ksatria') {
    if (validTargetUid) {
      const target = nextHeroes[validTargetUid];
      const nextTile = Math.max(1, target.tile - 3);
      nextHeroes[validTargetUid] = { ...target, tile: nextTile };
      nextHeroes[actorUid] = { ...actor, skillCooldown: classMeta.skillCooldown };
      message = `${actor.displayName} menghantam ${target.displayName} dengan Bantingan Perisai (-3 petak → Petak ${nextTile})!`;
    } else {
      nextHeroes[actorUid] = {
        ...actor,
        bonusSteps: actor.bonusSteps + 2,
        skillCooldown: classMeta.skillCooldown,
      };
      message = `${actor.displayName} bersiap menerjang (+2 langkah ekstra di dadu ini)!`;
    }
  } else if (actor.heroClass === 'pencuri') {
    if (validTargetUid) {
      const target = nextHeroes[validTargetUid];
      const stolen = Math.min(15, target.gold);
      nextHeroes[validTargetUid] = { ...target, gold: target.gold - stolen };
      nextHeroes[actorUid] = {
        ...actor,
        gold: actor.gold + stolen,
        skillCooldown: classMeta.skillCooldown,
      };
      message = `${actor.displayName} melancarkan Copet Kilat dan mencuri ${stolen}G dari ${target.displayName}!`;
    } else {
      nextHeroes[actorUid] = {
        ...actor,
        bonusSteps: actor.bonusSteps + 3,
        skillCooldown: classMeta.skillCooldown,
      };
      message = `${actor.displayName} memicu Langkah Kilat (+3 langkah ekstra di dadu ini)!`;
    }
  } else {
    // Penyihir
    if (validTargetUid) {
      const target = nextHeroes[validTargetUid];
      const nextTile = Math.max(1, target.tile - 4);
      nextHeroes[validTargetUid] = { ...target, tile: nextTile };
      nextHeroes[actorUid] = { ...actor, skillCooldown: classMeta.skillCooldown };
      message = `${actor.displayName} merapal Sihir Petak ke ${target.displayName} (terlempar -4 petak → Petak ${nextTile})!`;
    } else {
      nextHeroes[actorUid] = {
        ...actor,
        bonusSteps: actor.bonusSteps + 4,
        skillCooldown: classMeta.skillCooldown,
      };
      message = `${actor.displayName} menyiapkan Teleportasi (+4 langkah ekstra di dadu ini)!`;
    }
  }

  log = appendLog(log, message);
  return {
    state: {
      ...state,
      usedSkillThisTurn: true,
      heroesByUid: nextHeroes,
      eventLog: log,
    },
    message,
  };
}

export function applyUlarBagItem(params: {
  state: UlarTanggaState;
  actorUid: string;
  actorBag: UlarItemId[];
  itemId: UlarItemId;
  targetUid?: string | null;
}): {
  state: UlarTanggaState;
  nextBag: UlarItemId[];
  message: string;
} {
  const { state, actorUid, actorBag, itemId, targetUid } = params;
  if (state.phase !== 'turn_action' || state.currentTurnUid !== actorUid) {
    throw new Error('Item hanya bisa dipakai saat giliranmu sebelum melempar dadu.');
  }
  if (state.usedItemThisTurn) {
    throw new Error('Maksimal 1 Item per giliran.');
  }
  const idx = actorBag.indexOf(itemId);
  if (idx < 0) {
    throw new Error('Item tersebut tidak ada di tasmu.');
  }
  const actor = state.heroesByUid[actorUid];
  if (!actor) throw new Error('Hero tidak ditemukan.');

  const nextBag = [...actorBag];
  nextBag.splice(idx, 1);
  const nextHeroes = { ...state.heroesByUid };
  let log = [...state.eventLog];
  let message = '';

  if (itemId === 'ramuan_hp') {
    nextHeroes[actorUid] = {
      ...actor,
      hp: clamp(actor.hp + 6, 1, actor.maxHp),
      bagCount: nextBag.length,
    };
    message = `${actor.displayName} meminum Ramuan HP (+6 HP)!`;
  } else if (itemId === 'jimat_anti_ular') {
    nextHeroes[actorUid] = {
      ...actor,
      shielded: true,
      bagCount: nextBag.length,
    };
    message = `${actor.displayName} mengaktifkan Jimat Anti-Ular!`;
  } else if (itemId === 'sepatu_kilat') {
    nextHeroes[actorUid] = {
      ...actor,
      bonusSteps: actor.bonusSteps + 3,
      bagCount: nextBag.length,
    };
    message = `${actor.displayName} memakai Sepatu Kilat (+3 langkah untuk dadu ini)!`;
  } else if (itemId === 'gulungan_tukar') {
    if (!targetUid || targetUid === actorUid || !nextHeroes[targetUid]) {
      throw new Error('Pilih 1 lawan valid untuk bertukar posisi.');
    }
    const target = nextHeroes[targetUid];
    const actorTile = actor.tile;
    const targetTile = target.tile;
    nextHeroes[actorUid] = { ...actor, tile: targetTile, bagCount: nextBag.length };
    nextHeroes[targetUid] = { ...target, tile: actorTile };
    message = `${actor.displayName} mengaktifkan Gulungan Tukar dan bertukar posisi dengan ${target.displayName} (Petak ${actorTile} ↔ ${targetTile})!`;
  } else if (itemId === 'bom_ular') {
    if (!targetUid || targetUid === actorUid || !nextHeroes[targetUid]) {
      throw new Error('Pilih 1 lawan valid sebagai sasaran Bom Ular.');
    }
    const target = nextHeroes[targetUid];
    const dmg = Math.max(1, 3 - ULAR_HERO_CLASSES[target.heroClass].damageReduction);
    const bombed: UlarHeroState = {
      ...target,
      tile: Math.max(1, target.tile - 5),
      hp: Math.max(0, target.hp - dmg),
    };
    const koRes = applyKoIfNeeded(bombed, log);
    nextHeroes[targetUid] = koRes.hero;
    log = koRes.log;
    nextHeroes[actorUid] = { ...actor, bagCount: nextBag.length };
    message = `${actor.displayName} melempar Bom Ular ke ${target.displayName} (-5 petak, -${dmg} HP)!`;
  }

  log = appendLog(log, message);
  return {
    state: {
      ...state,
      usedItemThisTurn: true,
      heroesByUid: nextHeroes,
      eventLog: log,
    },
    nextBag,
    message,
  };
}

export function calculateUlarTanggaScoreDeltas(state: UlarTanggaState): Record<string, number> {
  const ranked = Object.values(state.heroesByUid).sort((a, b) => {
    if (b.tile !== a.tile) return b.tile - a.tile;
    if (b.gold !== a.gold) return b.gold - a.gold;
    return b.hp - a.hp;
  });

  const deltas: Record<string, number> = {};
  ranked.forEach((hero, index) => {
    if (index === 0) deltas[hero.uid] = 5;
    else if (index === 1) deltas[hero.uid] = 3;
    else if (index === 2) deltas[hero.uid] = 2;
    else deltas[hero.uid] = 1;
  });
  return deltas;
}

export function rollDiceAndMove(params: {
  state: UlarTanggaState;
  actorUid: string;
  actorBag: UlarItemId[];
  activeBrbUids?: Set<string>;
  rng?: UlarRngFn;
}): {
  state: UlarTanggaState;
  nextBag: UlarItemId[];
  finished: boolean;
  message: string;
} {
  const rng = params.rng ?? defaultRng;
  const { state, actorUid } = params;
  if (state.phase !== 'turn_action' || state.currentTurnUid !== actorUid) {
    throw new Error('Bukan giliranmu untuk melempar dadu.');
  }

  const actor = state.heroesByUid[actorUid];
  if (!actor) throw new Error('Hero tidak ditemukan.');

  const pack = getUlarScenarioPack(state.scenarioId);
  const snakes = getActiveSnakesForScenario(pack, state.boardMode);
  const classMeta = ULAR_HERO_CLASSES[actor.heroClass];

  const dice = rng(1, 6);
  const bonus = actor.bonusSteps;
  const fromTile = actor.tile;
  const rawDest = fromTile + dice + bonus;

  let landedTile = rawDest;
  let bounceNote = '';
  if (rawDest > 100) {
    if (state.exactFinishBounce) {
      landedTile = 100 - (rawDest - 100);
      bounceNote = ` (pantul balik dari 100 ke ${landedTile})`;
    } else {
      landedTile = 100;
    }
  }

  let nextHero: UlarHeroState = {
    ...actor,
    tile: landedTile,
    bonusSteps: 0,
  };
  let nextBag = [...params.actorBag];
  let log = [...state.eventLog];
  let summary = `${actor.displayName} melempar dadu ${dice}${bonus > 0 ? `+${bonus}` : ''} → Petak ${landedTile}${bounceNote}.`;

  // Check exact win first before ladders/snakes
  if (landedTile === 100) {
    const nextHeroes = { ...state.heroesByUid, [actorUid]: nextHero };
    summary = `${actor.displayName} mencapai Petak 100 dan MENANG di ${pack.name}!`;
    log = appendLog(log, summary);
    return {
      state: {
        ...state,
        phase: 'reveal',
        lastRoll: {
          uid: actorUid,
          displayName: actor.displayName,
          dice,
          bonus,
          fromTile,
          toTile: 100,
          summary,
        },
        heroesByUid: nextHeroes,
        eventLog: log,
        winnerUid: actorUid,
        winnerName: actor.displayName,
      },
      nextBag,
      finished: true,
      message: summary,
    };
  }

  const ladder = pack.ladders.find((l) => l.from === landedTile);
  const snake = snakes.find((s) => s.from === landedTile);

  if (ladder) {
    const healAmt = 2 + classMeta.ladderHealBonus;
    nextHero = {
      ...nextHero,
      tile: ladder.to,
      hp: clamp(nextHero.hp + healAmt, 1, nextHero.maxHp),
    };
    summary = `${actor.displayName} melempar ${dice}${bonus > 0 ? `+${bonus}` : ''} ke Petak ${landedTile}, naik ${pack.ladderLabel} ke Petak ${ladder.to} (+${healAmt} HP)!`;
  } else if (snake) {
    if (nextHero.shielded) {
      nextHero = { ...nextHero, shielded: false };
      summary = `${actor.displayName} mendarat di ${pack.snakeLabel} (${landedTile}), tapi Perisai Anti-Ular menangkis gigitannya!`;
    } else {
      const dmg = Math.max(1, 4 - classMeta.damageReduction);
      nextHero = {
        ...nextHero,
        tile: snake.to,
        hp: Math.max(0, nextHero.hp - dmg),
      };
      summary = `${actor.displayName} tergigit ${pack.snakeLabel} (${landedTile} → ${snake.to}, -${dmg} HP)!`;
      const koRes = applyKoIfNeeded(nextHero, log);
      nextHero = koRes.hero;
      log = koRes.log;
    }
  } else if (pack.chestTiles.includes(landedTile)) {
    const goldGain = 20 + classMeta.chestGoldBonus;
    let itemNote = '';
    if (nextBag.length < 3) {
      const drawn = ULAR_ITEM_IDS[rng(0, ULAR_ITEM_IDS.length - 1)];
      nextBag = [...nextBag, drawn];
      itemNote = ` & menemukan ${ULAR_RPG_ITEMS[drawn].name}`;
    }
    nextHero = {
      ...nextHero,
      gold: nextHero.gold + goldGain,
      bagCount: nextBag.length,
    };
    summary = `${actor.displayName} membuka Peti Harta di Petak ${landedTile}: +${goldGain}G${itemNote}!`;
  } else if (pack.monsterTiles.includes(landedTile)) {
    const template = pack.monsters[rng(0, pack.monsters.length - 1)];
    const powerScale = state.boardMode === 'brutal' ? 1 : 0;
    const nextHeroes = { ...state.heroesByUid, [actorUid]: nextHero };
    summary = `${actor.displayName} dihadang ${template.name} di Petak ${landedTile}!`;
    log = appendLog(log, summary);
    return {
      state: {
        ...state,
        phase: 'encounter',
        lastRoll: {
          uid: actorUid,
          displayName: actor.displayName,
          dice,
          bonus,
          fromTile,
          toTile: nextHero.tile,
          summary,
        },
        activeEncounter: {
          type: 'monster',
          tile: landedTile,
          monsterId: template.id,
          monsterName: template.name,
          monsterPower: template.power + powerScale,
          monsterDamage: template.damage,
          monsterRewardGold: template.rewardGold,
          monsterFlavor: template.flavor,
        },
        heroesByUid: nextHeroes,
        eventLog: log,
      },
      nextBag,
      finished: false,
      message: summary,
    };
  } else if (pack.shopTiles.includes(landedTile)) {
    const nextHeroes = { ...state.heroesByUid, [actorUid]: nextHero };
    summary = `${actor.displayName} mampir di ${pack.merchantLabel} (Petak ${landedTile}).`;
    log = appendLog(log, summary);
    return {
      state: {
        ...state,
        phase: 'encounter',
        lastRoll: {
          uid: actorUid,
          displayName: actor.displayName,
          dice,
          bonus,
          fromTile,
          toTile: nextHero.tile,
          summary,
        },
        activeEncounter: {
          type: 'merchant',
          tile: landedTile,
        },
        heroesByUid: nextHeroes,
        eventLog: log,
      },
      nextBag,
      finished: false,
      message: summary,
    };
  }

  log = appendLog(log, summary);
  const updatedState: UlarTanggaState = {
    ...state,
    lastRoll: {
      uid: actorUid,
      displayName: actor.displayName,
      dice,
      bonus,
      fromTile,
      toTile: nextHero.tile,
      summary,
    },
    heroesByUid: { ...state.heroesByUid, [actorUid]: nextHero },
    eventLog: log,
  };

  return {
    state: advanceUlarTurn(updatedState, params.activeBrbUids),
    nextBag,
    finished: false,
    message: summary,
  };
}

export function resolveUlarEncounter(params: {
  state: UlarTanggaState;
  actorUid: string;
  actorBag: UlarItemId[];
  decision: 'attack' | 'buy' | 'skip';
  buyItemId?: UlarItemId | null;
  activeBrbUids?: Set<string>;
  rng?: UlarRngFn;
}): {
  state: UlarTanggaState;
  nextBag: UlarItemId[];
  finished: boolean;
  message: string;
} {
  const rng = params.rng ?? defaultRng;
  const { state, actorUid, decision, buyItemId } = params;
  if (state.phase !== 'encounter' || state.currentTurnUid !== actorUid || !state.activeEncounter) {
    throw new Error('Tidak ada perjumpaan aktif untuk giliranmu.');
  }
  const actor = state.heroesByUid[actorUid];
  if (!actor) throw new Error('Hero tidak ditemukan.');

  let nextBag = [...params.actorBag];
  let nextHero = { ...actor };
  let log = [...state.eventLog];
  let message = '';
  const enc = state.activeEncounter;

  if (enc.type === 'monster') {
    const classMeta = ULAR_HERO_CLASSES[actor.heroClass];
    const combatRoll = rng(1, 6);
    const totalPower = combatRoll + classMeta.combatBonus;
    const monsterPower = enc.monsterPower ?? 5;

    if (totalPower >= monsterPower) {
      const goldReward = enc.monsterRewardGold ?? 25;
      const bonusMove = Math.min(100, actor.tile + 2);
      nextHero = {
        ...nextHero,
        gold: nextHero.gold + goldReward,
        tile: bonusMove,
        monstersDefeated: nextHero.monstersDefeated + 1,
      };
      message = `${actor.displayName} mengalahkan ${enc.monsterName} (Serangan ${combatRoll}+${classMeta.combatBonus} vs ${monsterPower})! +${goldReward}G & maju ke Petak ${bonusMove}!`;
    } else {
      const dmg = Math.max(1, (enc.monsterDamage ?? 3) - classMeta.damageReduction);
      const knockTile = Math.max(1, actor.tile - 2);
      nextHero = {
        ...nextHero,
        hp: Math.max(0, nextHero.hp - dmg),
        tile: knockTile,
      };
      message = `${actor.displayName} kewalahan melawan ${enc.monsterName} (${combatRoll}+${classMeta.combatBonus} vs ${monsterPower}): -${dmg} HP & mundur ke Petak ${knockTile}.`;
      const koRes = applyKoIfNeeded(nextHero, log);
      nextHero = koRes.hero;
      log = koRes.log;
    }
  } else {
    // Merchant
    if (decision === 'buy' && buyItemId && buyItemId in ULAR_RPG_ITEMS) {
      const itemMeta = ULAR_RPG_ITEMS[buyItemId];
      if (nextBag.length >= 3) {
        throw new Error('Tas penuh (maksimal 3 item). Gunakan dulu di giliran berikutnya atau pilih Lewati.');
      }
      if (nextHero.gold < itemMeta.price) {
        throw new Error(`Koin kurang (butuh ${itemMeta.price}G).`);
      }
      nextBag = [...nextBag, buyItemId];
      nextHero = {
        ...nextHero,
        gold: nextHero.gold - itemMeta.price,
        bagCount: nextBag.length,
      };
      message = `${actor.displayName} membeli ${itemMeta.name} (${itemMeta.price}G).`;
    } else {
      message = `${actor.displayName} beristirahat sejenak dan melanjutkan perjalanan.`;
    }
  }

  log = appendLog(log, message);
  const nextHeroes = { ...state.heroesByUid, [actorUid]: nextHero };

  if (nextHero.tile >= 100) {
    const pack = getUlarScenarioPack(state.scenarioId);
    const winMsg = `${actor.displayName} mencapai Petak 100 dan MENANG di ${pack.name}!`;
    return {
      state: {
        ...state,
        phase: 'reveal',
        activeEncounter: null,
        heroesByUid: nextHeroes,
        eventLog: appendLog(log, winMsg),
        winnerUid: actorUid,
        winnerName: actor.displayName,
      },
      nextBag,
      finished: true,
      message: winMsg,
    };
  }

  const nextState = advanceUlarTurn(
    {
      ...state,
      activeEncounter: null,
      heroesByUid: nextHeroes,
      eventLog: log,
    },
    params.activeBrbUids,
  );

  return {
    state: nextState,
    nextBag,
    finished: false,
    message,
  };
}
