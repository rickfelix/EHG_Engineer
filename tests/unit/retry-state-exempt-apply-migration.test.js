/**
 * SD-LEO-INFRA-RCA-ENFORCEMENT-PROGRESS-STALL-NOT-REPETITION-001 — exempt apply-migration.js.
 *
 * apply-migration.js is one invocation PER migration file — applying 3 migrations in a row is
 * progress, not a stuck loop. But each invocation targets a DIFFERENT migration file, so the
 * SD-level phase/percent progressFingerprint (Control 3) can't observe that per-file progress.
 * A chairman-approved prod migration apply was hard-blocked on Echo by the bare-repetition
 * 3-strikes guard before this fix landed. Backstop: add to EXEMPT_PATTERNS (same precedent as
 * the other mutating-but-idempotent scheduled scripts already there).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { isExempt, recordAndCount } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('isExempt — apply-migration.js', () => {
  it('exempts apply-migration.js regardless of arguments', () => {
    expect(isExempt('node scripts/apply-migration.js database/migrations/20260619_a.sql')).toBe(true);
    expect(isExempt('node scripts/apply-migration.js database/migrations/20260701_b.sql --prod-deploy')).toBe(true);
    expect(isExempt('node scripts\\apply-migration.js database\\migrations\\c.sql')).toBe(true); // windows path sep
  });

  it('does not exempt an unrelated migration-adjacent script (scoped match)', () => {
    expect(isExempt('node scripts/generate-migration.js')).toBe(false);
    expect(isExempt('node scripts/migration-readiness-check.js')).toBe(false);
  });
});

describe('recordAndCount honors the apply-migration.js exemption across different migration files', () => {
  let tmpDir;
  const SESSION = 'sess-exempt-migrations';
  const noReset = async () => null;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-exempt-migration-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('applying 3 DIFFERENT migration files in a row never accumulates (the Echo repro)', async () => {
    const files = [
      'database/migrations/20260619_guard_a.sql',
      'database/migrations/20260621_guard_b.sql',
      'database/migrations/20260701_guard_c.sql',
    ];
    for (let i = 0; i < files.length; i++) {
      const cmd = `node scripts/apply-migration.js ${files[i]} --prod-deploy`;
      const r = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 + i * 1000 });
      expect(r.attempts).toBe(0);
    }
  });

  it('re-applying the SAME migration file repeatedly (e.g. a retried apply) also never accumulates', async () => {
    const cmd = 'node scripts/apply-migration.js database/migrations/20260701_guard_c.sql --prod-deploy';
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 + i * 1000 });
      expect(r.attempts).toBe(0);
    }
  });
});
