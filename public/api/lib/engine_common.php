<?php
declare(strict_types=1);

const YUKMAIN_EMPTY_ROOM_RESET_GRACE_MS = 15000;

function yukmain_packs(): array
{
    static $packs = null;
    if ($packs !== null) {
        return $packs;
    }
    $path = __DIR__ . '/game-packs.json';
    $raw = is_file($path) ? file_get_contents($path) : false;
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    $packs = is_array($decoded) ? $decoded : [];
    return $packs;
}

function yukmain_shuffle(array $items): array
{
    $copy = array_values($items);
    $count = count($copy);
    for ($i = $count - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        [$copy[$i], $copy[$j]] = [$copy[$j], $copy[$i]];
    }
    return $copy;
}

function yukmain_generate_room_code(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $len = strlen($chars);
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= $chars[random_int(0, $len - 1)];
    }
    return $code;
}

function yukmain_default_packs_for_game(string $gameType): array
{
    return match ($gameType) {
        'kata_kata'        => ['kuliner', 'keseharian'],
        'satu_frekuensi'   => ['tongkrongan', 'kuliner'],
        'fakta_hari_ini'   => ['hukum_sejarah', 'nusantara'],
        'pelukis_gadungan' => ['kuliner', 'tongkrongan', 'hewan_alam'],
        'malam_siluman'    => ['malam_siluman'],
        'ular_tangga'      => ['menara_nusantara'],
        'cuma_bercanda'    => ['tongkrongan', 'kantor_kampus'],
        default            => ['nusantara', 'klasik'],
    };
}

function yukmain_filter_active_players(array $players): array
{
    return array_values(array_filter($players, static fn(array $p): bool => empty($p['isBrb'])));
}

function yukmain_normalize_word_compare(string $input): string
{
    $lower = mb_strtolower($input, 'UTF-8');
    $clean = preg_replace('/[^\p{L}\p{N}\s]/u', ' ', $lower) ?? $lower;
    $collapsed = preg_replace('/\s+/u', ' ', $clean) ?? $clean;
    return trim($collapsed);
}

function yukmain_sanitize_custom_location($raw): ?array
{
    if (!is_array($raw)) return null;
    $name = mb_substr(trim((string) ($raw['name'] ?? '')), 0, 60, 'UTF-8');
    if ($name === '') return null;
    $cat = mb_substr(trim((string) ($raw['category'] ?? 'Kustom')), 0, 32, 'UTF-8') ?: 'Kustom';
    $rolesRaw = is_array($raw['roles'] ?? null) ? $raw['roles'] : [];
    $roles = [];
    foreach ($rolesRaw as $r) {
        $clean = mb_substr(trim((string) $r), 0, 48, 'UTF-8');
        if ($clean !== '' && !in_array($clean, $roles, true)) {
            $roles[] = $clean;
        }
        if (count($roles) >= 16) break;
    }
    if (count($roles) < 2) return null;
    $rawId = (string) ($raw['id'] ?? '');
    $safeId = preg_match('/^[a-zA-Z0-9_-]{2,48}$/', $rawId)
        ? $rawId
        : 'kustom-' . yukmain_random_hex(4);
    return ['id' => $safeId, 'name' => $name, 'category' => $cat, 'roles' => $roles];
}

function yukmain_sanitize_custom_word_pair($raw): ?array
{
    if (!is_array($raw)) return null;
    $cw = mb_substr(trim((string) ($raw['citizenWord'] ?? '')), 0, 60, 'UTF-8');
    $sw = mb_substr(trim((string) ($raw['spyWord'] ?? '')), 0, 60, 'UTF-8');
    $cat = mb_substr(trim((string) ($raw['category'] ?? 'Kustom')), 0, 32, 'UTF-8') ?: 'Kustom';
    if ($cw === '' || $sw === '') return null;
    if (yukmain_normalize_word_compare($cw) === yukmain_normalize_word_compare($sw)) return null;
    $rawId = (string) ($raw['id'] ?? '');
    $id = preg_match('/^[a-zA-Z0-9_-]{3,40}$/', $rawId) ? $rawId : 'custom-pair-' . yukmain_random_hex(4);
    return ['id' => $id, 'citizenWord' => $cw, 'spyWord' => $sw, 'category' => $cat];
}

