<?php
declare(strict_types=1);

/**
 * Ephemeral WebRTC Quick-Code Signaling Mailbox for Yuk Main LAN Party.
 *
 * Used strictly for the ~2-second SDP handshake when Home Wi-Fi has internet.
 * Once the direct local Wi-Fi DataChannel opens, signaling rows are deleted
 * immediately and 0 DB queries occur during gameplay.
 */

const YUKMAIN_LAN_ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const YUKMAIN_LAN_PEER_TTL_MS = 3 * 60 * 1000;  // 3 minutes
const YUKMAIN_LAN_MAX_SIGNAL_LEN = 12000;
const YUKMAIN_LAN_MAX_PENDING_PEERS = 16;

function yukmain_lan_normalize_code(string $raw): string
{
    $clean = strtoupper(trim($raw));
    if (!preg_match('/^[A-Z0-9]{6}$/', $clean)) {
        throw new RuntimeException('Kode ruang LAN harus 6 huruf/angka.', 400);
    }
    return $clean;
}

function yukmain_lan_validate_signal_code(string $raw, string $label): string
{
    $clean = trim($raw);
    if ($clean === '' || strlen($clean) > YUKMAIN_LAN_MAX_SIGNAL_LEN) {
        throw new RuntimeException("Ukuran kode sinyal {$label} tidak valid.", 400);
    }
    if (!str_starts_with($clean, 'YMLAN')) {
        throw new RuntimeException("Format kode sinyal {$label} tidak dikenali.", 400);
    }
    return $clean;
}

function yukmain_lan_validate_secret(string $raw): string
{
    $clean = trim($raw);
    if (!preg_match('/^[a-f0-9]{24,128}$/i', $clean)) {
        throw new RuntimeException('Token sesi sinyal LAN tidak valid.', 401);
    }
    return $clean;
}

function yukmain_lan_prune_expired(PDO $pdo, int $nowMs): void
{
    $pdo->prepare('DELETE FROM lan_signal_peers WHERE expires_at_ms < ?')->execute([$nowMs]);
    $pdo->prepare('DELETE FROM lan_signal_rooms WHERE expires_at_ms < ?')->execute([$nowMs]);
}

function yukmain_lan_verify_host_room(PDO $pdo, string $roomCode, string $hostSecret, int $nowMs): array
{
    $stmt = $pdo->prepare(
        'SELECT room_code, host_secret_hash, game_type, host_name, expires_at_ms
         FROM lan_signal_rooms
         WHERE room_code = ? LIMIT 1'
    );
    $stmt->execute([$roomCode]);
    $row = $stmt->fetch();

    if (!$row || (int) $row['expires_at_ms'] < $nowMs) {
        throw new RuntimeException('Sesi kode LAN sudah berakhir atau tidak ditemukan.', 404);
    }

    $providedHash = hash('sha256', $hostSecret);
    if (!hash_equals((string) $row['host_secret_hash'], $providedHash)) {
        throw new RuntimeException('Akses Host sinyal LAN ditolak.', 403);
    }

    return $row;
}

function yukmain_lan_register_room(PDO $pdo, array $body): array
{
    $now = yukmain_now_ms();
    yukmain_lan_prune_expired($pdo, $now);

    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $gameType = trim((string) ($body['gameType'] ?? 'spyfall'));
    if (!preg_match('/^[a-z0-9_]{2,32}$/', $gameType)) {
        $gameType = 'spyfall';
    }
    $hostName = mb_substr(trim((string) ($body['hostName'] ?? 'Host LAN')), 0, 40, 'UTF-8');
    if ($hostName === '') {
        $hostName = 'Host LAN';
    }

    $existingHostSecret = trim((string) ($body['hostSecret'] ?? ''));
    $expiresAt = $now + YUKMAIN_LAN_ROOM_TTL_MS;

    // Check if an active room with this code already exists
    $chk = $pdo->prepare('SELECT host_secret_hash, expires_at_ms FROM lan_signal_rooms WHERE room_code = ? LIMIT 1');
    $chk->execute([$roomCode]);
    $existing = $chk->fetch();

    if ($existing && (int) $existing['expires_at_ms'] >= $now) {
        if (
            $existingHostSecret !== '' &&
            preg_match('/^[a-f0-9]{24,128}$/i', $existingHostSecret) &&
            hash_equals((string) $existing['host_secret_hash'], hash('sha256', $existingHostSecret))
        ) {
            $pdo->prepare(
                'UPDATE lan_signal_rooms
                 SET game_type = ?, host_name = ?, expires_at_ms = ?
                 WHERE room_code = ?'
            )->execute([$gameType, $hostName, $expiresAt, $roomCode]);

            return [
                'ok'          => true,
                'roomCode'    => $roomCode,
                'hostSecret'  => $existingHostSecret,
                'expiresAtMs' => $expiresAt,
            ];
        }
        throw new RuntimeException('Kode LAN tersebut sedang dipakai ruang lain. Buat ulang ruang LAN.', 409);
    }

    // Clear stale expired row if any, then register fresh host secret
    $pdo->prepare('DELETE FROM lan_signal_rooms WHERE room_code = ?')->execute([$roomCode]);

    $hostSecret = bin2hex(random_bytes(24));
    $hostSecretHash = hash('sha256', $hostSecret);

    $pdo->prepare(
        'INSERT INTO lan_signal_rooms (room_code, host_secret_hash, game_type, host_name, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)'
    )->execute([$roomCode, $hostSecretHash, $gameType, $hostName, $now, $expiresAt]);

    return [
        'ok'          => true,
        'roomCode'    => $roomCode,
        'hostSecret'  => $hostSecret,
        'expiresAtMs' => $expiresAt,
    ];
}

