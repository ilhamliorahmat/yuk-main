import type { UlarBoardMode, UlarTanggaState } from '../types';
import {
  getActiveSnakesForScenario,
  getUlarScenarioPack,
  type UlarScenarioPack,
} from './packs';

export interface UlarTileCoord {
  tile: number;
  rowFromTop: number;
  col: number;
  cx: number;
  cy: number;
  leftPct: number;
  topPct: number;
}

export function getUlarTileCoord(tile: number): UlarTileCoord {
  const safe = Math.max(1, Math.min(100, Math.round(tile)));
  const zero = safe - 1;
  const rowFromBottom = Math.floor(zero / 10);
  const colRaw = zero % 10;
  const col = rowFromBottom % 2 === 0 ? colRaw : 9 - colRaw;
  const rowFromTop = 9 - rowFromBottom;
  return {
    tile: safe,
    rowFromTop,
    col,
    cx: col * 100 + 50,
    cy: rowFromTop * 100 + 50,
    leftPct: col * 10 + 5,
    topPct: rowFromTop * 10 + 5,
  };
}

export function getSnakeControlPoints(
  fromTile: number,
  toTile: number,
  idx: number,
): {
  head: UlarTileCoord;
  tail: UlarTileCoord;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
} {
  const head = getUlarTileCoord(fromTile);
  const tail = getUlarTileCoord(toTile);
  const dx = tail.cx - head.cx;
  const dy = tail.cy - head.cy;
  const len = Math.hypot(dx, dy) || 1;
  const sway = (idx % 2 === 0 ? 1 : -1) * 42;
  const c1x = head.cx + dx * 0.25 + (-dy / len) * sway;
  const c1y = head.cy + dy * 0.25 + (dx / len) * sway;
  const c2x = head.cx + dx * 0.75 - (-dy / len) * sway;
  const c2y = head.cy + dy * 0.75 - (dx / len) * sway;
  return { head, tail, c1x, c1y, c2x, c2y };
}

export function evaluateUlarSnakePct(
  fromTile: number,
  toTile: number,
  idx: number,
  t: number,
): { leftPct: number; topPct: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const { head, tail, c1x, c1y, c2x, c2y } = getSnakeControlPoints(fromTile, toTile, idx);
  const u = 1 - clamped;
  const x =
    u * u * u * head.cx +
    3 * u * u * clamped * c1x +
    3 * u * clamped * clamped * c2x +
    clamped * clamped * clamped * tail.cx;
  const y =
    u * u * u * head.cy +
    3 * u * u * clamped * c1y +
    3 * u * clamped * clamped * c2y +
    clamped * clamped * clamped * tail.cy;
  return {
    leftPct: x / 10,
    topPct: y / 10,
  };
}

export interface UlarRollChoreography {
  actorUid: string;
  hopTiles: number[];
  slideKind: 'none' | 'ladder' | 'snake';
  slideFrom: number;
  slideTo: number;
  snakeIndex: number;
  finalTile: number;
  calloutText: string | null;
}

export function buildUlarRollChoreography(params: {
  fromTile: number;
  toTile: number;
  dice: number;
  bonus: number;
  actorUid: string;
  exactFinishBounce: boolean;
  pack: UlarScenarioPack;
  boardMode: UlarBoardMode;
  summary?: string;
}): UlarRollChoreography {
  const {
    fromTile,
    toTile,
    dice,
    bonus,
    actorUid,
    exactFinishBounce,
    pack,
    boardMode,
    summary = '',
  } = params;

  const totalSteps = Math.max(1, dice + Math.max(0, bonus));
  const hopTiles: number[] = [];
  let cursor = Math.max(1, Math.min(100, fromTile));
  let direction = 1;

  for (let i = 0; i < totalSteps; i++) {
    if (cursor === 100 && exactFinishBounce) {
      direction = -1;
    }
    const next = cursor + direction;
    if (next >= 100) {
      cursor = 100;
      hopTiles.push(cursor);
      if (!exactFinishBounce) {
        break;
      }
    } else if (next < 1) {
      cursor = 1;
      hopTiles.push(cursor);
    } else {
      cursor = next;
      hopTiles.push(cursor);
    }
  }

  const rawLanding = hopTiles[hopTiles.length - 1] ?? cursor;
  const ladder = pack.ladders.find((l) => l.from === rawLanding && l.to === toTile);
  if (ladder) {
    return {
      actorUid,
      hopTiles,
      slideKind: 'ladder',
      slideFrom: ladder.from,
      slideTo: ladder.to,
      snakeIndex: -1,
      finalTile: toTile,
      calloutText: `Naik ${pack.ladderLabel}!`,
    };
  }

  const snakes = getActiveSnakesForScenario(pack, boardMode);
  const snakeIdx = snakes.findIndex((s) => s.from === rawLanding && s.to === toTile);
  if (snakeIdx >= 0) {
    return {
      actorUid,
      hopTiles,
      slideKind: 'snake',
      slideFrom: rawLanding,
      slideTo: toTile,
      snakeIndex: snakeIdx,
      finalTile: toTile,
      calloutText: `Terpeleset ${pack.snakeLabel}!`,
    };
  }

  const blockedByShield =
    snakes.some((s) => s.from === rawLanding) &&
    toTile === rawLanding &&
    /perisai|jimat/i.test(summary);

  let calloutText: string | null = null;
  if (toTile === 100) {
    calloutText = 'Petak 100!';
  } else if (blockedByShield) {
    calloutText = 'Perisai Menahan Ular!';
  } else if (/peti/i.test(summary)) {
    calloutText = 'Peti Harta!';
  } else if (/pingsan/i.test(summary)) {
    calloutText = 'Pingsan!';
  }

  return {
    actorUid,
    hopTiles,
    slideKind: 'none',
    slideFrom: rawLanding,
    slideTo: toTile,
    snakeIndex: -1,
    finalTile: toTile,
    calloutText,
  };
}

export function getChoreographyFromState(state: UlarTanggaState): UlarRollChoreography | null {
  if (!state.lastRoll) return null;
  const pack = getUlarScenarioPack(state.scenarioId);
  return buildUlarRollChoreography({
    fromTile: state.lastRoll.fromTile,
    toTile: state.lastRoll.toTile,
    dice: state.lastRoll.dice,
    bonus: state.lastRoll.bonus,
    actorUid: state.lastRoll.uid,
    exactFinishBounce: state.exactFinishBounce,
    pack,
    boardMode: state.boardMode,
    summary: state.lastRoll.summary,
  });
}