function yukmain_sanitize_custom_spectrum($raw): ?array
{
    if (!is_array($raw)) return null;
    $left = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['leftLabel'] ?? '')) ?? ''), 0, 42, 'UTF-8');
    $right = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['rightLabel'] ?? '')) ?? ''), 0, 42, 'UTF-8');
    if ($left === '' || $right === '' || mb_strtolower($left, 'UTF-8') === mb_strtolower($right, 'UTF-8')) {
        return null;
    }
    $cat = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['category'] ?? 'Kustom')) ?? ''), 0, 32, 'UTF-8') ?: 'Kustom';
    $id = mb_substr(trim((string) ($raw['id'] ?? '')), 0, 40, 'UTF-8') ?: ('custom_spec_' . yukmain_random_hex(4));
    return ['id' => $id, 'leftLabel' => $left, 'rightLabel' => $right, 'category' => $cat];
}

function yukmain_sanitize_custom_fact($raw): ?array
{
    if (!is_array($raw)) return null;
    $prefix = mb_substr(preg_replace('/\s+/', ' ', (string) ($raw['prefix'] ?? '')) ?? '', 0, 220, 'UTF-8');
    $twist = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['twist'] ?? '')) ?? ''), 0, 220, 'UTF-8');
    $suffix = mb_substr(preg_replace('/\s+/', ' ', (string) ($raw['suffix'] ?? '')) ?? '', 0, 120, 'UTF-8');
    if ($twist === '' || (trim($prefix) === '' && trim($suffix) === '')) return null;
    $cat = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['category'] ?? 'Kustom')) ?? ''), 0, 32, 'UTF-8') ?: 'Kustom';
    $id = mb_substr(trim((string) ($raw['id'] ?? '')), 0, 40, 'UTF-8') ?: ('custom_fact_' . yukmain_random_hex(4));
    return ['id' => $id, 'prefix' => $prefix, 'twist' => $twist, 'suffix' => $suffix, 'category' => $cat];
}

function yukmain_sanitize_custom_drawing_prompt($raw): ?array
{
    if (!is_array($raw)) return null;
    $cat = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['category'] ?? '')) ?? ''), 0, 40, 'UTF-8');
    $word = mb_substr(trim(preg_replace('/\s+/', ' ', (string) ($raw['word'] ?? '')) ?? ''), 0, 60, 'UTF-8');
    if ($cat === '' || $word === '') return null;
    $id = mb_substr(trim((string) ($raw['id'] ?? '')), 0, 40, 'UTF-8') ?: ('custom_pg_' . yukmain_random_hex(4));
    return ['id' => $id, 'category' => $cat, 'word' => $word];
}

function yukmain_default_malam_siluman_settings(): array
{
    return [
        'wolfCountMode'     => 'auto',
        'revealRoleOnDeath' => true,
        'enabledRoles'      => [
            'seer'        => true,
            'doctor'      => true,
            'hunter'      => false,
            'mayor'       => false,
            'stealthWolf' => false,
            'jester'      => false,
        ],
    ];
}

function yukmain_sanitize_malam_siluman_settings($raw): array
{
    $def = yukmain_default_malam_siluman_settings();
    if (!is_array($raw)) return $def;
    $rawMode = $raw['wolfCountMode'] ?? 'auto';
    $mode = in_array($rawMode, [1, 2, 3, '1', '2', '3'], true) ? (int) $rawMode : 'auto';
    $reveal = isset($raw['revealRoleOnDeath']) && is_bool($raw['revealRoleOnDeath'])
        ? $raw['revealRoleOnDeath']
        : $def['revealRoleOnDeath'];
    $r = is_array($raw['enabledRoles'] ?? null) ? $raw['enabledRoles'] : [];
    return [
        'wolfCountMode'     => $mode,
        'revealRoleOnDeath' => $reveal,
        'enabledRoles'      => [
            'seer'        => is_bool($r['seer'] ?? null) ? $r['seer'] : true,
            'doctor'      => is_bool($r['doctor'] ?? null) ? $r['doctor'] : true,
            'hunter'      => is_bool($r['hunter'] ?? null) ? $r['hunter'] : false,
            'mayor'       => is_bool($r['mayor'] ?? null) ? $r['mayor'] : false,
            'stealthWolf' => is_bool($r['stealthWolf'] ?? null) ? $r['stealthWolf'] : false,
            'jester'      => is_bool($r['jester'] ?? null) ? $r['jester'] : false,
        ],
    ];
}

function yukmain_default_ular_tangga_settings(): array
{
    return [
        'scenarioId'          => 'menara_nusantara',
        'boardMode'           => 'standar',
        'exactFinishBounce'   => true,
        'classSelectionByUid' => new stdClass(),
    ];
}

