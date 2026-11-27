<?php
declare(strict_types=1);

require_once __DIR__ . '/engine_common.php';

const YUKMAIN_MEJA_MIN_PLAYERS = 2;
const YUKMAIN_MEJA_HAND_SIZE = 5;
const YUKMAIN_MEJA_MAX_PLAY = 3;
const YUKMAIN_MEJA_CEPAT_MAX_SUBROUNDS = 5;

function yukmain_meja_rank_label(string $rank): string
{
    return match ($rank) {
        'raja'  => 'Raja',
        'ratu'  => 'Ratu',
        'as'    => 'As',
        'joker' => 'Joker',
        default => 'Raja',
    };
}

function yukmain_meja_pick_table_rank(): string
{
    $ranks = ['raja', 'ratu', 'as'];
    return $ranks[random_int(0, count($ranks) - 1)];
}

function yukmain_meja_build_deck(int $playerCount, int $subRoundNumber): array
{
    $mult = $playerCount > 6 ? 2 : 1;
    $cards = [];
    $seq = 1;

    for ($m = 0; $m < $mult; $m++) {
        for ($i = 0; $i < 12; $i++) {
            $cards[] = ['id' => "m_{$subRoundNumber}_r_{$seq}", 'rank' => 'raja'];
            $seq++;
        }
        for ($i = 0; $i < 12; $i++) {
            $cards[] = ['id' => "m_{$subRoundNumber}_q_{$seq}", 'rank' => 'ratu'];
            $seq++;
        }
        for ($i = 0; $i < 12; $i++) {
            $cards[] = ['id' => "m_{$subRoundNumber}_a_{$seq}", 'rank' => 'as'];
            $seq++;
        }
        for ($i = 0; $i < 4; $i++) {
            $cards[] = ['id' => "m_{$subRoundNumber}_j_{$seq}", 'rank' => 'joker'];
            $seq++;
        }
    }

    return yukmain_shuffle($cards);
}

function yukmain_meja_is_claim_honest(array $cards, string $tableRank): bool
{
    if (empty($cards)) {
        return false;
    }
    foreach ($cards as $card) {
        $r = (string) ($card['rank'] ?? '');
        if ($r !== $tableRank && $r !== 'joker') {
            return false;
        }
    }
    return true;
}

function yukmain_meja_pick_next_turn_uid(array $turnOrder, array $livingUids, array $handCountByUid, string $afterUid): string
{
    $livingSet = array_flip($livingUids);
    $orderedLiving = array_values(array_filter($turnOrder, static fn(string $u): bool => isset($livingSet[$u])));
    $count = count($orderedLiving);
    if ($count === 0) {
        return '';
    }

    $startIdx = array_search($afterUid, $orderedLiving, true);
    if ($startIdx === false) {
        $startIdx = 0;
    }

    $rotated = [];
    for ($offset = 1; $offset <= $count; $offset++) {
        $rotated[] = $orderedLiving[($startIdx + $offset) % $count];
    }

    foreach ($rotated as $uid) {
        if ($uid !== $afterUid && ((int) ($handCountByUid[$uid] ?? 0)) > 0) {
            return $uid;
        }
    }

    foreach ($rotated as $uid) {
        if ($uid !== $afterUid) {
            return $uid;
        }
    }

    return $orderedLiving[0];
}

function yukmain_meja_compute_leaders(array $participantUids, array $namesByUid, array $playerScoresByUid, array $scoreDeltas = []): array
{
    $maxScore = -1;
    foreach ($participantUids as $uid) {
        $total = ((int) ($playerScoresByUid[$uid] ?? 0)) + ((int) ($scoreDeltas[$uid] ?? 0));
        if ($total > $maxScore) {
            $maxScore = $total;
        }
    }

    $winnerUids = [];
    $winnerNames = [];
    foreach ($participantUids as $uid) {
        $total = ((int) ($playerScoresByUid[$uid] ?? 0)) + ((int) ($scoreDeltas[$uid] ?? 0));
        if ($total === $maxScore) {
            $winnerUids[] = $uid;
            $winnerNames[] = $namesByUid[$uid] ?? 'Pemain';
        }
    }

    return ['winnerUids' => $winnerUids, 'winnerNames' => $winnerNames];
}

