<?php
declare(strict_types=1);

require_once __DIR__ . '/engine_common.php';

// ===================== GAME #1: SPYFALL =====================

function yukmain_merge_location_pool(array $enabledPacks, array $customLocations): array
{
    $packs = yukmain_packs();
    $builtIn = $packs['spyfall']['items'] ?? [];
    $byName = [];

    foreach ($builtIn as $loc) {
        if (in_array($loc['packId'] ?? '', $enabledPacks, true)) {
            $byName[mb_strtolower($loc['name'], 'UTF-8')] = $loc;
        }
    }
    foreach ($customLocations as $raw) {
        $loc = yukmain_sanitize_custom_location($raw);
        if ($loc !== null) {
            $loc['packId'] = 'kustom';
            $loc['packLabel'] = 'Lokasi Kustom';
            $byName[mb_strtolower($loc['name'], 'UTF-8')] = $loc;
        }
    }
    $res = array_values($byName);
    return !empty($res) ? $res : array_slice($builtIn, 0, 12);
}

function yukmain_deal_spyfall_round(array $playerUids, array $pool, ?string $prevLocationName, string $spyMode, string $roundId): array
{
    $unique = array_values(array_unique($playerUids));
    $count = count($unique);
    if ($count < 3) {
        throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Yang Bener Yang Mana.');
    }
    if (empty($pool)) {
        throw new RuntimeException('Minimal harus ada 1 lokasi aktif untuk memulai ronde.');
    }

    $candidates = $pool;
    if (count($pool) > 1 && $prevLocationName !== null && trim($prevLocationName) !== '') {
        $prevLower = mb_strtolower(trim($prevLocationName), 'UTF-8');
        $filtered = array_values(array_filter(
            $pool,
            static fn(array $loc): bool => mb_strtolower($loc['name'], 'UTF-8') !== $prevLower
        ));
        if (!empty($filtered)) $candidates = $filtered;
    }
    $location = $candidates[random_int(0, count($candidates) - 1)];

    $spyCount = 1;
    if ($spyMode === 'double') {
        $spyCount = $count >= 5 ? 2 : 1;
    } elseif ($spyMode === 'random' && $count >= 5) {
        $spyCount = random_int(1, 100) <= 35 ? 2 : 1;
    }

    $shuffledPlayers = yukmain_shuffle($unique);
    $spyUids = array_slice($shuffledPlayers, 0, $spyCount);
    $spySet = array_flip($spyUids);

    $shuffledRoles = yukmain_shuffle($location['roles'] ?? ['Pengunjung']);
    $secretsByUid = [];
    $roleCursor = 0;

    foreach ($unique as $uid) {
        if (isset($spySet[$uid])) {
            $secretsByUid[$uid] = [
                'uid'          => $uid,
                'roundId'      => $roundId,
                'gameType'     => 'spyfall',
                'isSpy'        => true,
                'locationName' => null,
                'roleName'     => 'Mata-Mata',
            ];
        } else {
            $assignedRole = $shuffledRoles[$roleCursor % count($shuffledRoles)] ?? 'Pengunjung';
            $roleCursor++;
            $secretsByUid[$uid] = [
                'uid'          => $uid,
                'roundId'      => $roundId,
                'gameType'     => 'spyfall',
                'isSpy'        => false,
                'locationName' => $location['name'],
                'roleName'     => $assignedRole,
            ];
        }
    }

    $firstSpeakerUid = $unique[random_int(0, $count - 1)];
    $selectedNames = array_map(static fn(array $l): string => (string) $l['name'], $pool);
    sort($selectedNames, SORT_NATURAL | SORT_FLAG_CASE);

    return [
        'location'              => $location,
        'spyUids'               => $spyUids,
        'firstSpeakerUid'       => $firstSpeakerUid,
        'selectedLocationNames' => $selectedNames,
        'secretsByUid'          => $secretsByUid,
    ];
}

function yukmain_get_majority_threshold(int $totalEligible): int
{
    if ($totalEligible <= 0) {
        return 0;
    }
    return intdiv($totalEligible, 2) + 1;
}

