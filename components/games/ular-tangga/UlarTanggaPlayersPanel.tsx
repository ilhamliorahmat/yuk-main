'use client';

import React, { useMemo } from 'react';
import { Coins, Crown, Shield, Swords, Users } from 'lucide-react';
import {
  sanitizeUlarTanggaSettings,
  ULAR_HERO_CLASSES,
} from '@/lib/games/ular-tangga/packs';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';

interface UlarTanggaPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function UlarTanggaPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: UlarTanggaPlayersPanelProps) {
  const uts = room.ularTanggaState;
  const settings = sanitizeUlarTanggaSettings(room.ularTanggaSettings);

  const orderedPlayers = useMemo(() => {
    if (!uts || room.status === 'lobby') return players;
    return [...players].sort((a, b) => {
      const ha = uts.heroesByUid[a.uid];
      const hb = uts.heroesByUid[b.uid];
      if (!ha && !hb) return b.score - a.score;
      if (!ha) return 1;
      if (!hb) return -1;
      if (hb.tile !== ha.tile) return hb.tile - ha.tile;
      return hb.gold - ha.gold;
    });
  }, [players, uts, room.status]);

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Petualang &amp; Posisi</h2>
        </div>
        <span className="text-xs font-mono-tabular text-slate-400">
          {players.length}/12
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {orderedPlayers.map((player) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.controllerUid ?? player.uid]?.online ?? true;
          const hero = uts?.heroesByUid[player.uid];
          const isCurrentTurn =
            room.status === 'playing' && uts?.currentTurnUid === player.uid;
          const lobbyChoice = settings.classSelectionByUid[player.uid] ?? 'acak';
          const classLabel = hero
            ? ULAR_HERO_CLASSES[hero.heroClass].name
            : lobbyChoice === 'acak'
              ? 'Kelas Acak'
              : ULAR_HERO_CLASSES[lobbyChoice]?.name ?? 'Kelas Acak';

          return (
            <div
              key={player.uid}
              className={`px-3.5 py-3 space-y-2 transition-colors ${
                isCurrentTurn
                  ? 'bg-amber-500/10'
                  : player.isBrb
                    ? 'opacity-65'
                    : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white border ${
                        isCurrentTurn ? 'border-amber-300 ring-2 ring-amber-400/40' : 'border-white/10'
                      }`}
                      style={{ backgroundColor: player.avatarColor || '#F59E0B' }}
                    >
                      {player.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0B1018] ${
                        isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
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
                      <span>{classLabel}</span>
                      {player.isBrb && (
                        <>
                          <span>·</span>
                          <span className="text-amber-400 font-semibold">BRB</span>
                        </>
                      )}
                      {isCurrentTurn && (
                        <>
                          <span>·</span>
                          <span className="text-amber-300 font-bold">Giliran Aktif</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {hero && room.status !== 'lobby' ? (
                    <>
                      <span className="font-mono-tabular text-sm font-black text-amber-300 block">
                        Petak {hero.tile}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-400">
                        {player.score} poin
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono-tabular text-sm font-bold text-white block">
                        {player.score}
                      </span>
                      <span className="text-[11px] text-slate-500">poin</span>
                    </>
                  )}
                </div>
              </div>

              {hero && room.status !== 'lobby' && (
                <div className="space-y-1.5 pl-10">
                  <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                    <span className="text-rose-300">
                      HP {hero.hp}/{hero.maxHp}
                    </span>
                    <div className="flex items-center gap-2.5">
                      {hero.shielded && (
                        <span className="inline-flex items-center gap-0.5 text-cyan-300 font-semibold">
                          <Shield className="w-3 h-3" /> Perisai
                        </span>
                      )}
                      {hero.monstersDefeated > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-orange-300">
                          <Swords className="w-3 h-3" /> {hero.monstersDefeated}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-0.5 text-amber-300 font-bold">
                        <Coins className="w-3 h-3" /> {hero.gold}G
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-rose-500 transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, (hero.hp / Math.max(1, hero.maxHp)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