function yukmain_deal_meja_pembohong_round(string $roundId, int $roundNumber, array $players, $settingsRaw, int $nowMs): array
{
    $settings = yukmain_sanitize_meja_pembohong_settings($settingsRaw);
    $active = yukmain_filter_active_players($players);
    if (count($active) < YUKMAIN_MEJA_MIN_PLAYERS) {
        throw new RuntimeException('Minimal 2 pemain aktif dibutuhkan untuk memulai Meja Pembohong.');
    }

    $participantUids = [];
    $namesByUid = [];
    foreach ($active as $p) {
        $participantUids[] = $p['uid'];
        $namesByUid[$p['uid']] = $p['displayName'];
    }

    $turnOrder = yukmain_shuffle($participantUids);
    $tableRank = yukmain_meja_pick_table_rank();
    $deck = yukmain_meja_build_deck(count($active), 1);

    $handsByUid = [];
    $trapSlotsByUid = [];
    $handCountByUid = [];
    $shotsTakenByUid = [];
    $playerSecrets = [];

    $cursor = 0;
    foreach ($turnOrder as $uid) {
        $hand = array_slice($deck, $cursor, YUKMAIN_MEJA_HAND_SIZE);
        $cursor += YUKMAIN_MEJA_HAND_SIZE;
        $handsByUid[$uid] = $hand;
        $handCountByUid[$uid] = count($hand);
        $shotsTakenByUid[$uid] = 0;
        $trapSlotsByUid[$uid] = random_int(1, 6);

        $playerSecrets[$uid] = [
            'uid'       => $uid,
            'roundId'   => $roundId,
            'gameType'  => 'meja_pembohong',
            'mejaHand'  => $hand,
            'createdAt' => $nowMs,
        ];
    }

    $firstUid = $turnOrder[0];
    $firstName = $namesByUid[$firstUid] ?? 'Pemain';
    $rankUpper = mb_strtoupper(yukmain_meja_rank_label($tableRank), 'UTF-8');

    $state = [
        'phase'                 => 'playing',
        'mode'                  => $settings['mode'],
        'subRoundNumber'        => 1,
        'maxSubRounds'          => $settings['mode'] === 'cepat' ? YUKMAIN_MEJA_CEPAT_MAX_SUBROUNDS : null,
        'tableRank'             => $tableRank,
        'participantUids'       => $participantUids,
        'participantNamesByUid' => $namesByUid,
        'livingUids'            => $turnOrder,
        'eliminatedUids'        => [],
        'turnOrder'             => $turnOrder,
        'currentTurnUid'        => $firstUid,
        'currentTurnName'       => $firstName,
        'handCountByUid'        => $handCountByUid,
        'shotsTakenByUid'       => $shotsTakenByUid,
        'pileCardCount'         => 0,
        'lastClaim'             => null,
        'lastChallenge'         => null,
        'winnerUids'            => [],
        'winnerNames'           => [],
        'eventLog'              => [
            "Meja dibuka! Pangkat meja: {$rankUpper}. Giliran pertama: {$firstName}.",
        ],
    ];

    $serverState = [
        'roundId'               => $roundId,
        'roundNumber'           => $roundNumber,
        'locationName'          => 'Meja ' . yukmain_meja_rank_label($tableRank),
        'spyUids'               => [],
        'spyNames'              => [],
        'mejaHandsByUid'        => $handsByUid,
        'mejaPendingClaimCards' => [],
        'mejaTrapSlotByUid'     => $trapSlotsByUid,
        'createdAtMs'           => $nowMs,
    ];

    return [
        'mejaPembohongState' => $state,
        'serverState'        => $serverState,
        'playerSecrets'      => $playerSecrets,
    ];
}

