<?php
declare(strict_types=1);

require_once __DIR__ . '/engine_common.php';

function yukmain_ut_data(): array
{
    $packs = yukmain_packs();
    return is_array($packs['ular_tangga'] ?? null) ? $packs['ular_tangga'] : [];
}

function yukmain_ut_hero_class_meta(string $classId): array
{
    $classes = yukmain_ut_data()['heroClasses'] ?? [];
    return $classes[$classId] ?? $classes['ksatria'] ?? [
        'id'              => 'ksatria',
        'name'            => 'Ksatria',
        'maxHp'           => 16,
        'combatBonus'     => 1,
        'damageReduction' => 2,
        'chestGoldBonus'  => 0,
        'ladderHealBonus' => 0,
        'skillCooldown'   => 3,
    ];
}

function yukmain_ut_item_meta(string $itemId): ?array
{
    $items = yukmain_ut_data()['items'] ?? [];
    return is_array($items[$itemId] ?? null) ? $items[$itemId] : null;
}

function yukmain_ut_scenario_pack(?string $scenarioId): array
{
    $scenarios = yukmain_ut_data()['scenarios'] ?? [];
    if ($scenarioId !== null && isset($scenarios[$scenarioId]) && is_array($scenarios[$scenarioId])) {
        return $scenarios[$scenarioId];
    }
    return $scenarios['menara_nusantara'] ?? [
        'id'                => 'menara_nusantara',
        'name'              => 'Menara Nusantara',
        'ladderLabel'       => 'Tangga Bambu Suci',
        'snakeLabel'        => 'Sarang Ular Keramat',
        'merchantLabel'     => 'Kedai Tabib Keliling',
        'ladders'           => [],
        'snakesStandard'    => [],
        'snakesBrutalExtra' => [],
        'chestTiles'        => [],
        'monsterTiles'      => [],
        'shopTiles'         => [],
        'monsters'          => [],
    ];
}

function yukmain_ut_active_snakes(array $pack, string $boardMode): array
{
    $std = is_array($pack['snakesStandard'] ?? null) ? $pack['snakesStandard'] : [];
    if ($boardMode === 'brutal') {
        $extra = is_array($pack['snakesBrutalExtra'] ?? null) ? $pack['snakesBrutalExtra'] : [];
        return array_merge($std, $extra);
    }
    return $std;
}

function yukmain_ut_clamp(int $val, int $min, int $max): int
{
    return max($min, min($max, $val));
}

function yukmain_ut_append_log(array $log, string $line): array
{
    array_unshift($log, $line);
    return array_slice($log, 0, 12);
}

function yukmain_ut_apply_ko_if_needed(array $hero, array $log): array
{
    if ((int) ($hero['hp'] ?? 0) > 0) {
        return ['hero' => $hero, 'log' => $log, 'knockedOut' => false];
    }
    $nextTile = max(1, ((int) $hero['tile']) - 8);
    $nextGold = intdiv((int) $hero['gold'], 2);
    $revived = array_merge($hero, [
        'tile'       => $nextTile,
        'hp'         => (int) $hero['maxHp'],
        'gold'       => $nextGold,
        'shielded'   => false,
        'bonusSteps' => 0,
        'koCount'    => ((int) ($hero['koCount'] ?? 0)) + 1,
    ]);
    $msg = "{$hero['displayName']} PINGSAN! Jatuh ke Petak {$nextTile}, kehilangan separuh Koin, dan bangkit dengan HP penuh.";
    return [
        'hero'       => $revived,
        'log'        => yukmain_ut_append_log($log, $msg),
        'knockedOut' => true,
    ];
}

