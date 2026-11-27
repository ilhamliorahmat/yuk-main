'use client';

import { CheckCircle2, Clock, Coffee, Crown, Sparkles, Users } from 'lucide-react';
import type { PresenceEntry, RoomDoc, RoomPlayerDoc } from '@/lib/games/types';

interface CumaBercandaPlayersPanelProps {
  room: RoomDoc;
  players: RoomPlayerDoc[];
  presence: Record<string, PresenceEntry>;
  myUid: string;
}

export function CumaBercandaPlayersPanel({
  room,
  players,
  presence,
  myUid,
}: CumaBercandaPlayersPanelProps) {
  const cb = room.cumaBercandaState;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const goldenUsedSet = new Set(cb?.goldenUsedByUid ?? []);
  const submittedSet = new Set(cb?.submittedUids ?? []);
  const votedSet = new Set(cb?.votedUids ?? []);

  return (
    <div className="rounded-2xl bg-[#131A24] border border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" />
          Pemain & Skor Upvote
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">
          {players.length} kursi
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map((p) => {
          const isOnline = presence[p.uid]?.online ?? true;
          const isParticipant = cb?.participantUids.includes(p.uid) ?? false;
          const hasSubmitted = submittedSet.has(p.uid);
          const hasVoted = votedSet.has(p.uid);
          const spentGolden = goldenUsedSet.has(p.uid);

          return (
            <div
              key={p.uid}
              className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
                p.uid === myUid
                  ? 'bg-sky-500/10 border-sky-500/40'
                  : p.isBrb
                    ? 'bg-[#0B1018]/60 border-amber-500/20 opacity-70'
                    : 'bg-[#0B1018] border-slate-800'
              }`}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <span className="text-xs font-bold text-white truncate">
                    {p.displayName}
                  </span>
                  {p.isHost && (
                    <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  {p.isBrb && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-300">
                      <Coffee className="w-3 h-3" /> BRB
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  {cb && isParticipant && cb.phase === 'picking' && (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        hasSubmitted ? 'text-emerald-300' : 'text-slate-400'
                      }`}
                    >
                      {hasSubmitted ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Sudah Kirim
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" /> Memilih Kartu
                        </>
                      )}
                    </span>
                  )}
                  {cb && isParticipant && cb.phase === 'voting' && (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        hasVoted ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {hasVoted ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Sudah Vote
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3" /> Menilai Komik
                        </>
                      )}
                    </span>
                  )}
                  {cb?.allowGoldenUpvote && (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        spentGolden ? 'text-slate-500 line-through' : 'text-amber-300'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      {spentGolden ? 'Emas Terpakai' : 'Emas 1x'}
                    </span>
                  )}
                </div>
              </div>

              <span className="font-mono text-sm font-black text-amber-300 tabular-nums shrink-0">
                {p.score} pt
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
