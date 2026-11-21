<?php
declare(strict_types=1);

require_once __DIR__ . '/engine_common.php';

function yukmain_ms_role_meta(string $role): array
{
    $packs = yukmain_packs();
    $roles = $packs['malam_siluman']['roles'] ?? [];
    return $roles[$role] ?? ['id' => $role, 'name' => ucfirst($role), 'team' => 'warga'];
}

function yukmain_ms_is_siluman(string $role): bool
{
    return $role === 'siluman' || $role === 'siluman_bayangan';
}

function yukmain_ms_resolve_wolf_count(int $playerCount, $mode): int
{
    $safe = max(4, min(12, $playerCount));
    $maxAllowed = max(1, intdiv($safe - 1, 2));
    if (is_int($mode) && in_array($mode, [1, 2, 3], true)) {
        return min($mode, $maxAllowed);
    }
    $auto = $safe >= 9 ? 3 : ($safe >= 6 ? 2 : 1);
    return min($auto, $maxAllowed);
}

function yukmain_ms_build_deck(int $playerCount, array $settings): array
{
    $safe = max(4, min(12, $playerCount));
    $wolfTotal = yukmain_ms_resolve_wolf_count($safe, $settings['wolfCountMode']);
    $er = $settings['enabledRoles'];

    $deck = [];
    if (!empty($er['stealthWolf']) && $wolfTotal >= 2) {
        $deck[] = 'siluman_bayangan';
        for ($i = 1; $i < $wolfTotal; $i++) {
            $deck[] = 'siluman';
        }
    } else {
        for ($i = 0; $i < $wolfTotal; $i++) {
            $deck[] = 'siluman';
        }
    }

    $maxOptional = max(0, $safe - $wolfTotal - 1);
    $requested = [];
    if (!empty($er['seer']))   $requested[] = 'penerawang';
    if (!empty($er['doctor'])) $requested[] = 'tabib';
    if (!empty($er['hunter'])) $requested[] = 'pemburu';
    if (!empty($er['mayor']))  $requested[] = 'pak_rt';
    if (!empty($er['jester'])) $requested[] = 'tumbal';

    foreach (array_slice($requested, 0, $maxOptional) as $optRole) {
        $deck[] = $optRole;
    }
    while (count($deck) < $safe) {
        $deck[] = 'warga';
    }
    return $deck;
}

function yukmain_deal_malam_siluman_round(array $playerUids, array $namesByUid, array $settings, string $roundId): array
{
    $deck = yukmain_ms_build_deck(count($playerUids), $settings);
    $shuffled = yukmain_shuffle($deck);

    $rolesByUid = [];
    $wolfUids = [];
    foreach ($playerUids as $idx => $uid) {
        $role = $shuffled[$idx] ?? 'warga';
        $rolesByUid[$uid] = $role;
        if (yukmain_ms_is_siluman($role)) {
            $wolfUids[] = $uid;
        }
    }

    $wolfNames = array_map(static fn(string $u): string => $namesByUid[$u] ?? 'Siluman', $wolfUids);
    $secretsByUid = [];

    foreach ($playerUids as $uid) {
        $role = $rolesByUid[$uid];
        $meta = yukmain_ms_role_meta($role);
        $fellowWolves = [];
        if (yukmain_ms_is_siluman($role)) {
            foreach ($wolfUids as $wUid) {
                $fellowWolves[] = [
                    'uid'         => $wUid,
                    'displayName' => $namesByUid[$wUid] ?? 'Siluman',
                    'role'        => $rolesByUid[$wUid],
                ];
            }
        }
        $secretsByUid[$uid] = [
            'uid'              => $uid,
            'roundId'          => $roundId,
            'gameType'         => 'malam_siluman',
            'wolfRole'         => $role,
            'wolfTeam'         => $meta['team'] ?? 'warga',
            'fellowWolves'     => $fellowWolves,
            'peekHistory'      => [],
            'lastProtectedUid' => null,
        ];
    }

    return [
        'rolesByUid'      => $rolesByUid,
        'wolfUids'        => $wolfUids,
        'wolfNames'       => $wolfNames,
        'secretsByUid'    => $secretsByUid,
        'deckComposition' => $deck,
    ];
}