function yukmain_evaluate_majority_vote_progress(array $votes, array $eligibleVoterUids): array
{
    $uniqueEligible = array_values(array_unique(array_map('strval', $eligibleVoterUids)));
    $yes = 0;
    $no = 0;

    foreach ($uniqueEligible as $uid) {
        $v = $votes[$uid] ?? null;
        if ($v === 'yes') {
            $yes++;
        } elseif ($v === 'no') {
            $no++;
        }
    }

    $totalEligible = count($uniqueEligible);
    $requiredYes = yukmain_get_majority_threshold($totalEligible);
    $remaining = max(0, $totalEligible - $yes - $no);

    if ($totalEligible === 0) {
        $outcome = 'acquitted';
    } elseif ($yes >= $requiredYes) {
        $outcome = 'convicted';
    } elseif (($totalEligible - $no) < $requiredYes) {
        $outcome = 'acquitted';
    } else {
        $outcome = 'pending';
    }

    return [
        'outcome'        => $outcome,
        'yesCount'       => $yes,
        'noCount'        => $no,
        'requiredYes'    => $requiredYes,
        'totalEligible'  => $totalEligible,
        'remainingCount' => $remaining,
    ];
}

function yukmain_evaluate_vote_progress(array $votes, array $eligibleVoterUids): string
{
    $progress = yukmain_evaluate_majority_vote_progress($votes, $eligibleVoterUids);
    return (string) $progress['outcome'];
}

function yukmain_calculate_spyfall_deltas(array $playerUids, array $spyUids, string $winnerTeam, ?string $initiatorUid, string $victoryType): array
{
    $deltas = array_fill_keys($playerUids, 0);
    $spySet = array_flip($spyUids);

    if ($winnerTeam === 'mata_mata') {
        $pts = $victoryType === 'timeout' ? 2 : 4;
        foreach ($spyUids as $sUid) {
            if (array_key_exists($sUid, $deltas)) $deltas[$sUid] = $pts;
        }
        return $deltas;
    }

    foreach ($playerUids as $uid) {
        if (!isset($spySet[$uid])) $deltas[$uid] = 1;
    }
    if ($initiatorUid !== null && !isset($spySet[$initiatorUid]) && array_key_exists($initiatorUid, $deltas)) {
        $deltas[$initiatorUid]++;
    }
    return $deltas;
}

// ===================== GAME #2: KATA-KATA HARI INI =====================

function yukmain_merge_word_pair_pool(array $enabledPacks, array $customWordPairs): array
{
    $packs = yukmain_packs();
    $builtIn = $packs['kata_kata']['items'] ?? [];
    $pool = [];

    foreach ($builtIn as $pair) {
        if (in_array($pair['packId'] ?? '', $enabledPacks, true)) {
            $pool[] = $pair;
        }
    }
    foreach ($customWordPairs as $raw) {
        $p = yukmain_sanitize_custom_word_pair($raw);
        if ($p !== null) {
            $p['packId'] = 'kustom';
            $p['packLabel'] = 'Pasangan Kustom';
            $pool[] = $p;
        }
    }
    return !empty($pool) ? $pool : array_slice($builtIn, 0, 12);
}

function yukmain_deal_kata_kata_round(array $playerUids, array $pool, ?string $prevCitizenWord, string $spyMode, string $roundId): array
{
    $count = count($playerUids);
    if ($count < 3) {
        throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Kata-Kata Hari Ini.');
    }
    if (empty($pool)) {
        throw new RuntimeException('Daftar pasangan kata kosong.');
    }

    $candidates = $pool;
    if (count($pool) > 1 && $prevCitizenWord !== null && trim($prevCitizenWord) !== '') {
        $prevNorm = yukmain_normalize_word_compare($prevCitizenWord);
        $filtered = array_values(array_filter(
            $pool,
            static fn(array $p): bool => yukmain_normalize_word_compare($p['citizenWord']) !== $prevNorm
                && yukmain_normalize_word_compare($p['spyWord']) !== $prevNorm
        ));
        if (!empty($filtered)) $candidates = $filtered;
    }
    $pair = $candidates[random_int(0, count($candidates) - 1)];

    $flip = random_int(0, 1) === 1;
    $citizenWord = $flip ? $pair['spyWord'] : $pair['citizenWord'];
    $spyWord = $flip ? $pair['citizenWord'] : $pair['spyWord'];

    $spyCount = 1;
    if ($spyMode === 'double' && $count >= 5) $spyCount = 2;
    elseif ($spyMode === 'random' && $count >= 5) $spyCount = random_int(0, 1) === 1 ? 2 : 1;

    $shuffled = yukmain_shuffle($playerUids);
    $spyUids = array_slice($shuffled, 0, $spyCount);
    $spySet = array_flip($spyUids);

    $secretsByUid = [];
    foreach ($playerUids as $uid) {
        $secretsByUid[$uid] = [
            'uid'        => $uid,
            'roundId'    => $roundId,
            'gameType'   => 'kata_kata',
            'secretWord' => isset($spySet[$uid]) ? $spyWord : $citizenWord,
        ];
    }

    return [
        'citizenWord'     => $citizenWord,
        'spyWord'         => $spyWord,
        'category'        => $pair['category'],
        'spyUids'         => $spyUids,
        'firstSpeakerUid' => $playerUids[random_int(0, $count - 1)],
        'secretsByUid'    => $secretsByUid,
    ];
}

