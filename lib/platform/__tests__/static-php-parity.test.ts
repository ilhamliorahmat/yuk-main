import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_FACTS_ID } from '../../games/fakta-hari-ini/facts-id';
import { BUILTIN_WORD_PAIRS } from '../../games/kata-kata/words-id';
import { MALAM_SILUMAN_ROLES } from '../../games/malam-siluman/roles-id';
import { BUILTIN_DRAWING_PROMPTS_ID } from '../../games/pelukis-gadungan/prompts-id';
import { BUILTIN_SPECTRUMS_ID } from '../../games/satu-frekuensi/spectrums-id';
import { INDONESIAN_LOCATIONS } from '../../games/spyfall/locations-id';
import {
  ULAR_HERO_CLASS_ORDER,
  ULAR_ITEM_IDS,
  ULAR_SCENARIO_ORDER,
} from '../../games/ular-tangga/packs';

const ROOT = process.cwd();

describe('Static Export + PHP 8 + PDO MySQL Architecture Parity', () => {
  it('enforces Next.js static export without Node.js server files', () => {
    const nextCfg = readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8');
    expect(nextCfg).toContain("output: 'export'");
    expect(nextCfg).toContain('unoptimized: true');

    expect(existsSync(resolve(ROOT, 'server.ts'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'app/api'))).toBe(false);
    expect(existsSync(resolve(ROOT, 'lib/server'))).toBe(false);
  });

  it('ships complete PHP 8 backend, Apache .htaccess, and MySQL InnoDB schema', () => {
    const requiredFiles = [
      'database/mysql_schema.sql',
      '.github/workflows/deploy-infinityfree.yml',
      'public/.htaccess',
      'public/api/.htaccess',
      'public/api/lib/.htaccess',
      'public/api/index.php',
      'public/api/config.local.example.php',
      'public/api/lib/config.php',
      'public/api/lib/db.php',
      'public/api/lib/auth.php',
      'public/api/lib/engine_common.php',
      'public/api/lib/engine_games_social.php',
      'public/api/lib/engine_malam_siluman.php',
      'public/api/lib/engine_ular_tangga.php',
      'public/api/lib/rooms.php',
      'public/api/lib/dispatcher.php',
      'public/api/lib/lan_signal.php',
      'public/api/lib/game-packs.json',
    ];

    for (const rel of requiredFiles) {
      expect(existsSync(resolve(ROOT, rel))).toBe(true);
    }
    expect(existsSync(resolve(ROOT, '.github/workflows/ci.yml'))).toBe(false);

    const schema = readFileSync(resolve(ROOT, 'database/mysql_schema.sql'), 'utf8');
    const phpDb = readFileSync(resolve(ROOT, 'public/api/lib/db.php'), 'utf8');
    const phpIndex = readFileSync(resolve(ROOT, 'public/api/index.php'), 'utf8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS rooms');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS lan_signal_rooms');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS lan_signal_peers');
    expect(schema).toContain('version INT UNSIGNED');
    expect(schema).toContain('room_messages');
    expect(schema).toContain('ENGINE=InnoDB');
    expect(schema).toContain('winner_uids_json LONGTEXT NOT NULL');
    expect(schema).toContain('scores_json LONGTEXT NOT NULL');
    expect(schema).not.toContain('AUTOINCREMENT'); // SQLite keyword forbidden in MySQL
    expect(phpDb).toContain('winner_uids_json LONGTEXT NOT NULL');
    expect(phpDb).toContain('scores_json LONGTEXT NOT NULL');
    expect(phpDb).toContain('CREATE TABLE IF NOT EXISTS lan_signal_rooms');
    expect(phpDb).toContain('CREATE TABLE IF NOT EXISTS lan_signal_peers');
    expect(phpIndex).toContain("route === 'lan/register'");
    expect(phpIndex).toContain("route === 'lan/request'");
    expect(phpIndex).toContain("route === 'lan/status'");

    const exampleCfg = readFileSync(resolve(ROOT, 'public/api/config.local.example.php'), 'utf8');
    expect(exampleCfg).toContain("'mysql_pass' => ''");
  });

  it('keeps PHP game-packs.json synchronized with TypeScript built-in packs', () => {
    const packs = JSON.parse(
      readFileSync(resolve(ROOT, 'public/api/lib/game-packs.json'), 'utf8'),
    ) as {
      spyfall: { items: Array<{ id: string }> };
      kata_kata: { items: Array<{ id: string }> };
      satu_frekuensi: { items: Array<{ id: string }> };
      fakta_hari_ini: { items: Array<{ id: string }> };
      pelukis_gadungan: { items: Array<{ id: string }> };
      malam_siluman: { roles: Record<string, { id: string }> };
      ular_tangga: {
        heroClasses: Record<string, { id: string }>;
        items: Record<string, { id: string }>;
        scenarios: Record<string, { id: string }>;
      };
    };

    expect(packs.spyfall.items).toHaveLength(INDONESIAN_LOCATIONS.length);
    expect(packs.kata_kata.items).toHaveLength(BUILTIN_WORD_PAIRS.length);
    expect(packs.satu_frekuensi.items).toHaveLength(BUILTIN_SPECTRUMS_ID.length);
    expect(packs.fakta_hari_ini.items).toHaveLength(BUILTIN_FACTS_ID.length);
    expect(packs.pelukis_gadungan.items).toHaveLength(BUILTIN_DRAWING_PROMPTS_ID.length);
    expect(Object.keys(packs.malam_siluman.roles)).toHaveLength(
      Object.keys(MALAM_SILUMAN_ROLES).length,
    );
    expect(Object.keys(packs.ular_tangga.heroClasses)).toHaveLength(ULAR_HERO_CLASS_ORDER.length);
    expect(Object.keys(packs.ular_tangga.items)).toHaveLength(ULAR_ITEM_IDS.length);
    expect(Object.keys(packs.ular_tangga.scenarios)).toHaveLength(ULAR_SCENARIO_ORDER.length);
  });

  it('handles every LanActionName case in PHP dispatcher.php', () => {
    const protoSrc = readFileSync(resolve(ROOT, 'lib/lan/lan-protocol.ts'), 'utf8');
    const dispatcherSrc = readFileSync(resolve(ROOT, 'public/api/lib/dispatcher.php'), 'utf8');

    const match = protoSrc.match(/export type LanActionName =([\s\S]*?);/);
    expect(match).toBeTruthy();

    const actionNames = Array.from(match![1].matchAll(/'([a-zA-Z0-9_]+)'/g)).map((m) => m[1]);
    expect(actionNames.length).toBeGreaterThanOrEqual(50);

    for (const action of actionNames) {
      expect(dispatcherSrc).toContain(`case '${action}':`);
    }

    const socialPhp = readFileSync(resolve(ROOT, 'public/api/lib/engine_games_social.php'), 'utf8');
    expect(socialPhp).toContain('function yukmain_evaluate_majority_vote_progress');
    expect(socialPhp).toContain('intdiv($totalEligible, 2) + 1');
    expect(dispatcherSrc).toContain('function yukmain_reconcile_active_vote_after_roster_change');
  });

  it('uses 100% Source Available* branding with footer explanation and ships the /about page', () => {
    expect(existsSync(resolve(ROOT, 'app/about/page.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'components/about/AboutCreatorView.tsx'))).toBe(true);

    const hubSrc = readFileSync(resolve(ROOT, 'components/hub/YukMainHub.tsx'), 'utf8');
    const layoutSrc = readFileSync(resolve(ROOT, 'app/layout.tsx'), 'utf8');

    expect(hubSrc).toContain('100% Source Available*');
    expect(hubSrc).toContain('id="source-available"');
    expect(hubSrc).toContain('PolyForm Noncommercial License 1.0.0');
    expect(hubSrc).toContain('href="/about"');
    expect(hubSrc).not.toMatch(/open[- ]source/i);

    expect(layoutSrc).toContain('100% Source Available');
    expect(layoutSrc).not.toMatch(/open[- ]source/i);
  });
});
