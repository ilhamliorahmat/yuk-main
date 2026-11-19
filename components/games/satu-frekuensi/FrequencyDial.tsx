'use client';

import React, { useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import type { FrequencyGuessReveal } from '@/lib/games/types';

interface FrequencyDialProps {
  leftLabel: string;
  rightLabel: string;
  /** Currently interactive needle value (0..100) for Guessers during dialing */
  needleValue?: number;
  interactive?: boolean;
  onChangeValue?: (val: number) => void;
  /** Target value (0..100) — visible ONLY to Psychic during clue/dialing, or to everyone during reveal */
  targetValue?: number | null;
  showTargetZone: boolean;
  /** Multi-player revealed guesses shown along the arc during reveal */
  revealedGuesses?: FrequencyGuessReveal[];
  /** Optional single label shown below the center hub */
  centerCaption?: string;
}

function clampVal(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/**
 * Maps 0..100 to CSS rotation degrees where:
 *   0   -> -90deg (far left)
 *   50  ->   0deg (straight up)
 *   100 -> +90deg (far right)
 */
function valueToRotateDeg(val: number): number {
  return (val / 100) * 180 - 90;
}

/**
 * Builds an exact CSS conic-gradient for the top semicircle (from -90deg at bottom center,
 * spanning 0deg..180deg clockwise from left pole to right pole).
 */
function buildTargetZoneGradient(target: number): string {
  const deg = (v: number) => Math.min(180, Math.max(0, (v / 100) * 180));

  const nearStart = deg(target - 16);
  const closeStart = deg(target - 10);
  const bullStart = deg(target - 4);
  const bullEnd = deg(target + 4);
  const closeEnd = deg(target + 10);
  const nearEnd = deg(target + 16);

  const base = '#131A24';
  const nearCol = '#0E4F5C';
  const closeCol = '#0284C7';
  const bullCol = '#22D3EE';

  return `conic-gradient(from -90deg at 50% 100%,
    ${base} 0deg ${nearStart}deg,
    ${nearCol} ${nearStart}deg ${closeStart}deg,
    ${closeCol} ${closeStart}deg ${bullStart}deg,
    ${bullCol} ${bullStart}deg ${bullEnd}deg,
    ${closeCol} ${bullEnd}deg ${closeEnd}deg,
    ${nearCol} ${closeEnd}deg ${nearEnd}deg,
    ${base} ${nearEnd}deg 180deg,
    transparent 180deg 360deg
  )`;
}

export function FrequencyDial({
  leftLabel,
  rightLabel,
  needleValue = 50,
  interactive = false,
  onChangeValue,
  targetValue = null,
  showTargetZone,
  revealedGuesses = [],
  centerCaption,
}: FrequencyDialProps) {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!interactive || !onChangeValue || !dialRef.current) return;
      const rect = dialRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.bottom;
      const dx = clientX - centerX;
      const dy = Math.max(1, centerY - clientY);
      // Angle from left horizontal (-PI..0 -> 0..180 deg)
      const angleRad = Math.atan2(dy, dx); // 0 at right, PI at left
      const ratio = 1 - angleRad / Math.PI;
      const nextVal = clampVal(ratio * 100);
      onChangeValue(nextVal);
    },
    [interactive, onChangeValue],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !draggingRef.current) return;
    updateFromClientPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const safeNeedle = clampVal(needleValue);
  const targetReady = showTargetZone && typeof targetValue === 'number';
  const tickValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  return (
    <div className="space-y-4 select-none">
      {/* Semicircle Frequency Gauge */}
      <div className="relative mx-auto w-full max-w-[380px]">
        <div
          ref={dialRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative w-full aspect-[2/1] overflow-hidden rounded-t-full border-t border-x border-slate-700/90 bg-[#0F1622] ${
            interactive ? 'cursor-pointer touch-none' : ''
          }`}
        >
          {/* Target Zone Arc (illuminated with smooth opacity transition) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: targetReady ? 1 : 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 rounded-t-full"
            style={{
              background:
                targetReady && typeof targetValue === 'number'
                  ? buildTargetZoneGradient(targetValue)
                  : undefined,
            }}
          />

          {/* Inner Cutout Ring for Clean Analog Instrument Depth */}
          <div className="absolute inset-x-[16%] bottom-0 h-[68%] rounded-t-full bg-[#0B1018]/92 border-t border-x border-slate-800/90 pointer-events-none" />

          {/* Perimeter Tick Marks */}
          {tickValues.map((t) => {
            const isMajor = t % 25 === 0;
            return (
              <div
                key={t}
                className="absolute left-1/2 bottom-0 h-full w-px origin-bottom pointer-events-none"
                style={{ transform: `translateX(-50%) rotate(${valueToRotateDeg(t)}deg)` }}
              >
                <div
                  className={`mx-auto ${
                    isMajor ? 'w-[2px] h-3.5 bg-slate-300/75' : 'w-px h-2 bg-slate-500/50'
                  }`}
                />
              </div>
            );
          })}

          {/* Multi-Player Revealed Needles */}
          {revealedGuesses.map((entry) => (
            <motion.div
              key={entry.uid}
              initial={{ rotate: 0, opacity: 0 }}
              animate={{ rotate: valueToRotateDeg(entry.value), opacity: 1 }}
              transition={{ type: 'spring', stiffness: 130, damping: 18 }}
              className="absolute left-1/2 bottom-0 h-[92%] w-1 origin-bottom pointer-events-none"
              style={{ marginLeft: '-2px' }}
            >
              <div
                className="w-1 h-full rounded-full opacity-90"
                style={{ backgroundColor: entry.avatarColor }}
              />
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-[#0B1018] -ml-[5px] -mt-[100%] shadow"
                style={{ backgroundColor: entry.avatarColor }}
                title={`${entry.displayName}: ${entry.value}`}
              />
            </motion.div>
          ))}

          {/* Target Centerline Pin (when target is shown) */}
          {targetReady && typeof targetValue === 'number' && (
            <div
              className="absolute left-1/2 bottom-0 h-[96%] w-[2px] origin-bottom pointer-events-none"
              style={{
                marginLeft: '-1px',
                transform: `rotate(${valueToRotateDeg(targetValue)}deg)`,
              }}
            >
              <div className="w-full h-full bg-white/90" />
            </div>
          )}

          {/* Active Interactive Guesser Needle */}
          {interactive && (
            <motion.div
              animate={{ rotate: valueToRotateDeg(safeNeedle) }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="absolute left-1/2 bottom-0 h-[90%] w-1 origin-bottom pointer-events-none"
              style={{ marginLeft: '-2px' }}
            >
              <div className="w-1 h-full rounded-t-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]" />
              <div className="w-3 h-3 rounded-full bg-white border-2 border-cyan-400 -ml-1 absolute top-0" />
            </motion.div>
          )}

          {/* Center Pivot Hub */}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 w-12 h-12 rounded-full bg-[#131A24] border-2 border-slate-600 flex items-start justify-center pt-1.5 pointer-events-none">
            <span className="font-mono-tabular text-xs font-bold text-white">
              {interactive
                ? safeNeedle
                : targetReady && typeof targetValue === 'number'
                  ? targetValue
                  : '—'}
            </span>
          </div>
        </div>

        {/* Baseline Track */}
        <div className="h-1 w-full bg-slate-800 rounded-full" />
      </div>

      {/* Spectrum Poles (Left 0 ↔ Right 100) */}
      <div className="grid grid-cols-2 gap-3 items-stretch">
        <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-3.5 py-2.5 text-left">
          <span className="text-[11px] font-mono-tabular text-slate-400 block">0 · Kutub Kiri</span>
          <span className="text-sm font-bold text-white leading-snug block mt-0.5">
            {leftLabel}
          </span>
        </div>
        <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-3.5 py-2.5 text-right">
          <span className="text-[11px] font-mono-tabular text-slate-400 block">100 · Kutub Kanan</span>
          <span className="text-sm font-bold text-white leading-snug block mt-0.5">
            {rightLabel}
          </span>
        </div>
      </div>

      {/* Interactive Slider + Fine-Tune Controls for Guessers */}
      {interactive && onChangeValue && (
        <div className="space-y-2.5 pt-1">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={safeNeedle}
            aria-label="Geser posisi jarum frekuensi"
            onChange={(e) => onChangeValue(clampVal(Number(e.target.value)))}
            className="w-full h-2.5 rounded-lg appearance-none bg-slate-800 accent-cyan-400 cursor-pointer"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeValue(clampVal(safeNeedle - 5))}
                className="min-h-[40px] px-3 rounded-lg bg-[#0B1018] border border-slate-800 hover:border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => onChangeValue(clampVal(safeNeedle - 1))}
                className="min-h-[40px] px-3 rounded-lg bg-[#0B1018] border border-slate-800 hover:border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors"
              >
                -1
              </button>
            </div>

            <span className="text-xs font-mono-tabular text-cyan-300 font-semibold">
              Posisi: {safeNeedle}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeValue(clampVal(safeNeedle + 1))}
                className="min-h-[40px] px-3 rounded-lg bg-[#0B1018] border border-slate-800 hover:border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => onChangeValue(clampVal(safeNeedle + 5))}
                className="min-h-[40px] px-3 rounded-lg bg-[#0B1018] border border-slate-800 hover:border-slate-600 text-xs font-mono-tabular text-slate-200 transition-colors"
              >
                +5
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend / Caption */}
      {showTargetZone ? (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
            <span>Tepat Sasaran (+4)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" />
            <span>Hampir Tepat (+3)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-900 inline-block" />
            <span>Cukup Dekat (+2)</span>
          </span>
        </div>
      ) : centerCaption ? (
        <p className="text-xs text-center text-slate-400">{centerCaption}</p>
      ) : null}
    </div>
  );
}
