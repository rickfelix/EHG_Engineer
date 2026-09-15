/**
 * SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001 -- TS-3.
 *
 * public_read_allowlist is chairman-owned: this SD's own code (migration, checker, wiring,
 * one-off scripts) must never write a row into it. Statically scans every file this SD adds
 * or touches for a write verb (INSERT/UPSERT/UPDATE/.from('public_read_allowlist').insert/
 * .upsert/.update) against the table name -- a read (SELECT / .from(...).select) is fine and
 * expected (the checker reads it every run).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../');

const FILES_TO_SCAN = [
  'lib/security/continuous-external-surface-checker.mjs',
  'database/migrations/20260915_continuous_external_surface_allowlist_and_canary.sql',
  'scripts/one-off/continuous-external-surface-001-seed-canary.mjs',
  'scripts/modules/handoff/pre-checks/pending-migrations-check.js',
  'scripts/apply-migration.js',
];

// Any of these, immediately followed (allowing whitespace/newlines) by the table name,
// constitutes a write against the allowlist table.
const WRITE_PATTERNS = [
  /insert\s+into\s+public\.public_read_allowlist/i,
  /\.from\(\s*['"]public_read_allowlist['"]\s*\)\s*\.\s*(insert|upsert|update|delete)/i,
  /update\s+public\.public_read_allowlist/i,
];

describe('public_read_allowlist zero-write (TS-3)', () => {
  for (const relPath of FILES_TO_SCAN) {
    it(`${relPath} contains no write against public_read_allowlist`, () => {
      const content = readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
      for (const pattern of WRITE_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    });
  }
});
