<?php
declare(strict_types=1);

require_once __DIR__ . '/engine_common.php';

const YUKMAIN_BERCANDA_HAND_SIZE = 7;
const YUKMAIN_BERCANDA_STANDARD_POINTS = 1;
const YUKMAIN_BERCANDA_GOLDEN_POINTS = 3;

function yukmain_bercanda_draw_next(array $deckIds, array $poolById, array $allPoolIds, array &$excludedIds): array
{
    while (!empty($deckIds)) {
        $candidateId = (string) array_shift($deckIds);
        if (isset($excludedIds[$candidateId])) {
            continue;
        }
        if (isset($poolById[$candidateId])) {
            $excludedIds[$candidateId] = true;
            return ['card' => $poolById[$candidateId], 'nextDeckIds' => $deckIds];
        }
    }

    $available = array_values(array_filter(
        $allPoolIds,
        static fn(string $id): bool => !isset($excludedIds[$id])
    ));
    $deckIds = !empty($available) ? yukmain_shuffle($available) : yukmain_shuffle($allPoolIds);
    $fallbackId = (string) array_shift($deckIds);
    $card = $poolById[$fallbackId] ?? $poolById[$allPoolIds[0]];
    $excludedIds[$card['id']] = true;
    return ['card' => $card, 'nextDeckIds' => $deckIds];
}

function yukmain_merge_bercanda_card_pool(array $enabledPacks, array $customCards = []): array
{
    $packs = yukmain_packs();
    $builtin = $packs['cuma_bercanda']['items'] ?? [];
    $packSet = array_flip(!empty($enabledPacks) ? $enabledPacks : ['tongkrongan', 'kantor_kampus']);

    $filtered = array_values(array_filter(
        $builtin,
        static fn(array $c): bool => isset($packSet[(string) ($c['packId'] ?? '')])
    ));

    $custom = [];
    foreach ($customCards as $idx => $raw) {
        $clean = yukmain_sanitize_custom_bercanda_card($raw, (int) $idx);
        if ($clean !== null) {
            $clean['packId'] = 'custom';
            $clean['packLabel'] = 'Kartu Kustom';
            $custom[] = $clean;
        }
    }

    $combined = array_merge($filtered, $custom);
    return count($combined) >= 16 ? $combined : array_merge($builtin, $custom);
}

