export type MajorityVoteChoice = 'yes' | 'no';

export type MajorityVoteOutcome = 'pending' | 'convicted' | 'acquitted';

export interface MajorityVoteProgress {
  outcome: MajorityVoteOutcome;
  yesCount: number;
  noCount: number;
  requiredYes: number;
  totalEligible: number;
  remainingCount: number;
}

/**
 * Computes the strict 50% + 1 majority threshold for a pool of eligible voters.
 * - N = 1 -> 1
 * - N = 2 -> 2
 * - N = 3 -> 2
 * - N = 4 -> 3
 * - N = 5 -> 3
 * - N = 6 -> 4
 */
export function getMajorityThreshold(totalEligible: number): number {
  if (!Number.isFinite(totalEligible) || totalEligible <= 0) {
    return 0;
  }
  return Math.floor(totalEligible / 2) + 1;
}

/**
 * Resolves the deduplicated list of eligible voters for a Yes/No accusation vote.
 * Automatically excludes BRB players, the accused target, and any game-specific
 * excluded seats (such as eliminated spectators in Kata-Kata Hari Ini).
 */
export function getEligibleMajorityVoterUids(params: {
  players: readonly { uid: string; isBrb?: boolean }[];
  targetUid: string | null | undefined;
  excludedUids?: readonly string[];
}): string[] {
  const excludedSet = new Set(params.excludedUids ?? []);
  const seen = new Set<string>();
  const eligible: string[] = [];

  for (const player of params.players) {
    if (player.isBrb) continue;
    if (params.targetUid && player.uid === params.targetUid) continue;
    if (excludedSet.has(player.uid)) continue;
    if (seen.has(player.uid)) continue;
    seen.add(player.uid);
    eligible.push(player.uid);
  }

  return eligible;
}

/**
 * Shared 50% + 1 majority voting evaluator used by games with Yes/No accusation
 * or consensus ballots (Yang Bener Yang Mana, Kata-Kata Hari Ini, and future modes).
 *
 * Rules:
 * - Only votes cast by UIDs in `eligibleVoterUids` are counted.
 * - A single `'no'` vote does NOT immediately cancel the ballot unless it becomes
 *   mathematically impossible for `'yes'` votes to reach `50% + 1`.
 * - Resolves `'convicted'` as soon as `yesCount >= requiredYes`.
 * - Resolves `'acquitted'` as soon as `totalEligible === 0` or
 *   `(totalEligible - noCount) < requiredYes`.
 * - Otherwise remains `'pending'`.
 */
export function evaluateMajorityVoteProgress(
  votes: Record<string, MajorityVoteChoice>,
  eligibleVoterUids: readonly string[],
): MajorityVoteProgress {
  const uniqueEligible = Array.from(new Set(eligibleVoterUids));
  let yesCount = 0;
  let noCount = 0;

  for (const uid of uniqueEligible) {
    const choice = votes[uid];
    if (choice === 'yes') {
      yesCount += 1;
    } else if (choice === 'no') {
      noCount += 1;
    }
  }

  const totalEligible = uniqueEligible.length;
  const requiredYes = getMajorityThreshold(totalEligible);
  const remainingCount = Math.max(0, totalEligible - yesCount - noCount);

  if (totalEligible === 0) {
    return {
      outcome: 'acquitted',
      yesCount,
      noCount,
      requiredYes,
      totalEligible,
      remainingCount: 0,
    };
  }

  if (yesCount >= requiredYes) {
    return {
      outcome: 'convicted',
      yesCount,
      noCount,
      requiredYes,
      totalEligible,
      remainingCount,
    };
  }

  const maxPossibleYes = totalEligible - noCount;
  if (maxPossibleYes < requiredYes) {
    return {
      outcome: 'acquitted',
      yesCount,
      noCount,
      requiredYes,
      totalEligible,
      remainingCount,
    };
  }

  return {
    outcome: 'pending',
    yesCount,
    noCount,
    requiredYes,
    totalEligible,
    remainingCount,
  };
}