function yukmain_eval_kata_kata_elimination(array $allUids, array $prevEliminated, string $eliminatedUid, array $spyUids): array
{
    $spySet = array_flip($spyUids);
    $elimSet = array_flip(array_merge($prevEliminated, [$eliminatedUid]));
    $alive = array_values(array_filter($allUids, static fn(string $u): bool => !isset($elimSet[$u])));
    $aliveSpies = array_values(array_filter($alive, static fn(string $u): bool => isset($spySet[$u])));
    $aliveCitizens = array_values(array_filter($alive, static fn(string $u): bool => !isset($spySet[$u])));
    $wasSpy = isset($spySet[$eliminatedUid]);

    if ($wasSpy && count($aliveSpies) === 0) {
        $outcome = 'final_spy_last_chance';
    } elseif (count($aliveSpies) >= count($aliveCitizens)) {
        $outcome = 'spies_outnumber';
    } else {
        $outcome = 'continue';
    }

    return ['wasSpy' => $wasSpy, 'outcome' => $outcome];
}

function yukmain_calculate_kata_kata_deltas(array $playerUids, array $spyUids, string $winnerTeam, string $victoryType): array
{
    $deltas = array_fill_keys($playerUids, 0);
    $spySet = array_flip($spyUids);
    if ($winnerTeam === 'warga') {
        foreach ($playerUids as $u) {
            if (!isset($spySet[$u])) $deltas[$u] = 2;
        }
        return $deltas;
    }
    $pts = $victoryType === 'last_chance_correct' ? 4 : 3;
    foreach ($spyUids as $u) {
        if (array_key_exists($u, $deltas)) $deltas[$u] = $pts;
    }
    return $deltas;
}

// ===================== GAME #3: SATU FREKUENSI =====================

function yukmain_merge_spectrum_pool(array $enabledPacks, array $customSpectrums): array
{
    $packs = yukmain_packs();
    $builtIn = $packs['satu_frekuensi']['items'] ?? [];
    $pool = [];
    foreach ($builtIn as $item) {
        if (in_array($item['packId'] ?? '', $enabledPacks, true)) $pool[] = $item;
    }
    foreach ($customSpectrums as $raw) {
        $s = yukmain_sanitize_custom_spectrum($raw);
        if ($s !== null) {
            $s['packId'] = 'custom';
            $s['packLabel'] = 'Spektrum Kustom';
            $pool[] = $s;
        }
    }
    return !empty($pool) ? $pool : array_slice($builtIn, 0, 15);
}