function yukmain_create_cuma_bercanda_round(
    array $players,
    int $roundNumber,
    array $enabledPacks,
    array $customCards,
    $settingsRaw,
    ?array $previousHandsByUid,
    ?array $previousDeckIds,
    array $previousGoldenUsedByUid,
    string $roundId,
    int $nowMs
): array {
    $active = yukmain_filter_active_players($players);
    if (count($active) < 2) {
        throw new RuntimeException('Cuma Bercanda membutuhkan minimal 2 pemain aktif (tidak BRB)!');
    }

    $settings = yukmain_sanitize_cuma_bercanda_settings($settingsRaw);
    $pool = yukmain_merge_bercanda_card_pool($enabledPacks, $customCards);
    $poolById = [];
    $allPoolIds = [];
    foreach ($pool as $c) {
        $cid = (string) $c['id'];
        $poolById[$cid] = $c;
        $allPoolIds[] = $cid;
    }

    $excludedIds = [];
    $handsByUid = [];
    foreach ($active as $p) {
        $uid = (string) $p['uid'];
        $prevHand = is_array($previousHandsByUid[$uid] ?? null) ? $previousHandsByUid[$uid] : [];
        $hand = [];
        foreach ($prevHand as $c) {
            $cid = (string) ($c['id'] ?? '');
            if ($cid !== '' && isset($poolById[$cid]) && !isset($excludedIds[$cid]) && count($hand) < YUKMAIN_BERCANDA_HAND_SIZE) {
                $hand[] = $poolById[$cid];
                $excludedIds[$cid] = true;
            }
        }
        $handsByUid[$uid] = $hand;
    }

    if (is_array($previousDeckIds) && !empty($previousDeckIds)) {
        $deckIds = array_values(array_filter(
            array_map('strval', $previousDeckIds),
            static fn(string $id): bool => isset($poolById[$id]) && !isset($excludedIds[$id])
        ));
    } else {
        $remainingIds = array_values(array_filter(
            $allPoolIds,
            static fn(string $id): bool => !isset($excludedIds[$id])
        ));
        $deckIds = yukmain_shuffle($remainingIds);
    }

    $p1 = yukmain_bercanda_draw_next($deckIds, $poolById, $allPoolIds, $excludedIds);
    $deckIds = $p1['nextDeckIds'];
    $p2 = yukmain_bercanda_draw_next($deckIds, $poolById, $allPoolIds, $excludedIds);
    $deckIds = $p2['nextDeckIds'];

    foreach ($active as $p) {
        $uid = (string) $p['uid'];
        while (count($handsByUid[$uid]) < YUKMAIN_BERCANDA_HAND_SIZE) {
            $drawn = yukmain_bercanda_draw_next($deckIds, $poolById, $allPoolIds, $excludedIds);
            $deckIds = $drawn['nextDeckIds'];
            $handsByUid[$uid][] = $drawn['card'];
        }
    }

    $participantUids = [];
    $participantNamesByUid = [];
    $secretsByUid = [];
    foreach ($active as $p) {
        $uid = (string) $p['uid'];
        $participantUids[] = $uid;
        $participantNamesByUid[$uid] = (string) $p['displayName'];
        $secretsByUid[$uid] = [
            'uid'                     => $uid,
            'roundId'                 => $roundId,
            'gameType'                => 'cuma_bercanda',
            'bercandaHand'            => $handsByUid[$uid],
            'bercandaOwnedEntryId'    => null,
            'bercandaSubmittedCardId' => null,
            'createdAt'               => $nowMs,
        ];
    }

    $allPlayerUids = array_flip(array_column($players, 'uid'));
    $goldenUsed = [];
    foreach ($previousGoldenUsedByUid as $gUid) {
        $gStr = (string) $gUid;
        if ($gStr !== '' && isset($allPlayerUids[$gStr]) && !in_array($gStr, $goldenUsed, true)) {
            $goldenUsed[] = $gStr;
        }
    }

    $state = [
        'phase'                 => 'picking',
        'allowGoldenUpvote'     => (bool) $settings['allowGoldenUpvote'],
        'panel1'                => $p1['card'],
        'panel2'                => $p2['card'],
        'participantUids'       => $participantUids,
        'participantNamesByUid' => $participantNamesByUid,
        'submittedUids'         => [],
        'votedUids'             => [],
        'goldenUsedByUid'       => $goldenUsed,
        'entries'               => [],
        'winnerEntryIds'        => [],
        'votesByUid'            => new stdClass(),
    ];

    $serverState = [
        'roundId'             => $roundId,
        'roundNumber'         => $roundNumber,
        'locationName'        => 'Cuma Bercanda',
        'spyUids'             => [],
        'spyNames'            => [],
        'bercandaHandsByUid'  => $handsByUid,
        'bercandaDeckIds'     => $deckIds,
        'bercandaEntriesMeta' => new stdClass(),
        'createdAtMs'         => $nowMs,
    ];

    return [
        'roundId'           => $roundId,
        'roundNumber'       => $roundNumber,
        'cumaBercandaState' => $state,
        'serverState'       => $serverState,
        'secretsByUid'      => $secretsByUid,
    ];
}

function yukmain_submit_bercanda_punchline(array $state, string $uid, string $cardId, array $currentHand): array
{
    if (($state['phase'] ?? '') !== 'picking') {
        throw new RuntimeException('Fase pemilihan kartu sudah ditutup.');
    }
    $participants = $state['participantUids'] ?? [];
    if (!in_array($uid, $participants, true)) {
        throw new RuntimeException('Hanya pemain aktif ronde ini yang bisa mengirim kartu.');
    }
    $submitted = $state['submittedUids'] ?? [];
    if (in_array($uid, $submitted, true)) {
        throw new RuntimeException('Kamu sudah mengirim Panel 3 untuk ronde ini.');
    }

    $chosenCard = null;
    $nextHand = [];
    foreach ($currentHand as $c) {
        if ($chosenCard === null && (string) ($c['id'] ?? '') === $cardId) {
            $chosenCard = $c;
        } else {
            $nextHand[] = $c;
        }
    }

    if ($chosenCard === null) {
        throw new RuntimeException('Kartu pilihan tidak ditemukan di tanganmu.');
    }

    $nextSubmitted = array_values(array_merge($submitted, [$uid]));
    $submittedSet = array_flip($nextSubmitted);
    $allSubmitted = true;
    foreach ($participants as $pUid) {
        if (!isset($submittedSet[(string) $pUid])) {
            $allSubmitted = false;
            break;
        }
    }

    return [
        'chosenCard'        => $chosenCard,
        'nextHand'          => $nextHand,
        'nextSubmittedUids' => $nextSubmitted,
        'allSubmitted'      => $allSubmitted,
    ];
}