function yukmain_sanitize_ular_tangga_settings($raw): array
{
    $def = yukmain_default_ular_tangga_settings();
    if (!is_array($raw)) {
        return $def;
    }

    $allowedScenarios = ['menara_nusantara', 'distrik_neon', 'pasar_mistis'];
    $scenarioId = in_array($raw['scenarioId'] ?? '', $allowedScenarios, true)
        ? (string) $raw['scenarioId']
        : $def['scenarioId'];

    $boardMode = (($raw['boardMode'] ?? '') === 'brutal') ? 'brutal' : 'standar';
    $exactFinishBounce = isset($raw['exactFinishBounce']) && is_bool($raw['exactFinishBounce'])
        ? $raw['exactFinishBounce']
        : $def['exactFinishBounce'];

    $allowedClasses = ['acak', 'ksatria', 'pencuri', 'penyihir', 'tabib'];
    $cleanClasses = [];
    if (is_array($raw['classSelectionByUid'] ?? null)) {
        foreach ($raw['classSelectionByUid'] as $uid => $val) {
            if (is_string($uid) && $uid !== '' && is_string($val) && in_array($val, $allowedClasses, true)) {
                $cleanClasses[$uid] = $val;
            }
        }
    }

    return [
        'scenarioId'          => $scenarioId,
        'boardMode'           => $boardMode,
        'exactFinishBounce'   => $exactFinishBounce,
        'classSelectionByUid' => empty($cleanClasses) ? new stdClass() : $cleanClasses,
    ];
}

function yukmain_default_cuma_bercanda_settings(): array
{
    return [
        'allowGoldenUpvote' => true,
    ];
}

function yukmain_sanitize_cuma_bercanda_settings($raw): array
{
    if (!is_array($raw)) {
        return yukmain_default_cuma_bercanda_settings();
    }
    return [
        'allowGoldenUpvote' => isset($raw['allowGoldenUpvote']) && is_bool($raw['allowGoldenUpvote'])
            ? $raw['allowGoldenUpvote']
            : true,
    ];
}

function yukmain_sanitize_custom_bercanda_card($raw, int $fallbackIndex = 0): ?array
{
    if (!is_array($raw)) return null;
    $caption = mb_substr(trim((string) ($raw['caption'] ?? '')), 0, 120, 'UTF-8');
    if (mb_strlen($caption, 'UTF-8') < 3) return null;

    $speaker = mb_substr(trim((string) ($raw['speaker'] ?? '')), 0, 28, 'UTF-8') ?: 'Tokoh';
    $subtext = mb_substr(trim((string) ($raw['subtext'] ?? '')), 0, 60, 'UTF-8');
    $allowedScenes = [
        'ngobrol_santai',
        'kaget_melotot',
        'bisik_rahasia',
        'tunjuk_marah',
        'nangis_lebay',
        'cengar_cengir',
        'mikir_keras',
        'panik_keringat',
        'sombong_kacamata',
        'pingsan_tepuk_jidat',
        'pegang_hp',
        'pose_menang',
    ];
    $rawScene = (string) ($raw['scene'] ?? 'ngobrol_santai');
    $scene = in_array($rawScene, $allowedScenes, true) ? $rawScene : 'ngobrol_santai';
    $id = mb_substr(trim((string) ($raw['id'] ?? '')), 0, 48, 'UTF-8')
        ?: ('cb_custom_' . $fallbackIndex . '_' . yukmain_random_hex(4));

    $card = [
        'id'      => $id,
        'scene'   => $scene,
        'speaker' => $speaker,
        'caption' => $caption,
    ];
    if ($subtext !== '') {
        $card['subtext'] = $subtext;
    }
    return $card;
}

function yukmain_finalize_completed_game_record(int $matchIndex, string $gameType, int $roundsPlayed, array $players, int $finishedAtMs): ?array
{
    if ($roundsPlayed <= 0) {
        return null;
    }

    $scoresByUid = [];
    $playerNamesByUid = [];
    $maxScore = 0;

    foreach ($players as $p) {
        $score = max(0, (int) round((float) ($p['score'] ?? 0)));
        $scoresByUid[$p['uid']] = $score;
        $playerNamesByUid[$p['uid']] = mb_substr((string) ($p['displayName'] ?? 'Pemain'), 0, 40, 'UTF-8');
        if ($score > $maxScore) {
            $maxScore = $score;
        }
    }

    $winnerUids = [];
    $winnerNames = [];
    if ($maxScore > 0) {
        foreach ($players as $p) {
            $score = max(0, (int) round((float) ($p['score'] ?? 0)));
            if ($score === $maxScore) {
                $winnerUids[] = $p['uid'];
                $winnerNames[] = mb_substr((string) ($p['displayName'] ?? 'Pemain'), 0, 40, 'UTF-8');
            }
        }
    }

    return [
        'matchIndex'        => $matchIndex,
        'gameType'          => $gameType,
        'roundsPlayed'      => $roundsPlayed,
        'scoresByUid'       => $scoresByUid,
        'playerNamesByUid'  => $playerNamesByUid,
        'winnerUids'        => $winnerUids,
        'winnerNames'       => $winnerNames,
        'finishedAtMs'      => $finishedAtMs,
    ];
}