function yukmain_lan_host_poll(PDO $pdo, array $body): array
{
    $now = yukmain_now_ms();
    yukmain_lan_prune_expired($pdo, $now);

    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $hostSecret = yukmain_lan_validate_secret((string) ($body['hostSecret'] ?? ''));

    yukmain_lan_verify_host_room($pdo, $roomCode, $hostSecret, $now);

    // Refresh room TTL softly while Host is actively waiting for peers
    $pdo->prepare('UPDATE lan_signal_rooms SET expires_at_ms = ? WHERE room_code = ?')
        ->execute([$now + YUKMAIN_LAN_ROOM_TTL_MS, $roomCode]);

    $stmt = $pdo->prepare(
        'SELECT request_id, guest_uid, display_name, avatar_color, is_stage, offer_code, created_at_ms
         FROM lan_signal_peers
         WHERE room_code = ? AND status = ? AND expires_at_ms >= ?
         ORDER BY created_at_ms ASC
         LIMIT 8'
    );
    $stmt->execute([$roomCode, 'pending', $now]);
    $rows = $stmt->fetchAll();

    $pending = [];
    foreach ($rows as $r) {
        $pending[] = [
            'requestId'      => (string) $r['request_id'],
            'guestUid'       => (string) $r['guest_uid'],
            'displayName'    => (string) $r['display_name'],
            'avatarColor'    => (string) $r['avatar_color'],
            'isStageDisplay' => (bool) ((int) $r['is_stage'] === 1),
            'offerCode'      => (string) $r['offer_code'],
            'createdAtMs'    => (int) $r['created_at_ms'],
        ];
    }

    return [
        'ok'      => true,
        'pending' => $pending,
    ];
}

