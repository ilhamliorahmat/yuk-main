'use client';

import React, { useState } from 'react';
import { Crown, Gavel, MessageCircleQuestion, ShieldAlert, UserX, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';
import { initiateKataKataVote } from '@/lib/platform/room-service';

interface KataKataPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
  myName: string;
}

export function KataKataPlayersPanel({
  room,
  players,
  presence,
  myUid,
  myName,
}: KataKataPlayersPanelProps) {
  const [accusingUid, setAccusingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const eliminatedSet = new Set(room.eliminatedUids ?? []);
  const eliminationByUid = new Map(
    (room.eliminationLog ?? []).map((entry) => [entry.uid, entry]),
  );
  const amIEliminated = eliminatedSet.has(myUid);

  const handleAccuse = async (target: RoomPlayerDoc) => {
    if (room.status !== 'playing' || accusingUid || amIEliminated) return;
    setAccusingUid(target.uid);
    setErrorMsg(null);
    try {
      await initiateKataKataVote({
        roomId: room.id,
        initiatorUid: myUid,
        initiatorName: myName,
        targetUid: target.uid,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulai voting.');
    } finally {
      setAccusingUid(null);
    }
  };

  // Alive players first, sorted by score descending
  const sortedPlayers = [...players].sort((a, b) => {
    const aElim = eliminatedSet.has(a.uid) ? 1 : 0;
    const bElim = eliminatedSet.has(b.uid) ? 1 : 0;
    if (aElim !== bElim) return aElim - bElim;
    return b.score - a.score;
  });

  const aliveCount = players.filter((p) => !eliminatedSet.has(p.uid)).length;

  return (
    <section className="bg-[#131A24] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-white">Daftar Pemain</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono-tabular">
          {room.status === 'lobby' || room.status === 'round_end'
            ? `${players.length} Pemain`
            : `${aliveCount}/${players.length} Bertahan`}
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
          const isEliminated =
            room.status !== 'lobby' && eliminatedSet.has(player.uid);
          const elimEntry = eliminationByUid.get(player.uid);
          const isFirstSpeaker =
            room.status !== 'lobby' &&
            room.status !== 'round_end' &&
            !isEliminated &&
            room.firstSpeakerUid === player.uid;

          return (
            <div
              key={player.uid}
              className={`p-3.5 flex items-center justify-between gap-3 ${
                isEliminated ? 'opacity-65' : ''
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 relative"
                  style={{ backgroundColor: isEliminated ? '#334155' : player.avatarColor }}
                >
                  {isEliminated ? (
                    <UserX className="w-4 h-4 text-slate-300" />
                  ) : (
                    <span>{player.displayName.slice(0, 2).toUpperCase()}</span>
                  )}
                  <span
                    title={isOnline ? 'Aktif (RTDB)' : 'Terputus'}
                    className={`w-2.5 h-2.5 rounded-full border-2 border-[#0B1018] absolute -bottom-0.5 -right-0.5 ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-semibold truncate ${
                        isEliminated ? 'text-slate-400 line-through' : 'text-white'
                      }`}
                    >
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
                    {isEliminated && elimEntry ? (
                      <span
                        className={`font-semibold inline-flex items-center gap-1 ${
                          elimEntry.wasSpy ? 'text-rose-400' : 'text-emerald-300'
                        }`}
                      >
                        {elimEntry.wasSpy && <ShieldAlert className="w-3 h-3" />}
                        <span>
                          Tereliminasi ({elimEntry.wasSpy ? 'Penyusup' : 'Warga'})
                        </span>
                      </span>
                    ) : (
                      <span>{isOnline ? 'Aktif' : 'Offline'}</span>
                    )}
                    {isFirstSpeaker && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-300 inline-flex items-center gap-1">
                          <MessageCircleQuestion className="w-3 h-3" />
                          Petunjuk Pertama
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {room.status === 'playing' && !isMe && !isEliminated && !amIEliminated && (
                <button
                  type="button"
                  disabled={accusingUid !== null}
                  onClick={() => void handleAccuse(player)}
                  className="min-h-[40px] px-3 rounded-xl bg-[#131A24] border border-slate-700 hover:border-amber-400 hover:text-amber-300 text-xs font-medium text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-40"
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