function yukmain_resolve_malam_siluman_night(int $nightNumber, array $livingUids, array $rolesByUid, array $namesByUid, array $nightTargetsByUid, ?string $prevDoctorProtected): array
{
    $livingSet = array_flip($livingUids);
    $wolfTargets = [];
    $doctorUid = null;
    $doctorPick = null;
    $seerUid = null;
    $seerPick = null;

    foreach ($livingUids as $uid) {
        $role = $rolesByUid[$uid] ?? 'warga';
        $target = $nightTargetsByUid[$uid] ?? '';
        if (yukmain_ms_is_siluman($role)) {
            if ($target !== '' && isset($livingSet[$target]) && !yukmain_ms_is_siluman($rolesByUid[$target] ?? 'warga')) {
                $wolfTargets[$target] = ($wolfTargets[$target] ?? 0) + 1;
            }
        } elseif ($role === 'tabib') {
            $doctorUid = $uid;
            if ($target !== '' && isset($livingSet[$target]) && $target !== $prevDoctorProtected) {
                $doctorPick = $target;
            }
        } elseif ($role === 'penerawang') {
            $seerUid = $uid;
            if ($target !== '' && isset($livingSet[$target]) && $target !== $uid) {
                $seerPick = $target;
            }
        }
    }

    $wolfTargetUid = null;
    if (!empty($wolfTargets)) {
        $maxCount = max($wolfTargets);
        $tied = array_keys(array_filter($wolfTargets, static fn(int $c): bool => $c === $maxCount));
        $wolfTargetUid = $tied[random_int(0, count($tied) - 1)];
    }

    $saved = $wolfTargetUid !== null && $doctorPick !== null && $wolfTargetUid === $doctorPick;
    $eliminatedUid = ($wolfTargetUid !== null && !$saved) ? $wolfTargetUid : null;

    $seerPeek = null;
    if ($seerUid !== null && $seerPick !== null) {
        $targetRole = $rolesByUid[$seerPick] ?? 'warga';
        // CRITICAL: Siluman Bayangan reads as Aura Warga!
        $apparentTeam = $targetRole === 'siluman' ? 'siluman' : 'warga';
        $seerPeek = [
            'seerUid' => $seerUid,
            'record'  => [
                'night'        => $nightNumber,
                'targetUid'    => $seerPick,
                'targetName'   => $namesByUid[$seerPick] ?? 'Pemain',
                'apparentTeam' => $apparentTeam,
            ],
        ];
    }

    $nextDocProtected = $doctorUid !== null ? $doctorPick : null;
    if ($wolfTargetUid === null) {
        $msg = "Malam #{$nightNumber} berlalu tanpa serangan—semua warga selamat saat fajar menyingsing.";
    } elseif ($saved) {
        $msg = "Terdengar lolongan di Malam #{$nightNumber}, namun Tabib berhasil menyelamatkan target tepat waktu! Tidak ada korban jiwa.";
    } else {
        $victim = $namesByUid[$wolfTargetUid] ?? 'Seorang warga';
        $msg = "Fajar berdarah di Malam #{$nightNumber}: {$victim} ditemukan gugur diterkam Siluman!";
    }

    return [
        'eliminatedUid'               => $eliminatedUid,
        'seerPeek'                    => $seerPeek,
        'nextDoctorLastProtectedUid'  => $nextDocProtected,
        'dawnMessage'                 => $msg,
    ];
}

