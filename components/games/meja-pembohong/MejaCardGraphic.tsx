'use client';

import React from 'react';
import { Crown, Diamond, Spade, Sparkles } from 'lucide-react';
import type { MejaCardRank } from '@/lib/games/types';
import { MEJA_RANK_LABELS } from '@/lib/games/meja-pembohong/engine';

interface MejaCardGraphicProps {
  rank?: MejaCardRank;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  matchedTableRank?: MejaCardRank;
  onClick?: () => void;
}

const RANK_STYLE: Record<
  MejaCardRank,
  {
    symbol: string;
    cardBg: string;
    borderClass: string;
    inkClass: string;
    cornerClass: string;
  }
> = {
  raja: {
    symbol: 'K',
    cardBg: 'bg-gradient-to-br from-amber-50 via-white to-amber-100',
    borderClass: 'border-amber-400',
    inkClass: 'text-amber-700',
    cornerClass: 'text-amber-800',
  },
  ratu: {
    symbol: 'Q',
    cardBg: 'bg-gradient-to-br from-rose-50 via-white to-rose-100',
    borderClass: 'border-rose-400',
    inkClass: 'text-rose-600',
    cornerClass: 'text-rose-700',
  },
  as: {
    symbol: 'A',
    cardBg: 'bg-gradient-to-br from-slate-50 via-white to-slate-200',
    borderClass: 'border-slate-400',
    inkClass: 'text-slate-900',
    cornerClass: 'text-slate-900',
  },
  joker: {
    symbol: '★',
    cardBg: 'bg-gradient-to-br from-violet-100 via-amber-50 to-emerald-100',
    borderClass: 'border-violet-400',
    inkClass: 'text-violet-700',
    cornerClass: 'text-violet-800',
  },
};

function RankEmblem({ rank, className }: { rank: MejaCardRank; className: string }) {
  if (rank === 'raja') return <Crown className={className} />;
  if (rank === 'ratu') return <Diamond className={className} />;
  if (rank === 'as') return <Spade className={className} />;
  return <Sparkles className={className} />;
}

export function MejaCardGraphic({
  rank = 'raja',
  faceDown = false,
  selected = false,
  disabled = false,
  compact = false,
  matchedTableRank,
  onClick,
}: MejaCardGraphicProps) {
  const sizeClass = compact ? 'w-16 h-24 rounded-xl' : 'w-20 h-28 sm:w-24 sm:h-34 rounded-2xl';

  if (faceDown) {
    return (
      <div
        className={`${sizeClass} relative border-2 border-amber-400/50 bg-[#1B1016] shadow-lg overflow-hidden select-none flex items-center justify-center`}
      >
        <div
          className="absolute inset-1.5 rounded-lg border border-amber-400/35"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(245,158,11,0.12) 0px, rgba(245,158,11,0.12) 4px, transparent 4px, transparent 10px)',
          }}
        />
        <span className="relative text-xs font-black tracking-widest text-amber-300/90">YM</span>
      </div>
    );
  }

  const style = RANK_STYLE[rank];
  const isValidForTable =
    matchedTableRank !== undefined && (rank === matchedTableRank || rank === 'joker');

  const interactiveClasses = onClick
    ? `cursor-pointer transition-transform duration-150 ${
        selected
          ? '-translate-y-2.5 ring-4 ring-emerald-400 shadow-emerald-500/30 shadow-xl'
          : 'hover:-translate-y-1'
      } disabled:opacity-55 disabled:cursor-not-allowed disabled:hover:translate-y-0`
    : '';

  const content = (
    <>
      <div className="flex items-center justify-between w-full leading-none">
        <span className={`font-mono font-black ${compact ? 'text-xs' : 'text-sm'} ${style.cornerClass}`}>
          {style.symbol}
        </span>
        {isValidForTable && (
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Cocok dengan meja" />
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-1 my-auto">
        <RankEmblem
          rank={rank}
          className={`${compact ? 'w-5 h-5' : 'w-7 h-7 sm:w-8 sm:h-8'} ${style.inkClass}`}
        />
        <span
          className={`font-black uppercase tracking-tight ${
            compact ? 'text-[10px]' : 'text-xs sm:text-sm'
          } ${style.inkClass}`}
        >
          {MEJA_RANK_LABELS[rank]}
        </span>
      </div>

      <div className="flex items-center justify-end w-full leading-none">
        <span
          className={`font-mono font-black rotate-180 ${compact ? 'text-xs' : 'text-sm'} ${style.cornerClass}`}
        >
          {style.symbol}
        </span>
      </div>
    </>
  );

  const baseClass = `${sizeClass} ${style.cardBg} border-2 ${style.borderClass} p-2 flex flex-col justify-between shadow-md select-none ${interactiveClasses}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={baseClass}
      >
        {content}
      </button>
    );
  }

  return <div className={baseClass}>{content}</div>;
}

export function MejaChamberIndicator({
  shotsTaken,
  eliminated,
  compact = false,
}: {
  shotsTaken: number;
  eliminated: boolean;
  compact?: boolean;
}) {
  const safeShots = Math.max(0, Math.min(6, shotsTaken));
  const dotSize = compact ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <div
      className="inline-flex items-center gap-1"
      title={`Silinder: ${safeShots}/6 tembakan`}
    >
      {Array.from({ length: 6 }, (_, idx) => {
        const spent = idx < safeShots;
        const lethalSlot = eliminated && idx === safeShots - 1;
        return (
          <span
            key={idx}
            className={`${dotSize} rounded-full border ${
              lethalSlot
                ? 'bg-rose-500 border-rose-300'
                : spent
                  ? 'bg-amber-400 border-amber-300'
                  : 'bg-slate-800 border-slate-600'
            }`}
          />
        );
      })}
      <span className="ml-1 font-mono text-[11px] font-bold text-slate-300 tabular-nums">
        {safeShots}/6
      </span>
    </div>
  );
}
