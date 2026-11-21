<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

function yukmain_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = yukmain_load_config();
    if ($cfg['mysql_host'] === '' || $cfg['mysql_db'] === '' || $cfg['mysql_user'] === '') {
        throw new RuntimeException('Konfigurasi MySQL belum diisi pada server PHP.');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $cfg['mysql_host'],
        $cfg['mysql_port'],
        $cfg['mysql_db']
    );

    $pdo = new PDO($dsn, $cfg['mysql_user'], $cfg['mysql_pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    yukmain_ensure_schema($pdo);
    return $pdo;
}

function yukmain_ensure_schema(PDO $pdo): void
{
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $statements = [
        "CREATE TABLE IF NOT EXISTS app_meta (
            meta_key VARCHAR(64) PRIMARY KEY,
            meta_value VARCHAR(255) NOT NULL,
            updated_at_ms BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS users (
            uid VARCHAR(64) PRIMARY KEY,
            username VARCHAR(64) NULL UNIQUE,
            password_hash VARCHAR(255) NULL,
            display_name VARCHAR(64) NOT NULL,
            avatar_color VARCHAR(32) NOT NULL,
            is_anonymous TINYINT(1) NOT NULL DEFAULT 1,
            games_played INT NOT NULL DEFAULT 0,
            wins INT NOT NULL DEFAULT 0,
            created_at_ms BIGINT NOT NULL,
            updated_at_ms BIGINT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS sessions (
            token_hash VARCHAR(128) PRIMARY KEY,
            uid VARCHAR(64) NOT NULL,
            expires_at_ms BIGINT NOT NULL,
            created_at_ms BIGINT NOT NULL,
            INDEX idx_sessions_uid (uid),
            CONSTRAINT fk_sessions_user FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS match_history (
            id VARCHAR(64) PRIMARY KEY,
            room_id VARCHAR(64) NOT NULL,
            room_code VARCHAR(16) NOT NULL,
            game_type VARCHAR(32) NOT NULL,
            rounds_played INT NOT NULL,
            winner_uids_json LONGTEXT NOT NULL,
            scores_json LONGTEXT NOT NULL,
            finished_at_ms BIGINT NOT NULL,
            INDEX idx_match_history_finished (finished_at_ms DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS rooms (
            id VARCHAR(64) PRIMARY KEY,
            code VARCHAR(16) NOT NULL UNIQUE,
            game_type VARCHAR(32) NOT NULL,
            host_uid VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            round_number INT NOT NULL DEFAULT 0,
            current_round_id VARCHAR(64) NOT NULL DEFAULT '',
            current_match_rounds INT NOT NULL DEFAULT 0,
            last_empty_at_ms BIGINT NULL,
            room_json LONGTEXT NOT NULL,
            version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at_ms BIGINT NOT NULL,
            updated_at_ms BIGINT NOT NULL,
            INDEX idx_rooms_updated (updated_at_ms)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS room_players (
            room_id VARCHAR(64) NOT NULL,
            uid VARCHAR(64) NOT NULL,
            display_name VARCHAR(64) NOT NULL,
            avatar_color VARCHAR(32) NOT NULL,
            is_host TINYINT(1) NOT NULL DEFAULT 0,
            score INT NOT NULL DEFAULT 0,
            is_ready TINYINT(1) NOT NULL DEFAULT 0,
            controller_uid VARCHAR(64) NOT NULL,
            is_numpang TINYINT(1) NOT NULL DEFAULT 0,
            is_brb TINYINT(1) NOT NULL DEFAULT 0,
            joined_at_ms BIGINT NOT NULL,
            updated_at_ms BIGINT NOT NULL,
            PRIMARY KEY (room_id, uid),
            INDEX idx_room_players_room (room_id, joined_at_ms),
            CONSTRAINT fk_room_players_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS round_server_states (
            room_id VARCHAR(64) NOT NULL,
            round_id VARCHAR(64) NOT NULL,
            state_json LONGTEXT NOT NULL,
            created_at_ms BIGINT NOT NULL,
            PRIMARY KEY (room_id, round_id),
            CONSTRAINT fk_server_state_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS round_player_secrets (
            room_id VARCHAR(64) NOT NULL,
            round_id VARCHAR(64) NOT NULL,
            uid VARCHAR(64) NOT NULL,
            secret_json LONGTEXT NOT NULL,
            created_at_ms BIGINT NOT NULL,
            PRIMARY KEY (room_id, round_id, uid),
            CONSTRAINT fk_secrets_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS round_submissions (
            room_id VARCHAR(64) NOT NULL,
            kind VARCHAR(32) NOT NULL,
            scope_key VARCHAR(64) NOT NULL,
            uid VARCHAR(64) NOT NULL,
            value_json TEXT NOT NULL,
            updated_at_ms BIGINT NOT NULL,
            PRIMARY KEY (room_id, kind, scope_key, uid),
            CONSTRAINT fk_submissions_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS room_messages (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            room_id VARCHAR(64) NOT NULL,
            msg_uid VARCHAR(64) NOT NULL,
            sender_uid VARCHAR(64) NOT NULL,
            sender_name VARCHAR(64) NOT NULL,
            text TEXT NOT NULL,
            type ENUM('chat', 'system') NOT NULL DEFAULT 'chat',
            created_at_ms BIGINT NOT NULL,
            INDEX idx_room_messages_room_id (room_id, id DESC),
            CONSTRAINT fk_messages_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS room_presence (
            room_id VARCHAR(64) NOT NULL,
            uid VARCHAR(64) NOT NULL,
            display_name VARCHAR(64) NOT NULL,
            is_stage TINYINT(1) NOT NULL DEFAULT 0,
            online TINYINT(1) NOT NULL DEFAULT 1,
            last_seen_ms BIGINT NOT NULL,
            PRIMARY KEY (room_id, uid),
            CONSTRAINT fk_presence_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];

    foreach ($statements as $sql) {
        $pdo->exec($sql);
    }

    $initialized = true;
}

function yukmain_with_tx(PDO $pdo, callable $fn)
{
    $pdo->beginTransaction();
    try {
        $res = $fn($pdo);
        $pdo->commit();
        return $res;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}