function yukmain_tally_ms_day_votes(array $votesByUid, array $livingUids, array $rolesByUid): array
{
    $livingSet = array_flip($livingUids);
    $voteTally = [];
    $skipVotes = 0;

    foreach ($livingUids as $voterUid) {
        $pick = $votesByUid[$voterUid] ?? null;
        if (!$pick) continue;
        $weight = (($rolesByUid[$voterUid] ?? 'warga') === 'pak_rt') ? 2 : 1;
        if ($pick === 'skip') {
            $skipVotes += $weight;
            continue;
        }
        if (isset($livingSet[$pick]) && $pick !== $voterUid) {
            $voteTally[$pick] = ($voteTally[$pick] ?? 0) + $weight;
        }
    }

    if (empty($voteTally)) {
        return ['executedUid' => null, 'isTie' => false, 'voteTally' => $voteTally];
    }
    $maxTarget = max($voteTally);
    if ($skipVotes >= $maxTarget) {
        return ['executedUid' => null, 'isTie' => ($skipVotes === $maxTarget), 'voteTally' => $voteTally];
    }
    $top = array_keys(array_filter($voteTally, static fn(int $v): bool => $v === $maxTarget));
    if (count($top) > 1) {
        return ['executedUid' => null, 'isTie' => true, 'voteTally' => $voteTally];
    }
    return ['executedUid' => $top[0], 'isTie' => false, 'voteTally' => $voteTally];
}

function yukmain_eval_ms_victory(array $livingUids, array $rolesByUid, array $namesByUid, ?string $dayExecutedUid = null): array
{
    if ($dayExecutedUid !== null && ($rolesByUid[$dayExecutedUid] ?? '') === 'tumbal') {
        $name = $namesByUid[$dayExecutedUid] ?? 'Tumbal';
        return [
            'winnerTeam'      => 'tumbal',
            'tumbalWinnerUid' => $dayExecutedUid,
            'reason'          => "JEBAKAN BERHASIL! {$name} ternyata adalah TUMBAL — ia memenangkan permainan sendirian (+4 poin) setelah dieksekusi desa!",
        ];
    }

    $livingWolves = 0;
    $livingNonWolves = 0;
    foreach ($livingUids as $uid) {
        if (yukmain_ms_is_siluman($rolesByUid[$uid] ?? 'warga')) {
            $livingWolves++;
        } else {
            $livingNonWolves++;
        }
    }

    if ($livingWolves === 0) {
        return [
            'winnerTeam'      => 'warga',
            'tumbalWinnerUid' => null,
            'reason'          => 'Seluruh Siluman berhasil ditumpas! Desa kembali aman dan Tim Warga memenangkan permainan!',
        ];
    }
    if ($livingWolves >= $livingNonWolves) {
        return [
            'winnerTeam'      => 'siluman',
            'tumbalWinnerUid' => null,
            'reason'          => "Jumlah Siluman ({$livingWolves}) telah menyamai atau melebihi sisa penduduk ({$livingNonWolves})! Kawanan Siluman menguasai desa!",
        ];
    }
    return ['winnerTeam' => null, 'tumbalWinnerUid' => null, 'reason' => null];
}

function yukmain_calc_ms_deltas(array $participantUids, array $livingUids, array $rolesByUid, string $winnerTeam, ?string $tumbalUid = null): array
{
    $deltas = array_fill_keys($participantUids, 0);
    if ($winnerTeam === 'tumbal') {
        if ($tumbalUid !== null && array_key_exists($tumbalUid, $deltas)) {
            $deltas[$tumbalUid] = 4;
        }
        return $deltas;
    }

    $livingSet = array_flip($livingUids);
    foreach ($participantUids as $uid) {
        $role = $rolesByUid[$uid] ?? 'warga';
        $isWolf = yukmain_ms_is_siluman($role);
        $isCitizen = ($role !== 'tumbal' && !$isWolf);
        $won = ($winnerTeam === 'siluman' && $isWolf) || ($winnerTeam === 'warga' && $isCitizen);
        if ($won) {
            $deltas[$uid] = isset($livingSet[$uid]) ? 3 : 2;
        }
    }
    return $deltas;
}

function yukmain_build_dead_player(string $uid, string $name, string $cause, int $dayOrNight, string $role, bool $revealRole): array
{
    $meta = yukmain_ms_role_meta($role);
    return [
        'uid'             => $uid,
        'displayName'     => $name,
        'cause'           => $cause,
        'dayOrNightNumber'=> $dayOrNight,
        'revealedRole'    => $revealRole ? $role : null,
        'revealedTeam'    => $revealRole ? ($meta['team'] ?? 'warga') : null,
    ];
}
