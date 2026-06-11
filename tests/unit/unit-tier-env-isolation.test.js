/**
 * SD-LEO-INFRA-ENFORCE-UNIT-TIER-001 (FR-3) — unit-tier env isolation pin.
 *
 * The `unit` vitest project uses tests/setup.unit.js, which must NOT load
 * `.env` (real credentials). This suite pins that contract:
 *   1. the repo `.env` file's SUPABASE_URL never leaks into the unit project;
 *   2. absent host-shell credentials, the synthetic sentinels are in effect.
 *
 * Host-shell env vars are still honored (||= semantics) so CI workflows that
 * deliberately pass secrets (test-coverage.yml, protected-unit-suites.yml)
 * stay green — assertion 2 self-skips in that case, assertion 1 never does.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');

function dotenvValue(key) {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${key}=`));
  if (!line) return null;
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || null;
}

const SENTINEL_URL = 'https://test.invalid.local';
const SENTINEL_KEY = 'test-service-role-key-not-real';

// Real creds present that did NOT come from .env ⇒ host shell provided them
// (CI secrets). The exact-sentinel pin self-skips then; the leak pin never does.
const envFileUrl = dotenvValue('SUPABASE_URL');
const urlIsReal = Boolean(process.env.SUPABASE_URL) && process.env.SUPABASE_URL !== SENTINEL_URL;
const shellProvidedCreds = urlIsReal && process.env.SUPABASE_URL !== envFileUrl;

describe('unit-tier env isolation (setup.unit.js)', () => {
  it('does NOT leak SUPABASE_URL from the repo .env file into the unit project', () => {
    if (envFileUrl && envFileUrl !== SENTINEL_URL) {
      expect(
        process.env.SUPABASE_URL,
        '.env SUPABASE_URL leaked into the unit project — setup.unit.js must not load .env'
      ).not.toBe(envFileUrl);
    } else {
      expect(true).toBe(true); // no .env (CI) — nothing to leak
    }
  });

  it.skipIf(shellProvidedCreds)('uses the synthetic sentinels when no host-shell creds exist', () => {
    expect(process.env.SUPABASE_URL).toBe(SENTINEL_URL);
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe(SENTINEL_KEY);
  });
});