function yukmain_ut_create_round(array $players, array $rawSettings, string $roundId): array
{
    $settings = yukmain_sanitize_ular_tangga_settings($rawSettings);
    $activePlayers = yukmain_filter_active_players($players);
    if (count($activePlayers) < 2) {
        throw new RuntimeException('Minimal 2 pemain aktif (tidak BRB) untuk memulai Ular Tangga RP.');
    }

    $turnOrder = yukmain_shuffle(array_column($activePlayers, 'uid'));
    $classOrder = ['ksatria', 'pencuri', 'penyihir', 'tabib'];
    $classSelections = is_array($settings['classSelectionByUid'])
        ? $settings['classSelectionByUid']
        : [];

    $heroesByUid = [];
    $secretsByUid = [];

    foreach ($activePlayers as $p) {
        $uid = (string) $p['uid'];
        $choice = $classSelections[$uid] ?? 'acak';
        $heroClass = in_array($choice, $classOrder, true)
            ? $choice
            : $classOrder[random_int(0, count($classOrder) - 1)];
        $meta = yukmain_ut_hero_class_meta($heroClass);
        $maxHp = (int) $meta['maxHp'];
        $starterItem = random_int(0, 1) === 0 ? 'ramuan_hp' : 'sepatu_kilat';

        $heroesByUid[$uid] = [
            'uid'              => $uid,
            'displayName'      => (string) $p['displayName'],
            'avatarColor'      => (string) $p['avatarColor'],
            'heroClass'        => $heroClass,
            'tile'             => 1,
            'hp'               => $maxHp,
            'maxHp'            => $maxHp,
            'gold'             => 25,
            'shielded'         => false,
            'bonusSteps'       => 0,
            'skillCooldown'    => 0,
            'bagCount'         => 1,
            'koCount'          => 0,
            'monstersDefeated' => 0,
        ];

        $secretsByUid[$uid] = [
            'uid'           => $uid,
            'roundId'       => $roundId,
            'gameType'      => 'ular_tangga',
            'ularHeroClass' => $heroClass,
            'ularBag'       => [$starterItem],
        ];
    }

    $pack = yukmain_ut_scenario_pack((string) $settings['scenarioId']);
    $firstUid = $turnOrder[0];
    $firstName = $heroesByUid[$firstUid]['displayName'] ?? 'Pemain';

    return [
        'state' => [
            'scenarioId'        => $settings['scenarioId'],
            'boardMode'         => $settings['boardMode'],
            'exactFinishBounce' => $settings['exactFinishBounce'],
            'phase'             => 'turn_action',
            'turnOrder'         => $turnOrder,
            'currentTurnIndex'  => 0,
            'currentTurnUid'    => $firstUid,
            'currentTurnName'   => $firstName,
            'turnNumber'        => 1,
            'usedSkillThisTurn' => false,
            'usedItemThisTurn'  => false,
            'lastRoll'          => null,
            'activeEncounter'   => null,
            'heroesByUid'       => $heroesByUid,
            'eventLog'          => [
                "Petualangan dimulai di {$pack['name']}! Giliran pertama: {$firstName}.",
            ],
            'winnerUid'         => null,
            'winnerName'        => null,
        ],
        'secretsByUid' => $secretsByUid,
    ];
}

function yukmain_ut_advance_turn(array $state, array $activeBrbSet = []): array
{
    $turnOrder = is_array($state['turnOrder'] ?? null) ? $state['turnOrder'] : [];
    if (($state['phase'] ?? '') === 'reveal' || empty($turnOrder)) {
        return $state;
    }

    $heroes = is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : [];
    $currentUid = (string) ($state['currentTurnUid'] ?? '');
    if (isset($heroes[$currentUid]) && ((int) ($heroes[$currentUid]['skillCooldown'] ?? 0)) > 0) {
        $heroes[$currentUid]['skillCooldown'] = max(0, ((int) $heroes[$currentUid]['skillCooldown']) - 1);
    }

    $count = count($turnOrder);
    $nextIdx = (((int) ($state['currentTurnIndex'] ?? 0)) + 1) % $count;
    for ($i = 0; $i < $count; $i++) {
        $candidate = (string) $turnOrder[$nextIdx];
        if (!isset($activeBrbSet[$candidate]) && isset($heroes[$candidate])) {
            break;
        }
        $nextIdx = ($nextIdx + 1) % $count;
    }

    $nextUid = (string) $turnOrder[$nextIdx];
    $nextName = (string) ($heroes[$nextUid]['displayName'] ?? 'Pemain');

    return array_merge($state, [
        'phase'             => 'turn_action',
        'currentTurnIndex'  => $nextIdx,
        'currentTurnUid'    => $nextUid,
        'currentTurnName'   => $nextName,
        'turnNumber'        => ((int) ($state['turnNumber'] ?? 1)) + 1,
        'usedSkillThisTurn' => false,
        'usedItemThisTurn'  => false,
        'activeEncounter'   => null,
        'heroesByUid'       => $heroes,
    ]);
}

