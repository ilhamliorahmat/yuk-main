import { describe, expect, it } from 'vitest';
import type { RoomPlayerDoc } from '../../types';
import {
  applyUlarBagItem,
  applyUlarSkill,
  calculateUlarTanggaScoreDeltas,
  createInitialUlarTanggaRound,
  resolveUlarEncounter,
  rollDiceAndMove,
} from '../engine';
import {
  ULAR_HERO_CLASS_ORDER,
  ULAR_ITEM_IDS,
  ULAR_SCENARIO_ORDER,
  ULAR_SCENARIO_PACKS,
} from '../packs';

function makePlayers(count = 4): RoomPlayerDoc[] {
  return Array.from({ length: count }).map((_, idx) => ({
    uid: `p${idx + 1}`,
    roomId: 'rm_test',
    displayName: `Hero ${idx + 1}`,
    avatarColor: '#F59E0B',
    isHost: idx === 0,
    score: 0,
    isReady: true,
    isBrb: false,
  }));
}

describe('Ular Tangga RP Engine & Scenario Packs', () => {
  it('ensures zero tile collisions across all 3 Scenario & Art Packs', () => {
    for (const scenarioId of ULAR_SCENARIO_ORDER) {
      const pack = ULAR_SCENARIO_PACKS[scenarioId];
      const occupied = new Set<number>();

      const addUnique = (tile: number) => {
        expect(tile).toBeGreaterThanOrEqual(2);
        expect(tile).toBeLessThanOrEqual(99);
        expect(occupied.has(tile)).toBe(false);
        occupied.add(tile);
      };

      for (const l of pack.ladders) addUnique(l.from);
      for (const s of pack.snakesStandard) addUnique(s.from);
      for (const s of pack.snakesBrutalExtra) addUnique(s.from);
      for (const t of pack.chestTiles) addUnique(t);
      for (const t of pack.monsterTiles) addUnique(t);
      for (const t of pack.shopTiles) addUnique(t);

      expect(pack.ladders).toHaveLength(7);
      expect(pack.snakesStandard).toHaveLength(7);
      expect(pack.snakesBrutalExtra).toHaveLength(2);
      expect(pack.monsters.length).toBeGreaterThanOrEqual(4);
    }

    expect(ULAR_HERO_CLASS_ORDER).toHaveLength(4);
    expect(ULAR_ITEM_IDS).toHaveLength(5);
  });

  it('initializes heroes with class stats, 25G, and 1 starter secret bag item', () => {
    const players = makePlayers(4);
    const { state, secretsByUid } = createInitialUlarTanggaRound({
      players,
      settings: {
        scenarioId: 'distrik_neon',
        boardMode: 'brutal',
        exactFinishBounce: true,
        classSelectionByUid: { p1: 'ksatria', p2: 'penyihir' },
      },
      roundId: 'r1_test',
      rng: () => 0,
    });

    expect(state.scenarioId).toBe('distrik_neon');
    expect(state.boardMode).toBe('brutal');
    expect(state.heroesByUid.p1.heroClass).toBe('ksatria');
    expect(state.heroesByUid.p1.maxHp).toBe(16);
    expect(state.heroesByUid.p2.heroClass).toBe('penyihir');
    expect(state.heroesByUid.p2.maxHp).toBe(11);
    expect(secretsByUid.p1.ularBag).toHaveLength(1);
    expect(state.heroesByUid.p1.bagCount).toBe(1);
  });

  it('applies class skills, secret items, and Pingsan (K.O.) non-eliminating respawn', () => {
    const players = makePlayers(2);
    const { state } = createInitialUlarTanggaRound({
      players,
      settings: {
        scenarioId: 'menara_nusantara',
        boardMode: 'standar',
        exactFinishBounce: true,
        classSelectionByUid: { p1: 'penyihir', p2: 'pencuri' },
      },
      roundId: 'r1_skill',
      rng: () => 0,
    });

    const activeUid = state.currentTurnUid;
    const otherUid = state.turnOrder.find((u) => u !== activeUid)!;

    // Give active hero Bom Ular & put opponent at low HP on tile 20
    const prepState = {
      ...state,
      heroesByUid: {
        ...state.heroesByUid,
        [otherUid]: {
          ...state.heroesByUid[otherUid],
          tile: 20,
          hp: 2,
          gold: 31,
        },
      },
    };

    const skillRes = applyUlarSkill({
      state: prepState,
      actorUid: activeUid,
      targetUid: null,
    });
    expect(skillRes.state.usedSkillThisTurn).toBe(true);
    expect(skillRes.state.heroesByUid[activeUid].bonusSteps).toBeGreaterThanOrEqual(3);

    const itemRes = applyUlarBagItem({
      state: skillRes.state,
      actorUid: activeUid,
      actorBag: ['bom_ular'],
      itemId: 'bom_ular',
      targetUid: otherUid,
    });
    expect(itemRes.nextBag).toEqual([]);
    // Bom Ular (-5 tile => 15, -3 HP => 0 HP -> Pingsan! drops -8 => 7, half gold => 15, revives full HP)
    const koHero = itemRes.state.heroesByUid[otherUid];
    expect(koHero.koCount).toBe(1);
    expect(koHero.tile).toBe(7);
    expect(koHero.gold).toBe(15);
    expect(koHero.hp).toBe(koHero.maxHp);
  });

  it('handles exact-100 bounce back, monster defeat, merchant buy, and placement score deltas', () => {
    const players = makePlayers(3);
    const { state, secretsByUid } = createInitialUlarTanggaRound({
      players,
      settings: {
        scenarioId: 'pasar_mistis',
        boardMode: 'standar',
        exactFinishBounce: true,
        classSelectionByUid: { p1: 'ksatria', p2: 'pencuri', p3: 'tabib' },
      },
      roundId: 'r1_play',
      rng: () => 0,
    });

    const pA = state.currentTurnUid;
    const pB = state.turnOrder[1];
    const pC = state.turnOrder[2];

    // 1. Bounce back from 98 with dice 5 => 97
    const nearFinishState = {
      ...state,
      heroesByUid: {
        ...state.heroesByUid,
        [pA]: { ...state.heroesByUid[pA], tile: 98 },
      },
    };
    const bounceRes = rollDiceAndMove({
      state: nearFinishState,
      actorUid: pA,
      actorBag: secretsByUid[pA].ularBag ?? [],
      rng: () => 5,
    });
    expect(bounceRes.finished).toBe(false);
    expect(bounceRes.state.heroesByUid[pA].tile).toBe(97);

    // 2. Monster encounter on pasar_mistis (tile 13) for pB
    const monsterPrep = {
      ...bounceRes.state,
      heroesByUid: {
        ...bounceRes.state.heroesByUid,
        [pB]: { ...bounceRes.state.heroesByUid[pB], tile: 10 },
      },
    };
    const hitMonster = rollDiceAndMove({
      state: monsterPrep,
      actorUid: pB,
      actorBag: [],
      rng: (min, max) => (max === 6 ? 3 : 0),
    });
    expect(hitMonster.state.phase).toBe('encounter');
    expect(hitMonster.state.activeEncounter?.type).toBe('monster');

    const wonFight = resolveUlarEncounter({
      state: hitMonster.state,
      actorUid: pB,
      actorBag: [],
      decision: 'attack',
      rng: () => 6,
    });
    expect(wonFight.state.heroesByUid[pB].tile).toBe(15);
    expect(wonFight.state.heroesByUid[pB].monstersDefeated).toBe(1);

    // 3. Exact win at 100 for pC => score deltas +5, +3, +2
    const winPrep = {
      ...wonFight.state,
      heroesByUid: {
        ...wonFight.state.heroesByUid,
        [pC]: { ...wonFight.state.heroesByUid[pC], tile: 95 },
      },
    };
    const winRes = rollDiceAndMove({
      state: winPrep,
      actorUid: pC,
      actorBag: [],
      rng: () => 5,
    });
    expect(winRes.finished).toBe(true);
    expect(winRes.state.winnerUid).toBe(pC);
    const deltas = calculateUlarTanggaScoreDeltas(winRes.state);
    expect(deltas[pC]).toBe(5);
    expect(deltas[pA]).toBe(3);
    expect(deltas[pB]).toBe(2);
  });
});
