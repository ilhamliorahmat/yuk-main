'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brush, Check, Play, RotateCcw, Undo2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { LukisanStroke } from '@/lib/games/types';

interface PelukisCanvasProps {
  strokes: LukisanStroke[];
  interactive?: boolean;
  inkColor?: string;
  onSubmitStroke?: (points: number[]) => Promise<void> | void;
  busy?: boolean;
  turnOrder?: string[];
  turnNamesByUid?: Record<string, string>;
  turnColorsByUid?: Record<string, string>;
  allowReplay?: boolean;
  autoPlayReplay?: boolean;
  caption?: string;
}

function toPolylinePoints(flat: number[]): string {
  const coords: string[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    coords.push(`${flat[i]},${flat[i + 1]}`);
  }
  return coords.join(' ');
}

export function PelukisCanvas({
  strokes,
  interactive = false,
  inkColor = '#F43F5E',
  onSubmitStroke,
  busy = false,
  turnOrder = [],
  turnNamesByUid = {},
  turnColorsByUid = {},
  allowReplay = false,
  autoPlayReplay = false,
  caption,
}: PelukisCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const [draftState, setDraftState] = useState<{ strokeCount: number; points: number[] }>({
    strokeCount: -1,
    points: [],
  });
  const [replayCount, setReplayCount] = useState<number | null>(() =>
    autoPlayReplay && strokes.length > 0 ? 0 : null,
  );

  const draftPoints =
    interactive && draftState.strokeCount === strokes.length ? draftState.points : [];

  // Reset pointer refs whenever interactive mode turns off
  useEffect(() => {
    if (!interactive) {
      isDrawingRef.current = false;
      activePointerIdRef.current = null;
    }
  }, [interactive]);

  // Step through stroke replay when replayCount is active
  useEffect(() => {
    if (replayCount === null) return;
    if (replayCount >= strokes.length) {
      const doneTimer = window.setTimeout(() => setReplayCount(null), 500);
      return () => window.clearTimeout(doneTimer);
    }
    const stepTimer = window.setTimeout(() => {
      setReplayCount((prev) => (prev === null ? null : prev + 1));
    }, 450);
    return () => window.clearTimeout(stepTimer);
  }, [replayCount, strokes.length]);

  const visibleStrokes = useMemo(() => {
    if (replayCount === null) return strokes;
    return strokes.slice(0, replayCount);
  }, [strokes, replayCount]);

  const strokeCountsByUid = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of strokes) {
      counts[s.uid] = (counts[s.uid] ?? 0) + 1;
    }
    return counts;
  }, [strokes]);

  const getNormalizedPoint = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.max(0, Math.min(1000, Math.round(((clientX - rect.left) / rect.width) * 1000)));
    const y = Math.max(0, Math.min(1000, Math.round(((clientY - rect.top) / rect.height) * 1000)));
    return [x, y];
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || busy) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    if (!pt) return;

    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture error in synthetic/unsupported environments
    }
    isDrawingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    setDraftState({ strokeCount: strokes.length, points: [pt[0], pt[1]] });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!interactive || !isDrawingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    if (!pt) return;

    setDraftState((prev) => {
      const current = prev.strokeCount === strokes.length ? prev.points : [];
      if (current.length < 2) {
        return { strokeCount: strokes.length, points: [pt[0], pt[1]] };
      }
      const lastX = current[current.length - 2];
      const lastY = current[current.length - 1];
      if (Math.hypot(pt[0] - lastX, pt[1] - lastY) < 4) {
        return prev;
      }
      return { strokeCount: strokes.length, points: [...current, pt[0], pt[1]] };
    });
  };

  const finishPointerStroke = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawingRef.current) return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  const handleClearDraft = () => {
    setDraftState({ strokeCount: strokes.length, points: [] });
  };

  const handleSendDraft = async () => {
    if (!onSubmitStroke || draftPoints.length < 4 || busy) return;
    const toSend = [...draftPoints];
    await onSubmitStroke(toSend);
    setDraftState({ strokeCount: strokes.length, points: [] });
  };

  const hasDraft = draftPoints.length >= 4;
  const isReplaying = replayCount !== null;

  return (
    <div className="space-y-3">
      {/* Canvas Board */}
      <div className="relative rounded-2xl bg-[#070B12] border border-slate-700/90 overflow-hidden shadow-inner">
        <svg
          ref={svgRef}
          viewBox="0 0 1000 1000"
          role="img"
          aria-label="Kanvas bersama Pelukis Gadungan"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerStroke}
          onPointerCancel={finishPointerStroke}
          className={`w-full aspect-square block touch-none select-none ${
            interactive && !busy ? 'cursor-crosshair' : 'cursor-default'
          }`}
        >
          {/* Subtle Artboard Grid */}
          <defs>
            <pattern
              id="pelukis-grid"
              width="250"
              height="250"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 250 0 L 0 0 0 250"
                fill="none"
                stroke="rgba(148, 163, 184, 0.08)"
                strokeWidth="2"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1000" height="1000" fill="url(#pelukis-grid)" />

          {/* Committed Strokes */}
          {visibleStrokes.map((stroke) => (
            <motion.polyline
              key={`${stroke.strokeIndex}-${stroke.uid}`}
              initial={isReplaying ? { opacity: 0, pathLength: 0.15 } : false}
              animate={{ opacity: 1, pathLength: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              points={toPolylinePoints(stroke.points)}
              fill="none"
              stroke={stroke.color || '#F8FAFC'}
              strokeWidth={12}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Local Unsent Draft Stroke */}
          {interactive && draftPoints.length >= 2 && (
            <polyline
              points={toPolylinePoints(
                draftPoints.length === 2
                  ? [
                      draftPoints[0],
                      draftPoints[1],
                      Math.min(1000, draftPoints[0] + 2),
                      Math.min(1000, draftPoints[1] + 2),
                    ]
                  : draftPoints,
              )}
              fill="none"
              stroke={inkColor}
              strokeWidth={13}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.92}
            />
          )}
        </svg>

        {/* Empty Canvas Prompt */}
        {visibleStrokes.length === 0 && draftPoints.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <Brush className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs sm:text-sm font-medium text-slate-500">
              {interactive
                ? 'Tarik 1 garis kontinu dengan jarimu di atas kanvas ini'
                : 'Kanvas masih kosong. Menunggu goresan pertama...'}
            </p>
          </div>
        )}

        {/* Ink Badge Top-Left */}
        {interactive && (
          <div className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B1018]/90 border border-slate-700/80 text-xs font-semibold text-white">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: inkColor }}
            />
            <span>Warna Tintamu</span>
          </div>
        )}

        {/* Replay Progress Pill Top-Right */}
        {isReplaying && (
          <div className="pointer-events-none absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-200 tabular-nums">
            Replay {Math.min(replayCount, strokes.length)} / {strokes.length}
          </div>
        )}
      </div>

      {caption && <p className="text-xs text-slate-400 leading-relaxed">{caption}</p>}

      {/* Interactive Draft Controls */}
      {interactive && (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={busy || draftPoints.length === 0}
            onClick={handleClearDraft}
            className="min-h-[44px] px-4 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          >
            <Undo2 className="w-4 h-4" />
            <span>Ulangi Garis</span>
          </button>

          <button
            type="button"
            disabled={busy || !hasDraft}
            onClick={() => void handleSendDraft()}
            className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            <span>{busy ? 'Mengirim Goresan...' : 'Kirim Garis'}</span>
          </button>
        </div>
      )}

      {/* Stroke-by-Stroke Replay Button */}
      {allowReplay && strokes.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setReplayCount(isReplaying ? null : 0)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 hover:border-amber-400/60 text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5 transition-colors"
          >
            {isReplaying ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tampilkan Semua ({strokes.length})</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Putar Ulang Goresan ({strokes.length})</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Color-Coded Artist Legend */}
      {turnOrder.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {turnOrder.map((uid) => {
            const color = turnColorsByUid[uid] ?? '#94A3B8';
            const name = turnNamesByUid[uid] ?? 'Pemain';
            const count = strokeCountsByUid[uid] ?? 0;
            return (
              <div
                key={uid}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B1018] border border-slate-800 text-xs text-slate-200"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="font-medium truncate max-w-[110px]">{name}</span>
                <span className="text-[11px] font-mono-tabular text-slate-500">({count})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