function yukmain_play_meja_cards(array $state, array $handsByUid, string $actorUid, array $rawIds, string $claimId): array
{
    if (($state['phase'] ?? '') !== 'playing') {
        throw new RuntimeException('Tidak dapat menaruh kartu saat ini.');
    }
    if (($state['currentTurnUid'] ?? '') !== $actorUid) {
        throw new RuntimeException('Belum giliranmu untuk mengambil aksi.');
    }
    if (!in_array($actorUid, $state['livingUids'] ?? [], true)) {
        throw new RuntimeException('Pemain yang sudah tereliminasi tidak dapat bermain.');
    }

    $uniqueIds = [];
    foreach ($rawIds as $id) {
        $clean = trim((string) $id);
        if ($clean !== '' && !in_array($clean, $uniqueIds, true)) {
            $uniqueIds[] = $clean;
        }
    }
    if (count($uniqueIds) < 1 || count($uniqueIds) > YUKMAIN_MEJA_MAX_PLAY) {
        throw new RuntimeException('Pilih antara 1 hingga 3 kartu untuk ditaruh.');
    }

    $currentHand = is_array($handsByUid[$actorUid] ?? null) ? $handsByUid[$actorUid] : [];
    $cardById = [];
    foreach ($currentHand as $c) {
        $cardById[(string) ($c['id'] ?? '')] = $c;
    }

    $playedCards = [];
    foreach ($uniqueIds as $id) {
        if (!isset($cardById[$id])) {
            throw new RuntimeException('Salah satu kartu yang dipilih tidak ada di tanganmu.');
        }
        $playedCards[] = $cardById[$id];
    }

    $playedSet = array_flip($uniqueIds);
    $remainingHand = array_values(array_filter(
        $currentHand,
        static fn(array $c): bool => !isset($playedSet[(string) ($c['id'] ?? '')])
    ));

    $nextHandsByUid = $handsByUid;
    $nextHandsByUid[$actorUid] = $remainingHand;

    $nextHandCount = $state['handCountByUid'] ?? [];
    $nextHandCount[$actorUid] = count($remainingHand);

    $actorName = $state['participantNamesByUid'][$actorUid] ?? 'Pemain';
    $nextTurnUid = yukmain_meja_pick_next_turn_uid(
        $state['turnOrder'] ?? [],
        $state['livingUids'] ?? [],
        $nextHandCount,
        $actorUid
    );
    $nextTurnName = $state['participantNamesByUid'][$nextTurnUid] ?? 'Pemain';
    $rankLabel = yukmain_meja_rank_label((string) ($state['tableRank'] ?? 'raja'));
    $playedCount = count($playedCards);
    $logEntry = "{$actorName} menaruh {$playedCount} kartu tertutup & mengklaim \"{$playedCount}x {$rankLabel}\".";

    $eventLog = array_slice(array_merge([$logEntry], $state['eventLog'] ?? []), 0, 12);

    $nextState = array_merge($state, [
        'currentTurnUid'  => $nextTurnUid,
        'currentTurnName' => $nextTurnName,
        'handCountByUid'  => $nextHandCount,
        'pileCardCount'   => ((int) ($state['pileCardCount'] ?? 0)) + $playedCount,
        'lastClaim'       => [
            'claimId'     => $claimId,
            'byUid'       => $actorUid,
            'byName'      => $actorName,
            'cardCount'   => $playedCount,
            'claimedRank' => (string) ($state['tableRank'] ?? 'raja'),
        ],
        'eventLog'        => $eventLog,
    ]);

    return [
        'nextState'      => $nextState,
        'nextHandsByUid' => $nextHandsByUid,
        'playedCards'    => $playedCards,
    ];
}

