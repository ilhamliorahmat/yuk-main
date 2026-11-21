<?php
declare(strict_types=1);

function yukmain_load_config(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $localPath = dirname(__DIR__) . '/config.local.php';
    $local = [];
    if (is_file($localPath)) {
        $loaded = require $localPath;
        if (is_array($loaded)) {
            $local = $loaded;
        }
    }

    $getVal = static function (string $envKey, string $localKey, string $default = '') use ($local): string {
        $envVal = getenv($envKey);
        if (is_string($envVal) && trim($envVal) !== '') {
            return trim($envVal);
        }
        if (isset($local[$localKey]) && is_string($local[$localKey]) && trim($local[$localKey]) !== '') {
            return trim($local[$localKey]);
        }
        return $default;
    };

    $cached = [
        'mysql_host' => $getVal('YUKMAIN_MYSQL_HOST', 'mysql_host'),
        'mysql_port' => $getVal('YUKMAIN_MYSQL_PORT', 'mysql_port', '3306'),
        'mysql_db'   => $getVal('YUKMAIN_MYSQL_DB', 'mysql_db'),
        'mysql_user' => $getVal('YUKMAIN_MYSQL_USER', 'mysql_user'),
        'mysql_pass' => $getVal('YUKMAIN_MYSQL_PASS', 'mysql_pass'),
    ];

    return $cached;
}

function yukmain_now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

function yukmain_random_hex(int $bytes = 16): string
{
    return bin2hex(random_bytes($bytes));
}
