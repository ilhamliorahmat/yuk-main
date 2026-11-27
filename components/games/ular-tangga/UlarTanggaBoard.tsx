'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  Box,
  Coins,
  Crown,
  Square,
  Store,
  Swords,
  TriangleAlert,
} from 'lucide-react';
import {
  evaluateUlarSnakePct,
  getChoreographyFromState,
  getSnakeControlPoints,
  getUlarTileCoord,
} from '@/lib/games/ular-tangga/choreography';
import {
  getActiveSnakesForScenario,
  getUlarScenarioPack,
} from '@/lib/games/ular-tangga/packs';
import type { UlarHeroState, UlarTanggaState } from '@/lib/games/types';
import { UlarHeroPawn } from './UlarHeroPawn';

interface UlarTanggaBoardProps {
  state?: UlarTanggaState | null;
  scenarioId?: string;
  boardMode?: 'standar' | 'brutal';
  compact?: boolean;
}

const STORAGE_BOARD_3D_KEY = 'yukmain:ular:board3d';

const ART_STYLES = {
  nusantara: {
    frame: 'border-amber-500/35 bg-[#12100E]',
    boardSlab: 'shadow-[0_20px_38px_rgba(0,0,0,0.65),0_8px_0_#451A03]',
    evenTile: 'bg-[#1B1712] border-amber-900/40 shadow-[inset_0_-2px_0_rgba(120,53,15,0.35)]',
    oddTile: 'bg-[#14120E] border-amber-950/55 shadow-[inset_0_-2px_0_rgba(69,26,3,0.45)]',
    tileNum: 'text-amber-200/75',
    ladderStroke: '#34D399',
    ladderRung: '#A7F3D0',
    snakeStroke: '#FB7185',
    snakeGlow: '#9F1239',
    finishTile: 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[inset_0_0_16px_rgba(251,191,36,0.28)]',
    legendAccent: 'text-amber-300',
  },
  cyber: {
    frame: 'border-cyan-500/35 bg-[#090E18]',
    boardSlab: 'shadow-[0_20px_38px_rgba(0,0,0,0.7),0_8px_0_#083344]',
    evenTile: 'bg-[#0F172A] border-cyan-900/45 shadow-[inset_0_-2px_0_rgba(8,145,178,0.28)]',
    oddTile: 'bg-[#0B1120] border-slate-800/85 shadow-[inset_0_-2px_0_rgba(15,23,42,0.5)]',
    tileNum: 'text-cyan-200/75',
    ladderStroke: '#22D3EE',
    ladderRung: '#A5F3FC',
    snakeStroke: '#F43F5E',
    snakeGlow: '#881337',
    finishTile: 'bg-cyan-500/20 border-cyan-300 text-cyan-100 shadow-[inset_0_0_16px_rgba(34,211,238,0.28)]',
    legendAccent: 'text-cyan-300',
  },
  mistis: {
    frame: 'border-violet-500/35 bg-[#0F0B18]',
    boardSlab: 'shadow-[0_20px_38px_rgba(0,0,0,0.7),0_8px_0_#2E1065]',
    evenTile: 'bg-[#19132B] border-violet-900/45 shadow-[inset_0_-2px_0_rgba(91,33,182,0.3)]',
    oddTile: 'bg-[#120D20] border-purple-950/65 shadow-[inset_0_-2px_0_rgba(46,16,101,0.45)]',
    tileNum: 'text-violet-200/75',
    ladderStroke: '#FBBF24',
    ladderRung: '#FDE68A',
    snakeStroke: '#E879F9',
    snakeGlow: '#701A75',
    finishTile: 'bg-violet-500/25 border-amber-300 text-amber-200 shadow-[inset_0_0_16px_rgba(192,132,252,0.3)]',
    legendAccent: 'text-violet-300',
  },
} as const;

interface AnimatedTokenPose {
  leftPct: number;
  topPct: number;
  hopping: boolean;
}

function getClusterOffset(idx: number, total: number): { dx: number; dy: number } {
  if (total <= 1) return { dx: 0, dy: 0 };
  if (total === 2) return idx === 0 ? { dx: -10, dy: 2 } : { dx: 10, dy: -2 };
  const angle = (idx / total) * Math.PI * 2 - Math.PI / 2;
  const radius = total <= 4 ? 12 : 15;
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius * 0.7),
  };
}

