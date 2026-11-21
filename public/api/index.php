<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/auth.php';
require_once __DIR__ . '/lib/rooms.php';
require_once __DIR__ . '/lib/dispatcher.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function yukmain_json_response(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function yukmain_read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Format JSON tidak valid.', 400);
    }
    return $decoded;
}

function yukmain_require_auth(PDO $pdo): array
{
    $user = yukmain_authenticate_request($pdo);
    if ($user === null) {
        throw new RuntimeException('Sesi masuk tidak ditemukan atau sudah kedaluwarsa.', 401);
    }
    return $user;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Parse route from `?r=...` or PATH_INFO
$rawRoute = '';
if (isset($_GET['r']) && is_string($_GET['r'])) {
    $rawRoute = $_GET['r'];
} elseif (!empty($_SERVER['PATH_INFO']) && is_string($_SERVER['PATH_INFO'])) {
    $rawRoute = $_SERVER['PATH_INFO'];
}
$route = strtolower(trim($rawRoute, "/ \t\n\r"));

// CSRF origin check for all mutating requests
if (!in_array($method, ['GET', 'HEAD'], true)) {
    if (!yukmain_verify_mutation_origin()) {
        yukmain_json_response(403, ['error' => 'Asal permintaan ditolak (CSRF check).']);
    }
}

try {
    // Health endpoint can report configuration state cleanly
    if ($method === 'GET' && ($route === '' || $route === 'health')) {
        $pdo = yukmain_pdo();
        $pdo->query('SELECT 1');
        yukmain_json_response(200, [
            'ok'      => true,
            'engine'  => 'php-mysql',
            'version' => '4.0.0',
        ]);
    }

    $pdo = yukmain_pdo();

    // ===================== AUTH ROUTES =====================
    if ($route === 'auth/me' && $method === 'GET') {
        $user = yukmain_authenticate_request($pdo);
        yukmain_json_response(200, ['user' => $user]);
    }

    if ($route === 'auth/me' && $method === 'PATCH') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $displayName = mb_substr(trim((string) ($body['displayName'] ?? '')), 0, 40, 'UTF-8');
        if (mb_strlen($displayName, 'UTF-8') < 2) {
            throw new RuntimeException('Nama panggilan minimal 2 karakter.', 400);
        }
        $now = yukmain_now_ms();
        $pdo->prepare('UPDATE users SET display_name = ?, updated_at_ms = ? WHERE uid = ?')
            ->execute([$displayName, $now, $user['uid']]);
        $pdo->prepare('UPDATE room_players SET display_name = ?, updated_at_ms = ? WHERE uid = ? AND is_numpang = 0')
            ->execute([$displayName, $now, $user['uid']]);
        $pdo->prepare('UPDATE room_presence SET display_name = ? WHERE uid = ? AND is_stage = 0')
            ->execute([$displayName, $user['uid']]);

        $user['displayName'] = $displayName;
        yukmain_json_response(200, ['user' => $user]);
    }

    if ($route === 'auth/guest' && $method === 'POST') {
        $body = yukmain_read_json_body();
        $nickname = mb_substr(trim((string) ($body['nickname'] ?? '')), 0, 40, 'UTF-8');
        if (mb_strlen($nickname, 'UTF-8') < 2) {
            throw new RuntimeException('Nama panggilan minimal 2 karakter.', 400);
        }

        $existing = yukmain_authenticate_request($pdo);
        $now = yukmain_now_ms();

        if ($existing !== null && !empty($existing['isAnonymous'])) {
            $pdo->prepare('UPDATE users SET display_name = ?, updated_at_ms = ? WHERE uid = ?')
                ->execute([$nickname, $now, $existing['uid']]);
            $existing['displayName'] = $nickname;
            $rawToken = yukmain_create_session($pdo, $existing['uid']);
            yukmain_set_session_cookie($rawToken);
            yukmain_json_response(200, ['user' => $existing, 'token' => $rawToken]);
        }

        $uid = 'gst_' . $now . '_' . yukmain_random_hex(4);
        $color = yukmain_avatar_color($uid);
        $pdo->prepare(
            'INSERT INTO users (uid, username, password_hash, display_name, avatar_color, is_anonymous, games_played, wins, created_at_ms, updated_at_ms)
             VALUES (?, NULL, NULL, ?, ?, 1, 0, 0, ?, ?)'
        )->execute([$uid, $nickname, $color, $now, $now]);

        $rawToken = yukmain_create_session($pdo, $uid);
        yukmain_set_session_cookie($rawToken);

        yukmain_json_response(200, [
            'user' => [
                'uid'         => $uid,
                'username'    => null,
                'displayName' => $nickname,
                'avatarColor' => $color,
                'isAnonymous' => true,
                'gamesPlayed' => 0,
                'wins'        => 0,
            ],
            'token' => $rawToken,
        ]);
    }

    if ($route === 'auth/register' && $method === 'POST') {
        $body = yukmain_read_json_body();
        $usernameRaw = trim((string) ($body['username'] ?? ''));
        $username = strtolower($usernameRaw);
        $password = (string) ($body['password'] ?? '');
        $displayName = mb_substr(trim((string) ($body['displayName'] ?? $usernameRaw)), 0, 40, 'UTF-8');

        if (!preg_match('/^[a-z0-9_.-]{3,32}$/', $username)) {
            throw new RuntimeException('Username harus 3–32 karakter (huruf, angka, titik, atau garis bawah).', 400);
        }
        if (strlen($password) < 6 || strlen($password) > 128) {
            throw new RuntimeException('Kata sandi minimal 6 karakter.', 400);
        }
        if (mb_strlen($displayName, 'UTF-8') < 2) {
            $displayName = $username;
        }

        $chk = $pdo->prepare('SELECT 1 FROM users WHERE username = ? LIMIT 1');
        $chk->execute([$username]);
        if ($chk->fetch()) {
            throw new RuntimeException('Username tersebut sudah dipakai pemain lain.', 409);
        }

        $now = yukmain_now_ms();
        $uid = 'usr_' . $now . '_' . yukmain_random_hex(4);
        $color = yukmain_avatar_color($uid);
        $hash = password_hash($password, PASSWORD_DEFAULT);

        $pdo->prepare(
            'INSERT INTO users (uid, username, password_hash, display_name, avatar_color, is_anonymous, games_played, wins, created_at_ms, updated_at_ms)
             VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)'
        )->execute([$uid, $username, $hash, $displayName, $color, $now, $now]);

        $rawToken = yukmain_create_session($pdo, $uid);
        yukmain_set_session_cookie($rawToken);

        yukmain_json_response(200, [
            'user' => [
                'uid'         => $uid,
                'username'    => $username,
                'displayName' => $displayName,
                'avatarColor' => $color,
                'isAnonymous' => false,
                'gamesPlayed' => 0,
                'wins'        => 0,
            ],
            'token' => $rawToken,
        ]);
    }

    if ($route === 'auth/login' && $method === 'POST') {
        $body = yukmain_read_json_body();
        $username = strtolower(trim((string) ($body['username'] ?? '')));
        $password = (string) ($body['password'] ?? '');

        if ($username === '' || $password === '') {
            throw new RuntimeException('Masukkan username dan kata sandi.', 400);
        }

        $stmt = $pdo->prepare(
            'SELECT uid, username, password_hash, display_name, avatar_color, is_anonymous, games_played, wins
             FROM users WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        $row = $stmt->fetch();

        if (!$row || empty($row['password_hash']) || !password_verify($password, (string) $row['password_hash'])) {
            throw new RuntimeException('Username atau kata sandi salah.', 401);
        }

        $rawToken = yukmain_create_session($pdo, (string) $row['uid']);
        yukmain_set_session_cookie($rawToken);

        yukmain_json_response(200, [
            'user' => [
                'uid'         => (string) $row['uid'],
                'username'    => $row['username'],
                'displayName' => (string) $row['display_name'],
                'avatarColor' => (string) $row['avatar_color'],
                'isAnonymous' => (bool) $row['is_anonymous'],
                'gamesPlayed' => (int) $row['games_played'],
                'wins'        => (int) $row['wins'],
            ],
            'token' => $rawToken,
        ]);
    }

    if ($route === 'auth/logout' && $method === 'POST') {
        $raw = yukmain_extract_raw_token();
        if ($raw) {
            $hash = yukmain_verify_token_format($pdo, $raw);
            if ($hash) {
                $pdo->prepare('DELETE FROM sessions WHERE token_hash = ?')->execute([$hash]);
            }
        }
        yukmain_clear_session_cookie();
        yukmain_json_response(200, ['ok' => true]);
    }

    // ===================== ROOM ROUTES =====================
    if (($route === 'rooms/create' || $route === 'rooms') && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $gameType = (string) ($body['gameType'] ?? 'spyfall');
        $created = yukmain_create_room($pdo, $user, $gameType);
        yukmain_json_response(200, $created);
    }

    if ($route === 'rooms/join' && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $code = (string) ($body['code'] ?? '');
        $isStage = !empty($body['stage']);
        $joined = $isStage
            ? yukmain_join_room_as_stage($pdo, $user, $code)
            : yukmain_join_room_by_code($pdo, $user, $code);
        yukmain_json_response(200, $joined);
    }

    if ($route === 'rooms/snapshot' && $method === 'GET') {
        $user = yukmain_require_auth($pdo);
        $roomId = trim((string) ($_GET['roomId'] ?? ''));
        if ($roomId === '') {
            throw new RuntimeException('Parameter roomId wajib diisi.', 400);
        }
        $isStage = (($_GET['stage'] ?? '') === '1');
        $heartbeat = (($_GET['heartbeat'] ?? '') === '1');
        $sinceVersion = max(0, (int) ($_GET['sinceVersion'] ?? 0));

        $snap = yukmain_get_room_snapshot($pdo, $roomId, $user, $isStage, $heartbeat, $sinceVersion);
        yukmain_json_response(200, $snap);
    }

    if ($route === 'rooms/action' && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $roomId = trim((string) ($body['roomId'] ?? $_GET['roomId'] ?? ''));
        $action = trim((string) ($body['action'] ?? ''));
        $payload = is_array($body['payload'] ?? null) ? $body['payload'] : [];

        if ($roomId === '' || $action === '') {
            throw new RuntimeException('Parameter roomId dan action wajib diisi.', 400);
        }

        $res = yukmain_dispatch_room_action($pdo, $roomId, $user, $action, $payload);
        yukmain_json_response(200, $res);
    }

    if ($route === 'rooms/leave' && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $roomId = trim((string) ($body['roomId'] ?? $_GET['roomId'] ?? ''));
        if ($roomId === '') {
            throw new RuntimeException('Parameter roomId wajib diisi.', 400);
        }
        $res = yukmain_leave_room($pdo, $user, $roomId);
        yukmain_json_response(200, array_merge(['ok' => true], $res));
    }

    if ($route === 'rooms/check-reset' && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $roomId = trim((string) ($body['roomId'] ?? $_GET['roomId'] ?? ''));
        if ($roomId === '') {
            throw new RuntimeException('Parameter roomId wajib diisi.', 400);
        }
        $res = yukmain_check_reset_expired_room($pdo, $roomId, $user['uid']);
        yukmain_json_response(200, $res);
    }

    if ($route === 'rooms/chat' && $method === 'POST') {
        $user = yukmain_require_auth($pdo);
        $body = yukmain_read_json_body();
        $roomId = trim((string) ($body['roomId'] ?? $_GET['roomId'] ?? ''));
        $text = (string) ($body['text'] ?? '');
        if ($roomId === '') {
            throw new RuntimeException('Parameter roomId wajib diisi.', 400);
        }
        $msg = yukmain_insert_and_prune_chat($pdo, $roomId, $user['uid'], $user['displayName'], $text, 'chat');
        yukmain_json_response(200, ['ok' => true, 'message' => $msg]);
    }

    yukmain_json_response(404, ['error' => 'Endpoint API tidak ditemukan.']);
} catch (RuntimeException $e) {
    $code = $e->getCode();
    $status = ($code >= 400 && $code < 600) ? $code : 400;
    yukmain_json_response($status, ['error' => $e->getMessage()]);
} catch (PDOException $e) {
    yukmain_json_response(503, ['error' => 'Database MySQL belum terhubung atau konfigurasi belum valid.']);
} catch (Throwable $e) {
    yukmain_json_response(500, ['error' => 'Terjadi kesalahan internal server PHP.']);
}
