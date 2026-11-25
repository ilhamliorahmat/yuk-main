'use client';

import React, { useMemo } from 'react';
import { Vote } from 'lucide-react';
import type { VoteState } from '@/lib/games/types';
import { evaluateMajorityVoteProgress } from '@/lib/games/voting/engine';

interface AccusationVoteBannerProps {
  activeVote: VoteState;
  eligibleVoterUids: readonly string[];
  myUid: string;
  isHost: boolean;
  isBrb?: boolean;
  isEliminated?: boolean;
  actionBusy: boolean;
  title: string;
  yesButtonLabel: string;
  noButtonLabel?: string;
  yesRecordedLabel: string;
  noRecordedLabel?: string;
  accentBorderClassName?: string;
  onCastVote: (choice: 'yes' | 'no') => void;
  onCancelVote: () => void;
}

export function AccusationVoteBanner({
  activeVote,
  eligibleVoterUids,
  myUid,
  isHost,
  isBrb = false,
  isEliminated = false,
  actionBusy,
  title,
  yesButtonLabel,
  noButtonLabel = 'Tidak Setuju',
  yesRecordedLabel,
  noRecordedLabel = 'Tidak Setuju',
  accentBorderClassName = 'border-amber-500/60',
  onCastVote,
  onCancelVote,
}: AccusationVoteBannerProps) {
  const progress = useMemo(
    () => evaluateMajorityVoteProgress(activeVote.votes, eligibleVoterUids),
    [activeVote.votes, eligibleVoterUids],
  );

  const isTargetOfVote = activeVote.targetUid === myUid;
  const myVoteChoice = activeVote.votes[myUid];
  const progressPct =
    progress.requiredYes > 0
      ? Math.min(100, Math.round((progress.yesCount / progress.requiredYes) * 100))
      : 0;

  return (
    <section
      className={`bg-[#131A24] border ${accentBorderClassName} rounded-2xl p-4 sm:p-5 space-y-3.5`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Vote className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Diajukan oleh {activeVote.initiatorName} ·{' '}
              <span className="font-mono-tabular text-amber-300 font-semibold">
                {progress.yesCount}/{progress.requiredYes} Setuju
              </span>{' '}
              (Mayoritas 50% + 1 dari {progress.totalEligible} pemilih)
            </p>
          </div>
        </div>

        {isHost && (
          <button
            type="button"
            disabled={actionBusy}
            onClick={onCancelVote}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#0B1018] border border-slate-700 text-xs text-slate-300 hover:text-white whitespace-nowrap shrink-0 transition-colors"
          >
            Batalkan Voting
          </button>
        )}
      </div>

      {/* Live 50% + 1 Tally Progress Bar */}
      <div className="rounded-xl bg-[#0B1018] border border-slate-800 px-3.5 py-2.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tabular">
          <span className="text-rose-300 font-semibold">
            Setuju: {progress.yesCount}/{progress.requiredYes}
          </span>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Tolak: {progress.noCount}</span>
            <span>Belum memilih: {progress.remainingCount}</span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-rose-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {isEliminated ? (
        <p className="text-xs text-slate-300 bg-[#0B1018] border border-slate-800 rounded-xl px-3.5 py-2.5">
          Kamu sudah tereliminasi dan berstatus penonton. Tunggu pemain yang bertahan menyelesaikan voting.
        </p>
      ) : isBrb ? (
        <p className="text-xs text-slate-300 bg-[#0B1018] border border-slate-800 rounded-xl px-3.5 py-2.5">
          Kamu sedang berstatus BRB sehingga tidak masuk hitungan pemilih pada voting ini.
        </p>
      ) : isTargetOfVote ? (
        <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-xl px-3.5 py-2.5">
          Kamu sedang dituduh! Tunggu hasil suara pemain lain.
        </p>
      ) : myVoteChoice ? (
        <p className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-3.5 py-2.5">
          Suaramu ({myVoteChoice === 'yes' ? yesRecordedLabel : noRecordedLabel}) telah tercatat. Menunggu suara pemain lain...
        </p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onCastVote('yes')}
            className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {yesButtonLabel}
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onCastVote('no')}
            className="flex-1 min-h-[44px] rounded-xl bg-[#0B1018] border border-slate-700 hover:border-slate-500 text-slate-200 text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {noButtonLabel}
          </button>
        </div>
      )}
    </section>
  );
}