function yukmain_resolve_meja_challenge(
    array $state,
    string $challengerUid,
    array $pendingClaimCards,
    array $trapSlotByUid,
    array $playerScoresByUid,
    int $roundNumber,
    int $nowMs
): array {
    if (($state['phase'] ?? '') !== 'playing') {
        throw new RuntimeException('Tuduhan BOHONG hanya dapat dilakukan saat fase bermain.');
    }
    if (($state['currentTurnUid'] ?? '') !== $challengerUid) {
        throw new RuntimeException('Hanya pemain yang sedang mendapat giliran yang dapat berteriak BOHONG.');
    }
    $lastClaim = $state['lastClaim'] ?? null;
    if (!is_array($lastClaim) || empty($pendingClaimCards)) {
        throw new RuntimeException('Belum ada kartu taruhan di meja untuk dituduh.');
    }
    if (($lastClaim['byUid'] ?? '') === $challengerUid) {
        throw new RuntimeException('Kamu tidak bisa menuduh taruhanmu sendiri.');
    }

    $accusedUid = (string) $lastClaim['byUid'];
    $accusedName = (string) ($lastClaim['byName'] ?? 'Pemain');
    $challengerName = $state['participantNamesByUid'][$challengerUid] ?? 'Pemain';
    $claimedRank = (string) ($lastClaim['claimedRank'] ?? 'raja');

    $honest = yukmain_meja_is_claim_honest($pendingClaimCards, $claimedRank);
    $wasLie = !$honest;

    $loserUid = $wasLie ? $accusedUid : $challengerUid;
    $loserName = $wasLie ? $accusedName : $challengerName;
    $winnerUid = $wasLie ? $challengerUid : $accusedUid;
    $winnerName = $wasLie ? $challengerName : $accusedName;

    $scoreDeltas = [];
    $nextShots = $state['shotsTakenByUid'] ?? [];
    $nextLiving = array_values($state['livingUids'] ?? []);
    $nextEliminated = array_values($state['eliminatedUids'] ?? []);
    $chamberStep = null;
    $hitBullet = false;
    $eliminatedUid = null;
    $rankLabel = yukmain_meja_rank_label($claimedRank);
    $mode = (string) ($state['mode'] ?? 'silinder');

    if ($mode === 'silinder') {
        $prevShots = (int) ($nextShots[$loserUid] ?? 0);
        $chamberStep = min(6, $prevShots + 1);
        $nextShots[$loserUid] = $chamberStep;
        $trapSlot = max(1, min(6, (int) ($trapSlotByUid[$loserUid] ?? 6)));
        $hitBullet = $chamberStep >= $trapSlot;

        if ($hitBullet) {
            $eliminatedUid = $loserUid;
            $nextLiving = array_values(array_filter($nextLiving, static fn(string $u): bool => $u !== $loserUid));
            if (!in_array($loserUid, $nextEliminated, true)) {
                $nextEliminated[] = $loserUid;
            }
            foreach ($nextLiving as $u) {
                $scoreDeltas[$u] = ($scoreDeltas[$u] ?? 0) + 1;
            }
            $scoreDeltas[$winnerUid] = ($scoreDeltas[$winnerUid] ?? 0) + 1;
            $summary = $wasLie
                ? "{$challengerName} membongkar kebohongan {$accusedName} (bukan {$rankLabel})! Pelatuk ke-{$chamberStep}/6 MELETUS — {$loserName} tereliminasi!"
                : "{$accusedName} ternyata JUJUR! {$challengerName} salah tuduh dan pelatuk ke-{$chamberStep}/6 MELETUS — {$loserName} tereliminasi!";
        } else {
            $scoreDeltas[$loserUid] = ($scoreDeltas[$loserUid] ?? 0) + 1;
            $scoreDeltas[$winnerUid] = ($scoreDeltas[$winnerUid] ?? 0) + 1;
            $summary = $wasLie
                ? "{$challengerName} membongkar kebohongan {$accusedName}! Pelatuk ke-{$chamberStep}/6 hanya berbunyi *KLIK* — {$loserName} masih selamat!"
                : "{$accusedName} ternyata JUJUR! Pelatuk ke-{$chamberStep}/6 untuk {$challengerName} hanya berbunyi *KLIK* — nyaris kena!";
        }
    } else {
        $scoreDeltas[$winnerUid] = 2;
        $summary = $wasLie
            ? "TERBONGKAR! {$accusedName} berbohong — {$challengerName} menang duel (+2 poin)!"
            : "JUJUR 100%! {$accusedName} lolos dari tuduhan {$challengerName} (+2 poin)!";
    }

    $challengeReveal = [
        'challengerUid'  => $challengerUid,
        'challengerName' => $challengerName,
        'accusedUid'     => $accusedUid,
        'accusedName'    => $accusedName,
        'claimedRank'    => $claimedRank,
        'revealedCards'  => $pendingClaimCards,
        'wasLie'         => $wasLie,
        'loserUid'       => $loserUid,
        'loserName'      => $loserName,
        'winnerUid'      => $winnerUid,
        'winnerName'     => $winnerName,
        'chamberStep'    => $chamberStep,
        'hitBullet'      => $hitBullet,
        'eliminatedUid'  => $eliminatedUid,
        'summary'        => $summary,
    ];

    $matchFinished = false;
    $winnerUids = [];
    $winnerNames = [];
    $maxSub = $state['maxSubRounds'] ?? null;

    if ($mode === 'silinder' && count($nextLiving) <= 1) {
        $matchFinished = true;
        $winnerUids = $nextLiving;
        foreach ($nextLiving as $u) {
            $winnerNames[] = $state['participantNamesByUid'][$u] ?? 'Juara';
        }
        if (isset($nextLiving[0])) {
            $scoreDeltas[$nextLiving[0]] = ($scoreDeltas[$nextLiving[0]] ?? 0) + 4;
        }
    } elseif ($mode === 'cepat' && $maxSub !== null && ((int) ($state['subRoundNumber'] ?? 1)) >= ((int) $maxSub)) {
        $matchFinished = true;
        $leaders = yukmain_meja_compute_leaders(
            $state['participantUids'] ?? [],
            $state['participantNamesByUid'] ?? [],
            $playerScoresByUid,
            $scoreDeltas
        );
        $winnerUids = $leaders['winnerUids'];
        $winnerNames = $leaders['winnerNames'];
    }

    $nextState = array_merge($state, [
        'phase'           => $matchFinished ? 'reveal' : 'challenge_reveal',
        'livingUids'      => $nextLiving,
        'eliminatedUids'  => $nextEliminated,
        'shotsTakenByUid' => $nextShots,
        'lastChallenge'   => $challengeReveal,
        'winnerUids'      => $winnerUids,
        'winnerNames'     => $winnerNames,
        'eventLog'        => array_slice(array_merge([$summary], $state['eventLog'] ?? []), 0, 12),
    ]);

    $roundResult = null;
    if ($matchFinished) {
        $tableLabel = yukmain_meja_rank_label((string) ($state['tableRank'] ?? 'raja'));
        if ($mode === 'silinder') {
            $champName = $winnerNames[0] ?? 'Pemain';
            $reason = "{$summary} {$champName} bertahan paling akhir dan menjuarai Meja Pembohong (+4 poin juara)!";
        } else {
            $label = !empty($winnerNames) ? implode(' & ', $winnerNames) : $winnerName;
            $reason = "{$summary} 5 Tangan Skor Cepat selesai — Pemenang poin tertinggi: {$label}!";
        }
        $roundResult = [
            'roundNumber'     => $roundNumber,
            'winnerTeam'      => 'pembohong',
            'reason'          => $reason,
            'locationName'    => "Meja {$tableLabel}",
            'guessedLocation' => null,
            'spyUids'         => $winnerUids,
            'spyNames'        => $winnerNames,
            'resolvedAtMs'    => $nowMs,
            'scoresApplied'   => true,
        ];
    }

    return [
        'nextState'       => $nextState,
        'challengeReveal' => $challengeReveal,
        'scoreDeltas'     => $scoreDeltas,
        'matchFinished'   => $matchFinished,
        'roundResult'     => $roundResult,
    ];
}

