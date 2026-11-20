'use client';

import React, { useMemo } from 'react';
import { Brush, CheckCircle2, Crown, EyeOff, Palette, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';

interface PelukisPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function PelukisPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: PelukisPlayersPanelProps) {
  const lukisan = room.lukisanState;

  const orderedPlayers = useMemo(() => {
    if (!lukisan || room.status === 'lobby' || lukisan.turnOrder.length === 0) {
      return players;
    }
    const orderMap = new Map(lukisan.turnOrder.map((uid, idx) => [uid, idx]));
    return [...players].sort((a, b) => {
      const idxA = orderMap.get(a.uid) ?? 999;
      const idxB = orderMap.get(b.uid) ?? 999;
      return idxA - idxB;
    });
  }, [players, lukisan, room.status]);

  const strokesByUid = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of lukisan?.strokes ?? []) {
      counts[s.uid] = (counts[s.uid] ?? 0) + 1;
    }
    return counts;
  }, [lukisan?.strokes]);

  const gadunganSet = new Set(lukisan?.gadunganUids ?? []);
  const votedSet = new Set(lukisan?.submittedVoteUids ?? []);

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Urutan &amp; Skor Pelukis</h2>
        </div>
        <span className="text-xs font-mono-tabular text-slate-400">
          {players.length}/12
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {orderedPlayers.map((player, index) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.controllerUid ?? player.uid]?.online ?? true;
          const inkColor =
            room.status !== 'lobby' && lukisan?.turnColorsByUid[player.uid]
              ? lukisan.turnColorsByUid[player.uid]
              : player.avatarColor || '#10B981';
          const isActiveDrawer =
            room.status === 'playing' &&
            lukisan?.phase === 'drawing' &&
            lukisan.currentTurnUid === player.uid;
          const hasVoted =
            room.status === 'playing' &&
            lukisan?.phase === 'voting' &&
            votedSet.has(player.uid);
          const strokeCount = strokesByUid[player.uid] ?? 0;
          const isRevealedGadungan =
            room.status === 'round_end' && gadunganSet.has(player.uid);

          return (
            <div
              key={player.uid}
              className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                player.isBrb
                  ? 'opacity-65'
                  : isActiveDrawer
                    ? 'bg-emerald-950/25'
                    : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 font-mono-tabular border border-white/10"
                  style={{ backgroundColor: inkColor }}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white truncate">
                    <span className="truncate">{player.displayName}</span>
                    {isMe && <span className="text-[11px] font-normal text-slate-400">(Kamu)</span>}
                    {player.isHost && (
                      <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-label="Host" />
                    )}
                    {player.isNumpang && (
                      <span className="text-[11px] font-medium text-emerald-400 shrink-0">
                        Numpang
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {player.isBrb ? (
                      <span className="text-amber-400 font-semibold">BRB</span>
                    ) : isActiveDrawer ? (
                      <span className="text-emerald-300 font-semibold inline-flex items-center gap-1">
                        <Brush className="w-3 h-3" />
                        <span>Menggambar</span>
                      </span>
                    ) : hasVoted ? (
                      <span className="text-cyan-300 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Sudah Voting</span>
                      </span>
                    ) : room.status === 'round_end' && lukisan ? (
                      isRevealedGadungan ? (
                        <span className="text-rose-400 font-semibold inline-flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          <span>Pelukis Gadungan</span>
                        </span>
                      ) : (
                        <span className="text-emerald-300 font-medium inline-flex items-center gap-1">
                          <Palette className="w-3 h-3" />
                          <span>Pelukis Asli</span>
                        </span>
                      )
                    ) : room.status !== 'lobby' ? (
                      <span>{strokeCount} garis</span>
                    ) : (
                      <span>{isOnline ? 'Siap' : 'Offline'}</span>
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

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Setiap pelukis mendapat warna tinta unik agar mudah melacak siapa menggambar garis apa saat voting.
      </p>
    </section>
  );
}
