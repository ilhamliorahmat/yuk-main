'use client';

import React, { useMemo, useSyncExternalStore } from 'react';
import { Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { UlarHeroClassId } from '@/lib/games/types';
import type { UlarScenarioPack } from '@/lib/games/ular-tangga/packs';
import { getUlarPawnArtworkUrl } from '@/lib/games/ular-tangga/pawn-art';

const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

export interface UlarHeroPawnProps {
  heroClass: UlarHeroClassId;
  displayName?: string;
  avatarColor?: string;
  artStyle?: UlarScenarioPack['artStyle'];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isTurn?: boolean;
  shielded?: boolean;
  bonusSteps?: number;
  tiltedBoard?: boolean;
  hopping?: boolean;
  showInitialBadge?: boolean;
  title?: string;
}

const SIZE_PRESETS = {
  xs: {
    box: 'w-7 h-8 sm:w-9 sm:h-10',
    pedestal: 'w-6 h-2 sm:w-8 sm:h-2.5',
    shadow: 'w-6 h-2',
    badge: 'text-[8px] w-3.5 h-3.5',
  },
  sm: {
    box: 'w-10 h-11',
    pedestal: 'w-9 h-2.5',
    shadow: 'w-8 h-2',
    badge: 'text-[9px] w-4 h-4',
  },
  md: {
    box: 'w-12 h-13',
    pedestal: 'w-11 h-3',
    shadow: 'w-10 h-2.5',
    badge: 'text-[10px] w-4 h-4',
  },
  lg: {
    box: 'w-16 h-16',
    pedestal: 'w-14 h-3.5',
    shadow: 'w-12 h-2.5',
    badge: 'text-[10px] w-5 h-5',
  },
} as const;

const PEDESTAL_TRIM: Record<UlarScenarioPack['artStyle'], string> = {
  nusantara: 'border-amber-300/80 bg-gradient-to-b from-amber-700/90 to-amber-950',
  cyber: 'border-cyan-300/80 bg-gradient-to-b from-cyan-800/90 to-slate-950',
  mistis: 'border-violet-300/80 bg-gradient-to-b from-violet-800/90 to-indigo-950',
};

function FallbackClassIcon({ heroClass }: { heroClass: UlarHeroClassId }) {
  if (heroClass === 'ksatria') return <Shield className="w-4 h-4 text-amber-200" />;
  if (heroClass === 'pencuri') return <Zap className="w-4 h-4 text-emerald-200" />;
  if (heroClass === 'penyihir') return <Sparkles className="w-4 h-4 text-violet-200" />;
  return <Swords className="w-4 h-4 text-cyan-200" />;
}

export function UlarHeroPawn({
  heroClass,
  displayName = '',
  avatarColor = '#F59E0B',
  artStyle = 'nusantara',
  size = 'sm',
  isTurn = false,
  shielded = false,
  bonusSteps = 0,
  tiltedBoard = false,
  hopping = false,
  showInitialBadge = true,
  title,
}: UlarHeroPawnProps) {
  const isClient = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  const artUrl = useMemo(() => {
    if (!isClient) return '';
    return getUlarPawnArtworkUrl(heroClass, avatarColor, artStyle);
  }, [isClient, heroClass, avatarColor, artStyle]);

  const preset = SIZE_PRESETS[size];
  const initial = displayName.trim().slice(0, 1).toUpperCase();

  return (
    <div
      title={title}
      className={`relative inline-flex flex-col items-center justify-end select-none ${preset.box}`}
      style={{
        transformStyle: 'preserve-3d',
        transform: tiltedBoard ? 'rotateX(-22deg) translateY(-4px)' : undefined,
        transition: 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Grounded contact shadow */}
      <span
        aria-hidden="true"
        className={`absolute bottom-0 rounded-full bg-black/70 blur-[2px] transition-transform duration-150 ${preset.shadow} ${
          hopping ? 'scale-75 opacity-45' : 'scale-100 opacity-80'
        }`}
      />

      {/* Shielded ward aura */}
      {shielded && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-cyan-300/80 shadow-[0_0_12px_rgba(34,211,238,0.45)] pointer-events-none"
        />
      )}

      {/* Active turn pedestal beacon */}
      {isTurn && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 w-8 h-3 sm:w-10 sm:h-3.5 rounded-full ring-2 ring-amber-300/90 shadow-[0_0_14px_rgba(251,191,36,0.6)] pointer-events-none"
        />
      )}

      {/* Detailed character standee figure */}
      <div
        className={`relative z-10 w-full h-[88%] flex items-end justify-center transition-transform duration-150 ${
          hopping ? '-translate-y-2 scale-110' : isTurn ? '-translate-y-0.5 scale-105' : ''
        } ${bonusSteps > 0 ? '-rotate-3' : ''}`}
      >
        {artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artUrl}
            alt={displayName ? `Pion ${displayName}` : `Pion ${heroClass}`}
            referrerPolicy="no-referrer"
            draggable={false}
            className="w-full h-full object-contain drop-shadow-[0_3px_4px_rgba(0,0,0,0.85)]"
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full border border-white/50 flex items-center justify-center shadow"
            style={{ backgroundColor: avatarColor }}
          >
            <FallbackClassIcon heroClass={heroClass} />
          </div>
        )}
      </div>

      {/* 3D Beveled Pedestal Base */}
      <div
        className={`relative z-0 -mt-1.5 rounded-full border shadow-md flex items-center justify-center ${preset.pedestal} ${PEDESTAL_TRIM[artStyle]}`}
      >
        <span
          aria-hidden="true"
          className="w-[72%] h-[45%] rounded-full opacity-90"
          style={{ backgroundColor: avatarColor }}
        />
      </div>

      {/* Initial Monogram Chip for same-class disambiguation */}
      {showInitialBadge && initial && (
        <span
          className={`absolute -top-0.5 -right-0.5 z-20 rounded-full border border-slate-950 font-black text-white flex items-center justify-center shadow ${preset.badge}`}
          style={{ backgroundColor: avatarColor }}
        >
          {initial}
        </span>
      )}

      {/* Shield Icon Marker */}
      {shielded && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -left-0.5 z-20 rounded-full bg-cyan-950 border border-cyan-300 p-0.5 shadow"
        >
          <Shield className="w-2.5 h-2.5 text-cyan-300" />
        </span>
      )}
    </div>
  );
}
