<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

const YUKMAIN_SESSION_COOKIE = 'yukmain_session';
const YUKMAIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function yukmain_avatar_color(string $seed): string
{
    $palette = ['#DC2626', '#D97706', '#059669', '#0284C7', '#4F46E5', '#9333EA', '#DB2777', '#0D9488'];
    $hash = 0;
    $len = strlen($seed);
    for ($i = 0; $i < $len; $i++) {
        $hash = (($hash * 31) + ord($seed[$i])) & 0x7fffffff;
    }
    return $palette[$hash % count($palette)];
}

function yukmain_session_secret(PDO $pdo): string
{
    static $cached = null;
    if (is_string($cached) && $cached !== '') {
        return $cached;
    }

    $envSecret = getenv('YUKMAIN_SESSION_SECRET');
    if (is_string($envSecret) && strlen(trim($envSecret)) >= 16) {
        $cached = trim($envSecret);
        return $cached;
    }

    $stmt = $pdo->prepare('SELECT meta_value FROM app_meta WHERE meta_key = ? LIMIT 1');
    $stmt->execute(['session_hmac_secret']);
    $row = $stmt->fetch();
    if ($row && is_string($row['meta_value']) && strlen($row['meta_value']) >= 32) {
        $cached = $row['meta_value'];
        return $cached;
    }

    $generated = yukmain_random_hex(32);
    $ins = $pdo->prepare(
        'INSERT IGNORE INTO app_meta (meta_key, meta_value, updated_at_ms) VALUES (?, ?, ?)'
    );
    $ins->execute(['session_hmac_secret', $generated, yukmain_now_ms()]);

    $stmt->execute(['session_hmac_secret']);
    $final = $stmt->fetch();
    $cached = ($final && is_string($final['meta_value'])) ? $final['meta_value'] : $generated;
    return $cached;
}

function yukmain_generate_session_token(PDO $pdo): array
{
    $secret = yukmain_session_secret($pdo);
    $nonce = yukmain_random_hex(24);
    $sig = substr(hash_hmac('sha256', $nonce, $secret), 0, 24);
    $raw = $nonce . '.' . $sig;
    return [
        'raw'  => $raw,
        'hash' => hash_hmac('sha256', $raw, $secret),
    ];
}

function yukmain_verify_token_format(PDO $pdo, string $rawToken): ?string
{
    $parts = explode('.', $rawToken);
    if (count($parts) !== 2) {
        return null;
    }
    [$nonce, $sig] = $parts;
    if (strlen($nonce) !== 48 || strlen($sig) !== 24 || !ctype_xdigit($nonce) || !ctype_xdigit($sig)) {
        return null;
    }
    $secret = yukmain_session_secret($pdo);
    $expected = substr(hash_hmac('sha256', $nonce, $secret), 0, 24);
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    return hash_hmac('sha256', $rawToken, $secret);
}

function yukmain_is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $proto = strtolower(trim(explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'])[0]));
        if ($proto === 'https') {
            return true;
        }
    }
    if (!empty($_SERVER['HTTP_ORIGIN']) && str_starts_with($_SERVER['HTTP_ORIGIN'], 'https://')) {
        return true;
    }
    return false;
}

function yukmain_set_session_cookie(string $rawToken): void
{
    $maxAge = (int) floor(YUKMAIN_SESSION_TTL_MS / 1000);
    if (yukmain_is_https()) {
        header(
            sprintf(
                'Set-Cookie: %s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=None; Secure; Partitioned',
                YUKMAIN_SESSION_COOKIE,
                rawurlencode($rawToken),
                $maxAge
            ),
            false
        );
    } else {
        header(
            sprintf(
                'Set-Cookie: %s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax',
                YUKMAIN_SESSION_COOKIE,
                rawurlencode($rawToken),
                $maxAge
            ),
            false
        );
    }
}

function yukmain_clear_session_cookie(): void
{
    if (yukmain_is_https()) {
        header(
            sprintf(
                'Set-Cookie: %s=; Path=/; Max-Age=0; HttpOnly; SameSite=None; Secure; Partitioned',
                YUKMAIN_SESSION_COOKIE
            ),
            false
        );
    } else {
        header(
            sprintf(
                'Set-Cookie: %s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
                YUKMAIN_SESSION_COOKIE
            ),
            false
        );
    }
}

function yukmain_extract_raw_token(): ?string
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (is_string($authHeader) && str_starts_with($authHeader, 'Bearer ')) {
        $bearer = trim(substr($authHeader, 7));
        if ($bearer !== '') {
            return $bearer;
        }
    }
    if (!empty($_COOKIE[YUKMAIN_SESSION_COOKIE]) && is_string($_COOKIE[YUKMAIN_SESSION_COOKIE])) {
        return trim($_COOKIE[YUKMAIN_SESSION_COOKIE]);
    }
    return null;
}

function yukmain_verify_mutation_origin(): bool
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (is_string($authHeader) && str_starts_with($authHeader, 'Bearer ')) {
        return true;
    }
    $reqWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    if (is_string($reqWith) && trim($reqWith) !== '') {
        return true;
    }
    if (empty($_COOKIE[YUKMAIN_SESSION_COOKIE])) {
        return true;
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '';
    if ($origin === '' || $host === '') {
        return false;
    }
    $originHost = parse_url($origin, PHP_URL_HOST);
    $originPort = parse_url($origin, PHP_URL_PORT);
    $originAuthority = $originPort ? ($originHost . ':' . $originPort) : $originHost;
    $targetHost = trim(explode(',', $host)[0]);
    return is_string($originAuthority) && hash_equals($targetHost, $originAuthority);
}

function yukmain_authenticate_request(PDO $pdo): ?array
{
    $raw = yukmain_extract_raw_token();
    if (!$raw) {
        return null;
    }
    $tokenHash = yukmain_verify_token_format($pdo, $raw);
    if (!$tokenHash) {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT u.uid, u.username, u.display_name, u.avatar_color, u.is_anonymous, u.games_played, u.wins
         FROM sessions s
         INNER JOIN users u ON u.uid = s.uid
         WHERE s.token_hash = ? AND s.expires_at_ms > ?
         LIMIT 1'
    );
    $stmt->execute([$tokenHash, yukmain_now_ms()]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    return [
        'uid'         => $row['uid'],
        'username'    => $row['username'],
        'displayName' => $row['display_name'],
        'avatarColor' => $row['avatar_color'],
        'isAnonymous' => (bool) $row['is_anonymous'],
        'gamesPlayed' => (int) $row['games_played'],
        'wins'        => (int) $row['wins'],
    ];
}

function yukmain_create_session(PDO $pdo, string $uid): string
{
    $tok = yukmain_generate_session_token($pdo);
    $now = yukmain_now_ms();
    $stmt = $pdo->prepare(
        'INSERT INTO sessions (token_hash, uid, expires_at_ms, created_at_ms) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$tok['hash'], $uid, $now + YUKMAIN_SESSION_TTL_MS, $now]);
    return $tok['raw'];
}
