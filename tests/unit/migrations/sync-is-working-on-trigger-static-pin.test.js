/**
 * Static-pin regression test for SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001 FR-4.
 *
 * Reads the migration .sql file via fs.readFileSync + regex assertions to
 * detect future regressions of the sync_is_working_on_with_session trigger
 * function shape.
 *
 * Glob-by-suffix pattern (per testing-agent C-4 — NOT hardcoded date prefix):
 * matches database/migrations/*_sync_is_working_on_preserve_recoverable_stale.sql.
 *
 * Mocking-independent — does not invoke Supabase. Detects:
 *  (a) CLEAR branch contains 'released' AND 'completed' literals (irrevocable transitions only)
 *  (b) SET branch preserved (claim acquisition path: OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL)
 *  (c) CAS guard present (active_session_id = OLD.session_id in CLEAR UPDATE WHERE)
 *  (d) NOTIFY pgrst, 'reload schema' at end (PostgREST cache refresh)
 *  (e) Function name exactly public.sync_is_working_on_with_session() (no plural-typo)
 *  (f) NO bare "NEW.status != 'active'" predicate that would re-introduce the bug
 *
 * Pattern source: SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 PR #3693 dual-anchor static-pin.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../database/migrations');

function findMigrationFile() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const matches = files.filter((f) =>
    /^\d{8,}_sync_is_working_on_preserve_recoverable_stale\.sql$/.test(f)
  );
  if (matches.length === 0) {
    throw new Error(
      `No migration file matching <date>_sync_is_working_on_preserve_recoverable_stale.sql found in ${MIGRATIONS_DIR}`
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple matching migration files (${matches.join(', ')}) — expected exactly one`
    );
  }
  return path.join(MIGRATIONS_DIR, matches[0]);
}

describe('FR-4 sync_is_working_on_with_session trigger — static-pin regression guard', () => {
  const migrationPath = findMigrationFile();
  const rawSrc = fs.readFileSync(migrationPath, 'utf-8');
  // Strip SQL line comments (-- ...) so anti-regression patterns don't false-match
  // documentation that LITERALLY quotes the buggy predicate for traceability.
  // PostgreSQL line comments are everything from -- to end of line (when not in string).
  // Conservative strip: match any line whose first non-whitespace chars are "--"
  const src = rawSrc.split('\n').map(line => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('--')) return '';
    // Also strip trailing -- comments (after non-comment SQL)
    const dashIdx = line.indexOf('--');
    if (dashIdx >= 0) return line.slice(0, dashIdx);
    return line;
  }).join('\n');

  it('(e) declares the function with exact name public.sync_is_working_on_with_session()', () => {
    expect(src).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_is_working_on_with_session\s*\(\s*\)/i
    );
  });

  it('(b) preserves SET branch verbatim (claim acquisition: OLD.sd_key IS NULL AND NEW.sd_key IS NOT NULL AND NEW.status = active)', () => {
    expect(src).toMatch(
      /OLD\.sd_key\s+IS\s+NULL\s+AND\s+NEW\.sd_key\s+IS\s+NOT\s+NULL\s+AND\s+NEW\.status\s*=\s*'active'/i
    );
  });

  it('(a) CLEAR branch narrowed to irrevocable transitions only — contains released AND completed literals', () => {
    expect(src).toMatch(/'released'/);
    expect(src).toMatch(/'completed'/);
    expect(src).toMatch(
      /NEW\.status\s+IN\s*\(\s*'released'\s*,\s*'completed'\s*\)/i
    );
  });

  it('(f) DOES NOT reintroduce the bug — no bare "NEW.status != active" predicate (which would catch stale)', () => {
    // The original buggy predicate was: OLD.status='active' AND NEW.status != 'active'
    // The fix requires NEW.status IN (released, completed) — this regex catches
    // any standalone NEW.status != 'active' that would re-include 'stale'.
    expect(src).not.toMatch(/NEW\.status\s*!=\s*'active'/i);
    expect(src).not.toMatch(/NEW\.status\s*<>\s*'active'/i);
  });

  it('(c) CAS guard present in CLEAR UPDATE WHERE clause (active_session_id = OLD.session_id) — cross-session safety', () => {
    expect(src).toMatch(/active_session_id\s*=\s*OLD\.session_id/i);
  });

  it('(d) NOTIFY pgrst, reload schema at migration end — PostgREST cache refresh', () => {
    // Last 500 chars of the file should contain the NOTIFY
    const tail = src.slice(-500);
    expect(tail).toMatch(/NOTIFY\s+pgrst\s*,\s*'reload\s+schema'/i);
  });

  it('FR-5: trigger writes to existing session_lifecycle_events table (uses metadata jsonb column, NOT payload)', () => {
    expect(src).toMatch(
      /INSERT\s+INTO\s+session_lifecycle_events\s*\(/i
    );
    // metadata column reference (existing schema per database-agent FR-1)
    expect(src).toMatch(/metadata/);
    // Must NOT use payload column (does not exist)
    expect(src).not.toMatch(/payload\s+jsonb|INSERT[^)]*payload\s*\)/i);
  });

  it('FR-5: audit-INSERT predicate narrowed to fire only on sd_key OR status change (skips heartbeat-only updates)', () => {
    expect(src).toMatch(
      /OLD\.sd_key\s+IS\s+DISTINCT\s+FROM\s+NEW\.sd_key/i
    );
    expect(src).toMatch(
      /OLD\.status\s+IS\s+DISTINCT\s+FROM\s+NEW\.status/i
    );
  });

  it('Function preserves SECURITY INVOKER (no SECURITY DEFINER)', () => {
    // CREATE OR REPLACE FUNCTION defaults to SECURITY INVOKER unless explicitly DEFINER
    expect(src).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('Idempotency: uses CREATE OR REPLACE FUNCTION (not CREATE FUNCTION)', () => {
    expect(src).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
  });
});