function yukmain_lan_host_answer(PDO $pdo, array $body): array
{
    $now = yukmain_now_ms();
    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $hostSecret = yukmain_lan_validate_secret((string) ($body['hostSecret'] ?? ''));
    $requestId = trim((string) ($body['requestId'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $requestId)) {
        throw new RuntimeException('Parameter requestId tidak valid.', 400);
    }
    $answerCode = yukmain_lan_validate_signal_code((string) ($body['answerCode'] ?? ''), 'Answer');

    yukmain_lan_verify_host_room($pdo, $roomCode, $hostSecret, $now);

    $stmt = $pdo->prepare(
        'UPDATE lan_signal_peers
         SET answer_code = ?, status = ?, expires_at_ms = ?
         WHERE request_id = ? AND room_code = ?'
    );
    $stmt->execute([$answerCode, 'answered', $now + YUKMAIN_LAN_PEER_TTL_MS, $requestId, $roomCode]);

    if ($stmt->rowCount() === 0) {
        throw new RuntimeException('Permintaan gabung pemain sudah kedaluwarsa.', 404);
    }

    return ['ok' => true];
}

function yukmain_lan_close_room(PDO $pdo, array $body): array
{
    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $hostSecret = yukmain_lan_validate_secret((string) ($body['hostSecret'] ?? ''));

    $stmt = $pdo->prepare('SELECT host_secret_hash FROM lan_signal_rooms WHERE room_code = ? LIMIT 1');
    $stmt->execute([$roomCode]);
    $row = $stmt->fetch();
    if ($row && hash_equals((string) $row['host_secret_hash'], hash('sha256', $hostSecret))) {
        $pdo->prepare('DELETE FROM lan_signal_rooms WHERE room_code = ?')->execute([$roomCode]);
    }

    return ['ok' => true];
}

function yukmain_lan_guest_request(PDO $pdo, array $body): array
{
    $now = yukmain_now_ms();
    yukmain_lan_prune_expired($pdo, $now);

    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $offerCode = yukmain_lan_validate_signal_code((string) ($body['offerCode'] ?? ''), 'Offer');

    $guestUid = trim((string) ($body['guestUid'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9_-]{4,64}$/', $guestUid)) {
        throw new RuntimeException('Identitas pemain LAN tidak valid.', 400);
    }

    $displayName = mb_substr(trim((string) ($body['displayName'] ?? 'Pemain LAN')), 0, 40, 'UTF-8');
    if ($displayName === '') {
        $displayName = 'Pemain LAN';
    }

    $avatarColor = trim((string) ($body['avatarColor'] ?? '#2563EB'));
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $avatarColor)) {
        $avatarColor = '#2563EB';
    }

    $isStage = !empty($body['isStageDisplay']) ? 1 : 0;

    $roomStmt = $pdo->prepare(
        'SELECT room_code, game_type, host_name, expires_at_ms
         FROM lan_signal_rooms
         WHERE room_code = ? LIMIT 1'
    );
    $roomStmt->execute([$roomCode]);
    $room = $roomStmt->fetch();

    if (!$room || (int) $room['expires_at_ms'] < $now) {
        throw new RuntimeException(
            'Ruang LAN dengan kode tersebut tidak ditemukan. Pastikan Host sudah membuka ruang LAN dan terhubung Wi-Fi.',
            404
        );
    }

    // Replace any previous stale request by the same guest in this room
    $pdo->prepare('DELETE FROM lan_signal_peers WHERE room_code = ? AND guest_uid = ?')
        ->execute([$roomCode, $guestUid]);

    $cntStmt = $pdo->prepare('SELECT COUNT(*) AS c FROM lan_signal_peers WHERE room_code = ? AND expires_at_ms >= ?');
    $cntStmt->execute([$roomCode, $now]);
    $count = (int) (($cntStmt->fetch()['c'] ?? 0));
    if ($count >= YUKMAIN_LAN_MAX_PENDING_PEERS) {
        throw new RuntimeException('Antrean koneksi ruang LAN sedang penuh. Coba beberapa detik lagi.', 429);
    }

    $requestId = 'lrq_' . $now . '_' . bin2hex(random_bytes(5));
    $peerSecret = bin2hex(random_bytes(24));
    $peerSecretHash = hash('sha256', $peerSecret);
    $expiresAt = $now + YUKMAIN_LAN_PEER_TTL_MS;

    $pdo->prepare(
        'INSERT INTO lan_signal_peers
         (request_id, room_code, peer_secret_hash, guest_uid, display_name, avatar_color, is_stage, offer_code, answer_code, status, created_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)'
    )->execute([
        $requestId,
        $roomCode,
        $peerSecretHash,
        $guestUid,
        $displayName,
        $avatarColor,
        $isStage,
        $offerCode,
        'pending',
        $now,
        $expiresAt,
    ]);

    return [
        'ok'         => true,
        'requestId'  => $requestId,
        'peerSecret' => $peerSecret,
        'hostName'   => (string) $room['host_name'],
        'gameType'   => (string) $room['game_type'],
    ];
}

function yukmain_lan_guest_status(PDO $pdo, array $body): array
{
    $now = yukmain_now_ms();
    $roomCode = yukmain_lan_normalize_code((string) ($body['roomCode'] ?? ''));
    $requestId = trim((string) ($body['requestId'] ?? ''));
    if (!preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $requestId)) {
        throw new RuntimeException('Parameter requestId tidak valid.', 400);
    }
    $peerSecret = yukmain_lan_validate_secret((string) ($body['peerSecret'] ?? ''));

    $stmt = $pdo->prepare(
        'SELECT peer_secret_hash, status, answer_code, expires_at_ms
         FROM lan_signal_peers
         WHERE request_id = ? AND room_code = ? LIMIT 1'
    );
    $stmt->execute([$requestId, $roomCode]);
    $row = $stmt->fetch();

    if (!$row || (int) $row['expires_at_ms'] < $now) {
        throw new RuntimeException('Permintaan gabung LAN kedaluwarsa. Coba ulangi.', 404);
    }

    if (!hash_equals((string) $row['peer_secret_hash'], hash('sha256', $peerSecret))) {
        throw new RuntimeException('Akses status sinyal LAN ditolak.', 403);
    }

    if ((string) $row['status'] === 'answered' && is_string($row['answer_code']) && $row['answer_code'] !== '') {
        $answerCode = (string) $row['answer_code'];
        // One-time consume: delete immediately so DB stays clean
        $pdo->prepare('DELETE FROM lan_signal_peers WHERE request_id = ?')->execute([$requestId]);
        return [
            'ok'         => true,
            'status'     => 'answered',
            'answerCode' => $answerCode,
        ];
    }

    return [
        'ok'     => true,
        'status' => 'pending',
    ];
}
