'use client';

import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  Coins,
  Crown,
  Shield,
  Store,
  Swords,
  TriangleAlert,
} from 'lucide-react';
import {
  getActiveSnakesForScenario,
  getUlarScenarioPack,
} from '@/lib/games/ular-tangga/packs';
import type { UlarTanggaState } from '@/lib/games/types';

interface UlarTanggaBoardProps {
  state?: UlarTanggaState | null;
  scenarioId?: string;
  boardMode?: 'standar' | 'brutal';
  compact?: boolean;
}

interface TileCoord {
  tile: number;
  rowFromTop: number;
  col: number;
  cx: number;
  cy: number;
}

function getTileCoord(tile: number): TileCoord {
  const safe = Math.max(1, Math.min(100, tile));
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
  };
}

const ART_STYLES = {
  nusantara: {
    frame: 'border-amber-500/35 bg-[#12100E]',
    evenTile: 'bg-[#1B1712] border-amber-900/35',
    oddTile: 'bg-[#14120E] border-amber-950/50',
    tileNum: 'text-amber-200/70',
    ladderStroke: '#34D399',
    ladderRung: '#A7F3D0',
    snakeStroke: '#FB7185',
    snakeGlow: '#9F1239',
    finishTile: 'bg-amber-500/20 border-amber-400 text-amber-200',
    legendAccent: 'text-amber-300',
  },
  cyber: {
    frame: 'border-cyan-500/35 bg-[#090E18]',
    evenTile: 'bg-[#0F172A] border-cyan-900/40',
    oddTile: 'bg-[#0B1120] border-slate-800/80',
    tileNum: 'text-cyan-200/70',
    ladderStroke: '#22D3EE',
    ladderRung: '#A5F3FC',
    snakeStroke: '#F43F5E',
    snakeGlow: '#881337',
    finishTile: 'bg-cyan-500/20 border-cyan-300 text-cyan-100',
    legendAccent: 'text-cyan-300',
  },
  mistis: {
    frame: 'border-violet-500/35 bg-[#0F0B18]',
    evenTile: 'bg-[#19132B] border-violet-900/40',
    oddTile: 'bg-[#120D20] border-purple-950/60',
    tileNum: 'text-violet-200/70',
    ladderStroke: '#FBBF24',
    ladderRung: '#FDE68A',
    snakeStroke: '#E879F9',
    snakeGlow: '#701A75',
    finishTile: 'bg-violet-500/25 border-amber-300 text-amber-200',
    legendAccent: 'text-violet-300',
  },
} as const;

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
    const grid: TileCoord[] = [];
    for (let r = 0; r < 10; r++) {
      const rowFromBottom = 9 - r;
      for (let c = 0; c < 10; c++) {
        const offsetInRow = rowFromBottom % 2 === 0 ? c : 9 - c;
        const tile = rowFromBottom * 10 + offsetInRow + 1;
        grid.push(getTileCoord(tile));
      }
    }
    return grid;
  }, []);

  const heroesByTile = useMemo(() => {
    const map = new Map<number, NonNullable<UlarTanggaState['heroesByUid'][string]>[]>();
    if (!state) return map;
    for (const hero of Object.values(state.heroesByUid)) {
      const list = map.get(hero.tile) ?? [];
      list.push(hero);
      map.set(hero.tile, list);
    }
    return map;
  }, [state]);

  return (
    <div className={`rounded-2xl border p-2.5 sm:p-3.5 space-y-2.5 ${theme.frame}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <p className={`text-[11px] font-bold uppercase tracking-wider ${theme.legendAccent}`}>
            {pack.name} · {pack.genre}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>{pack.ladderLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <TriangleAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>{pack.snakeLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span>Peti</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Swords className="w-3.5 h-3.5 text-orange-400" />
            <span>Monster</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Store className="w-3.5 h-3.5 text-cyan-400" />
            <span>Kedai</span>
          </span>
        </div>
      </div>

      {/* Responsive 10x10 Board */}
      <div className="relative w-full aspect-square max-w-[680px] mx-auto select-none">
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
            const tileClass = isFinish
              ? theme.finishTile
              : (cell.rowFromTop + cell.col) % 2 === 0
                ? theme.evenTile
                : theme.oddTile;

            return (
              <div
                key={cell.tile}
                className={`relative rounded-[4px] sm:rounded-md border p-0.5 sm:p-1 flex flex-col justify-between overflow-hidden ${tileClass}`}
              >
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
              </div>
            );
          })}
        </div>

        {/* Vector Ladders & Snakes Overlay */}
        <svg
          viewBox="0 0 1000 1000"
          className="pointer-events-none absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          {/* Ladders */}
          {pack.ladders.map((ladder) => {
            const a = getTileCoord(ladder.from);
            const b = getTileCoord(ladder.to);
            const dx = b.cx - a.cx;
            const dy = b.cy - a.cy;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * 10;
            const ny = (dx / len) * 10;
            const steps = Math.max(4, Math.floor(len / 44));

            return (
              <g key={`ladder-${ladder.from}-${ladder.to}`} opacity={0.78}>
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
            const head = getTileCoord(snake.from);
            const tail = getTileCoord(snake.to);
            const mx = (head.cx + tail.cx) / 2;
            const my = (head.cy + tail.cy) / 2;
            const dx = tail.cx - head.cx;
            const dy = tail.cy - head.cy;
            const len = Math.hypot(dx, dy) || 1;
            const sway = (idx % 2 === 0 ? 1 : -1) * 42;
            const c1x = head.cx + dx * 0.25 + (-dy / len) * sway;
            const c1y = head.cy + dy * 0.25 + (dx / len) * sway;
            const c2x = head.cx + dx * 0.75 - (-dy / len) * sway;
            const c2y = head.cy + dy * 0.75 - (dx / len) * sway;
            const d = `M ${head.cx} ${head.cy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tail.cx} ${tail.cy}`;

            return (
              <g key={`snake-${snake.from}-${snake.to}`} opacity={0.85}>
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

        {/* Live Hero Tokens */}
        {state && (
          <div className="pointer-events-none absolute inset-0">
            {Array.from(heroesByTile.entries()).map(([tile, heroes]) => {
              const coord = getTileCoord(tile);
              const leftPct = coord.col * 10 + 5;
              const topPct = coord.rowFromTop * 10 + 5;
              return (
                <div
                  key={`tokens-${tile}`}
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-wrap items-center justify-center gap-0.5 max-w-[44px] sm:max-w-[56px]"
                >
                  {heroes.map((hero) => {
                    const isTurn =
                      state.phase !== 'reveal' && state.currentTurnUid === hero.uid;
                    return (
                      <div
                        key={hero.uid}
                        title={`${hero.displayName} (Petak ${hero.tile})`}
                        className={`relative w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-black text-white shadow-md transition-transform duration-300 ${
                          isTurn
                            ? 'ring-2 ring-amber-300 scale-115 z-20'
                            : 'border border-white/80 z-10'
                        }`}
                        style={{ backgroundColor: hero.avatarColor || '#F59E0B' }}
                      >
                        {hero.displayName.slice(0, 1).toUpperCase()}
                        {hero.shielded && (
                          <Shield className="absolute -top-1.5 -right-1.5 w-3 h-3 text-cyan-300 fill-cyan-950" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
