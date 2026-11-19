'use client';

import React from 'react';
import { Check, Crown, Radio, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';

interface SatuFrekuensiPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function SatuFrekuensiPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: SatuFrekuensiPlayersPanelProps) {
  const freq = room.frequencyState;
  const lockedSet = new Set(freq?.lockedUids ?? []);

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Daftar Pemain</h2>
        </div>
        <span className="text-xs font-mono-tabular text-slate-400">
          {players.length}/12
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {sortedPlayers.map((player) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.uid]?.online ?? true;
          const isPsychic = room.status !== 'lobby' && freq?.psychicUid === player.uid;
          const hasLocked = room.status === 'playing' && lockedSet.has(player.uid);

          return (
            <div
              key={player.uid}
              className="px-3.5 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: player.avatarColor || '#0891B2' }}
                >
                  {player.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white truncate">
                    <span className="truncate">{player.displayName}</span>
                    {isMe && <span className="text-[11px] font-normal text-slate-400">(Kamu)</span>}
                    {player.isHost && (
                      <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Host" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    {isPsychic ? (
                      <span className="text-cyan-300 font-medium inline-flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        <span>Penerawang</span>
                      </span>
                    ) : room.status === 'playing' && freq?.phase === 'dialing' ? (
                      hasLocked ? (
                        <span className="text-emerald-300 font-medium inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Jarum Terkunci</span>
                        </span>
                      ) : (
                        <span>Sedang memutar jarum...</span>
                      )
                    ) : (
                      <span>{isOnline ? 'Aktif' : 'Offline'}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono-tabular text-sm font-bold text-white block">
                  {player.score}
                </span>
                <span className="text-[11px] text-slate-500">poin</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