function yukmain_ut_apply_skill(array $state, string $actorUid, ?string $targetUid = null): array
{
    if (($state['phase'] ?? '') !== 'turn_action' || ($state['currentTurnUid'] ?? '') !== $actorUid) {
        throw new RuntimeException('Skill hanya bisa dipakai saat giliranmu sebelum melempar dadu.');
    }
    if (!empty($state['usedSkillThisTurn'])) {
        throw new RuntimeException('Kamu sudah memakai Skill di giliran ini.');
    }
    $heroes = is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : [];
    $actor = $heroes[$actorUid] ?? null;
    if (!is_array($actor)) {
        throw new RuntimeException('Hero tidak ditemukan.');
    }
    if (((int) ($actor['skillCooldown'] ?? 0)) > 0) {
        throw new RuntimeException("Skill masih cooldown {$actor['skillCooldown']} giliran lagi.");
    }

    $classId = (string) $actor['heroClass'];
    $meta = yukmain_ut_hero_class_meta($classId);
    $cd = (int) ($meta['skillCooldown'] ?? 3);
    $validTargetUid = ($targetUid !== null && $targetUid !== '' && $targetUid !== $actorUid && isset($heroes[$targetUid]))
        ? $targetUid
        : null;

    $message = '';
    if ($classId === 'tabib') {
        $healedHp = yukmain_ut_clamp(((int) $actor['hp']) + 5, 1, (int) $actor['maxHp']);
        $heroes[$actorUid] = array_merge($actor, [
            'hp'            => $healedHp,
            'shielded'      => true,
            'skillCooldown' => $cd,
        ]);
        $message = "{$actor['displayName']} merapal Doa Pelindung (+5 HP & Perisai Anti-Ular aktif)!";
    } elseif ($classId === 'ksatria') {
        if ($validTargetUid !== null) {
            $target = $heroes[$validTargetUid];
            $nextTile = max(1, ((int) $target['tile']) - 3);
            $heroes[$validTargetUid] = array_merge($target, ['tile' => $nextTile]);
            $heroes[$actorUid] = array_merge($actor, ['skillCooldown' => $cd]);
            $message = "{$actor['displayName']} menghantam {$target['displayName']} dengan Bantingan Perisai (-3 petak → Petak {$nextTile})!";
        } else {
            $heroes[$actorUid] = array_merge($actor, [
                'bonusSteps'    => ((int) $actor['bonusSteps']) + 2,
                'skillCooldown' => $cd,
            ]);
            $message = "{$actor['displayName']} bersiap menerjang (+2 langkah ekstra di dadu ini)!";
        }
    } elseif ($classId === 'pencuri') {
        if ($validTargetUid !== null) {
            $target = $heroes[$validTargetUid];
            $stolen = min(15, (int) $target['gold']);
            $heroes[$validTargetUid] = array_merge($target, ['gold' => ((int) $target['gold']) - $stolen]);
            $heroes[$actorUid] = array_merge($actor, [
                'gold'          => ((int) $actor['gold']) + $stolen,
                'skillCooldown' => $cd,
            ]);
            $message = "{$actor['displayName']} melancarkan Copet Kilat dan mencuri {$stolen}G dari {$target['displayName']}!";
        } else {
            $heroes[$actorUid] = array_merge($actor, [
                'bonusSteps'    => ((int) $actor['bonusSteps']) + 3,
                'skillCooldown' => $cd,
            ]);
            $message = "{$actor['displayName']} memicu Langkah Kilat (+3 langkah ekstra di dadu ini)!";
        }
    } else {
        if ($validTargetUid !== null) {
            $target = $heroes[$validTargetUid];
            $nextTile = max(1, ((int) $target['tile']) - 4);
            $heroes[$validTargetUid] = array_merge($target, ['tile' => $nextTile]);
            $heroes[$actorUid] = array_merge($actor, ['skillCooldown' => $cd]);
            $message = "{$actor['displayName']} merapal Sihir Petak ke {$target['displayName']} (terlempar -4 petak → Petak {$nextTile})!";
        } else {
            $heroes[$actorUid] = array_merge($actor, [
                'bonusSteps'    => ((int) $actor['bonusSteps']) + 4,
                'skillCooldown' => $cd,
            ]);
            $message = "{$actor['displayName']} menyiapkan Teleportasi (+4 langkah ekstra di dadu ini)!";
        }
    }

    $log = yukmain_ut_append_log(is_array($state['eventLog'] ?? null) ? $state['eventLog'] : [], $message);
    return [
        'state' => array_merge($state, [
            'usedSkillThisTurn' => true,
            'heroesByUid'       => $heroes,
            'eventLog'          => $log,
        ]),
        'message' => $message,
    ];
}

