<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/engine_common.php';

const YUKMAIN_ALLOWED_GAME_TYPES = [
    'spyfall',
    'kata_kata',
    'satu_frekuensi',
    'fakta_hari_ini',
    'pelukis_gadungan',
    'malam_siluman',
    'ular_tangga',
];

function yukmain_row_to_player(array $row): array
{
    return [
        'uid'           => (string) $row['uid'],
        'roomId'        => (string) $row['room_id'],
        'displayName'   => (string) $row['display_name'],
        'avatarColor'   => (string) $row['avatar_color'],
        'isHost'        => (bool) $row['is_host'],
        'score'         => (int) $row['score'],
        'isReady'       => (bool) $row['is_ready'],
        'controllerUid' => (string) $row['controller_uid'],
        'isNumpang'     => (bool) $row['is_numpang'],
        'isBrb'         => (bool) $row['is_brb'],
        'joinedAt'      => (int) $row['joined_at_ms'],
        'updatedAt'     => (int) $row['updated_at_ms'],
    ];
}

function yukmain_load_room_players(PDO $pdo, string $roomId): array
{
    $stmt = $pdo->prepare(
        'SELECT room_id, uid, display_name, avatar_color, is_host, score, is_ready, controller_uid, is_numpang, is_brb, joined_at_ms, updated_at_ms
         FROM room_players
         WHERE room_id = ?
         ORDER BY joined_at_ms ASC, uid ASC'
    );
    $stmt->execute([$roomId]);
    $rows = $stmt->fetchAll();
    return array_map('yukmain_row_to_player', $rows);
}

function yukmain_load_presence_map(PDO $pdo, string $roomId): array
{
    $stmt = $pdo->prepare(
        'SELECT uid, display_name, is_stage, online, last_seen_ms
         FROM room_presence
         WHERE room_id = ?'
    );
    $stmt->execute([$roomId]);
    $map = [];
    foreach ($stmt->fetchAll() as $row) {
        $map[(string) $row['uid']] = [
            'uid'         => (string) $row['uid'],
            'displayName' => (string) $row['display_name'],
            'isStage'     => (bool) $row['is_stage'],
            'online'      => (bool) $row['online'],
            'lastSeen'    => (int) $row['last_seen_ms'],
        ];
    }
    return $map;
}

function yukmain_upsert_presence(
    PDO $pdo,
    string $roomId,
    string $uid,
    string $displayName,
    bool $isStage,
    bool $online,
    int $nowMs
): void {
    $stmt = $pdo->prepare(
        'INSERT INTO room_presence (room_id, uid, display_name, is_stage, online, last_seen_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           is_stage = VALUES(is_stage),
           online = VALUES(online),
           last_seen_ms = VALUES(last_seen_ms)'
    );
    $stmt->execute([
        $roomId,
        $uid,
        mb_substr($displayName, 0, 64, 'UTF-8'),
        $isStage ? 1 : 0,
        $online ? 1 : 0,
        $nowMs,
    ]);
}