function yukmain_deal_satu_frekuensi_round(array $playerUids, array $pool, ?string $prevKey, ?int $prevIdx, string $roundId): array
{
    $count = count($playerUids);
    if ($count < 2) throw new RuntimeException('Minimal 2 pemain aktif (tidak BRB) dibutuhkan untuk Satu Frekuensi.');
    if (empty($pool)) throw new RuntimeException('Daftar spektrum kosong.');

    $candidates = $pool;
    if (count($pool) > 1 && $prevKey !== null) {
        $filtered = array_values(array_filter(
            $pool,
            static fn(array $s): bool => ($s['leftLabel'] . '|' . $s['rightLabel']) !== $prevKey
        ));
        if (!empty($filtered)) $candidates = $filtered;
    }
    $spectrum = $candidates[random_int(0, count($candidates) - 1)];
    $rotIdx = ($prevIdx === null || $prevIdx < 0) ? 0 : (($prevIdx + 1) % $count);
    $psychicUid = $playerUids[$rotIdx] ?? $playerUids[0];
    $targetValue = random_int(6, 94);

    $secretsByUid = [];
    foreach ($playerUids as $uid) {
        if ($uid === $psychicUid) {
            $secretsByUid[$uid] = [
                'uid'         => $uid,
                'roundId'     => $roundId,
                'gameType'    => 'satu_frekuensi',
                'isPsychic'   => true,
                'targetValue' => $targetValue,
            ];
        } else {
            $secretsByUid[$uid] = [
                'uid'       => $uid,
                'roundId'   => $roundId,
                'gameType'  => 'satu_frekuensi',
                'isPsychic' => false,
            ];
        }
    }

    return [
        'spectrum'      => $spectrum,
        'psychicUid'    => $psychicUid,
        'rotationIndex' => $rotIdx,
        'targetValue'   => $targetValue,
        'secretsByUid'  => $secretsByUid,
    ];
}

function yukmain_score_satu_frekuensi_round(string $psychicUid, int $targetValue, array $players, array $submissionsByUid): array
{
    $deltas = [];
    $revealedGuesses = [];
    $scoringGuessers = 0;

    foreach ($players as $p) {
        $uid = $p['uid'];
        $deltas[$uid] = 0;
        if ($uid === $psychicUid || !array_key_exists($uid, $submissionsByUid)) {
            continue;
        }
        $clamped = min(100, max(0, (int) round((float) $submissionsByUid[$uid])));
        $dist = abs($clamped - min(100, max(0, $targetValue)));
        if ($dist <= 4) {
            $pts = 4;
            $tier = 'bullseye';
        } elseif ($dist <= 10) {
            $pts = 3;
            $tier = 'close';
        } elseif ($dist <= 16) {
            $pts = 2;
            $tier = 'near';
        } else {
            $pts = 0;
            $tier = 'miss';
        }
        $deltas[$uid] = $pts;
        if ($pts >= 2) $scoringGuessers++;

        $revealedGuesses[] = [
            'uid'         => $uid,
            'displayName' => $p['displayName'],
            'avatarColor' => $p['avatarColor'],
            'value'       => $clamped,
            'points'      => $pts,
            'tier'        => $tier,
        ];
    }

    $psychicBonus = min(4, $scoringGuessers);
    $deltas[$psychicUid] = $psychicBonus;
    usort($revealedGuesses, static function (array $a, array $b) use ($targetValue): int {
        if ($b['points'] !== $a['points']) return $b['points'] <=> $a['points'];
        return abs($a['value'] - $targetValue) <=> abs($b['value'] - $targetValue);
    });

    return [
        'revealedGuesses' => $revealedGuesses,
        'psychicBonus'    => $psychicBonus,
        'deltas'          => $deltas,
    ];
}

// ===================== GAME #4: FAKTA HARI INI =====================

function yukmain_merge_fact_pool(array $enabledPacks, array $customFacts): array
{
    $packs = yukmain_packs();
    $builtIn = $packs['fakta_hari_ini']['items'] ?? [];
    $pool = [];
    foreach ($builtIn as $item) {
        if (in_array($item['packId'] ?? '', $enabledPacks, true)) $pool[] = $item;
    }
    foreach ($customFacts as $raw) {
        $f = yukmain_sanitize_custom_fact($raw);
        if ($f !== null) {
            $f['packId'] = 'custom';
            $f['packLabel'] = 'Fakta Kustom';
            $pool[] = $f;
        }
    }
    return !empty($pool) ? $pool : array_slice($builtIn, 0, 15);
}

