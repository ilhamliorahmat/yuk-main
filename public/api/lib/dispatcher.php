<?php
declare(strict_types=1);

require_once __DIR__ . '/rooms.php';
require_once __DIR__ . '/engine_games_social.php';
require_once __DIR__ . '/engine_malam_siluman.php';
require_once __DIR__ . '/engine_ular_tangga.php';

function yukmain_owns_seat(string $deviceUid, string $targetUid, array $playersByUid): bool
{
    if ($deviceUid === $targetUid) {
        return true;
    }
    $p = $playersByUid[$targetUid] ?? null;
    return is_array($p) && !empty($p['isNumpang']) && (($p['controllerUid'] ?? '') === $deviceUid);
}

function yukmain_resolve_actor(string $senderDeviceUid, array $payload, array $playersByUid): array
{
    $keys = ['actAsUid', 'actorUid', 'uid', 'voterUid', 'initiatorUid', 'spyUid', 'psychicUid', 'guesserUid'];
    $requestedUid = $senderDeviceUid;
    foreach ($keys as $k) {
        if (isset($payload[$k]) && is_string($payload[$k]) && trim($payload[$k]) !== '') {
            $requestedUid = trim($payload[$k]);
            break;
        }
    }

    if (!yukmain_owns_seat($senderDeviceUid, $requestedUid, $playersByUid)) {
        throw new RuntimeException('Tidak memiliki izin untuk kursi pemain tersebut.', 403);
    }
    $actor = $playersByUid[$requestedUid] ?? null;
    if (!is_array($actor)) {
        throw new RuntimeException('Pemain tidak ditemukan di ruang.', 404);
    }
    return $actor;
}

function yukmain_require_host(string $senderDeviceUid, array $room): void
{
    if (($room['hostUid'] ?? '') !== $senderDeviceUid) {
        throw new RuntimeException('Hanya Host yang dapat melakukan aksi ini.', 403);
    }
}