function yukmain_insert_and_prune_chat(
    PDO $pdo,
    string $roomId,
    string $senderUid,
    string $senderName,
    string $text,
    string $type = 'chat'
): array {
    $cleanText = mb_substr(trim($text), 0, 500, 'UTF-8');
    if ($cleanText === '') {
        throw new RuntimeException('Pesan tidak boleh kosong.');
    }
    $cleanName = mb_substr(trim($senderName), 0, 64, 'UTF-8') ?: 'Pemain';
    $safeType = $type === 'system' ? 'system' : 'chat';
    $now = yukmain_now_ms();

    if ($safeType === 'chat') {
        $memStmt = $pdo->prepare('SELECT 1 FROM room_players WHERE room_id = ? AND uid = ? LIMIT 1');
        $memStmt->execute([$roomId, $senderUid]);
        if (!$memStmt->fetch()) {
            throw new RuntimeException('Hanya pemain di ruang ini yang dapat mengirim pesan.');
        }

        // Per-user flood protection: max 8 messages per 5 seconds
        $floodStmt = $pdo->prepare(
            'SELECT COUNT(*) AS cnt FROM room_messages
             WHERE room_id = ? AND sender_uid = ? AND type = ? AND created_at_ms > ?'
        );
        $floodStmt->execute([$roomId, $senderUid, 'chat', $now - 5000]);
        $cnt = (int) ($floodStmt->fetch()['cnt'] ?? 0);
        if ($cnt >= 8) {
            throw new RuntimeException('Terlalu banyak pesan dalam waktu singkat. Tunggu beberapa detik.');
        }
    }

    $msgUid = ($safeType === 'system' ? 'sys_' : 'msg_') . $now . '_' . yukmain_random_hex(3);
    $ins = $pdo->prepare(
        'INSERT INTO room_messages (room_id, msg_uid, sender_uid, sender_name, text, type, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->execute([$roomId, $msgUid, $senderUid, $cleanName, $cleanText, $safeType, $now]);

    // Prune messages beyond latest 150 per room (MySQL-safe derived table syntax)
    $prune = $pdo->prepare(
        'DELETE FROM room_messages
         WHERE room_id = ?
           AND id NOT IN (
             SELECT id FROM (
               SELECT id FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT 150
             ) AS keep_rows
           )'
    );
    $prune->execute([$roomId, $roomId]);

    if ($safeType === 'chat') {
        $bump = $pdo->prepare('UPDATE rooms SET version = version + 1, updated_at_ms = ? WHERE id = ?');
        $bump->execute([$now, $roomId]);
    }

    return [
        'id'         => $msgUid,
        'senderUid'  => $senderUid,
        'senderName' => $cleanName,
        'text'       => $cleanText,
        'type'       => $safeType,
        'createdAt'  => $now,
    ];
}

function yukmain_build_default_room(string $roomId, string $code, string $gameType, string $hostUid, int $nowMs): array
{
    return [
        'id'                    => $roomId,
        'code'                  => $code,
        'gameType'              => $gameType,
        'hostUid'               => $hostUid,
        'status'                => 'lobby',
        'roundNumber'           => 0,
        'currentMatchRounds'    => 0,
        'currentRoundId'        => '',
        'roundDurationSec'      => 480,
        'roundEndsAtMs'         => 0,
        'firstSpeakerUid'       => '',
        'spyMode'               => 'single',
        'enabledPacks'          => yukmain_default_packs_for_game($gameType),
        'selectedLocationNames' => [],
        'customLocations'       => [],
        'customWordPairs'       => [],
        'customSpectrums'       => [],
        'customFacts'           => [],
        'customDrawingPrompts'  => [],
        'pelukisStrokeRounds'   => 2,
        'malamSilumanSettings'  => yukmain_default_malam_siluman_settings(),
        'ularTanggaSettings'    => yukmain_default_ular_tangga_settings(),
        'eliminatedUids'        => [],
        'eliminationLog'        => [],
        'frequencyState'        => null,
        'faktaState'            => null,
        'lukisanState'          => null,
        'malamSilumanState'     => null,
        'ularTanggaState'       => null,
        'activeVote'            => null,
        'pendingSpyGuess'       => null,
        'lastRoundResult'       => null,
        'completedGames'        => [],
        'activeRecap'           => null,
        'lastEmptyAtMs'         => null,
        'createdAt'             => $nowMs,
        'updatedAt'             => $nowMs,
    ];
}

function yukmain_save_room_row(PDO $pdo, array $room, ?int $lastEmptyAtMs = null): void
{
    $room['lastEmptyAtMs'] = $lastEmptyAtMs;
    $now = (int) ($room['updatedAt'] ?? yukmain_now_ms());
    $stmt = $pdo->prepare(
        'UPDATE rooms
         SET game_type = ?, host_uid = ?, status = ?, round_number = ?, current_round_id = ?,
             current_match_rounds = ?, last_empty_at_ms = ?, room_json = ?, version = version + 1, updated_at_ms = ?
         WHERE id = ?'
    );
    $stmt->execute([
        (string) $room['gameType'],
        (string) $room['hostUid'],
        (string) $room['status'],
        (int) ($room['roundNumber'] ?? 0),
        (string) ($room['currentRoundId'] ?? ''),
        (int) ($room['currentMatchRounds'] ?? 0),
        $lastEmptyAtMs,
        json_encode($room, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        $now,
        (string) $room['id'],
    ]);
}

function yukmain_create_room(PDO $pdo, array $user, string $gameType): array
{
    if (!in_array($gameType, YUKMAIN_ALLOWED_GAME_TYPES, true)) {
        $gameType = 'spyfall';
    }

    return yukmain_with_tx($pdo, static function (PDO $tx) use ($user, $gameType): array {
        $now = yukmain_now_ms();
        $code = '';
        $check = $tx->prepare('SELECT 1 FROM rooms WHERE code = ? LIMIT 1');
        for ($i = 0; $i < 12; $i++) {
            $candidate = yukmain_generate_room_code();
            $check->execute([$candidate]);
            if (!$check->fetch()) {
                $code = $candidate;
                break;
            }
        }
        if ($code === '') {
            throw new RuntimeException('Gagal membuat kode ruang unik. Silakan coba lagi.');
        }

        $roomId = 'rm_' . $now . '_' . yukmain_random_hex(4);
        $room = yukmain_build_default_room($roomId, $code, $gameType, $user['uid'], $now);
        $roomJson = json_encode($room, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $insRoom = $tx->prepare(
            'INSERT INTO rooms
             (id, code, game_type, host_uid, status, round_number, current_round_id, current_match_rounds, last_empty_at_ms, room_json, version, created_at_ms, updated_at_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?)'
        );
        $insRoom->execute([
            $roomId,
            $code,
            $gameType,
            $user['uid'],
            'lobby',
            0,
            '',
            0,
            $roomJson,
            $now,
            $now,
        ]);

        $insPlayer = $tx->prepare(
            'INSERT INTO room_players
             (room_id, uid, display_name, avatar_color, is_host, score, is_ready, controller_uid, is_numpang, is_brb, joined_at_ms, updated_at_ms)
             VALUES (?, ?, ?, ?, 1, 0, 1, ?, 0, 0, ?, ?)'
        );
        $insPlayer->execute([
            $roomId,
            $user['uid'],
            mb_substr($user['displayName'], 0, 64, 'UTF-8'),
            $user['avatarColor'],
            $user['uid'],
            $now,
            $now,
        ]);

        yukmain_upsert_presence($tx, $roomId, $user['uid'], $user['displayName'], false, true, $now);
        yukmain_insert_and_prune_chat(
            $tx,
            $roomId,
            'system',
            'Yuk Main',
            "Ruang {$code} dibuat oleh {$user['displayName']}. Bagikan kode ke temanmu!",
            'system'
        );

        return ['roomId' => $roomId, 'code' => $code];
    });
}

function yukmain_perform_empty_room_reset_locked(PDO $tx, array $roomRow, int $nowMs): array
{
    $room = json_decode((string) $roomRow['room_json'], true);
    if (!is_array($room)) {
        return [];
    }

    $room['status'] = 'lobby';
    $room['roundNumber'] = 0;
    $room['currentMatchRounds'] = 0;
    $room['currentRoundId'] = '';
    $room['roundEndsAtMs'] = 0;
    $room['firstSpeakerUid'] = '';
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
    $room['completedGames'] = [];
    $room['activeRecap'] = null;
    $room['lastEmptyAtMs'] = null;
    $room['updatedAt'] = $nowMs;

    yukmain_save_room_row($tx, $room, null);

    $tx->prepare('UPDATE room_players SET score = 0, is_ready = is_host, updated_at_ms = ? WHERE room_id = ?')
        ->execute([$nowMs, $roomRow['id']]);
    $tx->prepare('DELETE FROM round_server_states WHERE room_id = ?')->execute([$roomRow['id']]);
    $tx->prepare('DELETE FROM round_player_secrets WHERE room_id = ?')->execute([$roomRow['id']]);
    $tx->prepare('DELETE FROM round_submissions WHERE room_id = ?')->execute([$roomRow['id']]);

    yukmain_insert_and_prune_chat(
        $tx,
        (string) $roomRow['id'],
        'system',
        'Yuk Main',
        'Ruang sempat kosong > 15 detik — statistik sesi & skor direset otomatis.',
        'system'
    );

    return $room;
}

function yukmain_maybe_reset_expired_room_locked(PDO $tx, array $roomRow, string $excludeUid, int $nowMs): array
{
    $room = json_decode((string) $roomRow['room_json'], true);
    if (!is_array($room)) {
        return ['resetPerformed' => false, 'room' => null];
    }

    $presence = yukmain_load_presence_map($tx, (string) $roomRow['id']);
    $lastEmpty = $roomRow['last_empty_at_ms'] !== null ? (int) $roomRow['last_empty_at_ms'] : null;

    if (!yukmain_should_auto_reset_expired_room($presence, $lastEmpty, $nowMs, $excludeUid)) {
        return ['resetPerformed' => false, 'room' => $room];
    }

    $hasSessionHistory =
        ((int) ($room['roundNumber'] ?? 0) > 0) ||
        ((int) ($room['currentMatchRounds'] ?? 0) > 0) ||
        !empty($room['completedGames']) ||
        (($room['status'] ?? 'lobby') !== 'lobby');

    if (!$hasSessionHistory) {
        return ['resetPerformed' => false, 'room' => $room];
    }

    $resetRoom = yukmain_perform_empty_room_reset_locked($tx, $roomRow, $nowMs);
    return ['resetPerformed' => true, 'room' => $resetRoom];
}

function yukmain_check_reset_expired_room(PDO $pdo, string $roomId, string $actorUid): array
{
    return yukmain_with_tx($pdo, static function (PDO $tx) use ($roomId, $actorUid): array {
        $stmt = $tx->prepare('SELECT * FROM rooms WHERE id = ? FOR UPDATE');
        $stmt->execute([$roomId]);
        $row = $stmt->fetch();
        if (!$row) {
            return ['resetPerformed' => false, 'roomData' => null];
        }
        $res = yukmain_maybe_reset_expired_room_locked($tx, $row, $actorUid, yukmain_now_ms());
        return [
            'resetPerformed' => $res['resetPerformed'],
            'roomData'       => $res['room'],
        ];
    });
}

function yukmain_join_room_by_code(PDO $pdo, array $user, string $rawCode): array
{
    $code = strtoupper(trim($rawCode));
    if (!preg_match('/^[A-Z0-9]{4,10}$/', $code)) {
        throw new RuntimeException('Format kode ruang tidak valid.');
    }

    return yukmain_with_tx($pdo, static function (PDO $tx) use ($user, $code): array {
        $now = yukmain_now_ms();
        $stmt = $tx->prepare('SELECT * FROM rooms WHERE code = ? FOR UPDATE');
        $stmt->execute([$code]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new RuntimeException("Ruang dengan kode {$code} tidak ditemukan.");
        }

        $resetCheck = yukmain_maybe_reset_expired_room_locked($tx, $row, $user['uid'], $now);
        $room = $resetCheck['room'];
        $roomId = (string) $row['id'];
        $players = yukmain_load_room_players($tx, $roomId);

        $existing = null;
        foreach ($players as $p) {
            if ($p['uid'] === $user['uid']) {
                $existing = $p;
                break;
            }
        }

        if ($existing !== null) {
            $tx->prepare(
                'UPDATE room_players SET display_name = ?, avatar_color = ?, updated_at_ms = ? WHERE room_id = ? AND uid = ?'
            )->execute([
                mb_substr($user['displayName'], 0, 64, 'UTF-8'),
                $user['avatarColor'],
                $now,
                $roomId,
                $user['uid'],
            ]);
        } else {
            if (($room['status'] ?? 'lobby') !== 'lobby') {
                throw new RuntimeException('Permainan sedang berlangsung. Tunggu Host kembali ke lobi.');
            }
            if (count($players) >= 12) {
                throw new RuntimeException('Ruang sudah penuh (maksimal 12 pemain).');
            }
            $tx->prepare(
                'INSERT INTO room_players
                 (room_id, uid, display_name, avatar_color, is_host, score, is_ready, controller_uid, is_numpang, is_brb, joined_at_ms, updated_at_ms)
                 VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, 0, ?, ?)'
            )->execute([
                $roomId,
                $user['uid'],
                mb_substr($user['displayName'], 0, 64, 'UTF-8'),
                $user['avatarColor'],
                $user['uid'],
                $now,
                $now,
            ]);
            yukmain_insert_and_prune_chat(
                $tx,
                $roomId,
                'system',
                'Yuk Main',
                "{$user['displayName']} bergabung ke ruang.",
                'system'
            );
        }

        yukmain_upsert_presence($tx, $roomId, $user['uid'], $user['displayName'], false, true, $now);
        $room['updatedAt'] = $now;
        yukmain_save_room_row($tx, $room, null);

        return ['roomId' => $roomId, 'code' => $code];
    });
}

function yukmain_join_room_as_stage(PDO $pdo, array $user, string $rawCode): array
{
    $code = strtoupper(trim($rawCode));
    if (!preg_match('/^[A-Z0-9]{4,10}$/', $code)) {
        throw new RuntimeException('Format kode ruang tidak valid.');
    }

    return yukmain_with_tx($pdo, static function (PDO $tx) use ($user, $code): array {
        $now = yukmain_now_ms();
        $stmt = $tx->prepare('SELECT * FROM rooms WHERE code = ? FOR UPDATE');
        $stmt->execute([$code]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new RuntimeException("Ruang dengan kode {$code} tidak ditemukan.");
        }
        $roomId = (string) $row['id'];
        $stageKey = 'stage_' . $user['uid'];

        yukmain_upsert_presence($tx, $roomId, $stageKey, 'Layar Panggung', true, true, $now);
        $tx->prepare('UPDATE rooms SET version = version + 1, updated_at_ms = ? WHERE id = ?')
            ->execute([$now, $roomId]);

        yukmain_insert_and_prune_chat(
            $tx,
            $roomId,
            'system',
            'Yuk Main',
            'Layar Panggung terhubung ke ruang.',
            'system'
        );

        return ['roomId' => $roomId, 'code' => $code];
    });
}

function yukmain_leave_room(PDO $pdo, array $user, string $roomId): array
{
    return yukmain_with_tx($pdo, static function (PDO $tx) use ($user, $roomId): array {
        $now = yukmain_now_ms();
        $stmt = $tx->prepare('SELECT * FROM rooms WHERE id = ? FOR UPDATE');
        $stmt->execute([$roomId]);
        $row = $stmt->fetch();
        if (!$row) {
            return ['deleted' => true];
        }

        $room = json_decode((string) $row['room_json'], true);
        if (!is_array($room)) {
            $tx->prepare('DELETE FROM rooms WHERE id = ?')->execute([$roomId]);
            return ['deleted' => true];
        }

        $playersBefore = yukmain_load_room_players($tx, $roomId);
        $leavingPlayer = null;
        foreach ($playersBefore as $p) {
            if ($p['uid'] === $user['uid']) {
                $leavingPlayer = $p;
                break;
            }
        }

        // Remove device owner + any Numpang seats owned by them
        $tx->prepare('DELETE FROM room_players WHERE room_id = ? AND (uid = ? OR (is_numpang = 1 AND controller_uid = ?))')
            ->execute([$roomId, $user['uid'], $user['uid']]);
        $tx->prepare('DELETE FROM room_presence WHERE room_id = ? AND uid = ?')
            ->execute([$roomId, $user['uid']]);

        $remaining = yukmain_load_room_players($tx, $roomId);
        if (empty($remaining)) {
            $tx->prepare('DELETE FROM rooms WHERE id = ?')->execute([$roomId]);
            return ['deleted' => true];
        }

        // Host transfer if Host left
        $hostTransferredTo = null;
        if ((string) $room['hostUid'] === $user['uid']) {
            $nextHost = $remaining[0];
            foreach ($remaining as $candidate) {
                if (!$candidate['isNumpang']) {
                    $nextHost = $candidate;
                    break;
                }
            }
            $room['hostUid'] = $nextHost['uid'];
            $tx->prepare('UPDATE room_players SET is_host = 0 WHERE room_id = ?')->execute([$roomId]);
            $tx->prepare('UPDATE room_players SET is_host = 1, is_ready = 1, updated_at_ms = ? WHERE room_id = ? AND uid = ?')
                ->execute([$now, $roomId, $nextHost['uid']]);
            $hostTransferredTo = $nextHost['displayName'];
        }

        // Fakta Hari Ini phase controller failover if controller left
        if (($room['status'] ?? 'lobby') === 'playing' && !empty($room['faktaState'])) {
            $fs = $room['faktaState'];
            $remainingUids = array_column($remaining, 'uid');
            if (!in_array($fs['phaseControllerUid'] ?? '', $remainingUids, true)) {
                $active = yukmain_filter_active_players($remaining);
                $poolPlayers = !empty($active) ? $active : $remaining;
                $nextCtrl = yukmain_select_fakta_phase_controller($poolPlayers, (string) $room['hostUid'], (string) ($fs['guesserUid'] ?? ''));
                $fs['phaseControllerUid'] = $nextCtrl['uid'];
                $fs['phaseControllerName'] = $nextCtrl['displayName'];
                $room['faktaState'] = $fs;
            }
        }

        // Ular Tangga RP turn failover if current turn player left
        if (($room['status'] ?? 'lobby') === 'playing' && !empty($room['ularTanggaState']) && function_exists('yukmain_ut_ensure_turn_valid')) {
            $nextUt = yukmain_ut_ensure_turn_valid($room, $remaining);
            if ($nextUt !== null) {
                $room['ularTanggaState'] = $nextUt;
            }
        }

        // Check whether any real player remains online
        $presence = yukmain_load_presence_map($tx, $roomId);
        $anyRealOnline = false;
        foreach ($presence as $entry) {
            if (empty($entry['isStage']) && !empty($entry['online'])) {
                $anyRealOnline = true;
                break;
            }
        }
        $lastEmpty = $anyRealOnline ? null : $now;

        $room['updatedAt'] = $now;
        yukmain_save_room_row($tx, $room, $lastEmpty);

        if ($leavingPlayer !== null) {
            $msg = "{$leavingPlayer['displayName']} keluar dari ruang.";
            if ($hostTransferredTo !== null) {
                $msg .= " {$hostTransferredTo} sekarang menjadi Host!";
            }
            yukmain_insert_and_prune_chat($tx, $roomId, 'system', 'Yuk Main', $msg, 'system');
        }

        return ['deleted' => false];
    });
}

function yukmain_get_room_snapshot(
    PDO $pdo,
    string $roomId,
    array $user,
    bool $isStage,
    bool $heartbeat,
    int $sinceVersion = 0
): array {
    $now = yukmain_now_ms();

    if ($heartbeat) {
        yukmain_with_tx($pdo, static function (PDO $tx) use ($roomId, $user, $isStage, $now): void {
            $stmt = $tx->prepare('SELECT * FROM rooms WHERE id = ? FOR UPDATE');
            $stmt->execute([$roomId]);
            $row = $stmt->fetch();
            if (!$row) {
                return;
            }

            if (!$isStage) {
                $mem = $tx->prepare('SELECT 1 FROM room_players WHERE room_id = ? AND uid = ? LIMIT 1');
                $mem->execute([$roomId, $user['uid']]);
                if (!$mem->fetch()) {
                    return;
                }
            }

            // First check if room had been empty past the 15s grace period
            yukmain_maybe_reset_expired_room_locked($tx, $row, $user['uid'], $now);

            $presenceUid = $isStage ? ('stage_' . $user['uid']) : $user['uid'];
            $presenceName = $isStage ? 'Layar Panggung' : $user['displayName'];
            yukmain_upsert_presence($tx, $roomId, $presenceUid, $presenceName, $isStage, true, $now);

            // Sweep stale presences (>25s without heartbeat)
            $tx->prepare('UPDATE room_presence SET online = 0 WHERE room_id = ? AND online = 1 AND last_seen_ms < ?')
                ->execute([$roomId, $now - 25000]);

            $onlineStmt = $tx->prepare(
                'SELECT COUNT(*) AS cnt FROM room_presence WHERE room_id = ? AND is_stage = 0 AND online = 1'
            );
            $onlineStmt->execute([$roomId]);
            $realOnlineCount = (int) ($onlineStmt->fetch()['cnt'] ?? 0);

            if ($realOnlineCount > 0) {
                $tx->prepare('UPDATE rooms SET last_empty_at_ms = NULL WHERE id = ? AND last_empty_at_ms IS NOT NULL')
                    ->execute([$roomId]);
            } else {
                $tx->prepare('UPDATE rooms SET last_empty_at_ms = COALESCE(last_empty_at_ms, ?) WHERE id = ?')
                    ->execute([$now, $roomId]);
            }
        });
    }

    $stmt = $pdo->prepare('SELECT * FROM rooms WHERE id = ? LIMIT 1');
    $stmt->execute([$roomId]);
    $row = $stmt->fetch();
    if (!$row) {
        $e = new RuntimeException('Ruang tidak ditemukan.');
        throw new RuntimeException($e->getMessage(), 404);
    }

    $players = yukmain_load_room_players($pdo, $roomId);
    if (!$isStage) {
        $isMember = false;
        foreach ($players as $p) {
            if ($p['uid'] === $user['uid'] || ($p['isNumpang'] && $p['controllerUid'] === $user['uid'])) {
                $isMember = true;
                break;
            }
        }
        if (!$isMember) {
            throw new RuntimeException('Kamu tidak terdaftar sebagai anggota ruang ini.', 403);
        }
    }

    $version = (int) $row['version'];
    $presence = yukmain_load_presence_map($pdo, $roomId);

    if ($sinceVersion > 0 && $version === $sinceVersion) {
        return [
            'unchanged' => true,
            'version'   => $version,
            'presence'  => $presence,
        ];
    }

    $room = json_decode((string) $row['room_json'], true);
    if (!is_array($room)) {
        throw new RuntimeException('Data ruang tidak valid.');
    }

    $currentRoundId = (string) ($room['currentRoundId'] ?? '');
    $status = (string) ($room['status'] ?? 'lobby');

    $mySecretsBySeat = [];
    if (!$isStage && $status !== 'lobby' && $currentRoundId !== '') {
        $ownedUids = [];
        foreach ($players as $p) {
            if ($p['uid'] === $user['uid'] || ($p['isNumpang'] && $p['controllerUid'] === $user['uid'])) {
                $ownedUids[] = $p['uid'];
            }
        }
        if (!empty($ownedUids)) {
            $placeholders = implode(',', array_fill(0, count($ownedUids), '?'));
            $secStmt = $pdo->prepare(
                "SELECT uid, secret_json FROM round_player_secrets
                 WHERE room_id = ? AND round_id = ? AND uid IN ({$placeholders})"
            );
            $secStmt->execute(array_merge([$roomId, $currentRoundId], $ownedUids));
            foreach ($secStmt->fetchAll() as $sRow) {
                $decoded = json_decode((string) $sRow['secret_json'], true);
                $mySecretsBySeat[(string) $sRow['uid']] = is_array($decoded) ? $decoded : null;
            }
        }
    }

    $revealedSecrets = [];
    if ($status === 'round_end' && $currentRoundId !== '') {
        $revStmt = $pdo->prepare(
            'SELECT uid, secret_json FROM round_player_secrets WHERE room_id = ? AND round_id = ?'
        );
        $revStmt->execute([$roomId, $currentRoundId]);
        foreach ($revStmt->fetchAll() as $sRow) {
            $decoded = json_decode((string) $sRow['secret_json'], true);
            if (is_array($decoded)) {
                $revealedSecrets[(string) $sRow['uid']] = $decoded;
            }
        }
    }

    $msgStmt = $pdo->prepare(
        'SELECT msg_uid, sender_uid, sender_name, text, type, created_at_ms
         FROM room_messages
         WHERE room_id = ?
         ORDER BY id DESC
         LIMIT 100'
    );
    $msgStmt->execute([$roomId]);
    $rawMsgs = array_reverse($msgStmt->fetchAll());
    $messages = [];
    foreach ($rawMsgs as $m) {
        $messages[] = [
            'id'         => (string) $m['msg_uid'],
            'senderUid'  => (string) $m['sender_uid'],
            'senderName' => (string) $m['sender_name'],
            'text'       => (string) $m['text'],
            'type'       => (string) $m['type'],
            'createdAt'  => (int) $m['created_at_ms'],
        ];
    }

    return [
        'unchanged'       => false,
        'version'         => $version,
        'room'            => $room,
        'players'         => $players,
        'mySecretsBySeat' => empty($mySecretsBySeat) ? new stdClass() : $mySecretsBySeat,
        'revealedSecrets' => empty($revealedSecrets) ? new stdClass() : $revealedSecrets,
        'messages'        => $messages,
        'presence'        => empty($presence) ? new stdClass() : $presence,
    ];
}