function yukmain_start_next_meja_sub_round(array $state): array
{
    $mode = (string) ($state['mode'] ?? 'silinder');
    $living = array_values($state['livingUids'] ?? []);
    if ($mode === 'silinder' && count($living) <= 1) {
        return [
            'nextState'      => array_merge($state, ['phase' => 'reveal']),
            'nextHandsByUid' => [],
            'matchFinished'  => true,
        ];
    }

    $nextSub = ((int) ($state['subRoundNumber'] ?? 1)) + 1;
    $maxSub = $state['maxSubRounds'] ?? null;
    if ($mode === 'cepat' && $maxSub !== null && $nextSub > ((int) $maxSub)) {
        return [
            'nextState'      => array_merge($state, ['phase' => 'reveal']),
            'nextHandsByUid' => [],
            'matchFinished'  => true,
        ];
    }

    $livingSet = array_flip($living);
    $nextTurnOrder = array_values(array_filter(
        $state['turnOrder'] ?? [],
        static fn(string $u): bool => isset($livingSet[$u])
    ));

    $tableRank = yukmain_meja_pick_table_rank();
    $deck = yukmain_meja_build_deck(count($nextTurnOrder), $nextSub);

    $nextHandsByUid = [];
    $nextHandCountByUid = $state['handCountByUid'] ?? [];
    foreach (($state['participantUids'] ?? []) as $u) {
        $nextHandCountByUid[$u] = 0;
    }

    $cursor = 0;
    foreach ($nextTurnOrder as $uid) {
        $hand = array_slice($deck, $cursor, YUKMAIN_MEJA_HAND_SIZE);
        $cursor += YUKMAIN_MEJA_HAND_SIZE;
        $nextHandsByUid[$uid] = $hand;
        $nextHandCountByUid[$uid] = count($hand);
    }

    $countLiving = count($nextTurnOrder);
    $startIdx = $countLiving > 0 ? (($nextSub - 1) % $countLiving) : 0;
    $firstUid = $nextTurnOrder[$startIdx] ?? ($living[0] ?? '');
    $firstName = $state['participantNamesByUid'][$firstUid] ?? 'Pemain';
    $rankUpper = mb_strtoupper(yukmain_meja_rank_label($tableRank), 'UTF-8');

    $nextState = array_merge($state, [
        'phase'           => 'playing',
        'subRoundNumber'  => $nextSub,
        'tableRank'       => $tableRank,
        'turnOrder'       => $nextTurnOrder,
        'currentTurnUid'  => $firstUid,
        'currentTurnName' => $firstName,
        'handCountByUid'  => $nextHandCountByUid,
        'pileCardCount'   => 0,
        'lastClaim'       => null,
        'lastChallenge'   => null,
        'eventLog'        => array_slice(
            array_merge(
                ["Tangan #{$nextSub} dibuka! Meja: {$rankUpper}. Giliran: {$firstName}."],
                $state['eventLog'] ?? []
            ),
            0,
            12
        ),
    ]);

    return [
        'nextState'      => $nextState,
        'nextHandsByUid' => $nextHandsByUid,
        'matchFinished'  => false,
    ];
}