function yukmain_build_session_recap(array $completedGames, array $players, int $generatedAtMs): array
{
    $recapId = 'recap_' . $generatedAtMs;
    $standingsMap = [];

    foreach ($players as $p) {
        $standingsMap[$p['uid']] = [
            'uid'          => $p['uid'],
            'displayName'  => mb_substr((string) ($p['displayName'] ?? 'Pemain'), 0, 40, 'UTF-8'),
            'avatarColor'  => (string) ($p['avatarColor'] ?? '#6366F1'),
            'gamesWon'     => 0,
            'overallXp'    => 0,
            'wonGameTypes' => [],
        ];
    }

    foreach ($completedGames as $match) {
        foreach (($match['scoresByUid'] ?? []) as $uid => $score) {
            if (!isset($standingsMap[$uid])) {
                $standingsMap[$uid] = [
                    'uid'          => $uid,
                    'displayName'  => mb_substr((string) ($match['playerNamesByUid'][$uid] ?? 'Pemain'), 0, 40, 'UTF-8'),
                    'avatarColor'  => '#64748B',
                    'gamesWon'     => 0,
                    'overallXp'    => 0,
                    'wonGameTypes' => [],
                ];
            }
            $standingsMap[$uid]['overallXp'] += max(0, (int) round((float) $score));
        }

        foreach (($match['winnerUids'] ?? []) as $winnerUid) {
            if (isset($standingsMap[$winnerUid])) {
                $standingsMap[$winnerUid]['gamesWon']++;
                $standingsMap[$winnerUid]['wonGameTypes'][] = $match['gameType'];
            }
        }
    }

    $standings = array_values($standingsMap);
    usort($standings, static function (array $a, array $b): int {
        if ($b['gamesWon'] !== $a['gamesWon']) return $b['gamesWon'] <=> $a['gamesWon'];
        if ($b['overallXp'] !== $a['overallXp']) return $b['overallXp'] <=> $a['overallXp'];
        return strcmp($a['displayName'], $b['displayName']);
    });

    if (empty($standings) || empty($completedGames)) {
        return [
            'recapId'        => $recapId,
            'generatedAtMs'  => $generatedAtMs,
            'completedGames' => $completedGames,
            'standings'      => $standings,
            'mvpUids'        => [],
            'mvpNames'       => [],
            'resolvedBy'     => 'none',
            'tiebreakerDuel' => null,
        ];
    }

    $topWins = max(array_column($standings, 'gamesWon'));
    $tiedOnWins = array_values(array_filter($standings, static fn(array $s): bool => $s['gamesWon'] === $topWins));
    if (count($tiedOnWins) === 1) {
        return [
            'recapId'        => $recapId,
            'generatedAtMs'  => $generatedAtMs,
            'completedGames' => $completedGames,
            'standings'      => $standings,
            'mvpUids'        => [$tiedOnWins[0]['uid']],
            'mvpNames'       => [$tiedOnWins[0]['displayName']],
            'resolvedBy'     => 'games_won',
            'tiebreakerDuel' => null,
        ];
    }

    $topXp = max(array_column($tiedOnWins, 'overallXp'));
    $tiedOnBoth = array_values(array_filter($tiedOnWins, static fn(array $s): bool => $s['overallXp'] === $topXp));
    if (count($tiedOnBoth) === 1) {
        return [
            'recapId'        => $recapId,
            'generatedAtMs'  => $generatedAtMs,
            'completedGames' => $completedGames,
            'standings'      => $standings,
            'mvpUids'        => [$tiedOnBoth[0]['uid']],
            'mvpNames'       => [$tiedOnBoth[0]['displayName']],
            'resolvedBy'     => 'overall_xp',
            'tiebreakerDuel' => null,
        ];
    }

    $presentSet = array_flip(array_column($players, 'uid'));
    $presentFinalists = array_values(array_filter($tiedOnBoth, static fn(array $s): bool => isset($presentSet[$s['uid']])));
    $finalists = count($presentFinalists) >= 2 ? $presentFinalists : $tiedOnBoth;

    $winsByUid = [];
    $duelistNames = [];
    foreach ($finalists as $f) {
        $winsByUid[$f['uid']] = 0;
        $duelistNames[$f['uid']] = $f['displayName'];
    }

    return [
        'recapId'        => $recapId,
        'generatedAtMs'  => $generatedAtMs,
        'completedGames' => $completedGames,
        'standings'      => $standings,
        'mvpUids'        => [],
        'mvpNames'       => [],
        'resolvedBy'     => 'suit_duel',
        'tiebreakerDuel' => [
            'duelId'        => 'duel_' . $generatedAtMs,
            'status'        => 'picking',
            'duelistUids'   => array_column($finalists, 'uid'),
            'duelistNames'  => $duelistNames,
            'clashNumber'   => 1,
            'targetWins'    => 2,
            'winsByUid'     => $winsByUid,
            'submittedUids' => [],
            'lastClash'     => null,
            'history'       => [],
            'championUids'  => [],
        ],
    ];
}