function yukmain_select_fakta_phase_controller(array $players, string $hostUid, string $guesserUid): array
{
    foreach ($players as $p) {
        if ($p['uid'] === $hostUid && $hostUid !== $guesserUid) {
            return $p;
        }
    }
    $nonGuessers = array_values(array_filter($players, static fn(array $p): bool => $p['uid'] !== $guesserUid));
    if (empty($nonGuessers)) return $players[0];

    $hostDev = $hostUid;
    foreach ($players as $p) {
        if ($p['uid'] === $hostUid) {
            $hostDev = (string) ($p['controllerUid'] ?? $hostUid);
            break;
        }
    }
    $independent = array_values(array_filter(
        $nonGuessers,
        static fn(array $p): bool => (string) ($p['controllerUid'] ?? $p['uid']) !== $hostDev
    ));
    $pool = !empty($independent) ? $independent : $nonGuessers;
    return $pool[random_int(0, count($pool) - 1)];
}

function yukmain_deal_fakta_round(array $players, string $hostUid, array $pool, ?string $prevTwist, ?int $prevIdx, string $roundId): array
{
    $count = count($players);
    if ($count < 3) throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Fakta Hari Ini.');
    if (empty($pool)) throw new RuntimeException('Daftar fakta kosong.');

    $candidates = $pool;
    if (count($pool) > 1 && $prevTwist !== null) {
        $filtered = array_values(array_filter($pool, static fn(array $f): bool => $f['twist'] !== $prevTwist));
        if (!empty($filtered)) $candidates = $filtered;
    }
    $fact = $candidates[random_int(0, count($candidates) - 1)];
    $rotIdx = ($prevIdx === null || $prevIdx < 0) ? 0 : (($prevIdx + 1) % $count);
    $guesser = $players[$rotIdx] ?? $players[0];

    $bluffers = array_values(array_filter($players, static fn(array $p): bool => $p['uid'] !== $guesser['uid']));
    $truthTeller = $bluffers[random_int(0, count($bluffers) - 1)];
    $controller = yukmain_select_fakta_phase_controller($players, $hostUid, $guesser['uid']);

    $secretsByUid = [];
    foreach ($players as $p) {
        if ($p['uid'] === $guesser['uid']) {
            $secretsByUid[$p['uid']] = [
                'uid'       => $p['uid'],
                'roundId'   => $roundId,
                'gameType'  => 'fakta_hari_ini',
                'isGuesser' => true,
            ];
        } else {
            $secretsByUid[$p['uid']] = [
                'uid'             => $p['uid'],
                'roundId'         => $roundId,
                'gameType'        => 'fakta_hari_ini',
                'isGuesser'       => false,
                'isTruthTeller'   => $p['uid'] === $truthTeller['uid'],
                'truthTellerUid'  => $truthTeller['uid'],
                'truthTellerName' => $truthTeller['displayName'],
                'factPrefix'      => $fact['prefix'],
                'factTwist'       => $fact['twist'],
                'factSuffix'      => $fact['suffix'] ?? '',
                'factCategory'    => $fact['category'],
            ];
        }
    }

    return [
        'fact'                => $fact,
        'guesserUid'          => $guesser['uid'],
        'guesserName'         => $guesser['displayName'],
        'rotationIndex'       => $rotIdx,
        'truthTellerUid'      => $truthTeller['uid'],
        'truthTellerName'     => $truthTeller['displayName'],
        'phaseControllerUid'  => $controller['uid'],
        'phaseControllerName' => $controller['displayName'],
        'secretsByUid'        => $secretsByUid,
    ];
}

// ===================== GAME #5: PELUKIS GADUNGAN =====================

function yukmain_merge_drawing_pool(array $enabledPacks, array $customPrompts): array
{
    $packs = yukmain_packs();
    $builtIn = $packs['pelukis_gadungan']['items'] ?? [];
    $pool = [];
    foreach ($builtIn as $item) {
        if (in_array($item['packId'] ?? '', $enabledPacks, true)) $pool[] = $item;
    }
    foreach ($customPrompts as $raw) {
        $p = yukmain_sanitize_custom_drawing_prompt($raw);
        if ($p !== null) {
            $p['packId'] = 'custom';
            $p['packLabel'] = 'Tema Kustom';
            $pool[] = $p;
        }
    }
    return !empty($pool) ? $pool : array_slice($builtIn, 0, 14);
}