function yukmain_ut_apply_bag_item(
    array $state,
    string $actorUid,
    array $actorBag,
    string $itemId,
    ?string $targetUid = null
): array {
    if (($state['phase'] ?? '') !== 'turn_action' || ($state['currentTurnUid'] ?? '') !== $actorUid) {
        throw new RuntimeException('Item hanya bisa dipakai saat giliranmu sebelum melempar dadu.');
    }
    if (!empty($state['usedItemThisTurn'])) {
        throw new RuntimeException('Maksimal 1 Item per giliran.');
    }
    $idx = array_search($itemId, $actorBag, true);
    if ($idx === false) {
        throw new RuntimeException('Item tersebut tidak ada di tasmu.');
    }
    $heroes = is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : [];
    $actor = $heroes[$actorUid] ?? null;
    if (!is_array($actor)) {
        throw new RuntimeException('Hero tidak ditemukan.');
    }

    $nextBag = array_values($actorBag);
    array_splice($nextBag, (int) $idx, 1);
    $log = is_array($state['eventLog'] ?? null) ? $state['eventLog'] : [];
    $message = '';

    if ($itemId === 'ramuan_hp') {
        $heroes[$actorUid] = array_merge($actor, [
            'hp'       => yukmain_ut_clamp(((int) $actor['hp']) + 6, 1, (int) $actor['maxHp']),
            'bagCount' => count($nextBag),
        ]);
        $message = "{$actor['displayName']} meminum Ramuan HP (+6 HP)!";
    } elseif ($itemId === 'jimat_anti_ular') {
        $heroes[$actorUid] = array_merge($actor, [
            'shielded' => true,
            'bagCount' => count($nextBag),
        ]);
        $message = "{$actor['displayName']} mengaktifkan Jimat Anti-Ular!";
    } elseif ($itemId === 'sepatu_kilat') {
        $heroes[$actorUid] = array_merge($actor, [
            'bonusSteps' => ((int) $actor['bonusSteps']) + 3,
            'bagCount'   => count($nextBag),
        ]);
        $message = "{$actor['displayName']} memakai Sepatu Kilat (+3 langkah untuk dadu ini)!";
    } elseif ($itemId === 'gulungan_tukar') {
        if ($targetUid === null || $targetUid === '' || $targetUid === $actorUid || !isset($heroes[$targetUid])) {
            throw new RuntimeException('Pilih 1 lawan valid untuk bertukar posisi.');
        }
        $target = $heroes[$targetUid];
        $actorTile = (int) $actor['tile'];
        $targetTile = (int) $target['tile'];
        $heroes[$actorUid] = array_merge($actor, ['tile' => $targetTile, 'bagCount' => count($nextBag)]);
        $heroes[$targetUid] = array_merge($target, ['tile' => $actorTile]);
        $message = "{$actor['displayName']} mengaktifkan Gulungan Tukar dan bertukar posisi dengan {$target['displayName']} (Petak {$actorTile} ↔ {$targetTile})!";
    } elseif ($itemId === 'bom_ular') {
        if ($targetUid === null || $targetUid === '' || $targetUid === $actorUid || !isset($heroes[$targetUid])) {
            throw new RuntimeException('Pilih 1 lawan valid sebagai sasaran Bom Ular.');
        }
        $target = $heroes[$targetUid];
        $targetMeta = yukmain_ut_hero_class_meta((string) $target['heroClass']);
        $dmg = max(1, 3 - ((int) ($targetMeta['damageReduction'] ?? 0)));
        $bombed = array_merge($target, [
            'tile' => max(1, ((int) $target['tile']) - 5),
            'hp'   => max(0, ((int) $target['hp']) - $dmg),
        ]);
        $koRes = yukmain_ut_apply_ko_if_needed($bombed, $log);
        $heroes[$targetUid] = $koRes['hero'];
        $log = $koRes['log'];
        $heroes[$actorUid] = array_merge($actor, ['bagCount' => count($nextBag)]);
        $message = "{$actor['displayName']} melempar Bom Ular ke {$target['displayName']} (-5 petak, -{$dmg} HP)!";
    } else {
        throw new RuntimeException('Item tidak dikenali.');
    }

    $log = yukmain_ut_append_log($log, $message);
    return [
        'state' => array_merge($state, [
            'usedItemThisTurn' => true,
            'heroesByUid'      => $heroes,
            'eventLog'         => $log,
        ]),
        'nextBag' => $nextBag,
        'message' => $message,
    ];
}

