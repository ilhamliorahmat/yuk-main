import { describe, expect, it } from 'vitest';
import {
  buildUlarRollChoreography,
  evaluateUlarSnakePct,
  getUlarTileCoord,
} from '../choreography';
import { getUlarScenarioPack } from '../packs';

describe('Ular Tangga RP Choreography', () => {
  it('computes boustrophedon coordinates for tile 1, 10, 11, and 100', () => {
    const t1 = getUlarTileCoord(1);
    expect(t1.rowFromTop).toBe(9);
    expect(t1.col).toBe(0);

    const t10 = getUlarTileCoord(10);
    expect(t10.rowFromTop).toBe(9);
    expect(t10.col).toBe(9);

    const t11 = getUlarTileCoord(11);
    expect(t11.rowFromTop).toBe(8);
    expect(t11.col).toBe(9);

    const t100 = getUlarTileCoord(100);
    expect(t100.rowFromTop).toBe(0);
    expect(t100.col).toBe(0);
  });

  it('builds hop-by-hop waypoints and detects ladder climbs', () => {
    const pack = getUlarScenarioPack('menara_nusantara');
    const firstLadder = pack.ladders[0];
    const fromTile = Math.max(1, firstLadder.from - 3);
    const dice = firstLadder.from - fromTile;

    const choreo = buildUlarRollChoreography({
      fromTile,
      toTile: firstLadder.to,
      dice,
      bonus: 0,
      actorUid: 'u1',
      exactFinishBounce: true,
      pack,
      boardMode: 'standar',
    });

    expect(choreo.hopTiles.length).toBe(dice);
    expect(choreo.hopTiles[choreo.hopTiles.length - 1]).toBe(firstLadder.from);
    expect(choreo.slideKind).toBe('ladder');
    expect(choreo.slideFrom).toBe(firstLadder.from);
    expect(choreo.slideTo).toBe(firstLadder.to);
  });

  it('detects snake slides and evaluates smooth Bezier endpoints', () => {
    const pack = getUlarScenarioPack('distrik_neon');
    const firstSnake = pack.snakesStandard[0];
    const fromTile = firstSnake.from - 2;

    const choreo = buildUlarRollChoreography({
      fromTile,
      toTile: firstSnake.to,
      dice: 2,
      bonus: 0,
      actorUid: 'u2',
      exactFinishBounce: true,
      pack,
      boardMode: 'standar',
    });

    expect(choreo.slideKind).toBe('snake');
    expect(choreo.snakeIndex).toBe(0);

    const head = getUlarTileCoord(firstSnake.from);
    const tail = getUlarTileCoord(firstSnake.to);
    const startPt = evaluateUlarSnakePct(firstSnake.from, firstSnake.to, 0, 0);
    const endPt = evaluateUlarSnakePct(firstSnake.from, firstSnake.to, 0, 1);
    expect(startPt.leftPct).toBeCloseTo(head.leftPct, 4);
    expect(startPt.topPct).toBeCloseTo(head.topPct, 4);
    expect(endPt.leftPct).toBeCloseTo(tail.leftPct, 4);
    expect(endPt.topPct).toBeCloseTo(tail.topPct, 4);
  });

  it('bounces cleanly off tile 100 when exactFinishBounce is enabled', () => {
    const pack = getUlarScenarioPack('pasar_mistis');
    const choreo = buildUlarRollChoreography({
      fromTile: 98,
      toTile: 97,
      dice: 5,
      bonus: 0,
      actorUid: 'u3',
      exactFinishBounce: true,
      pack,
      boardMode: 'standar',
    });

    expect(choreo.hopTiles).toEqual([99, 100, 99, 98, 97]);
    expect(choreo.slideKind).toBe('none');
  });
});