function yukmain_normalize_points(array $rawPoints, float $minDist = 10.0, int $maxPoints = 50): array
{
    $count = intdiv(count($rawPoints), 2);
    if ($count < 1) return [];
    $pairs = [];
    for ($i = 0; $i < $count; $i++) {
        $x = min(1000, max(0, (int) round((float) $rawPoints[$i * 2])));
        $y = min(1000, max(0, (int) round((float) $rawPoints[$i * 2 + 1])));
        if (empty($pairs)) {
            $pairs[] = [$x, $y];
            continue;
        }
        $prev = $pairs[count($pairs) - 1];
        $dist = hypot($x - $prev[0], $y - $prev[1]);
        if ($dist >= $minDist || $i === $count - 1) {
            $pairs[] = [$x, $y];
        }
    }
    if (empty($pairs)) return [];
    if (count($pairs) === 1) {
        [$x, $y] = $pairs[0];
        return [$x, $y, min(1000, $x + 2), min(1000, $y + 2)];
    }
    $finalPairs = $pairs;
    if (count($pairs) > $maxPoints) {
        $finalPairs = [];
        $step = (count($pairs) - 1) / ($maxPoints - 1);
        for ($i = 0; $i < $maxPoints; $i++) {
            $finalPairs[] = $pairs[(int) round($i * $step)];
        }
    }
    $flat = [];
    foreach ($finalPairs as [$x, $y]) {
        $flat[] = $x;
        $flat[] = $y;
    }
    return $flat;
}

function yukmain_deal_pelukis_round(array $players, array $pool, string $spyMode, ?string $prevWord, string $roundId): array
{
    $inkPalette = ['#F43F5E', '#F59E0B', '#06B6D4', '#A855F7', '#10B981', '#EC4899', '#3B82F6', '#84CC16', '#F97316', '#14B8A6', '#EAB308', '#8B5CF6'];
    $count = count($players);
    if ($count < 3) throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Pelukis Gadungan.');
    if (empty($pool)) throw new RuntimeException('Daftar tema gambar kosong.');

    $candidates = $pool;
    if (count($pool) > 1 && $prevWord !== null) {
        $prevLower = mb_strtolower($prevWord, 'UTF-8');
        $filtered = array_values(array_filter($pool, static fn(array $p): bool => mb_strtolower($p['word'], 'UTF-8') !== $prevLower));
        if (!empty($filtered)) $candidates = $filtered;
    }
    $prompt = $candidates[random_int(0, count($candidates) - 1)];

    $startOffset = random_int(0, $count - 1);
    $rotated = array_merge(array_slice($players, $startOffset), array_slice($players, 0, $startOffset));

    $gadunganCount = 1;
    if ($count >= 6) {
        if ($spyMode === 'double') $gadunganCount = 2;
        elseif ($spyMode === 'random') $gadunganCount = random_int(1, 100) <= 40 ? 2 : 1;
    }

    $shuffled = yukmain_shuffle($players);
    $gadunganPlayers = array_slice($shuffled, 0, $gadunganCount);
    $gadunganSet = array_flip(array_column($gadunganPlayers, 'uid'));

    $turnOrder = [];
    $turnNames = [];
    $turnColors = [];
    $usedColors = [];
    foreach ($rotated as $idx => $p) {
        $uid = $p['uid'];
        $turnOrder[] = $uid;
        $turnNames[$uid] = mb_substr($p['displayName'], 0, 40, 'UTF-8');
        $preferred = trim((string) ($p['avatarColor'] ?? ''));
        $chosenColor = null;
        if ($preferred !== '' && !isset($usedColors[$preferred])) {
            $chosenColor = $preferred;
        } else {
            foreach ($inkPalette as $c) {
                if (!isset($usedColors[$c])) {
                    $chosenColor = $c;
                    break;
                }
            }
            if ($chosenColor === null) $chosenColor = $inkPalette[$idx % count($inkPalette)];
        }
        $usedColors[$chosenColor] = true;
        $turnColors[$uid] = $chosenColor;
    }

    $secretsByUid = [];
    foreach ($players as $p) {
        $uid = $p['uid'];
        $isG = isset($gadunganSet[$uid]);
        $secretsByUid[$uid] = [
            'uid'             => $uid,
            'roundId'         => $roundId,
            'gameType'        => 'pelukis_gadungan',
            'isGadungan'      => $isG,
            'drawingCategory' => $prompt['category'],
            'drawingWord'     => $isG ? null : $prompt['word'],
            'playerInkColor'  => $turnColors[$uid],
        ];
    }

    return [
        'prompt'           => $prompt,
        'gadunganUids'     => array_column($gadunganPlayers, 'uid'),
        'gadunganNames'    => array_column($gadunganPlayers, 'displayName'),
        'turnOrder'        => $turnOrder,
        'turnNamesByUid'   => $turnNames,
        'turnColorsByUid'  => $turnColors,
        'secretsByUid'     => $secretsByUid,
    ];
}

