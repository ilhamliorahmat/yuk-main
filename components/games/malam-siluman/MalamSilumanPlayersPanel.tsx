'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, Crown, Moon, Skull, Users } from 'lucide-react';
import { MALAM_SILUMAN_ROLES } from '@/lib/games/malam-siluman/roles-id';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';

interface MalamSilumanPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function MalamSilumanPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: MalamSilumanPlayersPanelProps) {
  const ms = room.malamSilumanState;

  const livingSet = useMemo(() => new Set(ms?.livingUids ?? []), [ms?.livingUids]);
  const submittedNightSet = useMemo(
    () => new Set(ms?.submittedNightUids ?? []),
    [ms?.submittedNightUids],
  );
  const submittedVoteSet = useMemo(
    () => new Set(ms?.submittedVoteUids ?? []),
    [ms?.submittedVoteUids],
  );

  const deadByUid = useMemo(() => {
    const map = new Map<string, NonNullable<typeof ms>['deadPlayers'][number]>();
    for (const d of ms?.deadPlayers ?? []) {
      map.set(d.uid, d);
    }
    return map;
  }, [ms]);

  const orderedPlayers = useMemo(() => {
    if (!ms || room.status === 'lobby') return players;
    return [...players].sort((a, b) => {
      const aDead = deadByUid.has(a.uid) ? 1 : 0;
      const bDead = deadByUid.has(b.uid) ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      return b.score - a.score;
    });
  }, [players, ms, room.status, deadByUid]);

  const livingCount = ms && room.status !== 'lobby' ? ms.livingUids.length : players.filter((p) => !p.isBrb).length;

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Penduduk &amp; Skor</h2>
        </div>
        <span className="text-xs font-mono-tabular text-slate-400">
          {room.status !== 'lobby' && ms ? `${livingCount} hidup` : `${players.length}/12`}
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {orderedPlayers.map((player) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.controllerUid ?? player.uid]?.online ?? true;
          const deadEntry = deadByUid.get(player.uid);
          const isAlive = room.status !== 'lobby' && ms ? livingSet.has(player.uid) : !player.isBrb;
          const hasNightDone =
            room.status === 'playing' &&
            ms?.phase === 'night' &&
            submittedNightSet.has(player.uid);
          const hasVoteDone =
            room.status === 'playing' &&
            ms?.phase === 'day_voting' &&
            submittedVoteSet.has(player.uid);
          const revealedRoleId =
            room.status === 'round_end'
              ? ms?.revealedRolesByUid?.[player.uid] ?? deadEntry?.revealedRole ?? null
              : deadEntry?.revealedRole ?? null;
          const revealedMeta = revealedRoleId ? MALAM_SILUMAN_ROLES[revealedRoleId] : null;

          const causeLabel =
            deadEntry?.cause === 'night_kill'
              ? `Gugur Malam #${deadEntry.dayOrNightNumber}`
              : deadEntry?.cause === 'hunter_shot'
                ? `Tembakan Pemburu #${deadEntry.dayOrNightNumber}`
                : deadEntry
                  ? `Eksekusi Siang #${deadEntry.dayOrNightNumber}`
                  : '';

          return (
            <div
              key={player.uid}
              className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                deadEntry || player.isBrb ? 'opacity-65' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white border border-white/10 ${
                      deadEntry ? 'grayscale' : ''
                    }`}
                    style={{ backgroundColor: player.avatarColor || '#DC2626' }}
                  >
                    {deadEntry ? (
                      <Skull className="w-4 h-4 text-slate-200" />
                    ) : (
                      player.displayName.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0B1018] ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-white truncate">
                    <span className={`truncate ${deadEntry ? 'line-through text-slate-400' : ''}`}>
                      {player.displayName}
                    </span>
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
                    {player.isBrb && room.status === 'lobby' ? (
                      <span className="text-amber-400 font-semibold">BRB</span>
                    ) : deadEntry ? (
                      <span className="text-rose-300/90">
                        {causeLabel}
                        {revealedMeta ? ` · ${revealedMeta.name}` : ''}
                      </span>
                    ) : room.status === 'round_end' && revealedMeta ? (
                      <span
                        className={
                          revealedMeta.team === 'siluman'
                            ? 'text-rose-400 font-semibold'
                            : revealedMeta.team === 'netral'
                              ? 'text-amber-300 font-semibold'
                              : 'text-emerald-300 font-medium'
                        }
                      >
                        {revealedMeta.name}
                      </span>
                    ) : hasNightDone ? (
                      <span className="text-indigo-300 font-medium inline-flex items-center gap-1">
                        <Moon className="w-3 h-3" />
                        <span>Sudah Aksi</span>
                      </span>
                    ) : hasVoteDone ? (
                      <span className="text-amber-300 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Sudah Vote</span>
                      </span>
                    ) : room.status !== 'lobby' && isAlive ? (
                      <span className="text-emerald-300/90">Hidup</span>
                    ) : room.status !== 'lobby' ? (
                      <span className="text-amber-400">Penonton (BRB)</span>
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
        Menang (+3 hidup / +2 gugur). Jika <strong>Tumbal</strong> dieksekusi di siang hari, ia menang solo (+4 poin).
      </p>
    </section>
  );
}