function yukmain_load_server_state(PDO $tx, string $roomId, string $roundId): ?array
{
    if ($roundId === '') {
        return null;
    }
    $stmt = $tx->prepare(
        'SELECT state_json FROM round_server_states WHERE room_id = ? AND round_id = ? LIMIT 1'
    );
    $stmt->execute([$roomId, $roundId]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode((string) $row['state_json'], true);
    return is_array($decoded) ? $decoded : null;
}

function yukmain_save_server_state(PDO $tx, string $roomId, string $roundId, array $state, int $nowMs): void
{
    $stmt = $tx->prepare(
        'INSERT INTO round_server_states (room_id, round_id, state_json, created_at_ms)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)'
    );
    $stmt->execute([
        $roomId,
        $roundId,
        json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $nowMs,
    ]);
}

function yukmain_save_round_secrets(PDO $tx, string $roomId, string $roundId, array $secretsByUid, int $nowMs): void
{
    $stmt = $tx->prepare(
        'INSERT INTO round_player_secrets (room_id, round_id, uid, secret_json, created_at_ms)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE secret_json = VALUES(secret_json)'
    );
    foreach ($secretsByUid as $uid => $sec) {
        $sec['createdAt'] = $nowMs;
        $stmt->execute([
            $roomId,
            $roundId,
            (string) $uid,
            json_encode($sec, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            $nowMs,
        ]);
    }
}

function yukmain_load_round_secret(PDO $tx, string $roomId, string $roundId, string $uid): ?array
{
    $stmt = $tx->prepare(
        'SELECT secret_json FROM round_player_secrets WHERE room_id = ? AND round_id = ? AND uid = ? LIMIT 1'
    );
    $stmt->execute([$roomId, $roundId, $uid]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $decoded = json_decode((string) $row['secret_json'], true);
    return is_array($decoded) ? $decoded : null;
}

function yukmain_save_round_secret_single(PDO $tx, string $roomId, string $roundId, string $uid, array $secret, int $nowMs): void
{
    $stmt = $tx->prepare(
        'INSERT INTO round_player_secrets (room_id, round_id, uid, secret_json, created_at_ms)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE secret_json = VALUES(secret_json)'
    );
    $stmt->execute([
        $roomId,
        $roundId,
        $uid,
        json_encode($secret, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $nowMs,
    ]);
}

function yukmain_save_submission(PDO $tx, string $roomId, string $kind, string $scopeKey, string $uid, $val, int $nowMs): void
{
    $stmt = $tx->prepare(
        'INSERT INTO round_submissions (room_id, kind, scope_key, uid, value_json, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at_ms = VALUES(updated_at_ms)'
    );
    $stmt->execute([
        $roomId,
        $kind,
        $scopeKey,
        $uid,
        json_encode($val, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $nowMs,
    ]);
}

function yukmain_load_submissions(PDO $tx, string $roomId, string $kind, string $scopeKey): array
{
    $stmt = $tx->prepare(
        'SELECT uid, value_json FROM round_submissions WHERE room_id = ? AND kind = ? AND scope_key = ?'
    );
    $stmt->execute([$roomId, $kind, $scopeKey]);
    $out = [];
    foreach ($stmt->fetchAll() as $row) {
        $out[(string) $row['uid']] = json_decode((string) $row['value_json'], true);
    }
    return $out;
}

function yukmain_apply_score_deltas(PDO $tx, string $roomId, array &$playersByUid, array $deltas, int $nowMs): void
{
    $stmt = $tx->prepare(
        'UPDATE room_players SET score = score + ?, updated_at_ms = ? WHERE room_id = ? AND uid = ?'
    );
    foreach ($deltas as $uid => $delta) {
        $intDelta = (int) $delta;
        if ($intDelta <= 0 || !isset($playersByUid[$uid])) {
            continue;
        }
        $stmt->execute([$intDelta, $nowMs, $roomId, $uid]);
        $playersByUid[$uid]['score'] += $intDelta;
        $playersByUid[$uid]['updatedAt'] = $nowMs;
    }
}

function yukmain_record_completed_game_history(PDO $tx, string $roomId, string $roomCode, array $match, int $nowMs): void
{
    $matchId = 'mh_' . $nowMs . '_' . yukmain_random_hex(4);
    $winnerUids = $match['winnerUids'] ?? [];
    $scoresByUid = $match['scoresByUid'] ?? [];

    $ins = $tx->prepare(
        'INSERT INTO match_history (id, room_id, room_code, game_type, rounds_played, winner_uids_json, scores_json, finished_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([
        $matchId,
        $roomId,
        $roomCode,
        (string) $match['gameType'],
        (int) $match['roundsPlayed'],
        json_encode($winnerUids, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        json_encode($scoresByUid, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $nowMs,
    ]);

    $winnerSet = array_flip($winnerUids);
    $updUser = $tx->prepare(
        'UPDATE users SET games_played = games_played + 1, wins = wins + ?, updated_at_ms = ? WHERE uid = ?'
    );
    foreach (array_keys($scoresByUid) as $uid) {
        $isWin = isset($winnerSet[$uid]) ? 1 : 0;
        $updUser->execute([$isWin, $nowMs, (string) $uid]);
    }
}

function yukmain_dispatch_room_action(
    PDO $pdo,
    string $roomId,
    array $user,
    string $action,
    array $payload
): array {
    return yukmain_with_tx($pdo, static function (PDO $tx) use ($roomId, $user, $action, $payload): array {
        $now = yukmain_now_ms();
        $senderUid = $user['uid'];

        $stmt = $tx->prepare('SELECT * FROM rooms WHERE id = ? FOR UPDATE');
        $stmt->execute([$roomId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new RuntimeException('Ruang tidak ditemukan.', 404);
        }

        $room = json_decode((string) $row['room_json'], true);
        if (!is_array($room)) {
            throw new RuntimeException('Data ruang rusak.');
        }

        $players = yukmain_load_room_players($tx, $roomId);
        $playersByUid = [];
        foreach ($players as $p) {
            $playersByUid[$p['uid']] = $p;
        }

        if (!isset($playersByUid[$senderUid])) {
            throw new RuntimeException('Kamu tidak terdaftar di ruang ini.', 403);
        }

        // Keep sender presence fresh
        yukmain_upsert_presence($tx, $roomId, $senderUid, $user['displayName'], false, true, $now);

        $sysMessages = [];
        $pushSys = static function (string $msg) use (&$sysMessages): void {
            $sysMessages[] = mb_substr($msg, 0, 280, 'UTF-8');
        };

        $currentRoundId = (string) ($room['currentRoundId'] ?? '');
        $serverState = yukmain_load_server_state($tx, $roomId, $currentRoundId);
        $result = [];

        switch ($action) {
            // ===================== LOBBY / SEATS / PRESENCE =====================
            case 'addNumpangPlayer': {
                if (($room['status'] ?? 'lobby') !== 'lobby') {
                    throw new RuntimeException('Pemain Numpang hanya bisa ditambahkan saat berada di Lobi.');
                }
                if (count($players) >= 12) {
                    throw new RuntimeException('Ruang sudah penuh (maksimal 12 pemain termasuk Numpang).');
                }
                $ownedCount = 0;
                foreach ($players as $p) {
                    if ($p['isNumpang'] && $p['controllerUid'] === $senderUid) {
                        $ownedCount++;
                    }
                }
                if ($ownedCount >= 2) {
                    throw new RuntimeException('Maksimal 2 kursi Numpang per perangkat.');
                }
                $cleanName = mb_substr(trim((string) ($payload['guestName'] ?? $payload['displayName'] ?? '')), 0, 40, 'UTF-8');
                if (mb_strlen($cleanName, 'UTF-8') < 2) {
                    throw new RuntimeException('Nama pemain Numpang minimal 2 karakter.');
                }
                $numpangUid = 'numpang_' . substr($senderUid, 0, 12) . '_' . base_convert((string) $now, 10, 36) . '_' . yukmain_random_hex(2);
                $rawColor = is_string($payload['avatarColor'] ?? null) ? trim($payload['avatarColor']) : '';
                $color = $rawColor !== '' ? mb_substr($rawColor, 0, 24, 'UTF-8') : yukmain_avatar_color($numpangUid);

                $tx->prepare(
                    'INSERT INTO room_players
                     (room_id, uid, display_name, avatar_color, is_host, score, is_ready, controller_uid, is_numpang, is_brb, joined_at_ms, updated_at_ms)
                     VALUES (?, ?, ?, ?, 0, 0, 1, ?, 1, 0, ?, ?)'
                )->execute([$roomId, $numpangUid, $cleanName, $color, $senderUid, $now, $now]);

                $room['updatedAt'] = $now;
                $pushSys("{$cleanName} ikut main (Numpang di HP {$playersByUid[$senderUid]['displayName']}).");
                $result = ['numpangUid' => $numpangUid];
                break;
            }

            case 'removeNumpangPlayer': {
                $targetUid = (string) ($payload['numpangUid'] ?? $payload['seatUid'] ?? '');
                $target = $playersByUid[$targetUid] ?? null;
                if (!$target || !$target['isNumpang']) {
                    $result = [];
                    break;
                }
                if ($target['controllerUid'] !== $senderUid && $room['hostUid'] !== $senderUid) {
                    throw new RuntimeException('Tidak memiliki izin menghapus kursi Numpang ini.', 403);
                }
                $tx->prepare('DELETE FROM room_players WHERE room_id = ? AND uid = ?')->execute([$roomId, $targetUid]);
                $room['updatedAt'] = $now;
                $pushSys("{$target['displayName']} (Numpang) keluar dari ruang.");
                break;
            }

            case 'togglePlayerBrb': {
                $targetUid = (string) ($payload['uid'] ?? $payload['targetUid'] ?? $senderUid);
                if (!yukmain_owns_seat($senderUid, $targetUid, $playersByUid)) {
                    throw new RuntimeException('Tidak memiliki izin mengubah status BRB kursi ini.', 403);
                }
                $target = $playersByUid[$targetUid] ?? null;
                if (!$target) {
                    throw new RuntimeException('Pemain tidak ditemukan.');
                }
                $nextBrb = !empty($payload['isBrb']);
                $tx->prepare('UPDATE room_players SET is_brb = ?, updated_at_ms = ? WHERE room_id = ? AND uid = ?')
                    ->execute([$nextBrb ? 1 : 0, $now, $roomId, $targetUid]);
                $updatedPlayers = yukmain_load_room_players($tx, $roomId);
                $nextUt = yukmain_ut_ensure_turn_valid($room, $updatedPlayers);
                if ($nextUt !== null) {
                    $room['ularTanggaState'] = $nextUt;
                }
                $room['updatedAt'] = $now;
                $pushSys(
                    $nextBrb
                        ? "{$target['displayName']} lagi BRB sebentar (dilewati di ronde baru)."
                        : "{$target['displayName']} sudah balik dan siap ikut ronde berikutnya!"
                );
                break;
            }

            case 'togglePlayerReady': {
                $targetUid = (string) ($payload['uid'] ?? $senderUid);
                if (!yukmain_owns_seat($senderUid, $targetUid, $playersByUid)) {
                    throw new RuntimeException('Tidak memiliki izin mengubah status siap.', 403);
                }
                $target = $playersByUid[$targetUid] ?? null;
                if (!$target) {
                    throw new RuntimeException('Pemain tidak ditemukan.');
                }
                $tx->prepare('UPDATE room_players SET is_ready = ?, updated_at_ms = ? WHERE room_id = ? AND uid = ?')
                    ->execute([!empty($payload['isReady']) ? 1 : 0, $now, $roomId, $targetUid]);
                $room['updatedAt'] = $now;
                break;
            }

            case 'leaveRoom': {
                // Redirected gracefully if sent via action route
                $tx->prepare('DELETE FROM room_players WHERE room_id = ? AND (uid = ? OR (is_numpang = 1 AND controller_uid = ?))')
                    ->execute([$roomId, $senderUid, $senderUid]);
                $tx->prepare('DELETE FROM room_presence WHERE room_id = ? AND uid = ?')->execute([$roomId, $senderUid]);
                $remaining = yukmain_load_room_players($tx, $roomId);
                if (empty($remaining)) {
                    $tx->prepare('DELETE FROM rooms WHERE id = ?')->execute([$roomId]);
                    return ['ok' => true, 'result' => ['deleted' => true], 'systemMessage' => null];
                }
                if ($room['hostUid'] === $senderUid) {
                    $nextHost = $remaining[0];
                    foreach ($remaining as $c) {
                        if (!$c['isNumpang']) {
                            $nextHost = $c;
                            break;
                        }
                    }
                    $room['hostUid'] = $nextHost['uid'];
                    $tx->prepare('UPDATE room_players SET is_host = 0 WHERE room_id = ?')->execute([$roomId]);
                    $tx->prepare('UPDATE room_players SET is_host = 1, is_ready = 1, updated_at_ms = ? WHERE room_id = ? AND uid = ?')
                        ->execute([$now, $roomId, $nextHost['uid']]);
                }
                $nextUt = yukmain_ut_ensure_turn_valid($room, $remaining);
                if ($nextUt !== null) {
                    $room['ularTanggaState'] = $nextUt;
                }
                $room['updatedAt'] = $now;
                $pushSys("{$playersByUid[$senderUid]['displayName']} keluar dari ruang.");
                break;
            }

            // ===================== SETTINGS =====================
            case 'updateSpyfallSettings': {
                yukmain_require_host($senderUid, $room);
                $duration = min(1200, max(120, (int) round((float) ($payload['roundDurationSec'] ?? 480))));
                $spyMode = in_array($payload['spyMode'] ?? '', ['single', 'double', 'random'], true) ? $payload['spyMode'] : 'single';
                $rawPacks = is_array($payload['enabledPacks'] ?? null) ? array_values(array_map('strval', $payload['enabledPacks'])) : ['nusantara', 'klasik'];
                $customLocs = [];
                if (is_array($payload['customLocations'] ?? null)) {
                    foreach ($payload['customLocations'] as $raw) {
                        $clean = yukmain_sanitize_custom_location($raw);
                        if ($clean !== null) $customLocs[] = $clean;
                        if (count($customLocs) >= 20) break;
                    }
                }
                $room['roundDurationSec'] = $duration;
                $room['spyMode'] = $spyMode;
                $room['enabledPacks'] = !empty($rawPacks) ? array_slice($rawPacks, 0, 10) : ['nusantara'];
                $room['customLocations'] = $customLocs;
                $room['updatedAt'] = $now;
                break;
            }

            case 'updateKataKataSettings': {
                yukmain_require_host($senderUid, $room);
                $duration = min(1200, max(120, (int) round((float) ($payload['roundDurationSec'] ?? 480))));
                $spyMode = in_array($payload['spyMode'] ?? '', ['single', 'double', 'random'], true) ? $payload['spyMode'] : 'single';
                $rawPacks = is_array($payload['enabledPacks'] ?? null) ? array_values(array_map('strval', $payload['enabledPacks'])) : ['kuliner', 'keseharian'];
                $customPairs = [];
                if (is_array($payload['customWordPairs'] ?? null)) {
                    foreach ($payload['customWordPairs'] as $raw) {
                        $clean = yukmain_sanitize_custom_word_pair($raw);
                        if ($clean !== null) $customPairs[] = $clean;
                        if (count($customPairs) >= 30) break;
                    }
                }
                $room['roundDurationSec'] = $duration;
                $room['spyMode'] = $spyMode;
                $room['enabledPacks'] = !empty($rawPacks) ? array_slice($rawPacks, 0, 10) : ['kuliner'];
                $room['customWordPairs'] = $customPairs;
                $room['updatedAt'] = $now;
                break;
            }

            case 'updateSatuFrekuensiSettings': {
                yukmain_require_host($senderUid, $room);
                $rawPacks = is_array($payload['enabledPacks'] ?? null) ? array_values(array_map('strval', $payload['enabledPacks'])) : ['tongkrongan', 'kuliner'];
                $customSpecs = [];
                if (is_array($payload['customSpectrums'] ?? null)) {
                    foreach ($payload['customSpectrums'] as $raw) {
                        $clean = yukmain_sanitize_custom_spectrum($raw);
                        if ($clean !== null) $customSpecs[] = $clean;
                        if (count($customSpecs) >= 25) break;
                    }
                }
                $room['enabledPacks'] = !empty($rawPacks) ? array_slice($rawPacks, 0, 10) : ['tongkrongan'];
                $room['customSpectrums'] = $customSpecs;
                $room['updatedAt'] = $now;
                break;
            }

            case 'updateFaktaHariIniSettings': {
                yukmain_require_host($senderUid, $room);
                $rawPacks = is_array($payload['enabledPacks'] ?? null) ? array_values(array_map('strval', $payload['enabledPacks'])) : ['hukum_sejarah', 'nusantara'];
                $customFacts = [];
                if (is_array($payload['customFacts'] ?? null)) {
                    foreach ($payload['customFacts'] as $raw) {
                        $clean = yukmain_sanitize_custom_fact($raw);
                        if ($clean !== null) $customFacts[] = $clean;
                        if (count($customFacts) >= 30) break;
                    }
                }
                $room['enabledPacks'] = !empty($rawPacks) ? array_slice($rawPacks, 0, 10) : ['hukum_sejarah'];
                $room['customFacts'] = $customFacts;
                $room['updatedAt'] = $now;
                break;
            }

            case 'updatePelukisSettings': {
                yukmain_require_host($senderUid, $room);
                $rawPacks = is_array($payload['enabledPacks'] ?? null) ? array_values(array_map('strval', $payload['enabledPacks'])) : ['kuliner', 'tongkrongan', 'hewan_alam'];
                $spyMode = in_array($payload['spyMode'] ?? '', ['single', 'double', 'random'], true) ? $payload['spyMode'] : 'single';
                $strokeRounds = ((int) ($payload['pelukisStrokeRounds'] ?? 2)) === 1 ? 1 : 2;
                $customPrompts = [];
                if (is_array($payload['customDrawingPrompts'] ?? null)) {
                    foreach ($payload['customDrawingPrompts'] as $raw) {
                        $clean = yukmain_sanitize_custom_drawing_prompt($raw);
                        if ($clean !== null) $customPrompts[] = $clean;
                        if (count($customPrompts) >= 30) break;
                    }
                }
                $room['enabledPacks'] = !empty($rawPacks) ? array_slice($rawPacks, 0, 10) : ['kuliner'];
                $room['spyMode'] = $spyMode;
                $room['pelukisStrokeRounds'] = $strokeRounds;
                $room['customDrawingPrompts'] = $customPrompts;
                $room['updatedAt'] = $now;
                break;
            }

            case 'updateMalamSilumanSettings': {
                yukmain_require_host($senderUid, $room);
                $room['malamSilumanSettings'] = yukmain_sanitize_malam_siluman_settings($payload['settings'] ?? $payload);
                $room['updatedAt'] = $now;
                break;
            }

            // ===================== GAME #1: SPYFALL =====================
            case 'startSpyfallRound': {
                yukmain_require_host($senderUid, $room);
                $active = yukmain_filter_active_players($players);
                if (count($active) < 3) {
                    throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Yang Bener Yang Mana.');
                }
                $pool = yukmain_merge_location_pool($room['enabledPacks'] ?? [], $room['customLocations'] ?? []);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);
                $dealt = yukmain_deal_spyfall_round(
                    array_column($active, 'uid'),
                    $pool,
                    $serverState['locationName'] ?? null,
                    (string) ($room['spyMode'] ?? 'single'),
                    $roundId
                );

                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                $spyNames = array_map(static fn(string $u): string => $playersByUid[$u]['displayName'] ?? 'Mata-Mata', $dealt['spyUids']);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'      => $roundId,
                    'roundNumber'  => $nextRound,
                    'locationName' => $dealt['location']['name'],
                    'spyUids'      => $dealt['spyUids'],
                    'spyNames'     => $spyNames,
                    'createdAtMs'  => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = $now + ((int) ($room['roundDurationSec'] ?? 480)) * 1000;
                $room['firstSpeakerUid'] = $dealt['firstSpeakerUid'];
                $room['selectedLocationNames'] = $dealt['selectedLocationNames'];
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $firstName = $playersByUid[$dealt['firstSpeakerUid']]['displayName'] ?? 'Pemain';
                $pushSys("Ronde {$nextRound} dimulai! {$firstName} bertanya pertama.");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'initiateAccusationVote': {
                $initiator = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (($room['status'] ?? '') !== 'playing') {
                    throw new RuntimeException('Voting tuduhan hanya bisa dimulai saat ronde berjalan.');
                }
                $targetUid = (string) ($payload['targetUid'] ?? '');
                $target = $playersByUid[$targetUid] ?? null;
                if (!$target || !empty($target['isBrb']) || $target['uid'] === $initiator['uid']) {
                    throw new RuntimeException('Target tuduhan tidak valid.');
                }
                $room['status'] = 'voting';
                $room['activeVote'] = [
                    'initiatorUid'  => $initiator['uid'],
                    'initiatorName' => $initiator['displayName'],
                    'targetUid'     => $target['uid'],
                    'targetName'    => $target['displayName'],
                    'startedAtMs'   => $now,
                    'votes'         => [$initiator['uid'] => 'yes'],
                ];
                $room['updatedAt'] = $now;
                $pushSys("{$initiator['displayName']} menuduh {$target['displayName']} sebagai Mata-Mata!");
                break;
            }

            case 'castAccusationVote': {
                $voter = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (($room['status'] ?? '') !== 'voting' || empty($room['activeVote']) || !$serverState) {
                    throw new RuntimeException('Tidak ada voting aktif.');
                }
                $vote = (($payload['vote'] ?? $payload['choice'] ?? 'yes') === 'no') ? 'no' : 'yes';
                $activeVote = $room['activeVote'];
                $activeVote['votes'][$voter['uid']] = $vote;

                $active = yukmain_filter_active_players($players);
                $eligible = array_values(array_filter(
                    array_column($active, 'uid'),
                    static fn(string $u): bool => $u !== $activeVote['targetUid']
                ));
                $outcome = yukmain_evaluate_vote_progress($activeVote['votes'], $eligible);

                if ($outcome === 'pending') {
                    $room['activeVote'] = $activeVote;
                    $room['updatedAt'] = $now;
                    $result = ['outcome' => 'pending'];
                    break;
                }

                if ($outcome === 'acquitted') {
                    $room['status'] = 'playing';
                    $room['activeVote'] = null;
                    $room['updatedAt'] = $now;
                    $pushSys("Tuduhan terhadap {$activeVote['targetName']} ditolak. Diskusi lanjut!");
                    $result = ['outcome' => 'acquitted'];
                    break;
                }

                $isSpy = in_array($activeVote['targetUid'], $serverState['spyUids'], true);
                $winnerTeam = $isSpy ? 'warga' : 'mata_mata';
                $deltas = yukmain_calculate_spyfall_deltas(
                    array_column($active, 'uid'),
                    $serverState['spyUids'],
                    $winnerTeam,
                    $activeVote['initiatorUid'],
                    $isSpy ? 'caught_no_guess' : 'false_accusation'
                );
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = $isSpy
                    ? "{$activeVote['targetName']} terbukti Mata-Mata! Warga menang."
                    : "{$activeVote['targetName']} ternyata Warga! Tim Mata-Mata menang.";
                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => $winnerTeam,
                    'reason'          => $reason,
                    'locationName'    => $serverState['locationName'],
                    'guessedLocation' => null,
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                $result = ['outcome' => 'convicted', 'winnerTeam' => $winnerTeam];
                break;
            }

            case 'cancelActiveVoteOrSpyGuess': {
                yukmain_require_host($senderUid, $room);
                if (in_array($room['status'] ?? '', ['voting', 'spy_guess'], true)) {
                    $room['status'] = 'playing';
                    $room['activeVote'] = null;
                    $room['pendingSpyGuess'] = null;
                    $room['updatedAt'] = $now;
                    $pushSys('Host membatalkan voting / tebakan. Ronde dilanjutkan.');
                }
                break;
            }

            case 'submitSpyLocationGuess': {
                $spy = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (!$serverState || !in_array($spy['uid'], $serverState['spyUids'], true)) {
                    throw new RuntimeException('Hanya Mata-Mata yang dapat menebak lokasi.', 403);
                }
                $guessed = mb_substr(trim((string) ($payload['guessedLocation'] ?? '')), 0, 80, 'UTF-8');
                if ($guessed === '') {
                    throw new RuntimeException('Pilih lokasi terlebih dahulu.');
                }
                $correct = yukmain_eval_spy_guess($guessed, (string) $serverState['locationName']);
                $winnerTeam = $correct ? 'mata_mata' : 'warga';
                $active = yukmain_filter_active_players($players);
                $deltas = yukmain_calculate_spyfall_deltas(
                    array_column($active, 'uid'),
                    $serverState['spyUids'],
                    $winnerTeam,
                    null,
                    $correct ? 'spy_guess_correct' : 'spy_guess_wrong'
                );
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = $correct
                    ? "{$spy['displayName']} menebak lokasi \"{$guessed}\" dengan tepat! Mata-Mata menang."
                    : "{$spy['displayName']} salah menebak \"{$guessed}\" (aslinya: {$serverState['locationName']}). Warga menang!";
                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => $winnerTeam,
                    'reason'          => $reason,
                    'locationName'    => $serverState['locationName'],
                    'guessedLocation' => $guessed,
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                $result = ['correct' => $correct, 'winnerTeam' => $winnerTeam];
                break;
            }

            case 'resolveRoundTimeout': {
                if (($room['status'] ?? '') !== 'playing' || !$serverState) {
                    break;
                }
                $active = yukmain_filter_active_players($players);
                $deltas = yukmain_calculate_spyfall_deltas(
                    array_column($active, 'uid'),
                    $serverState['spyUids'],
                    'mata_mata',
                    null,
                    'timeout'
                );
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = 'Waktu habis! Mata-Mata berhasil bertahan sampai akhir.';
                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => 'mata_mata',
                    'reason'          => $reason,
                    'locationName'    => $serverState['locationName'],
                    'guessedLocation' => null,
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                break;
            }

            // ===================== GAME #2: KATA-KATA HARI INI =====================
            case 'startKataKataRound': {
                yukmain_require_host($senderUid, $room);
                $active = yukmain_filter_active_players($players);
                if (count($active) < 3) {
                    throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Kata-Kata Hari Ini.');
                }
                $pool = yukmain_merge_word_pair_pool($room['enabledPacks'] ?? [], $room['customWordPairs'] ?? []);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);
                $dealt = yukmain_deal_kata_kata_round(
                    array_column($active, 'uid'),
                    $pool,
                    $serverState['citizenWord'] ?? null,
                    (string) ($room['spyMode'] ?? 'single'),
                    $roundId
                );

                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                $spyNames = array_map(static fn(string $u): string => $playersByUid[$u]['displayName'] ?? 'Penyusup', $dealt['spyUids']);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'      => $roundId,
                    'roundNumber'  => $nextRound,
                    'locationName' => $dealt['category'],
                    'citizenWord'  => $dealt['citizenWord'],
                    'spyWord'      => $dealt['spyWord'],
                    'spyUids'      => $dealt['spyUids'],
                    'spyNames'     => $spyNames,
                    'createdAtMs'  => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = $now + ((int) ($room['roundDurationSec'] ?? 480)) * 1000;
                $room['firstSpeakerUid'] = $dealt['firstSpeakerUid'];
                $room['eliminatedUids'] = [];
                $room['eliminationLog'] = [];
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $firstName = $playersByUid[$dealt['firstSpeakerUid']]['displayName'] ?? 'Pemain';
                $pushSys("Ronde {$nextRound} Kata-Kata Hari Ini dimulai! {$firstName} mulai memberi petunjuk.");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'initiateKataKataVote': {
                $initiator = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (($room['status'] ?? '') !== 'playing') {
                    throw new RuntimeException('Voting hanya bisa dimulai saat diskusi berjalan.');
                }
                $eliminated = $room['eliminatedUids'] ?? [];
                if (in_array($initiator['uid'], $eliminated, true)) {
                    throw new RuntimeException('Pemain yang tereliminasi tidak bisa menuduh.');
                }
                $targetUid = (string) ($payload['targetUid'] ?? '');
                $target = $playersByUid[$targetUid] ?? null;
                if (!$target || !empty($target['isBrb']) || in_array($target['uid'], $eliminated, true) || $target['uid'] === $initiator['uid']) {
                    throw new RuntimeException('Target tuduhan tidak valid.');
                }
                $room['status'] = 'voting';
                $room['activeVote'] = [
                    'initiatorUid'  => $initiator['uid'],
                    'initiatorName' => $initiator['displayName'],
                    'targetUid'     => $target['uid'],
                    'targetName'    => $target['displayName'],
                    'startedAtMs'   => $now,
                    'votes'         => [$initiator['uid'] => 'yes'],
                ];
                $room['updatedAt'] = $now;
                $pushSys("{$initiator['displayName']} menuduh {$target['displayName']} sebagai Penyusup!");
                break;
            }

            case 'castKataKataVote': {
                $voter = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (($room['status'] ?? '') !== 'voting' || empty($room['activeVote']) || !$serverState) {
                    throw new RuntimeException('Tidak ada voting aktif.');
                }
                $eliminatedList = $room['eliminatedUids'] ?? [];
                $eliminatedSet = array_flip($eliminatedList);
                if (isset($eliminatedSet[$voter['uid']])) {
                    throw new RuntimeException('Pemain tereliminasi tidak bisa ikut voting.');
                }
                $vote = (($payload['vote'] ?? $payload['choice'] ?? 'yes') === 'no') ? 'no' : 'yes';
                $activeVote = $room['activeVote'];
                $activeVote['votes'][$voter['uid']] = $vote;

                $active = yukmain_filter_active_players($players);
                $eligible = [];
                foreach ($active as $p) {
                    if (!isset($eliminatedSet[$p['uid']]) && $p['uid'] !== $activeVote['targetUid']) {
                        $eligible[] = $p['uid'];
                    }
                }
                $outcome = yukmain_evaluate_vote_progress($activeVote['votes'], $eligible);
                if ($outcome === 'pending') {
                    $room['activeVote'] = $activeVote;
                    $room['updatedAt'] = $now;
                    $result = ['outcome' => 'pending'];
                    break;
                }
                if ($outcome === 'acquitted') {
                    $room['status'] = 'playing';
                    $room['activeVote'] = null;
                    $room['updatedAt'] = $now;
                    $pushSys("Tuduhan ke {$activeVote['targetName']} ditolak. Diskusi lanjut!");
                    $result = ['outcome' => 'acquitted'];
                    break;
                }

                $elimEval = yukmain_eval_kata_kata_elimination(
                    array_column($active, 'uid'),
                    $eliminatedList,
                    $activeVote['targetUid'],
                    $serverState['spyUids']
                );
                $nextEliminated = array_merge($eliminatedList, [$activeVote['targetUid']]);
                $nextLog = array_merge($room['eliminationLog'] ?? [], [[
                    'uid'            => $activeVote['targetUid'],
                    'displayName'    => $activeVote['targetName'],
                    'wasSpy'         => $elimEval['wasSpy'],
                    'eliminatedAtMs' => $now,
                ]]);

                if ($elimEval['outcome'] === 'final_spy_last_chance') {
                    $room['status'] = 'spy_guess';
                    $room['eliminatedUids'] = $nextEliminated;
                    $room['eliminationLog'] = $nextLog;
                    $room['activeVote'] = null;
                    $room['pendingSpyGuess'] = [
                        'spyUid'          => $activeVote['targetUid'],
                        'spyName'         => $activeVote['targetName'],
                        'guessedLocation' => '',
                        'submittedAtMs'   => $now,
                    ];
                    $room['updatedAt'] = $now;
                    $pushSys("{$activeVote['targetName']} adalah Penyusup terakhir! Dia dapat 1 Kesempatan Terakhir menebak Kata Warga!");
                    $result = ['outcome' => 'final_spy_last_chance'];
                    break;
                }

                if ($elimEval['outcome'] === 'spies_outnumber') {
                    $deltas = yukmain_calculate_kata_kata_deltas(
                        array_column($active, 'uid'),
                        $serverState['spyUids'],
                        'mata_mata',
                        'spies_outnumber'
                    );
                    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                    $reason = "{$activeVote['targetName']} tereliminasi! Jumlah Penyusup menyamai Warga — Tim Penyusup menang!";
                    $room['status'] = 'round_end';
                    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                    $room['eliminatedUids'] = $nextEliminated;
                    $room['eliminationLog'] = $nextLog;
                    $room['activeVote'] = null;
                    $room['pendingSpyGuess'] = null;
                    $room['lastRoundResult'] = [
                        'roundNumber'     => $room['roundNumber'],
                        'winnerTeam'      => 'mata_mata',
                        'reason'          => $reason,
                        'locationName'    => $serverState['locationName'],
                        'guessedLocation' => null,
                        'citizenWord'     => $serverState['citizenWord'],
                        'spyWord'         => $serverState['spyWord'],
                        'spyUids'         => $serverState['spyUids'],
                        'spyNames'        => $serverState['spyNames'],
                        'resolvedAtMs'    => $now,
                        'scoresApplied'   => true,
                    ];
                    $room['updatedAt'] = $now;
                    $pushSys($reason);
                    $result = ['outcome' => 'spies_outnumber'];
                    break;
                }

                $room['status'] = 'playing';
                $room['eliminatedUids'] = $nextEliminated;
                $room['eliminationLog'] = $nextLog;
                $room['activeVote'] = null;
                $room['updatedAt'] = $now;
                $pushSys(
                    $elimEval['wasSpy']
                        ? "{$activeVote['targetName']} (Penyusup) tereliminasi! Masih ada Penyusup lain."
                        : "{$activeVote['targetName']} (Warga) tereliminasi! Permainan berlanjut."
                );
                $result = ['outcome' => 'continue'];
                break;
            }

            case 'cancelKataKataVote': {
                yukmain_require_host($senderUid, $room);
                if (($room['status'] ?? '') === 'voting') {
                    $room['status'] = 'playing';
                    $room['activeVote'] = null;
                    $room['updatedAt'] = $now;
                    $pushSys('Host membatalkan voting.');
                }
                break;
            }

            case 'submitKataKataLastChanceGuess': {
                $spy = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (($room['status'] ?? '') !== 'spy_guess' || empty($room['pendingSpyGuess']) || !$serverState || $room['pendingSpyGuess']['spyUid'] !== $spy['uid']) {
                    throw new RuntimeException('Bukan giliranmu menebak Kata Warga.');
                }
                $surrender = !empty($payload['surrender']);
                $guessedWord = $surrender ? '' : mb_substr(trim((string) ($payload['guessedWord'] ?? '')), 0, 60, 'UTF-8');
                if (!$surrender && $guessedWord === '') {
                    throw new RuntimeException('Tulis tebakan Kata Warga terlebih dahulu.');
                }
                $actualCitizen = (string) ($serverState['citizenWord'] ?? '');
                $correct = !$surrender && yukmain_eval_kata_kata_guess($guessedWord, $actualCitizen);
                $winnerTeam = $correct ? 'mata_mata' : 'warga';
                $active = yukmain_filter_active_players($players);
                $deltas = yukmain_calculate_kata_kata_deltas(
                    array_column($active, 'uid'),
                    $serverState['spyUids'],
                    $winnerTeam,
                    $correct ? 'last_chance_correct' : 'last_chance_wrong'
                );
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = $surrender
                    ? "{$spy['displayName']} menyerah menebak Kata Warga ({$actualCitizen}). Warga menang!"
                    : ($correct
                        ? "{$spy['displayName']} menebak Kata Warga \"{$guessedWord}\" dengan TEPAT! Penyusup mencuri kemenangan!"
                        : "{$spy['displayName']} menebak \"{$guessedWord}\" (aslinya: {$actualCitizen}). Warga menang!");
                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['pendingSpyGuess'] = null;
                $room['activeVote'] = null;
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => $winnerTeam,
                    'reason'          => $reason,
                    'locationName'    => $serverState['locationName'],
                    'guessedLocation' => null,
                    'citizenWord'     => $actualCitizen,
                    'spyWord'         => $serverState['spyWord'],
                    'guessedWord'     => $surrender ? null : $guessedWord,
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                $result = ['correct' => $correct, 'winnerTeam' => $winnerTeam];
                break;
            }

            case 'resolveKataKataTimeout': {
                if (($room['status'] ?? '') !== 'playing' || !$serverState) {
                    break;
                }
                $active = yukmain_filter_active_players($players);
                $deltas = yukmain_calculate_kata_kata_deltas(
                    array_column($active, 'uid'),
                    $serverState['spyUids'],
                    'mata_mata',
                    'timeout'
                );
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = 'Waktu habis! Penyusup berhasil menyamar sampai akhir.';
                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => 'mata_mata',
                    'reason'          => $reason,
                    'locationName'    => $serverState['locationName'],
                    'guessedLocation' => null,
                    'citizenWord'     => $serverState['citizenWord'],
                    'spyWord'         => $serverState['spyWord'],
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                break;
            }

            // ===================== GAME #3: SATU FREKUENSI =====================
            case 'startSatuFrekuensiRound': {
                yukmain_require_host($senderUid, $room);
                $active = yukmain_filter_active_players($players);
                if (count($active) < 2) {
                    throw new RuntimeException('Minimal 2 pemain aktif (tidak BRB) dibutuhkan untuk Satu Frekuensi.');
                }
                $pool = yukmain_merge_spectrum_pool($room['enabledPacks'] ?? [], $room['customSpectrums'] ?? []);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);
                $prevKey = !empty($room['frequencyState'])
                    ? ($room['frequencyState']['leftLabel'] . '|' . $room['frequencyState']['rightLabel'])
                    : null;

                $dealt = yukmain_deal_satu_frekuensi_round(
                    array_column($active, 'uid'),
                    $pool,
                    $prevKey,
                    $room['frequencyState']['rotationIndex'] ?? null,
                    $roundId
                );

                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                $psychicName = $playersByUid[$dealt['psychicUid']]['displayName'] ?? 'Penerawang';
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'      => $roundId,
                    'roundNumber'  => $nextRound,
                    'locationName' => $dealt['spectrum']['leftLabel'] . ' ↔ ' . $dealt['spectrum']['rightLabel'],
                    'spyUids'      => [$dealt['psychicUid']],
                    'spyNames'     => [$psychicName],
                    'targetValue'  => $dealt['targetValue'],
                    'createdAtMs'  => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = 0;
                $room['firstSpeakerUid'] = $dealt['psychicUid'];
                $room['frequencyState'] = [
                    'phase'           => 'clue',
                    'psychicUid'      => $dealt['psychicUid'],
                    'psychicName'     => $psychicName,
                    'rotationIndex'   => $dealt['rotationIndex'],
                    'leftLabel'       => $dealt['spectrum']['leftLabel'],
                    'rightLabel'      => $dealt['spectrum']['rightLabel'],
                    'category'        => $dealt['spectrum']['category'],
                    'clueText'        => '',
                    'lockedUids'      => [],
                    'revealedTarget'  => null,
                    'revealedGuesses' => [],
                    'psychicBonus'    => 0,
                ];
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $pushSys("Ronde {$nextRound} Satu Frekuensi! {$psychicName} menjadi Penerawang.");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'submitSatuFrekuensiClue': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (empty($room['frequencyState']) || $room['frequencyState']['psychicUid'] !== $actor['uid']) {
                    throw new RuntimeException('Hanya Penerawang yang dapat mengirim petunjuk.');
                }
                $clue = mb_substr(trim((string) ($payload['clueText'] ?? '')), 0, 80, 'UTF-8');
                if ($clue === '') {
                    throw new RuntimeException('Tulis petunjuk terlebih dahulu.');
                }
                $room['frequencyState']['phase'] = 'dialing';
                $room['frequencyState']['clueText'] = $clue;
                $room['updatedAt'] = $now;
                $pushSys("Petunjuk {$actor['displayName']}: \"{$clue}\" — silakan putar dial!");
                break;
            }

            case 'submitSatuFrekuensiGuess': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                if (empty($room['frequencyState']) || ($room['frequencyState']['phase'] ?? '') !== 'dialing') {
                    throw new RuntimeException('Fase putar dial belum aktif.');
                }
                if ($actor['uid'] === $room['frequencyState']['psychicUid']) {
                    throw new RuntimeException('Penerawang tidak ikut menebak dial.');
                }
                $val = min(100, max(0, (int) round((float) ($payload['guessValue'] ?? 50))));
                yukmain_save_submission($tx, $roomId, 'freq_guess', $currentRoundId, $actor['uid'], $val, $now);

                $locked = $room['frequencyState']['lockedUids'] ?? [];
                if (!in_array($actor['uid'], $locked, true)) {
                    $locked[] = $actor['uid'];
                }
                $room['frequencyState']['lockedUids'] = $locked;
                $room['updatedAt'] = $now;
                $result = ['value' => $val];
                break;
            }

            case 'advanceSatuFrekuensiPhase': {
                yukmain_require_host($senderUid, $room);
                $fs = $room['frequencyState'] ?? null;
                if (!$fs || !$serverState) {
                    throw new RuntimeException('Ronde Satu Frekuensi tidak aktif.');
                }
                $dir = (($payload['direction'] ?? 'next') === 'prev') ? 'prev' : 'next';
                if ($dir === 'prev') {
                    if ($fs['phase'] === 'dialing') {
                        $room['frequencyState']['phase'] = 'clue';
                        $room['updatedAt'] = $now;
                    }
                    break;
                }
                if ($fs['phase'] === 'clue') {
                    $room['frequencyState']['phase'] = 'dialing';
                    $room['updatedAt'] = $now;
                    break;
                }
                if ($fs['phase'] === 'dialing') {
                    $targetValue = (int) ($serverState['targetValue'] ?? 50);
                    $active = yukmain_filter_active_players($players);
                    $subs = yukmain_load_submissions($tx, $roomId, 'freq_guess', $currentRoundId);
                    $scored = yukmain_score_satu_frekuensi_round($fs['psychicUid'], $targetValue, $active, $subs);
                    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $scored['deltas'], $now);

                    $reason = "Target frekuensi berada di angka {$targetValue}! Penerawang dapat +{$scored['psychicBonus']} poin.";
                    $room['status'] = 'round_end';
                    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                    $room['frequencyState']['phase'] = 'reveal';
                    $room['frequencyState']['revealedTarget'] = $targetValue;
                    $room['frequencyState']['revealedGuesses'] = $scored['revealedGuesses'];
                    $room['frequencyState']['psychicBonus'] = $scored['psychicBonus'];
                    $room['lastRoundResult'] = [
                        'roundNumber'     => $room['roundNumber'],
                        'winnerTeam'      => 'frekuensi',
                        'reason'          => $reason,
                        'locationName'    => $fs['leftLabel'] . ' ↔ ' . $fs['rightLabel'],
                        'guessedLocation' => null,
                        'spyUids'         => [$fs['psychicUid']],
                        'spyNames'        => [$fs['psychicName']],
                        'resolvedAtMs'    => $now,
                        'scoresApplied'   => true,
                    ];
                    $room['updatedAt'] = $now;
                    $pushSys($reason);
                }
                break;
            }

            // ===================== GAME #4: FAKTA HARI INI =====================
            case 'startFaktaHariIniRound': {
                yukmain_require_host($senderUid, $room);
                $active = yukmain_filter_active_players($players);
                if (count($active) < 3) {
                    throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Fakta Hari Ini.');
                }
                $pool = yukmain_merge_fact_pool($room['enabledPacks'] ?? [], $room['customFacts'] ?? []);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);

                $dealt = yukmain_deal_fakta_round(
                    $active,
                    (string) $room['hostUid'],
                    $pool,
                    $serverState['factTwist'] ?? null,
                    $room['faktaState']['rotationIndex'] ?? null,
                    $roundId
                );

                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'         => $roundId,
                    'roundNumber'     => $nextRound,
                    'locationName'    => $dealt['fact']['category'],
                    'spyUids'         => [$dealt['truthTellerUid']],
                    'spyNames'        => [$dealt['truthTellerName']],
                    'factPrefix'      => $dealt['fact']['prefix'],
                    'factTwist'       => $dealt['fact']['twist'],
                    'factSuffix'      => $dealt['fact']['suffix'] ?? '',
                    'factCategory'    => $dealt['fact']['category'],
                    'truthTellerUid'  => $dealt['truthTellerUid'],
                    'truthTellerName' => $dealt['truthTellerName'],
                    'createdAtMs'     => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = 0;
                $room['firstSpeakerUid'] = $dealt['guesserUid'];
                $room['faktaState'] = [
                    'phase'               => 'discussion',
                    'guesserUid'          => $dealt['guesserUid'],
                    'guesserName'         => $dealt['guesserName'],
                    'rotationIndex'       => $dealt['rotationIndex'],
                    'phaseControllerUid'  => $dealt['phaseControllerUid'],
                    'phaseControllerName' => $dealt['phaseControllerName'],
                    'pickedUid'           => null,
                    'pickedName'          => null,
                    'guesserWon'          => null,
                ];
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $pushSys("Ronde {$nextRound} Fakta Hari Ini! {$dealt['guesserName']} jadi Penebak!");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'advanceFaktaHariIniPhase': {
                $fs = $room['faktaState'] ?? null;
                if (!$fs) {
                    throw new RuntimeException('Ronde Fakta Hari Ini tidak aktif.');
                }
                if (!yukmain_owns_seat($senderUid, (string) $fs['phaseControllerUid'], $playersByUid)) {
                    throw new RuntimeException("Hanya {$fs['phaseControllerName']} yang dapat mengontrol fase ronde ini.", 403);
                }
                $dir = in_array($payload['direction'] ?? '', ['prev', 'back'], true) ? 'prev' : 'next';
                $nextPhase = $dir === 'prev' ? 'discussion' : 'guessing';
                $room['faktaState']['phase'] = $nextPhase;
                $room['updatedAt'] = $now;
                if ($nextPhase === 'guessing') {
                    $pushSys("Saatnya {$fs['guesserName']} memilih siapa Pembawa Fakta Asli!");
                }
                break;
            }

            case 'submitFaktaHariIniGuess': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $fs = $room['faktaState'] ?? null;
                if (!$fs || !$serverState || ($fs['phase'] ?? '') !== 'guessing') {
                    throw new RuntimeException('Fase menebak belum aktif.');
                }
                if ($actor['uid'] !== $fs['guesserUid']) {
                    throw new RuntimeException('Hanya Penebak yang dapat menentukan pilihan.', 403);
                }
                $pickedUid = (string) ($payload['pickedUid'] ?? '');
                $picked = $playersByUid[$pickedUid] ?? null;
                if (!$picked || $picked['uid'] === $fs['guesserUid']) {
                    throw new RuntimeException('Pilihan tidak valid.');
                }

                $active = yukmain_filter_active_players($players);
                $truthUid = (string) ($serverState['truthTellerUid'] ?? '');
                $truthName = (string) ($serverState['truthTellerName'] ?? 'Pembawa Fakta');
                $scored = yukmain_calc_fakta_deltas(array_column($active, 'uid'), $fs['guesserUid'], $truthUid, $picked['uid']);
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $scored['deltas'], $now);

                $winnerTeam = $scored['guesserWon'] ? 'penebak' : 'bluffer';
                $reason = $scored['guesserWon']
                    ? "{$fs['guesserName']} menebak TEPAT! {$truthName} adalah Pembawa Fakta (+{$scored['guesserPoints']} poin)."
                    : "{$fs['guesserName']} tertipu oleh {$picked['displayName']}! Pembawa Fakta aslinya {$truthName}. Seluruh Tim Bluffer +1 poin!";

                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['faktaState'] = array_merge($fs, [
                    'phase'                   => 'reveal',
                    'pickedUid'               => $picked['uid'],
                    'pickedName'              => $picked['displayName'],
                    'guesserWon'              => $scored['guesserWon'],
                    'revealedFactPrefix'      => $serverState['factPrefix'] ?? '',
                    'revealedFactTwist'       => $serverState['factTwist'] ?? '',
                    'revealedFactSuffix'      => $serverState['factSuffix'] ?? '',
                    'revealedCategory'        => $serverState['factCategory'] ?? '',
                    'revealedTruthTellerUid'  => $truthUid,
                    'revealedTruthTellerName' => $truthName,
                    'guesserPoints'           => $scored['guesserPoints'],
                    'blufferPointsEach'       => $scored['blufferPointsEach'],
                ]);
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => $winnerTeam,
                    'reason'          => $reason,
                    'locationName'    => $serverState['factCategory'] ?? 'Fakta Hari Ini',
                    'guessedLocation' => null,
                    'spyUids'         => [$truthUid],
                    'spyNames'        => [$truthName],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                $result = ['guesserWon' => $scored['guesserWon']];
                break;
            }

            // ===================== GAME #5: PELUKIS GADUNGAN =====================
            case 'startPelukisRound': {
                yukmain_require_host($senderUid, $room);
                $active = yukmain_filter_active_players($players);
                if (count($active) < 3) {
                    throw new RuntimeException('Minimal 3 pemain aktif (tidak BRB) dibutuhkan untuk Pelukis Gadungan.');
                }
                $pool = yukmain_merge_drawing_pool($room['enabledPacks'] ?? [], $room['customDrawingPrompts'] ?? []);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);
                $totalStrokeRounds = ((int) ($room['pelukisStrokeRounds'] ?? 2)) === 1 ? 1 : 2;

                $dealt = yukmain_deal_pelukis_round(
                    $active,
                    $pool,
                    (string) ($room['spyMode'] ?? 'single'),
                    $serverState['drawingWord'] ?? null,
                    $roundId
                );

                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'         => $roundId,
                    'roundNumber'     => $nextRound,
                    'locationName'    => $dealt['prompt']['category'],
                    'drawingCategory' => $dealt['prompt']['category'],
                    'drawingWord'     => $dealt['prompt']['word'],
                    'spyUids'         => $dealt['gadunganUids'],
                    'spyNames'        => $dealt['gadunganNames'],
                    'createdAtMs'     => $now,
                ], $now);

                $firstTurnUid = $dealt['turnOrder'][0];
                $firstTurnName = $dealt['turnNamesByUid'][$firstTurnUid] ?? 'Pemain';

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = 0;
                $room['firstSpeakerUid'] = $firstTurnUid;
                $room['lukisanState'] = [
                    'phase'             => 'drawing',
                    'category'          => $dealt['prompt']['category'],
                    'totalStrokeRounds' => $totalStrokeRounds,
                    'strokeRound'       => 1,
                    'turnOrder'         => $dealt['turnOrder'],
                    'turnNamesByUid'    => $dealt['turnNamesByUid'],
                    'turnColorsByUid'   => $dealt['turnColorsByUid'],
                    'currentTurnIndex'  => 0,
                    'currentTurnUid'    => $firstTurnUid,
                    'currentTurnName'   => $firstTurnName,
                    'strokes'           => [],
                    'submittedVoteUids' => [],
                    'accusedUid'        => null,
                    'accusedName'       => null,
                ];
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $pushSys("Ronde {$nextRound} Pelukis Gadungan dimulai! Tema: {$dealt['prompt']['category']}. Giliran pertama: {$firstTurnName}.");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'submitPelukisStroke':
            case 'skipPelukisTurn': {
                $lukisan = $room['lukisanState'] ?? null;
                if (!$lukisan || ($room['status'] ?? '') !== 'playing' || ($lukisan['phase'] ?? '') !== 'drawing') {
                    throw new RuntimeException('Fase menggambar sedang tidak aktif.');
                }
                $isSkip = $action === 'skipPelukisTurn' || ($payload['action'] ?? '') === 'skip';
                if (!$isSkip) {
                    $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                    if ($actor['uid'] !== $lukisan['currentTurnUid']) {
                        throw new RuntimeException("Sekarang giliran {$lukisan['currentTurnName']} untuk menggambar.");
                    }
                } elseif ($senderUid !== $room['hostUid']) {
                    $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                    if ($actor['uid'] !== $lukisan['currentTurnUid']) {
                        throw new RuntimeException('Hanya pemain aktif atau Host yang dapat melewati giliran.', 403);
                    }
                }

                $nextStrokes = $lukisan['strokes'] ?? [];
                if (!$isSkip) {
                    $rawPoints = is_array($payload['points'] ?? null) ? $payload['points'] : [];
                    $cleanPoints = yukmain_normalize_points($rawPoints, 10.0, 50);
                    if (count($cleanPoints) < 4) {
                        throw new RuntimeException('Buat minimal 1 tarikan garis pada kanvas sebelum mengirim.');
                    }
                    $turnUid = (string) $lukisan['currentTurnUid'];
                    $nextStrokes[] = [
                        'strokeIndex' => count($nextStrokes) + 1,
                        'strokeRound' => (int) $lukisan['strokeRound'],
                        'uid'         => $turnUid,
                        'displayName' => $lukisan['turnNamesByUid'][$turnUid] ?? $lukisan['currentTurnName'],
                        'color'       => $lukisan['turnColorsByUid'][$turnUid] ?? '#F43F5E',
                        'points'      => $cleanPoints,
                    ];
                }

                $nextIndex = ((int) $lukisan['currentTurnIndex']) + 1;
                $nextPhase = $lukisan['phase'];
                $nextStrokeRound = (int) $lukisan['strokeRound'];
                $nextTurnIndex = $nextIndex;
                $nextTurnUid = '';
                $nextTurnName = '';

                if ($nextIndex < count($lukisan['turnOrder'])) {
                    $nextTurnUid = $lukisan['turnOrder'][$nextIndex];
                    $nextTurnName = $lukisan['turnNamesByUid'][$nextTurnUid] ?? 'Pemain';
                } elseif ($nextStrokeRound < (int) $lukisan['totalStrokeRounds']) {
                    $nextStrokeRound++;
                    $nextTurnIndex = 0;
                    $nextTurnUid = $lukisan['turnOrder'][0];
                    $nextTurnName = $lukisan['turnNamesByUid'][$nextTurnUid] ?? 'Pemain';
                    $pushSys("Putaran #{$nextStrokeRound} dimulai! Giliran {$nextTurnName} menambah 1 goresan.");
                } else {
                    $nextPhase = 'voting';
                    $nextTurnIndex = 0;
                    $pushSys('Semua goresan selesai! Saatnya berdiskusi dan memilih Pelukis Gadungan secara rahasia.');
                }

                $room['lukisanState'] = array_merge($lukisan, [
                    'phase'            => $nextPhase,
                    'strokeRound'      => $nextStrokeRound,
                    'currentTurnIndex' => $nextTurnIndex,
                    'currentTurnUid'   => $nextTurnUid,
                    'currentTurnName'  => $nextTurnName,
                    'strokes'          => $nextStrokes,
                ]);
                $room['updatedAt'] = $now;
                $result = ['phase' => $nextPhase, 'strokeCount' => count($nextStrokes)];
                break;
            }

            case 'castPelukisVote': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $lukisan = $room['lukisanState'] ?? null;
                if (!$lukisan || !$serverState || ($lukisan['phase'] ?? '') !== 'voting') {
                    throw new RuntimeException('Voting Pelukis Gadungan belum aktif.');
                }
                if (!in_array($actor['uid'], $lukisan['turnOrder'], true)) {
                    throw new RuntimeException('Hanya peserta ronde ini yang berhak memilih.');
                }
                $targetUid = (string) ($payload['targetUid'] ?? '');
                if (!in_array($targetUid, $lukisan['turnOrder'], true) || $targetUid === $actor['uid']) {
                    throw new RuntimeException('Pilihan tersangka tidak valid.');
                }

                yukmain_save_submission($tx, $roomId, 'pelukis_vote', $currentRoundId, $actor['uid'], $targetUid, $now);
                $votesByUid = yukmain_load_submissions($tx, $roomId, 'pelukis_vote', $currentRoundId);
                $submitted = array_values(array_filter(
                    $lukisan['turnOrder'],
                    static fn(string $u): bool => isset($votesByUid[$u])
                ));

                if (count($submitted) < count($lukisan['turnOrder'])) {
                    $room['lukisanState']['submittedVoteUids'] = $submitted;
                    $room['updatedAt'] = $now;
                    $result = ['allVoted' => false];
                    break;
                }

                $result = yukmain_finalize_pelukis_vote($tx, $roomId, $room, $players, $playersByUid, $serverState, $votesByUid, $submitted, $now, $pushSys);
                break;
            }

            case 'resolvePelukisVote': {
                yukmain_require_host($senderUid, $room);
                $lukisan = $room['lukisanState'] ?? null;
                if (!$lukisan || !$serverState) {
                    throw new RuntimeException('Ronde Pelukis Gadungan tidak aktif.');
                }
                if (($room['status'] ?? '') === 'round_end' || in_array($lukisan['phase'] ?? '', ['reveal', 'gadungan_guess'], true)) {
                    break;
                }
                if (($lukisan['phase'] ?? '') !== 'voting') {
                    throw new RuntimeException('Voting belum aktif.');
                }
                $votesByUid = yukmain_load_submissions($tx, $roomId, 'pelukis_vote', $currentRoundId);
                $result = yukmain_finalize_pelukis_vote($tx, $roomId, $room, $players, $playersByUid, $serverState, $votesByUid, $lukisan['submittedVoteUids'] ?? [], $now, $pushSys);
                break;
            }

            case 'submitPelukisGuess': {
                $lukisan = $room['lukisanState'] ?? null;
                if (!$lukisan || !$serverState || ($lukisan['phase'] ?? '') !== 'gadungan_guess') {
                    throw new RuntimeException('Tidak ada fase tebakan terakhir Pelukis Gadungan.');
                }
                $surrender = !empty($payload['surrender']);
                $guessedWord = $surrender ? '' : mb_substr(trim((string) ($payload['guessedWord'] ?? '')), 0, 60, 'UTF-8');
                if (!$surrender && $guessedWord === '') {
                    throw new RuntimeException('Ketik tebakan Kata Rahasia terlebih dahulu.');
                }

                $actorName = $lukisan['accusedName'] ?? 'Pelukis Gadungan';
                if (!$surrender || $senderUid !== $room['hostUid']) {
                    $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                    if ($actor['uid'] !== ($lukisan['accusedUid'] ?? '')) {
                        throw new RuntimeException('Hanya Pelukis Gadungan yang tertangkap yang dapat menebak kata rahasia.', 403);
                    }
                    $actorName = $actor['displayName'];
                }

                $secretWord = (string) ($serverState['drawingWord'] ?? $serverState['locationName']);
                $category = (string) ($serverState['drawingCategory'] ?? $lukisan['category']);
                $isCorrect = !$surrender && yukmain_eval_pelukis_guess($guessedWord, $secretWord);
                $winnerTeam = $isCorrect ? 'gadungan' : 'pelukis';

                $active = yukmain_filter_active_players($players);
                $deltas = yukmain_calc_pelukis_deltas(array_column($active, 'uid'), $serverState['spyUids'], $winnerTeam);
                yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

                $reason = $surrender
                    ? "{$actorName} menyerah menebak! Pelukis Asli menangkap Pelukis Gadungan ({$secretWord}) dan meraih +2 poin!"
                    : ($isCorrect
                        ? "{$actorName} menebak \"{$guessedWord}\" dengan TEPAT dan mencuri kemenangan (+3 poin)!"
                        : "Tebakan {$actorName} (\"{$guessedWord}\") meleset! Kata aslinya \"{$secretWord}\". Semua Pelukis Asli +2 poin!");

                $room['status'] = 'round_end';
                $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                $room['lukisanState'] = array_merge($lukisan, [
                    'phase'         => 'reveal',
                    'revealedWord'  => $secretWord,
                    'gadunganUids'  => $serverState['spyUids'],
                    'gadunganNames' => $serverState['spyNames'],
                    'guessedWord'   => $surrender ? null : $guessedWord,
                ]);
                $room['lastRoundResult'] = [
                    'roundNumber'     => $room['roundNumber'],
                    'winnerTeam'      => $winnerTeam,
                    'reason'          => $reason,
                    'locationName'    => $secretWord,
                    'guessedLocation' => $surrender ? null : $guessedWord,
                    'guessedWord'     => $surrender ? null : $guessedWord,
                    'drawingCategory' => $category,
                    'drawingWord'     => $secretWord,
                    'spyUids'         => $serverState['spyUids'],
                    'spyNames'        => $serverState['spyNames'],
                    'resolvedAtMs'    => $now,
                    'scoresApplied'   => true,
                ];
                $room['updatedAt'] = $now;
                $pushSys($reason);
                $result = ['isCorrect' => $isCorrect, 'winnerTeam' => $winnerTeam];
                break;
            }

            // ===================== GAME #6: MALAM SILUMAN =====================
            case 'startMalamSilumanRound': {
                yukmain_require_host($senderUid, $room);
                if (!in_array($room['status'] ?? 'lobby', ['lobby', 'round_end'], true)) {
                    throw new RuntimeException('Ronde sedang berlangsung.');
                }
                $active = yukmain_filter_active_players($players);
                if (count($active) < 4) {
                    throw new RuntimeException('Minimal 4 pemain aktif (tidak sedang BRB) dibutuhkan untuk memulai Malam Siluman.');
                }
                $settings = yukmain_sanitize_malam_siluman_settings($room['malamSilumanSettings'] ?? null);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);

                $participantUids = array_column($active, 'uid');
                $namesByUid = [];
                foreach ($active as $p) {
                    $namesByUid[$p['uid']] = mb_substr($p['displayName'], 0, 40, 'UTF-8');
                }

                $dealt = yukmain_deal_malam_siluman_round($participantUids, $namesByUid, $settings, $roundId);
                yukmain_save_round_secrets($tx, $roomId, $roundId, $dealt['secretsByUid'], $now);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'               => $roundId,
                    'roundNumber'           => $nextRound,
                    'locationName'          => 'Desa Malam Siluman',
                    'spyUids'               => $dealt['wolfUids'],
                    'spyNames'              => $dealt['wolfNames'],
                    'wolfRolesByUid'        => $dealt['rolesByUid'],
                    'wolfNamesByUid'        => $namesByUid,
                    'lastProtectedByDoctor' => null,
                    'createdAtMs'           => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['roundEndsAtMs'] = 0;
                $room['firstSpeakerUid'] = '';
                $room['selectedLocationNames'] = [];
                $room['eliminatedUids'] = [];
                $room['eliminationLog'] = [];
                $room['malamSilumanSettings'] = $settings;
                $room['malamSilumanState'] = [
                    'phase'                 => 'night',
                    'nightNumber'           => 1,
                    'dayNumber'             => 0,
                    'participantUids'       => $participantUids,
                    'participantNamesByUid' => $namesByUid,
                    'livingUids'            => $participantUids,
                    'deadPlayers'           => [],
                    'submittedNightUids'    => [],
                    'submittedVoteUids'     => [],
                    'lastNightSummary'      => null,
                    'lastDaySummary'        => null,
                    'lastHunterSummary'     => null,
                    'pendingHunterUid'      => null,
                    'pendingHunterName'     => null,
                    'hunterTrigger'         => null,
                    'activeDeckComposition' => $dealt['deckComposition'],
                ];
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $pCount = count($active);
                $wCount = count($dealt['wolfUids']);
                $pushSys("Malam #1 turun di desa ({$pCount} warga, {$wCount} Siluman). Semua pemain hidup silakan kirim aksi malamnya!");
                $result = ['roundNumber' => $nextRound, 'roundId' => $roundId];
                break;
            }

            case 'submitMalamSilumanNightAction': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || !$serverState || ($room['status'] ?? '') !== 'playing' || ($ms['phase'] ?? '') !== 'night') {
                    throw new RuntimeException('Fase Malam sedang tidak aktif.');
                }
                if (!in_array($actor['uid'], $ms['livingUids'], true)) {
                    throw new RuntimeException('Hanya pemain yang masih hidup yang dapat beraksi di malam hari.');
                }
                $targetUid = trim((string) ($payload['targetUid'] ?? ''));
                if ($targetUid === '') {
                    throw new RuntimeException('Pilih target atau kirim aksi Ronda Malam terlebih dahulu.');
                }
                $actorRole = $serverState['wolfRolesByUid'][$actor['uid']] ?? 'warga';
                if ($actorRole === 'tabib' && !empty($serverState['lastProtectedByDoctor']) && $targetUid === $serverState['lastProtectedByDoctor']) {
                    throw new RuntimeException('Tabib tidak boleh melindungi orang yang sama 2 malam berturut-turut.');
                }

                $scopeKey = $currentRoundId . '_n' . $ms['nightNumber'];
                yukmain_save_submission($tx, $roomId, 'ms_night', $scopeKey, $actor['uid'], $targetUid, $now);
                $nightTargets = yukmain_load_submissions($tx, $roomId, 'ms_night', $scopeKey);
                $submitted = array_values(array_filter(
                    $ms['livingUids'],
                    static fn(string $u): bool => isset($nightTargets[$u])
                ));

                if (count($submitted) < count($ms['livingUids'])) {
                    $room['malamSilumanState']['submittedNightUids'] = $submitted;
                    $room['updatedAt'] = $now;
                    $result = ['allSubmitted' => false];
                    break;
                }

                $result = yukmain_finalize_ms_night($tx, $roomId, $room, $playersByUid, $serverState, $nightTargets, $submitted, $now, $pushSys);
                break;
            }

            case 'resolveMalamSilumanNight': {
                yukmain_require_host($senderUid, $room);
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || !$serverState) {
                    throw new RuntimeException('Ronde Malam Siluman tidak aktif.');
                }
                if (($room['status'] ?? '') !== 'playing' || ($ms['phase'] ?? '') !== 'night') {
                    break;
                }
                $scopeKey = $currentRoundId . '_n' . $ms['nightNumber'];
                $nightTargets = yukmain_load_submissions($tx, $roomId, 'ms_night', $scopeKey);
                $result = yukmain_finalize_ms_night($tx, $roomId, $room, $playersByUid, $serverState, $nightTargets, $ms['submittedNightUids'] ?? [], $now, $pushSys);
                break;
            }

            case 'advanceMalamSilumanDayPhase': {
                yukmain_require_host($senderUid, $room);
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || ($room['status'] ?? '') !== 'playing') {
                    throw new RuntimeException('Ronde Malam Siluman sedang tidak berjalan.');
                }
                $nextPhase = (string) ($payload['nextPhase'] ?? '');
                if (!in_array($nextPhase, ['day_discussion', 'day_voting'], true)) {
                    throw new RuntimeException('Transisi fase tidak valid.');
                }
                if ($nextPhase === 'day_discussion' && $ms['phase'] === 'dawn') {
                    $room['malamSilumanState']['phase'] = 'day_discussion';
                    $room['updatedAt'] = $now;
                    $pushSys("Siang #{$ms['dayNumber']} dimulai! Warga desa berdiskusi mencari siapa Siluman.");
                    $result = ['phase' => 'day_discussion'];
                } elseif ($nextPhase === 'day_voting' && in_array($ms['phase'], ['day_discussion', 'dawn'], true)) {
                    $room['malamSilumanState']['phase'] = 'day_voting';
                    $room['malamSilumanState']['submittedVoteUids'] = [];
                    $room['updatedAt'] = $now;
                    $pushSys("Voting Eksekusi Siang #{$ms['dayNumber']} dibuka! Setiap warga hidup memilih secara rahasia.");
                    $result = ['phase' => 'day_voting'];
                }
                break;
            }

            case 'castMalamSilumanVote': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || !$serverState || ($room['status'] ?? '') !== 'playing' || ($ms['phase'] ?? '') !== 'day_voting') {
                    throw new RuntimeException('Voting eksekusi sedang tidak aktif.');
                }
                if (!in_array($actor['uid'], $ms['livingUids'], true)) {
                    throw new RuntimeException('Pemain yang sudah gugur tidak memiliki hak suara.');
                }
                $targetUid = trim((string) ($payload['targetUid'] ?? ''));
                if ($targetUid === '') {
                    throw new RuntimeException('Pilih salah satu tersangka atau "Lewati Eksekusi".');
                }
                if ($targetUid === $actor['uid']) {
                    throw new RuntimeException('Kamu tidak dapat memilih dirimu sendiri.');
                }
                if ($targetUid !== 'skip' && !in_array($targetUid, $ms['livingUids'], true)) {
                    throw new RuntimeException('Target yang dipilih tidak valid atau sudah gugur.');
                }

                $scopeKey = $currentRoundId . '_d' . $ms['dayNumber'];
                yukmain_save_submission($tx, $roomId, 'ms_vote', $scopeKey, $actor['uid'], $targetUid, $now);
                $votesByUid = yukmain_load_submissions($tx, $roomId, 'ms_vote', $scopeKey);
                $submitted = array_values(array_filter(
                    $ms['livingUids'],
                    static fn(string $u): bool => isset($votesByUid[$u])
                ));

                if (count($submitted) < count($ms['livingUids'])) {
                    $room['malamSilumanState']['submittedVoteUids'] = $submitted;
                    $room['updatedAt'] = $now;
                    $result = ['allVoted' => false];
                    break;
                }

                $result = yukmain_finalize_ms_vote($tx, $roomId, $room, $playersByUid, $serverState, $votesByUid, $submitted, $now, $pushSys);
                break;
            }

            case 'resolveMalamSilumanVote': {
                yukmain_require_host($senderUid, $room);
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || !$serverState) {
                    throw new RuntimeException('Ronde Malam Siluman tidak aktif.');
                }
                if (($room['status'] ?? '') !== 'playing' || ($ms['phase'] ?? '') !== 'day_voting') {
                    break;
                }
                $scopeKey = $currentRoundId . '_d' . $ms['dayNumber'];
                $votesByUid = yukmain_load_submissions($tx, $roomId, 'ms_vote', $scopeKey);
                $result = yukmain_finalize_ms_vote($tx, $roomId, $room, $playersByUid, $serverState, $votesByUid, $ms['submittedVoteUids'] ?? [], $now, $pushSys);
                break;
            }

            case 'submitMalamSilumanHunterShot': {
                $ms = $room['malamSilumanState'] ?? null;
                if (!$ms || !$serverState || ($room['status'] ?? '') !== 'playing' || ($ms['phase'] ?? '') !== 'hunter_revenge' || empty($ms['pendingHunterUid'])) {
                    throw new RuntimeException('Tidak ada fase Tembakan Terakhir Pemburu yang aktif.');
                }
                $skip = !empty($payload['skip']);
                $targetUid = trim((string) ($payload['targetUid'] ?? ''));
                if (!$skip && $targetUid === '') {
                    throw new RuntimeException('Pilih 1 pemain hidup untuk ditembak atau lewati.');
                }
                if (!$skip || $senderUid !== $room['hostUid']) {
                    $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                    if ($actor['uid'] !== $ms['pendingHunterUid']) {
                        throw new RuntimeException('Hanya Pemburu yang baru gugur yang dapat menembak.', 403);
                    }
                }

                $rolesByUid = $serverState['wolfRolesByUid'] ?? [];
                $namesByUid = $ms['participantNamesByUid'];
                $settings = yukmain_sanitize_malam_siluman_settings($room['malamSilumanSettings'] ?? null);
                $nextLiving = $ms['livingUids'];
                $nextDead = $ms['deadPlayers'];
                $hunterName = $ms['pendingHunterName'] ?? 'Pemburu';

                if (!$skip) {
                    if (!in_array($targetUid, $ms['livingUids'], true)) {
                        throw new RuntimeException('Target tembakan bukan pemain yang masih hidup.');
                    }
                    $targetName = $namesByUid[$targetUid] ?? 'Pemain';
                    $targetRole = $rolesByUid[$targetUid] ?? 'warga';
                    $nextLiving = array_values(array_filter($nextLiving, static fn(string $u): bool => $u !== $targetUid));
                    $nextDead[] = yukmain_build_dead_player(
                        $targetUid,
                        $targetName,
                        'hunter_shot',
                        (int) $ms['dayNumber'],
                        $targetRole,
                        !empty($settings['revealRoleOnDeath'])
                    );
                    $roleMeta = yukmain_ms_role_meta($targetRole);
                    $roleSuffix = !empty($settings['revealRoleOnDeath']) ? " ({$roleMeta['name']})" : '';
                    $hunterSummary = "{$hunterName} menembak {$targetName} dengan Tembakan Terakhir{$roleSuffix}!";
                } else {
                    $hunterSummary = "{$hunterName} menahan Tembakan Terakhirnya.";
                }

                $victory = yukmain_eval_ms_victory($nextLiving, $rolesByUid, $namesByUid);
                if ($victory['winnerTeam'] && $victory['reason']) {
                    $deltas = yukmain_calc_ms_deltas($ms['participantUids'], $nextLiving, $rolesByUid, $victory['winnerTeam'], null);
                    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);
                    $reason = "{$hunterSummary} {$victory['reason']}";

                    $room['status'] = 'round_end';
                    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                    $room['malamSilumanState'] = array_merge($ms, [
                        'phase'              => 'reveal',
                        'livingUids'         => $nextLiving,
                        'deadPlayers'        => $nextDead,
                        'lastHunterSummary'  => $hunterSummary,
                        'pendingHunterUid'   => null,
                        'pendingHunterName'  => null,
                        'hunterTrigger'      => null,
                        'revealedRolesByUid' => $rolesByUid,
                    ]);
                    $room['lastRoundResult'] = [
                        'roundNumber'     => $room['roundNumber'],
                        'winnerTeam'      => $victory['winnerTeam'],
                        'reason'          => $reason,
                        'locationName'    => 'Desa Malam Siluman',
                        'guessedLocation' => null,
                        'spyUids'         => $serverState['spyUids'],
                        'spyNames'        => $serverState['spyNames'],
                        'resolvedAtMs'    => $now,
                        'scoresApplied'   => true,
                    ];
                    $room['updatedAt'] = $now;
                    $pushSys($reason);
                    $result = ['winnerTeam' => $victory['winnerTeam']];
                    break;
                }

                if (($ms['hunterTrigger'] ?? '') === 'night') {
                    $room['malamSilumanState'] = array_merge($ms, [
                        'phase'             => 'day_discussion',
                        'livingUids'        => $nextLiving,
                        'deadPlayers'       => $nextDead,
                        'lastHunterSummary' => $hunterSummary,
                        'pendingHunterUid'  => null,
                        'pendingHunterName' => null,
                        'hunterTrigger'     => null,
                    ]);
                    $room['updatedAt'] = $now;
                    $pushSys("{$hunterSummary} Diskusi Siang #{$ms['dayNumber']} dimulai!");
                    $result = ['phase' => 'day_discussion'];
                    break;
                }

                $nextNight = ((int) $ms['nightNumber']) + 1;
                $room['malamSilumanState'] = array_merge($ms, [
                    'phase'              => 'night',
                    'nightNumber'        => $nextNight,
                    'livingUids'         => $nextLiving,
                    'deadPlayers'        => $nextDead,
                    'submittedNightUids' => [],
                    'submittedVoteUids'  => [],
                    'lastHunterSummary'  => $hunterSummary,
                    'pendingHunterUid'   => null,
                    'pendingHunterName'  => null,
                    'hunterTrigger'      => null,
                ]);
                $room['updatedAt'] = $now;
                $pushSys("{$hunterSummary} Malam #{$nextNight} pun turun...");
                $result = ['phase' => 'night', 'nightNumber' => $nextNight];
                break;
            }

            // ===================== GAME #7: ULAR TANGGA RP =====================
            case 'updateUlarTanggaSettings': {
                yukmain_require_host($senderUid, $room);
                $existing = yukmain_sanitize_ular_tangga_settings($room['ularTanggaSettings'] ?? null);
                $incoming = is_array($payload['settings'] ?? null) ? $payload['settings'] : $payload;
                $existingClasses = is_object($existing['classSelectionByUid'] ?? null)
                    ? []
                    : (is_array($existing['classSelectionByUid'] ?? null) ? $existing['classSelectionByUid'] : []);
                $incomingClasses = is_array($incoming['classSelectionByUid'] ?? null)
                    ? $incoming['classSelectionByUid']
                    : [];
                $merged = array_merge($existing, $incoming, [
                    'classSelectionByUid' => array_merge($existingClasses, $incomingClasses),
                ]);
                $clean = yukmain_sanitize_ular_tangga_settings($merged);
                $room['enabledPacks'] = [$clean['scenarioId']];
                $room['ularTanggaSettings'] = $clean;
                $room['updatedAt'] = $now;
                break;
            }

            case 'selectUlarTanggaClass': {
                if (($room['status'] ?? 'lobby') !== 'lobby') {
                    throw new RuntimeException('Kelas hero hanya bisa dipilih di Lobi sebelum petualangan dimulai.');
                }
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $rawClass = (string) ($payload['heroClass'] ?? 'acak');
                $allowed = ['acak', 'ksatria', 'pencuri', 'penyihir', 'tabib'];
                $nextClass = in_array($rawClass, $allowed, true) ? $rawClass : 'acak';
                $existing = yukmain_sanitize_ular_tangga_settings($room['ularTanggaSettings'] ?? null);
                $existingClasses = is_object($existing['classSelectionByUid'] ?? null)
                    ? []
                    : (is_array($existing['classSelectionByUid'] ?? null) ? $existing['classSelectionByUid'] : []);
                $existingClasses[$actor['uid']] = $nextClass;
                $existing['classSelectionByUid'] = $existingClasses;
                $room['ularTanggaSettings'] = yukmain_sanitize_ular_tangga_settings($existing);
                $room['updatedAt'] = $now;
                break;
            }

            case 'startUlarTanggaRound': {
                yukmain_require_host($senderUid, $room);
                $settings = yukmain_sanitize_ular_tangga_settings($room['ularTanggaSettings'] ?? null);
                $nextRound = ((int) ($room['roundNumber'] ?? 0)) + 1;
                $roundId = 'r' . $nextRound . '_' . base_convert((string) $now, 10, 36);
                $created = yukmain_ut_create_round($players, $settings, $roundId);

                yukmain_save_round_secrets($tx, $roomId, $roundId, $created['secretsByUid'], $now);
                $scenarioPack = yukmain_ut_scenario_pack((string) $settings['scenarioId']);
                yukmain_save_server_state($tx, $roomId, $roundId, [
                    'roundId'      => $roundId,
                    'roundNumber'  => $nextRound,
                    'locationName' => $scenarioPack['name'],
                    'spyUids'      => [],
                    'spyNames'     => [],
                    'createdAtMs'  => $now,
                ], $now);

                $room['status'] = 'playing';
                $room['roundNumber'] = $nextRound;
                $room['currentRoundId'] = $roundId;
                $room['enabledPacks'] = [$settings['scenarioId']];
                $room['ularTanggaSettings'] = $settings;
                $room['ularTanggaState'] = $created['state'];
                $room['lastRoundResult'] = null;
                $room['updatedAt'] = $now;

                $pushSys($created['state']['eventLog'][0] ?? 'Petualangan Ular Tangga RP dimulai!');
                $result = ['roundId' => $roundId, 'currentTurnUid' => $created['state']['currentTurnUid']];
                break;
            }

            case 'useUlarTanggaSkill': {
                $uts = $room['ularTanggaState'] ?? null;
                if (($room['status'] ?? 'lobby') !== 'playing' || !is_array($uts)) {
                    throw new RuntimeException('Petualangan belum aktif.');
                }
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $targetUid = is_string($payload['targetUid'] ?? null) && $payload['targetUid'] !== ''
                    ? $payload['targetUid']
                    : null;
                $res = yukmain_ut_apply_skill($uts, $actor['uid'], $targetUid);
                $room['ularTanggaState'] = $res['state'];
                $room['updatedAt'] = $now;
                $pushSys($res['message']);
                $result = ['message' => $res['message']];
                break;
            }

            case 'useUlarTanggaItem': {
                $uts = $room['ularTanggaState'] ?? null;
                if (($room['status'] ?? 'lobby') !== 'playing' || !is_array($uts)) {
                    throw new RuntimeException('Petualangan belum aktif.');
                }
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $secret = yukmain_load_round_secret($tx, $roomId, $currentRoundId, $actor['uid']) ?? [];
                $actorBag = is_array($secret['ularBag'] ?? null) ? $secret['ularBag'] : [];
                $itemId = (string) ($payload['itemId'] ?? '');
                $targetUid = is_string($payload['targetUid'] ?? null) && $payload['targetUid'] !== ''
                    ? $payload['targetUid']
                    : null;

                $res = yukmain_ut_apply_bag_item($uts, $actor['uid'], $actorBag, $itemId, $targetUid);
                $secret['ularBag'] = $res['nextBag'];
                yukmain_save_round_secret_single($tx, $roomId, $currentRoundId, $actor['uid'], $secret, $now);

                $room['ularTanggaState'] = $res['state'];
                $room['updatedAt'] = $now;
                $pushSys($res['message']);
                $result = ['message' => $res['message']];
                break;
            }

            case 'rollUlarTanggaDice': {
                $uts = $room['ularTanggaState'] ?? null;
                if (($room['status'] ?? 'lobby') !== 'playing' || !is_array($uts)) {
                    throw new RuntimeException('Petualangan belum aktif.');
                }
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $secret = yukmain_load_round_secret($tx, $roomId, $currentRoundId, $actor['uid']) ?? [];
                $actorBag = is_array($secret['ularBag'] ?? null) ? $secret['ularBag'] : [];

                $brbSet = [];
                foreach ($players as $p) {
                    if (!empty($p['isBrb'])) {
                        $brbSet[$p['uid']] = true;
                    }
                }

                $res = yukmain_ut_roll_dice_and_move($uts, $actor['uid'], $actorBag, $brbSet);
                $secret['ularBag'] = $res['nextBag'];
                yukmain_save_round_secret_single($tx, $roomId, $currentRoundId, $actor['uid'], $secret, $now);

                if (!empty($res['finished'])) {
                    $deltas = yukmain_ut_score_deltas($res['state']);
                    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);
                    $scenarioName = yukmain_ut_scenario_pack((string) ($res['state']['scenarioId'] ?? 'menara_nusantara'))['name'];
                    $winUid = (string) ($res['state']['winnerUid'] ?? $actor['uid']);
                    $winName = (string) ($res['state']['winnerName'] ?? $actor['displayName']);
                    $roundResult = [
                        'roundNumber'     => (int) ($room['roundNumber'] ?? 1),
                        'winnerTeam'      => 'petualang',
                        'reason'          => $res['message'],
                        'locationName'    => $scenarioName,
                        'guessedLocation' => null,
                        'spyUids'         => [$winUid],
                        'spyNames'        => [$winName],
                        'resolvedAtMs'    => $now,
                        'scoresApplied'   => true,
                    ];
                    $room['status'] = 'round_end';
                    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                    $room['ularTanggaState'] = $res['state'];
                    $room['lastRoundResult'] = $roundResult;
                    $room['updatedAt'] = $now;
                    $pushSys($res['message']);
                    $result = ['finished' => true, 'message' => $res['message']];
                    break;
                }

                $room['ularTanggaState'] = $res['state'];
                $room['updatedAt'] = $now;
                $pushSys($res['message']);
                $result = ['finished' => false, 'message' => $res['message']];
                break;
            }

            case 'resolveUlarTanggaEncounter': {
                $uts = $room['ularTanggaState'] ?? null;
                if (($room['status'] ?? 'lobby') !== 'playing' || !is_array($uts)) {
                    throw new RuntimeException('Petualangan belum aktif.');
                }
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $secret = yukmain_load_round_secret($tx, $roomId, $currentRoundId, $actor['uid']) ?? [];
                $actorBag = is_array($secret['ularBag'] ?? null) ? $secret['ularBag'] : [];

                $brbSet = [];
                foreach ($players as $p) {
                    if (!empty($p['isBrb'])) {
                        $brbSet[$p['uid']] = true;
                    }
                }

                $decision = in_array($payload['decision'] ?? '', ['attack', 'buy', 'skip'], true)
                    ? (string) $payload['decision']
                    : 'skip';
                $buyItemId = is_string($payload['buyItemId'] ?? null) && $payload['buyItemId'] !== ''
                    ? (string) $payload['buyItemId']
                    : null;

                $res = yukmain_ut_resolve_encounter($uts, $actor['uid'], $actorBag, $decision, $buyItemId, $brbSet);
                $secret['ularBag'] = $res['nextBag'];
                yukmain_save_round_secret_single($tx, $roomId, $currentRoundId, $actor['uid'], $secret, $now);

                if (!empty($res['finished'])) {
                    $deltas = yukmain_ut_score_deltas($res['state']);
                    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);
                    $scenarioName = yukmain_ut_scenario_pack((string) ($res['state']['scenarioId'] ?? 'menara_nusantara'))['name'];
                    $winUid = (string) ($res['state']['winnerUid'] ?? $actor['uid']);
                    $winName = (string) ($res['state']['winnerName'] ?? $actor['displayName']);
                    $roundResult = [
                        'roundNumber'     => (int) ($room['roundNumber'] ?? 1),
                        'winnerTeam'      => 'petualang',
                        'reason'          => $res['message'],
                        'locationName'    => $scenarioName,
                        'guessedLocation' => null,
                        'spyUids'         => [$winUid],
                        'spyNames'        => [$winName],
                        'resolvedAtMs'    => $now,
                        'scoresApplied'   => true,
                    ];
                    $room['status'] = 'round_end';
                    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
                    $room['ularTanggaState'] = $res['state'];
                    $room['lastRoundResult'] = $roundResult;
                    $room['updatedAt'] = $now;
                    $pushSys($res['message']);
                    $result = ['finished' => true, 'message' => $res['message']];
                    break;
                }

                $room['ularTanggaState'] = $res['state'];
                $room['updatedAt'] = $now;
                $pushSys($res['message']);
                $result = ['finished' => false, 'message' => $res['message']];
                break;
            }

            // ===================== RETURN TO LOBBY =====================
            case 'returnRoomToLobby':
            case 'returnKataKataToLobby':
            case 'returnSatuFrekuensiToLobby':
            case 'returnFaktaHariIniToLobby':
            case 'returnPelukisToLobby':
            case 'returnMalamSilumanToLobby':
            case 'returnUlarTanggaToLobby': {
                yukmain_require_host($senderUid, $room);
                $room['status'] = 'lobby';
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['eliminatedUids'] = [];
                $room['eliminationLog'] = [];
                $room['frequencyState'] = null;
                $room['faktaState'] = null;
                $room['lukisanState'] = null;
                $room['malamSilumanState'] = null;
                $room['ularTanggaState'] = null;
                $room['updatedAt'] = $now;
                break;
            }

            // ===================== SESSION PLATFORM & RECAP =====================
            case 'switchRoomGameType': {
                yukmain_require_host($senderUid, $room);
                if (!in_array($room['status'] ?? 'lobby', ['lobby', 'round_end'], true)) {
                    throw new RuntimeException('Selesaikan atau kembali ke lobi terlebih dahulu sebelum ganti game.');
                }
                $nextGameType = (string) ($payload['nextGameType'] ?? '');
                if (!in_array($nextGameType, YUKMAIN_ALLOWED_GAME_TYPES, true)) {
                    throw new RuntimeException('Jenis permainan tidak valid.');
                }

                $existingCompleted = $room['completedGames'] ?? [];
                $recorded = yukmain_finalize_completed_game_record(
                    count($existingCompleted) + 1,
                    (string) $room['gameType'],
                    (int) ($room['currentMatchRounds'] ?? 0),
                    $players,
                    $now
                );
                if ($recorded !== null) {
                    $existingCompleted[] = $recorded;
                    yukmain_record_completed_game_history($tx, $roomId, (string) $room['code'], $recorded, $now);
                }

                $tx->prepare('UPDATE room_players SET score = 0, updated_at_ms = ? WHERE room_id = ?')->execute([$now, $roomId]);

                $room['gameType'] = $nextGameType;
                $room['status'] = 'lobby';
                $room['roundNumber'] = 0;
                $room['currentMatchRounds'] = 0;
                $room['currentRoundId'] = '';
                $room['roundEndsAtMs'] = 0;
                $room['firstSpeakerUid'] = '';
                $room['enabledPacks'] = yukmain_default_packs_for_game($nextGameType);
                $room['selectedLocationNames'] = [];
                $room['eliminatedUids'] = [];
                $room['eliminationLog'] = [];
                $room['frequencyState'] = null;
                $room['faktaState'] = null;
                $room['lukisanState'] = null;
                $room['malamSilumanState'] = null;
                $room['ularTanggaState'] = null;
                $room['activeVote'] = null;
                $room['pendingSpyGuess'] = null;
                $room['lastRoundResult'] = null;
                $room['completedGames'] = $existingCompleted;
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;

                $pushSys('Host mengganti permainan di ruang. Skor dimulai dari 0.');
                $result = ['recordedPreviousMatch' => $recorded !== null];
                break;
            }

            case 'openSessionRecap': {
                yukmain_require_host($senderUid, $room);
                if (!in_array($room['status'] ?? 'lobby', ['lobby', 'round_end'], true)) {
                    throw new RuntimeException('Rekap Permainan hanya bisa dibuka di Lobi atau setelah ronde selesai.');
                }
                $completedGames = $room['completedGames'] ?? [];
                $recordedCurrent = yukmain_finalize_completed_game_record(
                    count($completedGames) + 1,
                    (string) $room['gameType'],
                    (int) ($room['currentMatchRounds'] ?? 0),
                    $players,
                    $now
                );
                if ($recordedCurrent !== null) {
                    $completedGames[] = $recordedCurrent;
                    yukmain_record_completed_game_history($tx, $roomId, (string) $room['code'], $recordedCurrent, $now);
                    $tx->prepare('UPDATE room_players SET score = 0, updated_at_ms = ? WHERE room_id = ?')->execute([$now, $roomId]);
                    $players = yukmain_load_room_players($tx, $roomId);
                }

                if (empty($completedGames)) {
                    throw new RuntimeException('Belum ada ronde yang selesai untuk direkap.');
                }

                $recap = yukmain_build_session_recap($completedGames, $players, $now);
                $room['status'] = 'lobby';
                $room['currentMatchRounds'] = 0;
                $room['completedGames'] = $completedGames;
                $room['activeRecap'] = $recap;
                $room['updatedAt'] = $now;
                $pushSys('Rekap Permainan dibuka untuk seluruh layar!');
                $result = ['recapId' => $recap['recapId']];
                break;
            }

            case 'closeSessionRecap': {
                yukmain_require_host($senderUid, $room);
                $room['activeRecap'] = null;
                $room['updatedAt'] = $now;
                break;
            }

            case 'submitSuitDuelPick': {
                $actor = yukmain_resolve_actor($senderUid, $payload, $playersByUid);
                $recap = $room['activeRecap'] ?? null;
                $duel = $recap['tiebreakerDuel'] ?? null;
                if (!$recap || !$duel || ($duel['status'] ?? '') !== 'picking') {
                    throw new RuntimeException('Duel Suit sedang tidak menerima pilihan.');
                }
                if (!in_array($actor['uid'], $duel['duelistUids'], true)) {
                    throw new RuntimeException('Kamu bukan peserta Duel Suit ini.', 403);
                }
                $pick = (string) ($payload['pick'] ?? '');
                if (!in_array($pick, ['batu', 'gunting', 'kertas'], true)) {
                    throw new RuntimeException('Pilihan Suit tidak valid.');
                }

                $scopeKey = $duel['duelId'] . '_c' . $duel['clashNumber'];
                yukmain_save_submission($tx, $roomId, 'suit_pick', $scopeKey, $actor['uid'], $pick, $now);
                $clashPicks = yukmain_load_submissions($tx, $roomId, 'suit_pick', $scopeKey);
                $submitted = array_values(array_filter(
                    $duel['duelistUids'],
                    static fn(string $u): bool => isset($clashPicks[$u])
                ));

                if (count($submitted) < count($duel['duelistUids'])) {
                    $duel['submittedUids'] = $submitted;
                    $recap['tiebreakerDuel'] = $duel;
                    $room['activeRecap'] = $recap;
                    $room['updatedAt'] = $now;
                    $result = ['allSubmitted' => false];
                    break;
                }

                $evaluated = yukmain_evaluate_suit_clash($duel, $clashPicks);
                $finished = ($evaluated['status'] ?? '') === 'finished';
                $recap['tiebreakerDuel'] = $evaluated;
                if ($finished) {
                    $recap['mvpUids'] = $evaluated['championUids'];
                    $recap['mvpNames'] = array_map(
                        static fn(string $u): string => $evaluated['duelistNames'][$u] ?? 'MVP',
                        $evaluated['championUids']
                    );
                    $recap['resolvedBy'] = 'suit_duel';
                }
                $room['activeRecap'] = $recap;
                $room['updatedAt'] = $now;
                $result = ['allSubmitted' => true, 'finished' => $finished];
                break;
            }

            case 'advanceSuitDuelClash': {
                yukmain_require_host($senderUid, $room);
                $recap = $room['activeRecap'] ?? null;
                $duel = $recap['tiebreakerDuel'] ?? null;
                if (!$recap || !$duel || ($duel['status'] ?? '') !== 'clash_reveal') {
                    throw new RuntimeException('Tidak dapat melanjutkan bentrok Suit saat ini.');
                }
                $duel['status'] = 'picking';
                $duel['clashNumber'] = ((int) $duel['clashNumber']) + 1;
                $duel['submittedUids'] = [];
                $duel['lastClash'] = null;
                $recap['tiebreakerDuel'] = $duel;
                $room['activeRecap'] = $recap;
                $room['updatedAt'] = $now;
                break;
            }

            default:
                throw new RuntimeException("Aksi tidak dikenal: {$action}", 400);
        }

        yukmain_save_room_row($tx, $room, null);
        foreach ($sysMessages as $msg) {
            yukmain_insert_and_prune_chat($tx, $roomId, 'system', 'Yuk Main', $msg, 'system');
        }

        return [
            'ok'            => true,
            'result'        => $result,
            'systemMessage' => !empty($sysMessages) ? end($sysMessages) : null,
        ];
    });
}

