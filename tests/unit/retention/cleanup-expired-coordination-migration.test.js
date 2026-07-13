/**
 * SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-1) — static content assertions on the
 * cleanup_expired_coordination() fix migration. A live-DB round-trip test isn't practical
 * in this suite (pure unit tests, no DB), so this pins the SQL text the same way
 * retention-policy.test.js's "migration parity (TS-2 static)" block pins the substrate
 * migration -- verifying the fix is actually present and the old bug is actually gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const MIGRATION = readFileSync(
  resolve(REPO_ROOT, 'database/migrations/20260713_fix_cleanup_expired_coordination.sql'),
  'utf8'
);
// The function BODY only -- excludes the header comment block, which intentionally
// mentions the OLD buggy pattern ("Prior body used ... RETURNING 1 INTO ...") for context.
const FUNCTION_BODY = MIGRATION.slice(MIGRATION.indexOf('CREATE OR REPLACE FUNCTION'));

describe('cleanup_expired_coordination() fix migration (FR-1, static)', () => {
  it('no longer uses the scalar RETURNING ... INTO pattern that raised P0003', () => {
    expect(FUNCTION_BODY).not.toMatch(/RETURNING\s+1\s+INTO/i);
  });

  it('uses GET DIAGNOSTICS ... ROW_COUNT for both the archive insert and the delete', () => {
    const matches = MIGRATION.match(/GET DIAGNOSTICS\s+\w+\s*=\s*ROW_COUNT/gi) || [];
    expect(matches.length).toBe(2);
  });

  it('archives before deleting (INSERT INTO retention_archive precedes the DELETE)', () => {
    const insertIdx = MIGRATION.indexOf('INSERT INTO retention_archive');
    const deleteIdx = MIGRATION.indexOf('DELETE FROM session_coordination');
    expect(insertIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeLessThan(deleteIdx);
  });

  it('raises on an archive/delete count mismatch instead of silently proceeding', () => {
    expect(MIGRATION).toMatch(/RAISE EXCEPTION.*archive\/delete count mismatch/i);
  });

  it('guard predicate never matches never-surfaced rows (read_at IS NULL AND acknowledged_at IS NULL)', () => {
    // The candidate WHERE clause must require acknowledged_at IS NOT NULL OR a read_at cutoff --
    // it must never select purely on expires_at alone.
    expect(MIGRATION).toMatch(/acknowledged_at IS NOT NULL/);
    expect(MIGRATION).toMatch(/read_at IS NOT NULL AND read_at <= now\(\) - interval '7 days'/);
  });

  it('snapshots candidate ids once via a temp table (no re-evaluation race between archive and delete)', () => {
    expect(MIGRATION).toMatch(/CREATE TEMP TABLE IF NOT EXISTS _cleanup_expired_coord_candidates/);
  });
});