function yukmain_tally_pelukis_votes(array $votesByUid, array $turnOrder, array $gadunganUids): array
{
    $tally = [];
    foreach ($turnOrder as $voterUid) {
        $target = $votesByUid[$voterUid] ?? null;
        if ($target) {
            $tally[$target] = ($tally[$target] ?? 0) + 1;
        }
    }
    if (empty($tally)) {
        return ['voteTally' => $tally, 'accusedUid' => null, 'isTie' => true, 'caughtGadungan' => false];
    }
    $maxVotes = max($tally);
    $top = array_keys(array_filter($tally, static fn(int $c): bool => $c === $maxVotes));
    $isTie = count($top) > 1;
    $accused = $isTie ? null : $top[0];
    $caught = $accused !== null && in_array($accused, $gadunganUids, true);
    return ['voteTally' => $tally, 'accusedUid' => $accused, 'isTie' => $isTie, 'caughtGadungan' => $caught];
}

function yukmain_eval_pelukis_guess(string $guess, string $secretWord): bool
{
    $clean = static function (string $s): string {
        $l = strtolower($s);
        $r = preg_replace('/[^a-z0-9\s]/', ' ', $l) ?? $l;
        return trim(preg_replace('/\s+/', ' ', $r) ?? $r);
    };
    $a = $clean($guess);
    $b = $clean($secretWord);
    if ($a === '' || $b === '') return false;
    if ($a === $b) return true;
    return strlen($a) >= 4 && (str_contains($b, $a) || str_contains($a, $b));
}

function yukmain_eval_spy_guess(string $guessedLocation, string $actualLocation): bool
{
    return mb_strtolower(trim($guessedLocation), 'UTF-8') === mb_strtolower(trim($actualLocation), 'UTF-8');
}

function yukmain_eval_kata_kata_guess(string $guessedWord, string $actualCitizenWord): bool
{
    $a = yukmain_normalize_word_compare($guessedWord);
    $b = yukmain_normalize_word_compare($actualCitizenWord);
    return $a !== '' && $a === $b;
}

function yukmain_calc_fakta_deltas(array $playerUids, string $guesserUid, string $truthTellerUid, string $pickedUid): array
{
    $blufferCount = max(1, count($playerUids) - 1);
    $guesserWon = $pickedUid === $truthTellerUid;
    $deltas = [];

    if ($guesserWon) {
        $guesserPoints = min(11, $blufferCount);
        foreach ($playerUids as $uid) {
            $deltas[$uid] = ($uid === $guesserUid) ? $guesserPoints : 0;
        }
        return [
            'guesserWon'        => true,
            'guesserPoints'     => $guesserPoints,
            'blufferPointsEach' => 0,
            'deltas'            => $deltas,
        ];
    }

    foreach ($playerUids as $uid) {
        $deltas[$uid] = ($uid === $guesserUid) ? 0 : 1;
    }
    return [
        'guesserWon'        => false,
        'guesserPoints'     => 0,
        'blufferPointsEach' => 1,
        'deltas'            => $deltas,
    ];
}

function yukmain_calc_pelukis_deltas(array $playerUids, array $gadunganUids, string $winnerTeam): array
{
    $gadunganSet = array_flip($gadunganUids);
    $deltas = [];
    foreach ($playerUids as $uid) {
        $isGadungan = isset($gadunganSet[$uid]);
        $deltas[$uid] = $winnerTeam === 'gadungan'
            ? ($isGadungan ? 3 : 0)
            : ($isGadungan ? 0 : 2);
    }
    return $deltas;
}