function yukmain_finalize_pelukis_vote(
    PDO $tx,
    string $roomId,
    array &$room,
    array $players,
    array &$playersByUid,
    array $serverState,
    array $votesByUid,
    array $submittedUids,
    int $now,
    callable $pushSys
): array {
    $lukisan = $room['lukisanState'];
    $tally = yukmain_tally_pelukis_votes($votesByUid, $lukisan['turnOrder'], $serverState['spyUids']);
    $accusedName = $tally['accusedUid']
        ? ($lukisan['turnNamesByUid'][$tally['accusedUid']] ?? 'Pemain')
        : null;

    if ($tally['caughtGadungan'] && $tally['accusedUid']) {
        $room['lukisanState'] = array_merge($lukisan, [
            'phase'             => 'gadungan_guess',
            'submittedVoteUids' => $submittedUids,
            'accusedUid'        => $tally['accusedUid'],
            'accusedName'       => $accusedName,
            'voteTally'         => empty($tally['voteTally']) ? new stdClass() : $tally['voteTally'],
            'votesByUid'        => empty($votesByUid) ? new stdClass() : $votesByUid,
        ]);
        $room['updatedAt'] = $now;
        $pushSys("{$accusedName} tertuduh sebagai Pelukis Gadungan! Dia mendapat 1 Kesempatan Terakhir menebak Kata Rahasia!");
        return ['allVoted' => true, 'caughtGadungan' => true, 'accusedUid' => $tally['accusedUid']];
    }

    $secretWord = (string) ($serverState['drawingWord'] ?? $serverState['locationName']);
    $category = (string) ($serverState['drawingCategory'] ?? $lukisan['category']);
    $active = yukmain_filter_active_players($players);
    $deltas = yukmain_calc_pelukis_deltas(array_column($active, 'uid'), $serverState['spyUids'], 'gadungan');
    yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

    $spyLabel = implode(', ', $serverState['spyNames']);
    $reason = ($tally['isTie'] || !$tally['accusedUid'])
        ? "Suara voting seri! Pelukis Gadungan ({$spyLabel}) lolos dan meraih +3 poin!"
        : "Salah tuduh! {$accusedName} ternyata Pelukis Asli! Pelukis Gadungan ({$spyLabel}) menang +3 poin!";

    $room['status'] = 'round_end';
    $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
    $room['lukisanState'] = array_merge($lukisan, [
        'phase'             => 'reveal',
        'submittedVoteUids' => $submittedUids,
        'accusedUid'        => $tally['accusedUid'],
        'accusedName'       => $accusedName,
        'voteTally'         => empty($tally['voteTally']) ? new stdClass() : $tally['voteTally'],
        'votesByUid'        => empty($votesByUid) ? new stdClass() : $votesByUid,
        'revealedWord'      => $secretWord,
        'gadunganUids'      => $serverState['spyUids'],
        'gadunganNames'     => $serverState['spyNames'],
    ]);
    $room['lastRoundResult'] = [
        'roundNumber'     => $room['roundNumber'],
        'winnerTeam'      => 'gadungan',
        'reason'          => $reason,
        'locationName'    => $secretWord,
        'guessedLocation' => null,
        'drawingCategory' => $category,
        'drawingWord'     => $secretWord,
        'spyUids'         => $serverState['spyUids'],
        'spyNames'        => $serverState['spyNames'],
        'resolvedAtMs'    => $now,
        'scoresApplied'   => true,
    ];
    $room['updatedAt'] = $now;
    $pushSys($reason);
    return ['allVoted' => true, 'caughtGadungan' => false];
}