function yukmain_ut_score_deltas(array $state): array
{
    $heroes = array_values(is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : []);
    usort($heroes, static function (array $a, array $b): int {
        if ((int) $b['tile'] !== (int) $a['tile']) {
            return (int) $b['tile'] <=> (int) $a['tile'];
        }
        if ((int) $b['gold'] !== (int) $a['gold']) {
            return (int) $b['gold'] <=> (int) $a['gold'];
        }
        return (int) $b['hp'] <=> (int) $a['hp'];
    });

    $deltas = [];
    foreach ($heroes as $idx => $hero) {
        $uid = (string) $hero['uid'];
        if ($idx === 0) $deltas[$uid] = 5;
        elseif ($idx === 1) $deltas[$uid] = 3;
        elseif ($idx === 2) $deltas[$uid] = 2;
        else $deltas[$uid] = 1;
    }
    return $deltas;
}

function yukmain_ut_roll_dice_and_move(
    array $state,
    string $actorUid,
    array $actorBag,
    array $activeBrbSet = []
): array {
    if (($state['phase'] ?? '') !== 'turn_action' || ($state['currentTurnUid'] ?? '') !== $actorUid) {
        throw new RuntimeException('Bukan giliranmu untuk melempar dadu.');
    }
    $heroes = is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : [];
    $actor = $heroes[$actorUid] ?? null;
    if (!is_array($actor)) {
        throw new RuntimeException('Hero tidak ditemukan.');
    }

    $pack = yukmain_ut_scenario_pack((string) ($state['scenarioId'] ?? 'menara_nusantara'));
    $snakes = yukmain_ut_active_snakes($pack, (string) ($state['boardMode'] ?? 'standar'));
    $classMeta = yukmain_ut_hero_class_meta((string) $actor['heroClass']);

    $dice = random_int(1, 6);
    $bonus = (int) ($actor['bonusSteps'] ?? 0);
    $fromTile = (int) $actor['tile'];
    $rawDest = $fromTile + $dice + $bonus;

    $landedTile = $rawDest;
    $bounceNote = '';
    if ($rawDest > 100) {
        if (!empty($state['exactFinishBounce'])) {
            $landedTile = 100 - ($rawDest - 100);
            $bounceNote = " (pantul balik dari 100 ke {$landedTile})";
        } else {
            $landedTile = 100;
        }
    }

    $nextHero = array_merge($actor, [
        'tile'       => $landedTile,
        'bonusSteps' => 0,
    ]);
    $nextBag = array_values($actorBag);
    $log = is_array($state['eventLog'] ?? null) ? $state['eventLog'] : [];
    $bonusSuffix = $bonus > 0 ? "+{$bonus}" : '';
    $summary = "{$actor['displayName']} melempar dadu {$dice}{$bonusSuffix} → Petak {$landedTile}{$bounceNote}.";

    if ($landedTile === 100) {
        $heroes[$actorUid] = $nextHero;
        $summary = "{$actor['displayName']} mencapai Petak 100 dan MENANG di {$pack['name']}!";
        $log = yukmain_ut_append_log($log, $summary);
        return [
            'state' => array_merge($state, [
                'phase'       => 'reveal',
                'lastRoll'    => [
                    'uid'         => $actorUid,
                    'displayName' => $actor['displayName'],
                    'dice'        => $dice,
                    'bonus'       => $bonus,
                    'fromTile'    => $fromTile,
                    'toTile'      => 100,
                    'summary'     => $summary,
                ],
                'heroesByUid' => $heroes,
                'eventLog'    => $log,
                'winnerUid'   => $actorUid,
                'winnerName'  => $actor['displayName'],
            ]),
            'nextBag'  => $nextBag,
            'finished' => true,
            'message'  => $summary,
        ];
    }

    $ladder = null;
    foreach (($pack['ladders'] ?? []) as $l) {
        if ((int) ($l['from'] ?? 0) === $landedTile) {
            $ladder = $l;
            break;
        }
    }
    $snake = null;
    foreach ($snakes as $s) {
        if ((int) ($s['from'] ?? 0) === $landedTile) {
            $snake = $s;
            break;
        }
    }

    $chestTiles = array_map('intval', $pack['chestTiles'] ?? []);
    $monsterTiles = array_map('intval', $pack['monsterTiles'] ?? []);
    $shopTiles = array_map('intval', $pack['shopTiles'] ?? []);

    if ($ladder !== null) {
        $healAmt = 2 + ((int) ($classMeta['ladderHealBonus'] ?? 0));
        $toTile = (int) $ladder['to'];
        $nextHero = array_merge($nextHero, [
            'tile' => $toTile,
            'hp'   => yukmain_ut_clamp(((int) $nextHero['hp']) + $healAmt, 1, (int) $nextHero['maxHp']),
        ]);
        $summary = "{$actor['displayName']} melempar {$dice}{$bonusSuffix} ke Petak {$landedTile}, naik {$pack['ladderLabel']} ke Petak {$toTile} (+{$healAmt} HP)!";
    } elseif ($snake !== null) {
        if (!empty($nextHero['shielded'])) {
            $nextHero['shielded'] = false;
            $summary = "{$actor['displayName']} mendarat di {$pack['snakeLabel']} ({$landedTile}), tapi Perisai Anti-Ular menangkis gigitannya!";
        } else {
            $dmg = max(1, 4 - ((int) ($classMeta['damageReduction'] ?? 0)));
            $toTile = (int) $snake['to'];
            $nextHero = array_merge($nextHero, [
                'tile' => $toTile,
                'hp'   => max(0, ((int) $nextHero['hp']) - $dmg),
            ]);
            $summary = "{$actor['displayName']} tergigit {$pack['snakeLabel']} ({$landedTile} → {$toTile}, -{$dmg} HP)!";
            $koRes = yukmain_ut_apply_ko_if_needed($nextHero, $log);
            $nextHero = $koRes['hero'];
            $log = $koRes['log'];
        }
    } elseif (in_array($landedTile, $chestTiles, true)) {
        $goldGain = 20 + ((int) ($classMeta['chestGoldBonus'] ?? 0));
        $itemNote = '';
        $itemIds = ['ramuan_hp', 'jimat_anti_ular', 'sepatu_kilat', 'bom_ular', 'gulungan_tukar'];
        if (count($nextBag) < 3) {
            $drawn = $itemIds[random_int(0, count($itemIds) - 1)];
            $nextBag[] = $drawn;
            $itemMeta = yukmain_ut_item_meta($drawn);
            $itemName = $itemMeta['name'] ?? $drawn;
            $itemNote = " & menemukan {$itemName}";
        }
        $nextHero = array_merge($nextHero, [
            'gold'     => ((int) $nextHero['gold']) + $goldGain,
            'bagCount' => count($nextBag),
        ]);
        $summary = "{$actor['displayName']} membuka Peti Harta di Petak {$landedTile}: +{$goldGain}G{$itemNote}!";
    } elseif (in_array($landedTile, $monsterTiles, true)) {
        $monsters = $pack['monsters'] ?? [];
        $template = $monsters[random_int(0, max(0, count($monsters) - 1))];
        $powerScale = (($state['boardMode'] ?? 'standar') === 'brutal') ? 1 : 0;
        $heroes[$actorUid] = $nextHero;
        $summary = "{$actor['displayName']} dihadang {$template['name']} di Petak {$landedTile}!";
        $log = yukmain_ut_append_log($log, $summary);
        return [
            'state' => array_merge($state, [
                'phase'           => 'encounter',
                'lastRoll'        => [
                    'uid'         => $actorUid,
                    'displayName' => $actor['displayName'],
                    'dice'        => $dice,
                    'bonus'       => $bonus,
                    'fromTile'    => $fromTile,
                    'toTile'      => (int) $nextHero['tile'],
                    'summary'     => $summary,
                ],
                'activeEncounter' => [
                    'type'              => 'monster',
                    'tile'              => $landedTile,
                    'monsterId'         => $template['id'],
                    'monsterName'       => $template['name'],
                    'monsterPower'      => ((int) $template['power']) + $powerScale,
                    'monsterDamage'     => (int) $template['damage'],
                    'monsterRewardGold' => (int) $template['rewardGold'],
                    'monsterFlavor'     => $template['flavor'],
                ],
                'heroesByUid'     => $heroes,
                'eventLog'        => $log,
            ]),
            'nextBag'  => $nextBag,
            'finished' => false,
            'message'  => $summary,
        ];
    } elseif (in_array($landedTile, $shopTiles, true)) {
        $heroes[$actorUid] = $nextHero;
        $summary = "{$actor['displayName']} mampir di {$pack['merchantLabel']} (Petak {$landedTile}).";
        $log = yukmain_ut_append_log($log, $summary);
        return [
            'state' => array_merge($state, [
                'phase'           => 'encounter',
                'lastRoll'        => [
                    'uid'         => $actorUid,
                    'displayName' => $actor['displayName'],
                    'dice'        => $dice,
                    'bonus'       => $bonus,
                    'fromTile'    => $fromTile,
                    'toTile'      => (int) $nextHero['tile'],
                    'summary'     => $summary,
                ],
                'activeEncounter' => [
                    'type' => 'merchant',
                    'tile' => $landedTile,
                ],
                'heroesByUid'     => $heroes,
                'eventLog'        => $log,
            ]),
            'nextBag'  => $nextBag,
            'finished' => false,
            'message'  => $summary,
        ];
    }

    $log = yukmain_ut_append_log($log, $summary);
    $heroes[$actorUid] = $nextHero;
    $updatedState = array_merge($state, [
        'lastRoll'    => [
            'uid'         => $actorUid,
            'displayName' => $actor['displayName'],
            'dice'        => $dice,
            'bonus'       => $bonus,
            'fromTile'    => $fromTile,
            'toTile'      => (int) $nextHero['tile'],
            'summary'     => $summary,
        ],
        'heroesByUid' => $heroes,
        'eventLog'    => $log,
    ]);

    return [
        'state'    => yukmain_ut_advance_turn($updatedState, $activeBrbSet),
        'nextBag'  => $nextBag,
        'finished' => false,
        'message'  => $summary,
    ];
}