function yukmain_evaluate_suit_clash(array $duel, array $picksByUid): array
{
    $beats = ['batu' => 'gunting', 'gunting' => 'kertas', 'kertas' => 'batu'];
    $distinct = [];
    foreach ($duel['duelistUids'] as $uid) {
        $p = $picksByUid[$uid] ?? '';
        if ($p !== '' && !in_array($p, $distinct, true)) {
            $distinct[] = $p;
        }
    }

    $winnerUids = [];
    $isDraw = true;
    if (count($distinct) === 2) {
        [$a, $b] = $distinct;
        $winningPick = (($beats[$a] ?? '') === $b) ? $a : $b;
        foreach ($duel['duelistUids'] as $uid) {
            if (($picksByUid[$uid] ?? '') === $winningPick) {
                $winnerUids[] = $uid;
            }
        }
        $isDraw = false;
    }

    $nextWins = $duel['winsByUid'];
    foreach ($winnerUids as $uid) {
        $nextWins[$uid] = ((int) ($nextWins[$uid] ?? 0)) + 1;
    }

    $clashRecord = [
        'clashNumber' => $duel['clashNumber'],
        'picksByUid'  => $picksByUid,
        'winnerUids'  => $winnerUids,
        'isDraw'      => $isDraw,
    ];
    $history = array_slice(array_merge($duel['history'] ?? [], [$clashRecord]), -20);

    $maxWins = 0;
    foreach ($duel['duelistUids'] as $uid) {
        $w = (int) ($nextWins[$uid] ?? 0);
        if ($w > $maxWins) $maxWins = $w;
    }
    $leaders = array_values(array_filter(
        $duel['duelistUids'],
        static fn(string $uid): bool => (int) ($nextWins[$uid] ?? 0) === $maxWins
    ));
    $hasSoleChampion = $maxWins >= (int) $duel['targetWins'] && count($leaders) === 1;
    $nextDuelists = ($maxWins >= (int) $duel['targetWins'] && count($leaders) > 1)
        ? $leaders
        : $duel['duelistUids'];

    return array_merge($duel, [
        'duelistUids'   => $nextDuelists,
        'status'        => $hasSoleChampion ? 'finished' : 'clash_reveal',
        'winsByUid'     => $nextWins,
        'submittedUids' => $duel['duelistUids'],
        'lastClash'     => $clashRecord,
        'history'       => $history,
        'championUids'  => $hasSoleChampion ? $leaders : [],
    ]);
}

function yukmain_should_auto_reset_expired_room(array $presence, ?int $lastEmptyAtMs, int $nowMs, string $excludeUid): bool
{
    $playerEntries = [];
    foreach ($presence as $entry) {
        if (!empty($entry['isStage']) || ($entry['uid'] ?? '') === $excludeUid) {
            continue;
        }
        $playerEntries[] = $entry;
        if (!empty($entry['online'])) {
            return false;
        }
    }

    $latestOfflineMs = $lastEmptyAtMs ?? 0;
    foreach ($playerEntries as $entry) {
        $ls = (int) ($entry['lastSeen'] ?? 0);
        if ($ls > $latestOfflineMs) {
            $latestOfflineMs = $ls;
        }
    }

    if ($latestOfflineMs <= 0) {
        return false;
    }

    return ($nowMs - $latestOfflineMs) >= YUKMAIN_EMPTY_ROOM_RESET_GRACE_MS;
}