function yukmain_transition_bercanda_to_voting(array $state, array $submissionsByUid): array
{
    $participantsSet = array_flip($state['participantUids'] ?? []);
    $pairs = [];
    foreach ($submissionsByUid as $uid => $card) {
        if (isset($participantsSet[(string) $uid]) && is_array($card)) {
            $pairs[] = ['uid' => (string) $uid, 'card' => $card];
        }
    }
    if (empty($pairs)) {
        throw new RuntimeException('Belum ada pemain yang mengirim kartu Panel 3!');
    }

    $shuffled = yukmain_shuffle($pairs);
    $entries = [];
    $entriesMeta = [];
    $ownedEntryIdsByUid = [];
    $names = $state['participantNamesByUid'] ?? [];

    foreach ($shuffled as $index => $pair) {
        $entryId = 'comic_' . ($index + 1);
        $uid = $pair['uid'];
        $panel3 = $pair['card'];
        $entries[] = [
            'entryId'           => $entryId,
            'panel3'            => $panel3,
            'authorUid'         => null,
            'authorName'        => null,
            'standardVoterUids' => [],
            'goldenVoterUids'   => [],
            'totalPoints'       => 0,
        ];
        $entriesMeta[$entryId] = [
            'entryId'    => $entryId,
            'authorUid'  => $uid,
            'authorName' => (string) ($names[$uid] ?? 'Pemain'),
            'panel3'     => $panel3,
        ];
        $ownedEntryIdsByUid[$uid] = $entryId;
    }

    $nextState = $state;
    $nextState['phase'] = 'voting';
    $nextState['entries'] = $entries;
    $nextState['votedUids'] = [];
    $nextState['winnerEntryIds'] = [];
    $nextState['votesByUid'] = new stdClass();

    return [
        'nextState'          => $nextState,
        'entriesMeta'        => $entriesMeta,
        'ownedEntryIdsByUid' => $ownedEntryIdsByUid,
    ];
}

function yukmain_cast_bercanda_upvote(
    array $state,
    array $entriesMeta,
    string $voterUid,
    string $voterName,
    string $kind,
    ?string $targetEntryId
): array {
    if (($state['phase'] ?? '') !== 'voting') {
        throw new RuntimeException('Voting upvote hanya dibuka saat semua komik siap dinilai.');
    }

    $participants = $state['participantUids'] ?? [];
    if (!in_array($voterUid, $participants, true)) {
        throw new RuntimeException('Hanya pemain aktif ronde ini yang dapat memberi upvote.');
    }

    $rawVotes = $state['votesByUid'] ?? [];
    $votesByUid = is_array($rawVotes) ? $rawVotes : [];
    if (isset($votesByUid[$voterUid])) {
        throw new RuntimeException('Kamu sudah mengirim keputusan upvote untuk ronde ini.');
    }

    $goldenUsed = array_values($state['goldenUsedByUid'] ?? []);
    $allowGolden = !empty($state['allowGoldenUpvote']);
    $points = 0;
    $resolvedEntryId = null;

    if ($kind === 'skip') {
        $points = 0;
        $resolvedEntryId = null;
    } else {
        if (!$targetEntryId || !isset($entriesMeta[$targetEntryId])) {
            throw new RuntimeException('Komik yang dipilih untuk di-upvote tidak ditemukan.');
        }
        $target = $entriesMeta[$targetEntryId];
        if ((string) ($target['authorUid'] ?? '') === $voterUid) {
            throw new RuntimeException('Dilarang meng-upvote komik milik sendiri!');
        }
        if ($kind === 'golden') {
            if (!$allowGolden) {
                throw new RuntimeException('Golden Upvote sedang dinonaktifkan oleh Host.');
            }
            if (in_array($voterUid, $goldenUsed, true)) {
                throw new RuntimeException('Golden Upvote hanya dapat dipakai 1 kali per seluruh sesi permainan.');
            }
            $points = YUKMAIN_BERCANDA_GOLDEN_POINTS;
            $goldenUsed[] = $voterUid;
        } elseif ($kind === 'standard') {
            $points = YUKMAIN_BERCANDA_STANDARD_POINTS;
        } else {
            throw new RuntimeException('Jenis upvote tidak dikenali.');
        }
        $resolvedEntryId = $targetEntryId;
    }

    $votesByUid[$voterUid] = [
        'voterUid'      => $voterUid,
        'voterName'     => $voterName,
        'targetEntryId' => $resolvedEntryId,
        'kind'          => $kind,
        'points'        => $points,
    ];

    $nextState = $state;
    $nextState['votedUids'] = array_keys($votesByUid);
    $nextState['goldenUsedByUid'] = $goldenUsed;
    $nextState['votesByUid'] = $votesByUid;

    $allVoted = true;
    foreach ($participants as $pUid) {
        if (!isset($votesByUid[(string) $pUid])) {
            $allVoted = false;
            break;
        }
    }

    return [
        'nextState'            => $nextState,
        'allParticipantsVoted' => $allVoted,
    ];
}