function yukmain_ut_resolve_encounter(
    array $state,
    string $actorUid,
    array $actorBag,
    string $decision,
    ?string $buyItemId = null,
    array $activeBrbSet = []
): array {
    $enc = $state['activeEncounter'] ?? null;
    if (($state['phase'] ?? '') !== 'encounter' || ($state['currentTurnUid'] ?? '') !== $actorUid || !is_array($enc)) {
        throw new RuntimeException('Tidak ada perjumpaan aktif untuk giliranmu.');
    }
    $heroes = is_array($state['heroesByUid'] ?? null) ? $state['heroesByUid'] : [];
    $actor = $heroes[$actorUid] ?? null;
    if (!is_array($actor)) {
        throw new RuntimeException('Hero tidak ditemukan.');
    }

    $nextBag = array_values($actorBag);
    $nextHero = $actor;
    $log = is_array($state['eventLog'] ?? null) ? $state['eventLog'] : [];
    $message = '';

    if (($enc['type'] ?? '') === 'monster') {
        $classMeta = yukmain_ut_hero_class_meta((string) $actor['heroClass']);
        $combatBonus = (int) ($classMeta['combatBonus'] ?? 0);
        $combatRoll = random_int(1, 6);
        $totalPower = $combatRoll + $combatBonus;
        $monsterPower = (int) ($enc['monsterPower'] ?? 5);

        if ($totalPower >= $monsterPower) {
            $goldReward = (int) ($enc['monsterRewardGold'] ?? 25);
            $bonusMove = min(100, ((int) $actor['tile']) + 2);
            $nextHero = array_merge($nextHero, [
                'gold'             => ((int) $nextHero['gold']) + $goldReward,
                'tile'             => $bonusMove,
                'monstersDefeated' => ((int) ($nextHero['monstersDefeated'] ?? 0)) + 1,
            ]);
            $message = "{$actor['displayName']} mengalahkan {$enc['monsterName']} (Serangan {$combatRoll}+{$combatBonus} vs {$monsterPower})! +{$goldReward}G & maju ke Petak {$bonusMove}!";
        } else {
            $dmg = max(1, ((int) ($enc['monsterDamage'] ?? 3)) - ((int) ($classMeta['damageReduction'] ?? 0)));
            $knockTile = max(1, ((int) $actor['tile']) - 2);
            $nextHero = array_merge($nextHero, [
                'hp'   => max(0, ((int) $nextHero['hp']) - $dmg),
                'tile' => $knockTile,
            ]);
            $message = "{$actor['displayName']} kewalahan melawan {$enc['monsterName']} ({$combatRoll}+{$combatBonus} vs {$monsterPower}): -{$dmg} HP & mundur ke Petak {$knockTile}.";
            $koRes = yukmain_ut_apply_ko_if_needed($nextHero, $log);
            $nextHero = $koRes['hero'];
            $log = $koRes['log'];
        }
    } else {
        $itemMeta = ($decision === 'buy' && $buyItemId !== null) ? yukmain_ut_item_meta($buyItemId) : null;
        if ($decision === 'buy' && is_array($itemMeta)) {
            if (count($nextBag) >= 3) {
                throw new RuntimeException('Tas penuh (maksimal 3 item). Gunakan dulu di giliran berikutnya atau pilih Lewati.');
            }
            $price = (int) $itemMeta['price'];
            if ((int) $nextHero['gold'] < $price) {
                throw new RuntimeException("Koin kurang (butuh {$price}G).");
            }
            $nextBag[] = $buyItemId;
            $nextHero = array_merge($nextHero, [
                'gold'     => ((int) $nextHero['gold']) - $price,
                'bagCount' => count($nextBag),
            ]);
            $message = "{$actor['displayName']} membeli {$itemMeta['name']} ({$price}G).";
        } else {
            $message = "{$actor['displayName']} beristirahat sejenak dan melanjutkan perjalanan.";
        }
    }

    $log = yukmain_ut_append_log($log, $message);
    $heroes[$actorUid] = $nextHero;

    if ((int) $nextHero['tile'] >= 100) {
        $pack = yukmain_ut_scenario_pack((string) ($state['scenarioId'] ?? 'menara_nusantara'));
        $winMsg = "{$actor['displayName']} mencapai Petak 100 dan MENANG di {$pack['name']}!";
        return [
            'state' => array_merge($state, [
                'phase'           => 'reveal',
                'activeEncounter' => null,
                'heroesByUid'     => $heroes,
                'eventLog'        => yukmain_ut_append_log($log, $winMsg),
                'winnerUid'       => $actorUid,
                'winnerName'      => $actor['displayName'],
            ]),
            'nextBag'  => $nextBag,
            'finished' => true,
            'message'  => $winMsg,
        ];
    }

    $nextState = yukmain_ut_advance_turn(
        array_merge($state, [
            'activeEncounter' => null,
            'heroesByUid'     => $heroes,
            'eventLog'        => $log,
        ]),
        $activeBrbSet
    );

    return [
        'state'    => $nextState,
        'nextBag'  => $nextBag,
        'finished' => false,
        'message'  => $message,
    ];
}

