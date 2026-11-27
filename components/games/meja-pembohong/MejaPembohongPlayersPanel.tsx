'use client';

import React from 'react';
import { Coffee, Crown, Layers, Skull, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';
import { MejaChamberIndicator } from './MejaCardGraphic';

interface MejaPembohongPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function MejaPembohongPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: MejaPembohongPlayersPanelProps) {
  const mp = room.mejaPembohongState;
  const eliminatedSet = new Set(mp?.eliminatedUids ?? []);
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" />
          Pemain di Meja
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">{players.length}/12 kursi</span>
      </div>

      <div className="space-y-2">
        {sorted.map((p) => {
          const isOnline = presence[p.uid]?.online ?? true;
          const isTurn = Boolean(mp && mp.phase === 'playing' && mp.currentTurnUid === p.uid);
          const isEliminated = eliminatedSet.has(p.uid);
          const cardCount = mp?.handCountByUid[p.uid] ?? 0;
          const shotsTaken = mp?.shotsTakenByUid[p.uid] ?? 0;

          return (
            <div
              key={p.uid}
              className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
                isEliminated
                  ? 'bg-[#0B1018]/60 border-rose-900/50 opacity-65'
                  : isTurn
                    ? 'bg-emerald-500/15 border-emerald-400/60'
                    : p.uid === myUid
                      ? 'bg-sky-500/10 border-sky-500/40'
                      : 'bg-[#0B1018] border-slate-800'
              }`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <span
                    className={`text-xs font-bold truncate ${
                      isEliminated ? 'line-through text-slate-400' : 'text-white'
                    }`}
                  >
                    {p.displayName}
                  </span>
                  {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {p.isBrb && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-300">
                      <Coffee className="w-3 h-3" /> BRB
                    </span>
                  )}
                </div>

                {mp && mp.participantUids.includes(p.uid) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    {isEliminated ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                        <Skull className="w-3 h-3" />
                        Tersingkir
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-300 font-mono tabular-nums">
                        <Layers className="w-3 h-3 text-emerald-400" />
                        {cardCount} kartu
                      </span>
                    )}

                    {mp.mode === 'silinder' && (
                      <MejaChamberIndicator
                        shotsTaken={shotsTaken}
                        eliminated={isEliminated}
                        compact
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono text-sm font-black text-amber-300 tabular-nums block">
                  {p.score} pt
                </span>
                {isTurn && (
                  <span className="text-[10px] font-bold text-emerald-300 uppercase">
                    Giliran
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