function yukmain_mp_ensure_turn_valid(array &$room, array $players, int $nowMs): ?string
{
    if (($room['status'] ?? 'lobby') !== 'playing' || empty($room['mejaPembohongState'])) {
        return null;
    }
    $mp = $room['mejaPembohongState'];
    if (($mp['phase'] ?? '') === 'reveal') {
        return null;
    }

    $playersByUid = [];
    foreach ($players as $p) {
        $playersByUid[$p['uid']] = $p;
    }

    $validLiving = [];
    foreach (($mp['livingUids'] ?? []) as $uid) {
        $p = $playersByUid[$uid] ?? null;
        if ($p && empty($p['isBrb'])) {
            $validLiving[] = $uid;
        }
    }

    if (count($validLiving) <= 1) {
        $champUid = $validLiving[0] ?? ($mp['livingUids'][0] ?? '');
        $champName = $mp['participantNamesByUid'][$champUid] ?? 'Pemain';
        $reason = "Pemain lain keluar/BRB. {$champName} memenangkan Meja Pembohong!";
        $tableLabel = yukmain_meja_rank_label((string) ($mp['tableRank'] ?? 'raja'));

        $room['status'] = 'round_end';
        $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
        $room['mejaPembohongState'] = array_merge($mp, [
            'phase'       => 'reveal',
            'livingUids'  => $validLiving,
            'winnerUids'  => $champUid !== '' ? [$champUid] : [],
            'winnerNames' => $champUid !== '' ? [$champName] : [],
            'eventLog'    => array_slice(array_merge([$reason], $mp['eventLog'] ?? []), 0, 12),
        ]);
        $room['lastRoundResult'] = [
            'roundNumber'     => (int) ($room['roundNumber'] ?? 1),
            'winnerTeam'      => 'pembohong',
            'reason'          => $reason,
            'locationName'    => "Meja {$tableLabel}",
            'guessedLocation' => null,
            'spyUids'         => $champUid !== '' ? [$champUid] : [],
            'spyNames'        => $champUid !== '' ? [$champName] : [],
            'resolvedAtMs'    => $nowMs,
            'scoresApplied'   => true,
        ];
        $room['updatedAt'] = $nowMs;
        return $reason;
    }

    if (!in_array($mp['currentTurnUid'] ?? '', $validLiving, true)) {
        $nextUid = $validLiving[0];
        $nextName = $mp['participantNamesByUid'][$nextUid] ?? 'Pemain';
        $msg = "Giliran diteruskan ke {$nextName} karena pemain sebelumnya keluar/BRB.";
        $room['mejaPembohongState'] = array_merge($mp, [
            'livingUids'      => $validLiving,
            'currentTurnUid'  => $nextUid,
            'currentTurnName' => $nextName,
            'eventLog'        => array_slice(array_merge([$msg], $mp['eventLog'] ?? []), 0, 12),
        ]);
        $room['updatedAt'] = $nowMs;
    }

    return null;
}
