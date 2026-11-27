'use client';

import { Sparkles, ThumbsUp, Trophy } from 'lucide-react';
import { BERCANDA_SCENE_META } from '@/lib/games/cuma-bercanda/packs';
import type { BercandaCard, BercandaPanelScene } from '@/lib/games/types';

interface BercandaComicPanelProps {
  card: BercandaCard;
  panelNumber?: 1 | 2 | 3;
  compact?: boolean;
  selected?: boolean;
  owned?: boolean;
  isWinner?: boolean;
  authorLabel?: string | null;
}

function ComicSceneIllustration({
  scene,
  accent,
}: {
  scene: BercandaPanelScene;
  accent: string;
}) {
  // Crisp comic-ink character portraits per mood/scene
  return (
    <svg
      viewBox="0 0 180 112"
      className="w-full h-full select-none"
      role="img"
      aria-label={BERCANDA_SCENE_META[scene]?.label ?? 'Adegan Komik'}
    >
      <defs>
        <pattern
          id={`halftone_${scene}`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="0.9" fill={accent} fillOpacity="0.14" />
        </pattern>
      </defs>
      <rect width="180" height="112" fill={`url(#halftone_${scene})`} />

      {/* Ground shadow / desk line */}
      <path d="M 14 102 Q 90 96 166 102" stroke="#0F172A" strokeWidth="2.5" fill="none" strokeLinecap="round" />

      {/* Main Character Torso + Head */}
      <g stroke="#0F172A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Shoulders */}
        <path
          d="M 52 103 C 54 80, 72 74, 90 74 C 108 74, 126 80, 128 103 Z"
          fill={accent}
          fillOpacity="0.88"
        />
        {/* Collar */}
        <path d="M 79 75 L 90 86 L 101 75" fill="#FFFDF7" />
        {/* Neck */}
        <rect x="83" y="64" width="14" height="13" rx="4" fill="#FDE68A" />
        {/* Head */}
        <ellipse cx="90" cy="45" rx="23" ry="25" fill="#FEF3C7" />
        {/* Hair */}
        <path
          d="M 67 42 C 67 22, 82 15, 93 17 C 107 18, 114 28, 113 42 C 106 31, 96 29, 86 31 C 76 33, 71 37, 67 42 Z"
          fill="#1E293B"
        />
        {/* Ears */}
        <circle cx="66" cy="46" r="4.5" fill="#FEF3C7" />
        <circle cx="114" cy="46" r="4.5" fill="#FEF3C7" />
      </g>

      {/* Scene-specific facial expressions & props */}
      {scene === 'ngobrol_santai' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="81" cy="44" r="2.3" fill="#0F172A" />
          <circle cx="99" cy="44" r="2.3" fill="#0F172A" />
          <path d="M 81 55 Q 90 61 99 54" fill="none" />
          {/* Coffee cup prop */}
          <rect x="131" y="76" width="18" height="20" rx="3" fill="#FFFFFF" />
          <path d="M 149 80 Q 156 80 156 86 Q 156 91 149 91" fill="none" />
          <path d="M 136 70 Q 139 64 136 60" fill="none" strokeOpacity="0.6" />
          <path d="M 143 70 Q 146 64 143 60" fill="none" strokeOpacity="0.6" />
        </g>
      )}

      {scene === 'kaget_melotot' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="80" cy="43" r="5.5" fill="#FFFFFF" />
          <circle cx="100" cy="43" r="5.5" fill="#FFFFFF" />
          <circle cx="80" cy="43" r="1.8" fill="#0F172A" />
          <circle cx="100" cy="43" r="1.8" fill="#0F172A" />
          <ellipse cx="90" cy="58" rx="6" ry="7.5" fill="#991B1B" />
          {/* Shock lines */}
          <path d="M 38 25 L 54 34 M 32 45 L 50 46 M 142 25 L 126 34 M 148 45 L 130 46" stroke="#D97706" />
        </g>
      )}

      {scene === 'bisik_rahasia' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 76 43 Q 81 40 85 43" fill="none" />
          <circle cx="99" cy="43" r="2.2" fill="#0F172A" />
          <path d="M 85 56 Q 91 54 96 56" fill="none" />
          {/* Hand cupped beside mouth */}
          <path d="M 101 55 C 115 47, 122 60, 110 71 C 103 75, 96 68, 96 60 Z" fill="#FDE68A" />
          <text x="24" y="34" fontSize="13" fontWeight="900" fill="#6D28D9" stroke="none">
            SSST!
          </text>
        </g>
      )}

      {scene === 'tunjuk_marah' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 74 37 L 85 41 M 106 37 L 95 41" fill="none" />
          <circle cx="81" cy="44" r="2.3" fill="#0F172A" />
          <circle cx="99" cy="44" r="2.3" fill="#0F172A" />
          <path d="M 80 59 Q 90 52 100 59" fill="none" />
          {/* Pointing finger */}
          <path d="M 122 84 L 154 76 C 159 75, 160 82, 155 83 L 134 90 L 122 93 Z" fill="#FDE68A" />
          <path d="M 124 22 L 131 15 M 130 28 L 139 24" stroke="#E11D48" />
        </g>
      )}

      {scene === 'nangis_lebay' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 75 43 Q 81 47 86 43 M 94 43 Q 99 47 105 43" fill="none" />
          <ellipse cx="90" cy="58" rx="8" ry="5" fill="#991B1B" />
          {/* Waterfall comic tears */}
          <path d="M 77 48 C 72 64, 67 80, 68 98" stroke="#3B82F6" strokeWidth="4" fill="none" />
          <path d="M 103 48 C 108 64, 113 80, 112 98" stroke="#3B82F6" strokeWidth="4" fill="none" />
        </g>
      )}

      {scene === 'cengar_cengir' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 75 43 Q 81 38 86 43 M 94 43 Q 99 38 105 43" fill="none" />
          <path d="M 76 52 Q 90 66 104 52 Z" fill="#FFFFFF" />
          <path d="M 126 78 L 136 65 L 143 68 L 136 86 Z" fill="#FDE68A" />
        </g>
      )}

      {scene === 'mikir_keras' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 75 39 L 85 40 M 95 37 Q 101 34 106 38" fill="none" />
          <circle cx="81" cy="44" r="2.2" fill="#0F172A" />
          <circle cx="99" cy="43" r="2.2" fill="#0F172A" />
          <path d="M 83 56 L 97 55" fill="none" />
          {/* Hand on chin */}
          <path d="M 84 68 L 97 61 L 104 72 L 88 79 Z" fill="#FDE68A" />
          <circle cx="136" cy="34" r="10" fill="#FFFFFF" />
          <text x="132" y="39" fontSize="14" fontWeight="900" fill="#334155" stroke="none">
            ?
          </text>
        </g>
      )}

      {scene === 'panik_keringat' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="80" cy="44" r="4.5" fill="#FFFFFF" />
          <circle cx="100" cy="44" r="4.5" fill="#FFFFFF" />
          <circle cx="80" cy="44" r="1.5" fill="#0F172A" />
          <circle cx="100" cy="44" r="1.5" fill="#0F172A" />
          <path d="M 80 57 Q 85 54 90 57 Q 95 60 100 56" fill="none" />
          {/* Sweat drop */}
          <path d="M 120 31 C 125 40, 125 46, 120 46 C 115 46, 115 40, 120 31 Z" fill="#38BDF8" />
        </g>
      )}

      {scene === 'sombong_kacamata' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* Cool sunglasses */}
          <rect x="70" y="37" width="17" height="11" rx="3" fill="#0F172A" />
          <rect x="93" y="37" width="17" height="11" rx="3" fill="#0F172A" />
          <line x1="87" y1="41" x2="93" y2="41" />
          <line x1="74" y1="40" x2="80" y2="45" stroke="#FFFFFF" strokeWidth="1.8" />
          <line x1="97" y1="40" x2="103" y2="45" stroke="#FFFFFF" strokeWidth="1.8" />
          <path d="M 82 56 Q 92 60 102 53" fill="none" />
        </g>
      )}

      {scene === 'pingsan_tepuk_jidat' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {/* X eyes / squeezed */}
          <path d="M 76 42 L 84 46 M 84 42 L 76 46" fill="none" />
          <path d="M 96 44 Q 100 40 105 44" fill="none" />
          <path d="M 83 57 Q 90 54 97 58" fill="none" />
          {/* Facepalm hand */}
          <path d="M 74 26 L 94 24 L 97 45 L 77 46 Z" fill="#FDE68A" />
          <text x="122" y="34" fontSize="12" fontWeight="900" fill="#DC2626" stroke="none">
            PLAK!
          </text>
        </g>
      )}

      {scene === 'pegang_hp' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="81" cy="44" r="2.2" fill="#0F172A" />
          <circle cx="99" cy="44" r="2.2" fill="#0F172A" />
          <path d="M 82 55 Q 90 58 98 55" fill="none" />
          {/* Glowing smartphone in hand */}
          <rect x="128" y="60" width="22" height="36" rx="4" fill="#0F172A" />
          <rect x="131" y="64" width="16" height="26" rx="2" fill="#38BDF8" />
          <circle cx="139" cy="93" r="1.4" fill="#E2E8F0" stroke="none" />
        </g>
      )}

      {scene === 'pose_menang' && (
        <g stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M 75 43 Q 80 37 86 43 M 94 43 Q 100 37 105 43" fill="none" />
          <path d="M 78 53 Q 90 65 102 53 Z" fill="#FFFFFF" />
          {/* Thumbs up & sparkles */}
          <path d="M 134 76 L 138 61 C 139 58, 144 59, 143 64 L 142 74 L 152 74 C 155 74, 155 88, 150 90 L 134 90 Z" fill="#FDE68A" />
          <path d="M 38 28 L 42 20 L 46 28 L 54 32 L 46 36 L 42 44 L 38 36 L 30 32 Z" fill="#FACC15" stroke="none" />
        </g>
      )}
    </svg>
  );
}

