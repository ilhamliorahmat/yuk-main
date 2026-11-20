'use client';

import React from 'react';
import { Crown, Search, ShieldCheck, Users } from 'lucide-react';
import type {
  PlayerSecretDoc,
  PresenceEntry,
  RoomDoc,
  RoomPlayerDoc,
} from '@/lib/games/types';

interface FaktaHariIniPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  mySecret: PlayerSecretDoc | null;
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function FaktaHariIniPlayersPanel({
  room,
  players,
  mySecret,
  presence,
  myUid,
}: FaktaHariIniPlayersPanelProps) {
  const fakta = room.faktaState;
  const amIBluffer = Boolean(mySecret && mySecret.isGuesser === false);
  const visibleTruthTellerUid =
    room.status === 'round_end'
      ? fakta?.revealedTruthTellerUid
      : amIBluffer
        ? mySecret?.truthTellerUid
        : undefined;

  // Keep join order visible via rotation number while displaying live scores
  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-400 shrink-0" />
          <h2 className="text-sm font-bold text-white">Urutan & Skor Pemain</h2>
        </div>
        <span className="text-xs font-mono-tabular text-slate-400">
          {players.length}/12
        </span>
      </div>

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {players.map((player, index) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.controllerUid ?? player.uid]?.online ?? true;
          const isGuesser = room.status !== 'lobby' && fakta?.guesserUid === player.uid;
          const isPhaseController =
            room.status === 'playing' && fakta?.phaseControllerUid === player.uid;
          const isKnownTruthTeller =
            room.status !== 'lobby' && visibleTruthTellerUid === player.uid;

          return (
            <div
              key={player.uid}
              className={`px-3.5 py-3 flex items-center justify-between gap-3 ${
                player.isBrb ? 'opacity-65' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0 font-mono-tabular"
                  style={{ backgroundColor: player.avatarColor || '#7C3AED' }}
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
                    ) : isGuesser ? (
                      <span className="text-amber-300 font-medium inline-flex items-center gap-1">
                        <Search className="w-3 h-3" />
                        <span>Penebak</span>
                      </span>
                    ) : room.status !== 'lobby' ? (
                      <span
                        className={
                          isKnownTruthTeller
                            ? 'text-emerald-300 font-medium inline-flex items-center gap-1'
                            : 'text-violet-300 font-medium'
                        }
                      >
                        {isKnownTruthTeller && <ShieldCheck className="w-3 h-3" />}
                        <span>{isKnownTruthTeller ? 'Pembawa Fakta' : 'Tim Bluffer'}</span>
                      </span>
                    ) : (
                      <span>{isOnline ? 'Siap' : 'Offline'}</span>
                    )}

                    {isPhaseController && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-300">Pengendali Fase</span>
                      </>
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
        Urutan nomor menentukan giliran <strong className="text-slate-200">Penebak</strong> di
        setiap ronde secara bergiliran.
      </p>
    </section>
  );
}