function yukmain_ut_ensure_turn_valid(array $room, array $players): ?array
{
    $uts = $room['ularTanggaState'] ?? null;
    if (($room['status'] ?? '') !== 'playing' || !is_array($uts) || ($uts['phase'] ?? '') === 'reveal') {
        return null;
    }

    $byUid = [];
    $brbSet = [];
    foreach ($players as $p) {
        $byUid[(string) $p['uid']] = $p;
        if (!empty($p['isBrb'])) {
            $brbSet[(string) $p['uid']] = true;
        }
    }

    $currentUid = (string) ($uts['currentTurnUid'] ?? '');
    $currentInvalid = !isset($byUid[$currentUid]) || isset($brbSet[$currentUid]);
    if (!$currentInvalid) {
        return null;
    }

    $heroes = is_array($uts['heroesByUid'] ?? null) ? $uts['heroesByUid'] : [];
    $remainingActive = 0;
    foreach (($uts['turnOrder'] ?? []) as $uid) {
        if (isset($byUid[$uid]) && !isset($brbSet[$uid]) && isset($heroes[$uid])) {
            $remainingActive++;
        }
    }
    if ($remainingActive === 0) {
        return null;
    }

    $nextState = yukmain_ut_advance_turn($uts, $brbSet);
    $nextState['eventLog'] = yukmain_ut_append_log(
        is_array($nextState['eventLog'] ?? null) ? $nextState['eventLog'] : [],
        "Giliran diteruskan ke {$nextState['currentTurnName']} karena pemain sebelumnya keluar/BRB."
    );
    return $nextState;
}