function yukmain_finalize_ms_night(
    PDO $tx,
    string $roomId,
    array &$room,
    array &$playersByUid,
    array $serverState,
    array $nightTargets,
    array $submittedNightUids,
    int $now,
    callable $pushSys
): array {
    $ms = $room['malamSilumanState'];
    $roundId = (string) $room['currentRoundId'];
    $rolesByUid = $serverState['wolfRolesByUid'] ?? [];
    $namesByUid = $ms['participantNamesByUid'];
    $settings = yukmain_sanitize_malam_siluman_settings($room['malamSilumanSettings'] ?? null);

    $nightRes = yukmain_resolve_malam_siluman_night(
        (int) $ms['nightNumber'],
        $ms['livingUids'],
        $rolesByUid,
        $namesByUid,
        $nightTargets,
        $serverState['lastProtectedByDoctor'] ?? null
    );

    if (!empty($nightRes['seerPeek'])) {
        $seerUid = $nightRes['seerPeek']['seerUid'];
        $sec = yukmain_load_round_secret($tx, $roomId, $roundId, $seerUid);
        if ($sec !== null) {
            $history = $sec['peekHistory'] ?? [];
            $history[] = $nightRes['seerPeek']['record'];
            $sec['peekHistory'] = $history;
            yukmain_save_round_secret_single($tx, $roomId, $roundId, $seerUid, $sec, $now);
        }
    }

    $nextDocProtected = $nightRes['nextDoctorLastProtectedUid'] ?? null;
    $serverState['lastProtectedByDoctor'] = $nextDocProtected;
    yukmain_save_server_state($tx, $roomId, $roundId, $serverState, $now);

    foreach ($ms['livingUids'] as $u) {
        if (($rolesByUid[$u] ?? '') === 'tabib') {
            $docSec = yukmain_load_round_secret($tx, $roomId, $roundId, $u);
            if ($docSec !== null) {
                $docSec['lastProtectedUid'] = $nextDocProtected;
                yukmain_save_round_secret_single($tx, $roomId, $roundId, $u, $docSec, $now);
            }
            break;
        }
    }

    $elimUid = $nightRes['eliminatedUid'];
    $nextLiving = $elimUid
        ? array_values(array_filter($ms['livingUids'], static fn(string $u): bool => $u !== $elimUid))
        : $ms['livingUids'];
    $nextDead = $ms['deadPlayers'];
    $killedHunter = false;

    if ($elimUid !== null) {
        $vRole = $rolesByUid[$elimUid] ?? 'warga';
        if ($vRole === 'pemburu') {
            $killedHunter = true;
        }
        $nextDead[] = yukmain_build_dead_player(
            $elimUid,
            $namesByUid[$elimUid] ?? 'Pemain',
            'night_kill',
            (int) $ms['nightNumber'],
            $vRole,
            !empty($settings['revealRoleOnDeath'])
        );
    }

    if ($killedHunter && $elimUid !== null && !empty($nextLiving)) {
        $hunterName = $namesByUid[$elimUid] ?? 'Pemburu';
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'hunter_revenge',
            'dayNumber'          => (int) $ms['nightNumber'],
            'livingUids'         => $nextLiving,
            'deadPlayers'        => $nextDead,
            'submittedNightUids' => $submittedNightUids,
            'submittedVoteUids'  => [],
            'lastNightSummary'   => $nightRes['dawnMessage'],
            'lastHunterSummary'  => null,
            'pendingHunterUid'   => $elimUid,
            'pendingHunterName'  => $hunterName,
            'hunterTrigger'      => 'night',
        ]);
        $room['updatedAt'] = $now;
        $pushSys("{$nightRes['dawnMessage']} {$hunterName} adalah PEMBURU dan langsung membidik Tembakan Terakhir!");
        return ['phase' => 'hunter_revenge'];
    }

    $victory = yukmain_eval_ms_victory($nextLiving, $rolesByUid, $namesByUid);
    if ($victory['winnerTeam'] && $victory['reason']) {
        $deltas = yukmain_calc_ms_deltas($ms['participantUids'], $nextLiving, $rolesByUid, $victory['winnerTeam'], $victory['tumbalWinnerUid']);
        yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);
        $reason = "{$nightRes['dawnMessage']} {$victory['reason']}";

        $room['status'] = 'round_end';
        $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'reveal',
            'dayNumber'          => (int) $ms['nightNumber'],
            'livingUids'         => $nextLiving,
            'deadPlayers'        => $nextDead,
            'submittedNightUids' => $submittedNightUids,
            'submittedVoteUids'  => [],
            'lastNightSummary'   => $nightRes['dawnMessage'],
            'revealedRolesByUid' => $rolesByUid,
        ]);
        $room['lastRoundResult'] = [
            'roundNumber'     => $room['roundNumber'],
            'winnerTeam'      => $victory['winnerTeam'],
            'reason'          => $reason,
            'locationName'    => 'Desa Malam Siluman',
            'guessedLocation' => null,
            'spyUids'         => $serverState['spyUids'],
            'spyNames'        => $serverState['spyNames'],
            'resolvedAtMs'    => $now,
            'scoresApplied'   => true,
        ];
        $room['updatedAt'] = $now;
        $pushSys($reason);
        return ['winnerTeam' => $victory['winnerTeam']];
    }

    $room['malamSilumanState'] = array_merge($ms, [
        'phase'              => 'dawn',
        'dayNumber'          => (int) $ms['nightNumber'],
        'livingUids'         => $nextLiving,
        'deadPlayers'        => $nextDead,
        'submittedNightUids' => $submittedNightUids,
        'submittedVoteUids'  => [],
        'lastNightSummary'   => $nightRes['dawnMessage'],
        'lastHunterSummary'  => null,
        'pendingHunterUid'   => null,
        'pendingHunterName'  => null,
        'hunterTrigger'      => null,
    ]);
    $room['updatedAt'] = $now;
    $pushSys($nightRes['dawnMessage']);
    return ['phase' => 'dawn'];
}