export function BercandaComicPanel({
  card,
  panelNumber,
  compact = false,
  selected = false,
  owned = false,
  isWinner = false,
  authorLabel = null,
}: BercandaComicPanelProps) {
  const meta = BERCANDA_SCENE_META[card.scene] ?? BERCANDA_SCENE_META.ngobrol_santai;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 overflow-hidden bg-[#FFFDF7] text-slate-900 shadow-sm transition-transform duration-150 ${
        isWinner
          ? 'border-amber-400 ring-2 ring-amber-400/50 shadow-amber-500/20'
          : selected
            ? 'border-emerald-400 ring-2 ring-emerald-400/40'
            : owned
              ? 'border-indigo-400'
              : 'border-slate-900'
      }`}
    >
      {/* Top Comic Frame Header */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-1.5 border-b-2 border-slate-900 text-[11px] font-extrabold uppercase tracking-wider"
        style={{ backgroundColor: meta.badgeBg, color: '#0F172A' }}
      >
        <span className="truncate">
          {panelNumber ? `Panel ${panelNumber} · ` : ''}
          {card.speaker}
        </span>
        {isWinner ? (
          <span className="inline-flex items-center gap-1 text-amber-800 shrink-0">
            <Trophy className="w-3.5 h-3.5" /> Juara
          </span>
        ) : owned ? (
          <span className="inline-flex items-center gap-1 text-indigo-700 shrink-0">
            <Sparkles className="w-3.5 h-3.5" /> Komikmu
          </span>
        ) : authorLabel ? (
          <span className="text-slate-700 truncate max-w-[110px]">oleh {authorLabel}</span>
        ) : (
          <span className="text-slate-600/80 shrink-0 text-[10px] font-bold">
            {meta.label}
          </span>
        )}
      </div>

      {/* Speech Bubble + Caption */}
      <div className={`px-3 ${compact ? 'pt-2.5 pb-2' : 'pt-3 pb-2.5'} bg-[#FFFDF7] flex-1`}>
        <div className="relative rounded-xl border-2 border-slate-900 bg-white px-3 py-2 shadow-[2px_2px_0_#0F172A]">
          <p
            className={`font-bold text-slate-950 leading-snug ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            “{card.caption}”
          </p>
          {card.subtext && (
            <p className="mt-1 text-[11px] font-medium text-slate-600 italic leading-tight">
              {card.subtext}
            </p>
          )}
        </div>
      </div>

      {/* Cartoon Illustration Box */}
      <div className={`w-full ${compact ? 'h-20' : 'h-28'} bg-slate-50 border-t-2 border-slate-900/15`}>
        <ComicSceneIllustration scene={card.scene} accent={meta.accent} />
      </div>
    </div>
  );
}

export function VoteScoreBadge({
  standardCount,
  goldenCount,
  totalPoints,
}: {
  standardCount: number;
  goldenCount: number;
  totalPoints: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-emerald-300">
        <ThumbsUp className="w-3.5 h-3.5" /> {standardCount} Biasa
      </span>
      {goldenCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/45 text-amber-300">
          <Sparkles className="w-3.5 h-3.5" /> {goldenCount} Golden
        </span>
      )}
      <span className="ml-auto font-mono text-sm font-black text-white">
        +{totalPoints} poin
      </span>
    </div>
  );
}
