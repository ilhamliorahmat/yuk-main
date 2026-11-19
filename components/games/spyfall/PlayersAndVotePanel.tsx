'use client';

import React, { useState } from 'react';
import { Crown, Gavel, MessageCircleQuestion, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';
import { initiateAccusationVote } from '@/lib/platform/room-service';

interface PlayersAndVotePanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
}

export function PlayersAndVotePanel({
  room,
  players,
  presence,
  myUid,
  myName,
}: PlayersAndVotePanelProps) {
  const [accusingUid, setAccusingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAccuse = async (target: RoomPlayerDoc) => {
    if (room.status !== 'playing' || accusingUid) return;
    setAccusingUid(target.uid);
    setErrorMsg(null);
    try {
      await initiateAccusationVote({
        roomId: room.id,
        initiatorUid: myUid,
        initiatorName: myName,
        targetUid: target.uid,
        targetName: target.displayName,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulai voting.');
    } finally {
      setAccusingUid(null);
    }
  };

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rose-400 shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-white">Daftar Pemain</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular">
          {players.length} Pemain
        </span>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-950/50 border border-rose-800/70 px-3 py-2 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="divide-y divide-slate-800/80 rounded-xl bg-[#0B1018] border border-slate-800">
        {sortedPlayers.map((player) => {
          const isMe = player.uid === myUid;
          const isOnline = presence[player.uid]?.online ?? true;
          const isFirstSpeaker =
            room.status !== 'lobby' && room.firstSpeakerUid === player.uid;

          return (
            <div
              key={player.uid}
              className="p-3.5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 relative"
                  style={{ backgroundColor: player.avatarColor }}
                >
                  <span>{player.displayName.slice(0, 2).toUpperCase()}</span>
                  <span
                    title={isOnline ? 'Aktif (RTDB)' : 'Terputus'}
                    className={`w-2.5 h-2.5 rounded-full border-2 border-[#0B1018] absolute -bottom-0.5 -right-0.5 ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-white truncate">
                      {player.displayName}
                    </span>
                    {isMe && <span className="text-xs text-slate-400">(Kamu)</span>}
                    {player.isHost && (
                      <Crown
                        className="w-3.5 h-3.5 text-amber-400 shrink-0"
                        aria-label="Host Ruang"
                      />
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2">
                    <span className="font-mono-tabular">{player.score} Poin</span>
                    <span aria-hidden="true">·</span>
                    <span>{isOnline ? 'Aktif' : 'Offline'}</span>
                    {isFirstSpeaker && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300 inline-flex items-center gap-1">
                          <MessageCircleQuestion className="w-3 h-3" />
                          Penanya Pertama
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {room.status === 'playing' && !isMe && (
                <button
                  type="button"
                  disabled={accusingUid !== null}
                  onClick={() => void handleAccuse(player)}
                  className="min-h-[40px] px-3 rounded-xl bg-[#131A24] border border-slate-700 hover:border-rose-500 hover:text-rose-300 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
                >
                  <Gavel className="w-3.5 h-3.5" />
                  <span>{accusingUid === player.uid ? 'Proses...' : 'Tuduh'}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