function yukmain_finalize_ms_vote(
    PDO $tx,
    string $roomId,
    array &$room,
    array &$playersByUid,
    array $serverState,
    array $votesByUid,
    array $submittedVoteUids,
    int $now,
    callable $pushSys
): array {
    $ms = $room['malamSilumanState'];
    $rolesByUid = $serverState['wolfRolesByUid'] ?? [];
    $namesByUid = $ms['participantNamesByUid'];
    $settings = yukmain_sanitize_malam_siluman_settings($room['malamSilumanSettings'] ?? null);

    $tally = yukmain_tally_ms_day_votes($votesByUid, $ms['livingUids'], $rolesByUid);
    $tallyMap = empty($tally['voteTally']) ? new stdClass() : $tally['voteTally'];

    if (!$tally['executedUid']) {
        $reason = $tally['isTie']
            ? "Suara voting Siang #{$ms['dayNumber']} seri! Tidak ada warga yang dieksekusi."
            : "Desa sepakat melewati eksekusi Siang #{$ms['dayNumber']}. Tidak ada yang dihukum.";
        $nextNight = ((int) $ms['nightNumber']) + 1;
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'night',
            'nightNumber'        => $nextNight,
            'submittedNightUids' => [],
            'submittedVoteUids'  => $submittedVoteUids,
            'lastDaySummary'     => $reason,
            'lastHunterSummary'  => null,
            'lastVoteTally'      => $tallyMap,
        ]);
        $room['updatedAt'] = $now;
        $pushSys("{$reason} Malam #{$nextNight} segera tiba...");
        return ['phase' => 'night', 'nightNumber' => $nextNight];
    }

    $execUid = $tally['executedUid'];
    $execName = $namesByUid[$execUid] ?? 'Pemain';
    $execRole = $rolesByUid[$execUid] ?? 'warga';
    $nextLiving = array_values(array_filter($ms['livingUids'], static fn(string $u): bool => $u !== $execUid));
    $nextDead = $ms['deadPlayers'];
    $nextDead[] = yukmain_build_dead_player(
        $execUid,
        $execName,
        'day_vote',
        (int) $ms['dayNumber'],
        $execRole,
        !empty($settings['revealRoleOnDeath'])
    );
    $roleMeta = yukmain_ms_role_meta($execRole);
    $roleSuffix = !empty($settings['revealRoleOnDeath']) ? " (ternyata {$roleMeta['name']})" : '';
    $daySummary = "{$execName} dieksekusi oleh keputusan voting desa pada Siang #{$ms['dayNumber']}{$roleSuffix}.";

    $victory = yukmain_eval_ms_victory($nextLiving, $rolesByUid, $namesByUid, $execUid);
    if ($victory['winnerTeam'] === 'tumbal' && $victory['reason']) {
        $deltas = yukmain_calc_ms_deltas($ms['participantUids'], $nextLiving, $rolesByUid, 'tumbal', $victory['tumbalWinnerUid']);
        yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);

        $room['status'] = 'round_end';
        $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'reveal',
            'livingUids'         => $nextLiving,
            'deadPlayers'        => $nextDead,
            'submittedNightUids' => [],
            'submittedVoteUids'  => $submittedVoteUids,
            'lastDaySummary'     => $daySummary,
            'lastVoteTally'      => $tallyMap,
            'revealedRolesByUid' => $rolesByUid,
        ]);
        $room['lastRoundResult'] = [
            'roundNumber'     => $room['roundNumber'],
            'winnerTeam'      => 'tumbal',
            'reason'          => $victory['reason'],
            'locationName'    => 'Desa Malam Siluman',
            'guessedLocation' => null,
            'spyUids'         => $serverState['spyUids'],
            'spyNames'        => $serverState['spyNames'],
            'resolvedAtMs'    => $now,
            'scoresApplied'   => true,
        ];
        $room['updatedAt'] = $now;
        $pushSys($victory['reason']);
        return ['winnerTeam' => 'tumbal'];
    }

    if ($execRole === 'pemburu' && !empty($nextLiving)) {
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'hunter_revenge',
            'livingUids'         => $nextLiving,
            'deadPlayers'        => $nextDead,
            'submittedNightUids' => [],
            'submittedVoteUids'  => $submittedVoteUids,
            'lastDaySummary'     => $daySummary,
            'lastHunterSummary'  => null,
            'lastVoteTally'      => $tallyMap,
            'pendingHunterUid'   => $execUid,
            'pendingHunterName'  => $execName,
            'hunterTrigger'      => 'day',
        ]);
        $room['updatedAt'] = $now;
        $pushSys("{$daySummary} Sebagai PEMBURU, {$execName} berhak melepaskan Tembakan Terakhir!");
        return ['phase' => 'hunter_revenge'];
    }

    if ($victory['winnerTeam'] && $victory['reason']) {
        $deltas = yukmain_calc_ms_deltas($ms['participantUids'], $nextLiving, $rolesByUid, $victory['winnerTeam'], null);
        yukmain_apply_score_deltas($tx, $roomId, $playersByUid, $deltas, $now);
        $reason = "{$daySummary} {$victory['reason']}";

        $room['status'] = 'round_end';
        $room['currentMatchRounds'] = ((int) ($room['currentMatchRounds'] ?? 0)) + 1;
        $room['malamSilumanState'] = array_merge($ms, [
            'phase'              => 'reveal',
            'livingUids'         => $nextLiving,
            'deadPlayers'        => $nextDead,
            'submittedNightUids' => [],
            'submittedVoteUids'  => $submittedVoteUids,
            'lastDaySummary'     => $daySummary,
            'lastVoteTally'      => $tallyMap,
            'revealedRolesByUid' => $rolesByUid,
        ]);
        $room['lastRoundResult'] = [
            'roundNumber'     => $room['roundNumber'],
            'winnerTeam'      => $victory['winnerTeam'],
            'reason'          => $reason,
            'locationName'    => 'Desa Malam Siluman',
            'guessedLocation' => null,
            'spyUids'         => $serverState['spyUids'],
            'spyNames'        => $serverState['spyNames'],
            'resolvedAtMs'    => $now,
            'scoresApplied'   => true,
        ];
        $room['updatedAt'] = $now;
        $pushSys($reason);
        return ['winnerTeam' => $victory['winnerTeam']];
    }

    $nextNight = ((int) $ms['nightNumber']) + 1;
    $room['malamSilumanState'] = array_merge($ms, [
        'phase'              => 'night',
        'nightNumber'        => $nextNight,
        'livingUids'         => $nextLiving,
        'deadPlayers'        => $nextDead,
        'submittedNightUids' => [],
        'submittedVoteUids'  => $submittedVoteUids,
        'lastDaySummary'     => $daySummary,
        'lastHunterSummary'  => null,
        'lastVoteTally'      => $tallyMap,
    ]);
    $room['updatedAt'] = $now;
    $pushSys("{$daySummary} Malam #{$nextNight} pun turun kembali...");
    return ['phase' => 'night', 'nightNumber' => $nextNight];
}
