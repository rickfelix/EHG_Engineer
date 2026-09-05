/**
 * SD-LEO-FIX-RLS-LINT-CORPUS-WIDTH-001 FR-2.
 *
 * A GitHub Actions `paths:` trigger can't import a JS module, so
 * .github/workflows/rls-anon-tenant-predicate-lint.yml's paths list and
 * scripts/lint/rls-lint-corpus-dirs.mjs's RLS_LINT_CORPUS_DIRS are two
 * hand-maintained copies of the same fact. This test is the sync mechanism:
 * it fails loudly the moment they diverge, instead of silently reproducing
 * the exact bug this SD fixes (lint-vs-pending-migrations-check.js drift).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RLS_LINT_CORPUS_DIRS } from '../../../scripts/lint/rls-lint-corpus-dirs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'rls-anon-tenant-predicate-lint.yml');

describe('rls-anon-tenant-predicate-lint.yml paths trigger stays in sync with RLS_LINT_CORPUS_DIRS', () => {
  const workflowText = readFileSync(WORKFLOW_PATH, 'utf8');

  it('has a `<dir>/**/*.sql` paths entry for every directory in RLS_LINT_CORPUS_DIRS', () => {
    for (const dir of RLS_LINT_CORPUS_DIRS) {
      expect(workflowText).toContain(`'${dir}/**/*.sql'`);
    }
  });

  it('has exactly as many `**/*.sql` path globs as RLS_LINT_CORPUS_DIRS entries (no extra, no missing)', () => {
    const sqlGlobLines = workflowText
      .split('\n')
      .filter((line) => /^\s*-\s*'.+\/\*\*\/\*\.sql'\s*$/.test(line));
    expect(sqlGlobLines).toHaveLength(RLS_LINT_CORPUS_DIRS.length);
  });
});