function yukmain_finalize_bercanda_reveal(array $state, array $entriesMeta, int $roundNumber, int $nowMs): array
{
    $rawVotes = $state['votesByUid'] ?? [];
    $votesByUid = is_array($rawVotes) ? $rawVotes : [];

    $tallies = [];
    foreach ($entriesMeta as $entryId => $meta) {
        $tallies[$entryId] = [
            'entryId'           => (string) $entryId,
            'authorUid'         => (string) ($meta['authorUid'] ?? ''),
            'standardVoterUids' => [],
            'goldenVoterUids'   => [],
            'totalPoints'       => 0,
        ];
    }

    $scoreDeltas = [];
    foreach ($votesByUid as $vote) {
        $kind = (string) ($vote['kind'] ?? 'skip');
        $targetEntryId = $vote['targetEntryId'] ?? null;
        $voterUid = (string) ($vote['voterUid'] ?? '');
        if ($kind === 'skip' || !$targetEntryId || !isset($tallies[$targetEntryId])) {
            continue;
        }
        $authorUid = $tallies[$targetEntryId]['authorUid'];
        if ($authorUid === $voterUid) {
            continue;
        }
        if ($kind === 'golden') {
            $tallies[$targetEntryId]['goldenVoterUids'][] = $voterUid;
            $tallies[$targetEntryId]['totalPoints'] += YUKMAIN_BERCANDA_GOLDEN_POINTS;
            $scoreDeltas[$authorUid] = ($scoreDeltas[$authorUid] ?? 0) + YUKMAIN_BERCANDA_GOLDEN_POINTS;
        } else {
            $tallies[$targetEntryId]['standardVoterUids'][] = $voterUid;
            $tallies[$targetEntryId]['totalPoints'] += YUKMAIN_BERCANDA_STANDARD_POINTS;
            $scoreDeltas[$authorUid] = ($scoreDeltas[$authorUid] ?? 0) + YUKMAIN_BERCANDA_STANDARD_POINTS;
        }
    }

    $maxPoints = 0;
    foreach ($tallies as $t) {
        if ($t['totalPoints'] > $maxPoints) {
            $maxPoints = $t['totalPoints'];
        }
    }

    $winnerEntryIds = [];
    $winnerAuthorUids = [];
    if ($maxPoints > 0) {
        foreach ($tallies as $t) {
            if ($t['totalPoints'] === $maxPoints) {
                $winnerEntryIds[] = $t['entryId'];
                if (!in_array($t['authorUid'], $winnerAuthorUids, true)) {
                    $winnerAuthorUids[] = $t['authorUid'];
                }
            }
        }
    }

    $revealedEntries = [];
    foreach (($state['entries'] ?? []) as $entry) {
        $entryId = (string) $entry['entryId'];
        $meta = $entriesMeta[$entryId] ?? [];
        $t = $tallies[$entryId] ?? [
            'standardVoterUids' => [],
            'goldenVoterUids'   => [],
            'totalPoints'       => 0,
        ];
        $revealedEntries[] = [
            'entryId'           => $entryId,
            'panel3'            => $entry['panel3'],
            'authorUid'         => $meta['authorUid'] ?? null,
            'authorName'        => $meta['authorName'] ?? 'Pemain',
            'standardVoterUids' => $t['standardVoterUids'],
            'goldenVoterUids'   => $t['goldenVoterUids'],
            'totalPoints'       => $t['totalPoints'],
        ];
    }

    usort($revealedEntries, static fn(array $a, array $b): int => $b['totalPoints'] <=> $a['totalPoints']);

    $namesByUid = $state['participantNamesByUid'] ?? [];
    $winnerNames = array_map(
        static fn(string $u): string => (string) ($namesByUid[$u] ?? 'Pemain'),
        $winnerAuthorUids
    );

    $reason = ($maxPoints > 0 && !empty($winnerNames))
        ? implode(' & ', $winnerNames) . " mencetak komik terlucu dengan +{$maxPoints} poin upvote!"
        : 'Ronde selesai tanpa ada poin upvote yang masuk.';

    $nextState = $state;
    $nextState['phase'] = 'reveal';
    $nextState['entries'] = $revealedEntries;
    $nextState['winnerEntryIds'] = $winnerEntryIds;

    $p1Caption = mb_substr((string) ($state['panel1']['caption'] ?? 'Cuma Bercanda'), 0, 36, 'UTF-8');
    $roundResult = [
        'roundNumber'     => $roundNumber,
        'winnerTeam'      => 'komikus',
        'reason'          => $reason,
        'locationName'    => "{$p1Caption}…",
        'guessedLocation' => null,
        'spyUids'         => $winnerAuthorUids,
        'spyNames'        => $winnerNames,
        'resolvedAtMs'    => $nowMs,
        'scoresApplied'   => true,
    ];

    return [
        'nextState'   => $nextState,
        'scoreDeltas' => $scoreDeltas,
        'roundResult' => $roundResult,
    ];
}