const BOARD_3D_EVENT = 'yukmain:ular-board3d-change';

function subscribeBoard3D(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener(BOARD_3D_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(BOARD_3D_EVENT, callback);
  };
}

function getBoard3DSnapshot() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_BOARD_3D_KEY) !== '0';
  } catch {
    return true;
  }
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const getTrueSnapshot = () => true;
const getFalseSnapshot = () => false;

interface ActiveChoreoVisual {
  sig: string;
  poseByUid: Record<string, AnimatedTokenPose>;
  highlightTile: number | null;
  callout: {
    key: string;
    leftPct: number;
    topPct: number;
    text: string;
  } | null;
}

export function UlarTanggaBoard({
  state,
  scenarioId,
  boardMode,
  compact = false,
}: UlarTanggaBoardProps) {
  const effectiveScenarioId = state?.scenarioId ?? scenarioId ?? 'menara_nusantara';
  const effectiveMode = state?.boardMode ?? boardMode ?? 'standar';
  const pack = getUlarScenarioPack(effectiveScenarioId);
  const snakes = useMemo(
    () => getActiveSnakesForScenario(pack, effectiveMode),
    [pack, effectiveMode],
  );
  const theme = ART_STYLES[pack.artStyle];

  const stored3D = useSyncExternalStore(
    subscribeBoard3D,
    getBoard3DSnapshot,
    getTrueSnapshot,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getFalseSnapshot,
  );
  const is3D = !compact && stored3D;

  const handleToggle3D = () => {
    const next = !stored3D;
    try {
      window.localStorage.setItem(STORAGE_BOARD_3D_KEY, next ? '1' : '0');
      window.dispatchEvent(new Event(BOARD_3D_EVENT));
    } catch {
      // Ignore storage errors
    }
  };

  // Hop-by-hop & slide choreography state keyed by roll signature
  const [choreoVisual, setChoreoVisual] = useState<ActiveChoreoVisual>({
    sig: '',
    poseByUid: {},
    highlightTile: null,
    callout: null,
  });

  const lastChoreoSigRef = useRef<string>('');

  const rollSig = state?.lastRoll
    ? `${state.turnNumber}:${state.lastRoll.uid}:${state.lastRoll.dice}:${state.lastRoll.fromTile}:${state.lastRoll.toTile}`
    : '';

  useEffect(() => {
    if (!state || !state.lastRoll || !rollSig) return;
    if (lastChoreoSigRef.current === rollSig) return;
    lastChoreoSigRef.current = rollSig;

    if (reducedMotion) return;

    const choreo = getChoreographyFromState(state);
    if (!choreo || choreo.hopTiles.length === 0) return;

    let cancelled = false;
    const timers: number[] = [];
    let rafId = 0;

    const actorUid = choreo.actorUid;
    const hopStepMs = choreo.hopTiles.length > 6 ? 95 : 120;

    choreo.hopTiles.forEach((tile, idx) => {
      const t = window.setTimeout(() => {
        if (cancelled) return;
        const coord = getUlarTileCoord(tile);
        setChoreoVisual({
          sig: rollSig,
          highlightTile: tile,
          callout: null,
          poseByUid: {
            [actorUid]: {
              leftPct: coord.leftPct,
              topPct: coord.topPct,
              hopping: true,
            },
          },
        });
      }, idx * hopStepMs);
      timers.push(t);
    });

    const hopsEndMs = choreo.hopTiles.length * hopStepMs + 60;

    if (choreo.slideKind !== 'none') {
      const slideStartTimer = window.setTimeout(() => {
        if (cancelled) return;
        const startCoord = getUlarTileCoord(choreo.slideFrom);
        const endCoord = getUlarTileCoord(choreo.slideTo);
        const slideDuration = choreo.slideKind === 'ladder' ? 480 : 620;
        const startTime = performance.now();
        const slideCallout = choreo.calloutText
          ? {
              key: `${rollSig}-slide`,
              leftPct: startCoord.leftPct,
              topPct: Math.max(8, startCoord.topPct - 6),
              text: choreo.calloutText,
            }
          : null;

        const stepSlide = (now: number) => {
          if (cancelled) return;
          const rawT = Math.min(1, (now - startTime) / slideDuration);
          const ease = 1 - Math.pow(1 - rawT, 2.5);
          const pos =
            choreo.slideKind === 'snake' && choreo.snakeIndex >= 0
              ? evaluateUlarSnakePct(
                  choreo.slideFrom,
                  choreo.slideTo,
                  choreo.snakeIndex,
                  ease,
                )
              : {
                  leftPct:
                    startCoord.leftPct + (endCoord.leftPct - startCoord.leftPct) * ease,
                  topPct:
                    startCoord.topPct + (endCoord.topPct - startCoord.topPct) * ease,
                };

          setChoreoVisual({
            sig: rollSig,
            highlightTile: rawT < 1 ? null : choreo.finalTile,
            callout: slideCallout,
            poseByUid:
              rawT < 1
                ? {
                    [actorUid]: {
                      leftPct: pos.leftPct,
                      topPct: pos.topPct,
                      hopping: choreo.slideKind === 'ladder',
                    },
                  }
                : {},
          });

          if (rawT < 1) {
            rafId = window.requestAnimationFrame(stepSlide);
          }
        };
        rafId = window.requestAnimationFrame(stepSlide);
      }, hopsEndMs);
      timers.push(slideStartTimer);
    } else {
      const finishTimer = window.setTimeout(() => {
        if (cancelled) return;
        const finalCoord = getUlarTileCoord(choreo.finalTile);
        setChoreoVisual({
          sig: rollSig,
          highlightTile: choreo.finalTile,
          poseByUid: {},
          callout: choreo.calloutText
            ? {
                key: `${rollSig}-done`,
                leftPct: finalCoord.leftPct,
                topPct: Math.max(8, finalCoord.topPct - 6),
                text: choreo.calloutText,
              }
            : null,
        });
      }, hopsEndMs);
      timers.push(finishTimer);
    }

    const clearCalloutTimer = window.setTimeout(() => {
      if (cancelled) return;
      setChoreoVisual((prev) =>
        prev.sig === rollSig ? { ...prev, callout: null } : prev,
      );
    }, hopsEndMs + 1600);
    timers.push(clearCalloutTimer);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      window.cancelAnimationFrame(rafId);
    };
  }, [state, rollSig, reducedMotion]);

  const animatedPoseByUid = useMemo(
    () => (rollSig && choreoVisual.sig === rollSig ? choreoVisual.poseByUid : {}),
    [rollSig, choreoVisual],
  );
  const activeTileHighlight =
    rollSig && choreoVisual.sig === rollSig
      ? choreoVisual.highlightTile
      : state?.lastRoll?.toTile ?? null;
  const callout =
    rollSig && choreoVisual.sig === rollSig ? choreoVisual.callout : null;

  const chestSet = useMemo(() => new Set(pack.chestTiles), [pack.chestTiles]);
  const monsterSet = useMemo(() => new Set(pack.monsterTiles), [pack.monsterTiles]);
  const shopSet = useMemo(() => new Set(pack.shopTiles), [pack.shopTiles]);
  const ladderFromMap = useMemo(
    () => new Map(pack.ladders.map((l) => [l.from, l.to])),
    [pack.ladders],
  );
  const snakeFromMap = useMemo(
    () => new Map(snakes.map((s) => [s.from, s.to])),
    [snakes],
  );

  // Ordered top-left (row 0, col 0) -> bottom-right (row 9, col 9)
  const cells = useMemo(() => {
    const grid = [];
    for (let r = 0; r < 10; r++) {
      const rowFromBottom = 9 - r;
      for (let c = 0; c < 10; c++) {
        const offsetInRow = rowFromBottom % 2 === 0 ? c : 9 - c;
        const tile = rowFromBottom * 10 + offsetInRow + 1;
        grid.push(getUlarTileCoord(tile));
      }
    }
    return grid;
  }, []);

  // Group non-animating heroes per tile so crowded squares cluster cleanly
  const { staticGroups, animatingHeroes } = useMemo(() => {
    const map = new Map<number, UlarHeroState[]>();
    const animList: Array<{ hero: UlarHeroState; pose: AnimatedTokenPose }> = [];
    if (!state) return { staticGroups: map, animatingHeroes: animList };
    for (const hero of Object.values(state.heroesByUid)) {
      const animPose = animatedPoseByUid[hero.uid];
      if (animPose) {
        animList.push({ hero, pose: animPose });
      } else {
        const list = map.get(hero.tile) ?? [];
        list.push(hero);
        map.set(hero.tile, list);
      }
    }
    return { staticGroups: map, animatingHeroes: animList };
  }, [state, animatedPoseByUid]);

  const monsterShakeKey =
    state?.phase === 'encounter' && state.activeEncounter?.type === 'monster'
      ? `monster-${state.turnNumber}-${state.activeEncounter.tile}`
      : 'calm';

  const [selectedTile, setSelectedTile] = useState<number | null>(null);

  const effective3D = is3D && !reducedMotion;

  const selectedTileInfo = useMemo(() => {
    if (compact || selectedTile === null) return null;
    const tile = selectedTile;
    const ladderDest = ladderFromMap.get(tile);
    const snakeIndex = snakes.findIndex((s) => s.from === tile);
    const snakeDest = snakeIndex >= 0 ? snakes[snakeIndex].to : undefined;
    const isChest = chestSet.has(tile);
    const isMonster = monsterSet.has(tile);
    const isShop = shopSet.has(tile);
    const heroesHere = state
      ? Object.values(state.heroesByUid).filter((h) => h.tile === tile)
      : [];

    let badge = 'Petak Biasa';
    let badgeColor = 'text-slate-300';
    let detail = 'Petak aman untuk berhenti sebelum giliran berikutnya.';

    if (tile === 100) {
      badge = 'Puncak Juara';
      badgeColor = 'text-amber-300';
      detail = 'Petualang pertama yang menapak tepat di Petak 100 memenangkan ronde.';
    } else if (tile === 1) {
      badge = 'Titik Awal';
      badgeColor = 'text-emerald-300';
      detail = 'Semua petualang memulai pendakian dari petak ini.';
    } else if (ladderDest !== undefined) {
      badge = pack.ladderLabel;
      badgeColor = 'text-emerald-300';
      detail = `Naik cepat ke Petak ${ladderDest} (+5 HP & bonus kelas Tabib jika ada).`;
    } else if (snakeDest !== undefined) {
      badge = `${pack.snakeLabel}${snakeIndex >= pack.snakesStandard.length ? ' (Brutal)' : ''}`;
      badgeColor = 'text-rose-300';
      detail = `Terseret turun ke Petak ${snakeDest} (-2 HP, dapat ditangkis Perisai).`;
    } else if (isChest) {
      badge = 'Peti Harta';
      badgeColor = 'text-amber-300';
      detail = 'Beri tambahan Koin acak atau peluang mendapat item rahasia.';
    } else if (isMonster) {
      badge = 'Sarang Monster';
      badgeColor = 'text-orange-300';
      const activeHere =
        state?.phase === 'encounter' &&
        state.activeEncounter?.type === 'monster' &&
        state.activeEncounter.tile === tile
          ? state.activeEncounter
          : null;
      detail = activeHere
        ? `Hadangan aktif: ${activeHere.monsterName} (Power ${activeHere.monsterPower}, Damage ${activeHere.monsterDamage} HP, +${activeHere.monsterRewardGold}G).`
        : `Memicu duel lawan penjaga skenario: ${pack.monsters
            .map((m) => `${m.name} (P${m.power})`)
            .join(', ')}.`;
    } else if (isShop) {
      badge = pack.merchantLabel;
      badgeColor = 'text-cyan-300';
      detail = 'Kesempatan membeli 1 item taktis ke Tas Rahasia (maks. 3 slot).';
    }

    return {
      tile,
      badge,
      badgeColor,
      detail,
      jumpDest: ladderDest ?? snakeDest ?? null,
      jumpKind: ladderDest !== undefined ? ('ladder' as const) : snakeDest !== undefined ? ('snake' as const) : null,
      heroesHere,
    };
  }, [compact, selectedTile, ladderFromMap, snakes, chestSet, monsterSet, shopSet, state, pack]);

  return (
    <div className={`rounded-2xl border p-2.5 sm:p-3.5 space-y-2.5 ${theme.frame}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <p className={`text-[11px] font-bold uppercase tracking-wider truncate ${theme.legendAccent}`}>
            {pack.name}
          </p>
          {!compact && (
            <button
              type="button"
              onClick={handleToggle3D}
              className={`min-h-[28px] px-2 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                effective3D
                  ? 'bg-amber-400/15 border-amber-400/50 text-amber-200'
                  : 'bg-[#0B1018] border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {effective3D ? <Box className="w-3 h-3" /> : <Square className="w-3 h-3" />}
              <span>{effective3D ? '3D' : '2D'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] sm:text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1" title={pack.ladderLabel}>
            <ArrowUpRight className="w-3 h-3 text-emerald-400" />
            <span>Tangga</span>
          </span>
          <span className="inline-flex items-center gap-1" title={pack.snakeLabel}>
            <TriangleAlert className="w-3 h-3 text-rose-400" />
            <span>Ular</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="w-3 h-3 text-amber-400" />
            <span>Peti</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Swords className="w-3 h-3 text-orange-400" />
            <span>Monster</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Store className="w-3 h-3 text-cyan-400" />
            <span>Kedai</span>
          </span>
        </div>
      </div>

      {/* 3D Perspective Tabletop Wrapper */}
      <div
        className="w-full flex justify-center overflow-visible py-0.5"
        style={{
          perspective: effective3D ? '1150px' : 'none',
        }}
      >
        <motion.div
          key={monsterShakeKey}
          initial={monsterShakeKey === 'calm' ? false : { x: 0 }}
          animate={
            monsterShakeKey === 'calm'
              ? { x: 0 }
              : { x: [0, -6, 6, -4, 4, 0] }
          }
          transition={{ duration: 0.36 }}
          className={`relative w-full aspect-square max-w-[590px] mx-auto select-none rounded-xl transition-transform duration-500 ${
            effective3D ? theme.boardSlab : ''
          }`}
          style={{
            transformStyle: effective3D ? 'preserve-3d' : 'flat',
            transform: effective3D ? 'rotateX(18deg) scale(0.96)' : 'rotateX(0deg) scale(1)',
          }}
        >
          {/* Base Grid */}
          <div className="grid grid-cols-10 grid-rows-10 w-full h-full gap-[2px] sm:gap-[3px]">
            {cells.map((cell) => {
              const isFinish = cell.tile === 100;
              const isStart = cell.tile === 1;
              const isChest = chestSet.has(cell.tile);
              const isMonster = monsterSet.has(cell.tile);
              const isShop = shopSet.has(cell.tile);
              const ladderDest = ladderFromMap.get(cell.tile);
              const snakeDest = snakeFromMap.get(cell.tile);
              const isHighlighted = activeTileHighlight === cell.tile;
              const isSelected = !compact && selectedTile === cell.tile;
              const isLinkedDest =
                !compact && selectedTileInfo?.jumpDest === cell.tile;
              const tileClass = isFinish
                ? theme.finishTile
                : (cell.rowFromTop + cell.col) % 2 === 0
                  ? theme.evenTile
                  : theme.oddTile;

              const highlightRing = isSelected
                ? 'ring-2 ring-white brightness-125 z-10'
                : isLinkedDest
                  ? selectedTileInfo?.jumpKind === 'ladder'
                    ? 'ring-2 ring-emerald-400 brightness-125 z-10'
                    : 'ring-2 ring-rose-400 brightness-125 z-10'
                  : isHighlighted
                    ? 'ring-2 ring-amber-300/90 brightness-125'
                    : '';

              const inner = (
                <>
                  <span
                    className={`font-mono-tabular leading-none font-bold ${
                      compact ? 'text-[8px] sm:text-[10px]' : 'text-[9px] sm:text-[11px]'
                    } ${isFinish ? 'text-amber-300 font-black' : theme.tileNum}`}
                  >
                    {cell.tile}
                  </span>

                  <div className="flex items-end justify-end">
                    {isFinish && <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />}
                    {isStart && !isFinish && (
                      <span className="text-[7px] sm:text-[9px] font-bold uppercase text-emerald-300">
                        Start
                      </span>
                    )}
                    {isChest && <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400/90" />}
                    {isMonster && <Swords className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-400/90" />}
                    {isShop && <Store className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-cyan-400/90" />}
                    {ladderDest && (
                      <span className="text-[7px] sm:text-[9px] font-mono-tabular font-bold text-emerald-300">
                        ↑{ladderDest}
                      </span>
                    )}
                    {snakeDest && (
                      <span className="text-[7px] sm:text-[9px] font-mono-tabular font-bold text-rose-300">
                        ↓{snakeDest}
                      </span>
                    )}
                  </div>
                </>
              );

              if (compact) {
                return (
                  <div
                    key={cell.tile}
                    className={`relative rounded-[4px] sm:rounded-md border p-0.5 sm:p-1 flex flex-col justify-between overflow-hidden transition-colors duration-200 ${tileClass} ${highlightRing}`}
                  >
                    {inner}
                  </div>
                );
              }

              return (
                <button
                  key={cell.tile}
                  type="button"
                  onClick={() =>
                    setSelectedTile((prev) => (prev === cell.tile ? null : cell.tile))
                  }
                  aria-label={`Periksa Petak ${cell.tile}`}
                  className={`relative text-left rounded-[4px] sm:rounded-md border p-0.5 sm:p-1 flex flex-col justify-between overflow-hidden transition-colors duration-150 hover:brightness-125 focus:outline-none ${tileClass} ${highlightRing}`}
                >
                  {inner}
                </button>
              );
            })}
          </div>

          {/* Vector Ladders & Snakes Overlay (slightly elevated in 3D Meja mode) */}
          <svg
            viewBox="0 0 1000 1000"
            className="pointer-events-none absolute inset-0 w-full h-full"
            style={{
              transform: effective3D ? 'translateZ(6px)' : undefined,
            }}
            aria-hidden="true"
          >
            {/* Ladders */}
            {pack.ladders.map((ladder) => {
              const a = getUlarTileCoord(ladder.from);
              const b = getUlarTileCoord(ladder.to);
              const dx = b.cx - a.cx;
              const dy = b.cy - a.cy;
              const len = Math.hypot(dx, dy) || 1;
              const nx = (-dy / len) * 10;
              const ny = (dx / len) * 10;
              const steps = Math.max(4, Math.floor(len / 44));

              return (
                <g key={`ladder-${ladder.from}-${ladder.to}`} opacity={0.82}>
                  <line
                    x1={a.cx - nx}
                    y1={a.cy - ny}
                    x2={b.cx - nx}
                    y2={b.cy - ny}
                    stroke={theme.ladderStroke}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                  />
                  <line
                    x1={a.cx + nx}
                    y1={a.cy + ny}
                    x2={b.cx + nx}
                    y2={b.cy + ny}
                    stroke={theme.ladderStroke}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                  />
                  {Array.from({ length: steps - 1 }).map((_, idx) => {
                    const t = (idx + 1) / steps;
                    const rx = a.cx + dx * t;
                    const ry = a.cy + dy * t;
                    return (
                      <line
                        key={idx}
                        x1={rx - nx}
                        y1={ry - ny}
                        x2={rx + nx}
                        y2={ry + ny}
                        stroke={theme.ladderRung}
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              );
            })}

            {/* Snakes */}
            {snakes.map((snake, idx) => {
              const { head, tail, c1x, c1y, c2x, c2y } = getSnakeControlPoints(
                snake.from,
                snake.to,
                idx,
              );
              const mx = (head.cx + tail.cx) / 2;
              const my = (head.cy + tail.cy) / 2;
              const d = `M ${head.cx} ${head.cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tail.cx} ${tail.cy}`;

              return (
                <g key={`snake-${snake.from}-${snake.to}`} opacity={0.86}>
                  <path
                    d={d}
                    fill="none"
                    stroke={theme.snakeGlow}
                    strokeWidth={11}
                    strokeLinecap="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={theme.snakeStroke}
                    strokeWidth={5.5}
                    strokeLinecap="round"
                    strokeDasharray={idx >= pack.snakesStandard.length ? '10 6' : undefined}
                  />
                  <circle
                    cx={head.cx}
                    cy={head.cy}
                    r={10}
                    fill={theme.snakeStroke}
                    stroke="#0B1018"
                    strokeWidth={2.5}
                  />
                  <circle cx={mx} cy={my} r={2} fill="#FFF1F2" opacity={0.45} />
                </g>
              );
            })}
          </svg>

          {/* Live Upright Role-Detailed Hero Standee Pawns */}
          {state && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                transformStyle: effective3D ? 'preserve-3d' : 'flat',
                transform: effective3D ? 'translateZ(10px)' : undefined,
              }}
            >
              {/* Static / Clustered Pawns */}
              {Array.from(staticGroups.entries()).map(([tile, heroes]) => {
                const coord = getUlarTileCoord(tile);
                return heroes.map((hero, idx) => {
                  const isTurn =
                    state.phase !== 'reveal' && state.currentTurnUid === hero.uid;
                  const offset = getClusterOffset(idx, heroes.length);
                  return (
                    <div
                      key={hero.uid}
                      style={{
                        left: `${coord.leftPct}%`,
                        top: `${coord.topPct}%`,
                        transform: `translate(calc(-50% + ${offset.dx}px), calc(-62% + ${offset.dy}px))`,
                        transformStyle: effective3D ? 'preserve-3d' : 'flat',
                      }}
                      className={`absolute transition-all duration-200 ${
                        isTurn ? 'z-30' : 'z-10'
                      }`}
                    >
                      <UlarHeroPawn
                        heroClass={hero.heroClass}
                        displayName={hero.displayName}
                        avatarColor={hero.avatarColor}
                        artStyle={pack.artStyle}
                        size="xs"
                        isTurn={isTurn}
                        shielded={hero.shielded}
                        bonusSteps={hero.bonusSteps}
                        tiltedBoard={effective3D}
                        title={`${hero.displayName} (Petak ${hero.tile} · HP ${hero.hp}/${hero.maxHp})`}
                      />
                    </div>
                  );
                });
              })}

              {/* Actively Hopping / Sliding Pawns */}
              {animatingHeroes.map(({ hero, pose }) => (
                <div
                  key={`anim-${hero.uid}`}
                  style={{
                    left: `${pose.leftPct}%`,
                    top: `${pose.topPct}%`,
                    transform: 'translate(-50%, -68%)',
                    transformStyle: effective3D ? 'preserve-3d' : 'flat',
                  }}
                  className="absolute z-40 transition-[left,top] duration-100 ease-out"
                >
                  <UlarHeroPawn
                    heroClass={hero.heroClass}
                    displayName={hero.displayName}
                    avatarColor={hero.avatarColor}
                    artStyle={pack.artStyle}
                    size="xs"
                    isTurn
                    shielded={hero.shielded}
                    bonusSteps={hero.bonusSteps}
                    tiltedBoard={effective3D}
                    hopping={pose.hopping}
                  />
                </div>
              ))}

              {/* Event Callout Pop */}
              <AnimatePresence>
                {callout && (
                  <motion.div
                    key={callout.key}
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: -12, scale: 1 }}
                    exit={{ opacity: 0, y: -22 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      left: `${callout.leftPct}%`,
                      top: `${callout.topPct}%`,
                      transform: 'translate(-50%, -100%)',
                    }}
                    className="absolute z-50 px-2.5 py-1 rounded-lg bg-slate-950/95 border border-amber-400/70 text-[11px] font-black text-amber-200 whitespace-nowrap shadow-xl"
                  >
                    {callout.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      {/* Interactive Tile Inspector */}
      {selectedTileInfo && (
        <div className="rounded-xl bg-[#0B1018]/95 border border-slate-700/80 px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono-tabular font-black text-white">
                Petak {selectedTileInfo.tile}
              </span>
              <span className={`font-bold ${selectedTileInfo.badgeColor}`}>
                · {selectedTileInfo.badge}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-300 leading-snug">
              {selectedTileInfo.detail}
            </p>
            {selectedTileInfo.heroesHere.length > 0 && (
              <p className="text-[11px] text-amber-200 font-mono-tabular">
                Di petak ini:{' '}
                {selectedTileInfo.heroesHere
                  .map((h) => `${h.displayName} (${h.hp} HP · ${h.gold}G)`)
                  .join(', ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedTile(null)}
            className="text-[11px] font-semibold text-slate-400 hover:text-white px-2 py-1 rounded-lg border border-slate-800 bg-[#131A24] shrink-0"
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  );
}
