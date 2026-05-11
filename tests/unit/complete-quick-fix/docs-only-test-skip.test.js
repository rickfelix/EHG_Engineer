/**
 * QF-20260511-365 — docs-only test-skip helpers
 *
 * Closes feedback 869f7cf3-ce8d-4218-a2e4-9c56d5a8067c: complete-quick-fix
 * orchestrator was running the full unit+e2e suite for docs-only QFs, surfacing
 * pre-existing baseline failures unrelated to the QF and burning a bypass-quota
 * slot per ship.
 *
 * These tests pin the pure-helper contract that the orchestrator uses to decide
 * whether the test-run block can be safely skipped.
 */

import { describe, it, expect } from 'vitest';
import {
  isDocsOnlyPath,
  isDocsOnlyDiff,
} from '../../../scripts/modules/complete-quick-fix/git-operations.js';

describe('isDocsOnlyPath', () => {
  it('classifies markdown variants as docs', () => {
    expect(isDocsOnlyPath('CLAUDE.md')).toBe(true);
    expect(isDocsOnlyPath('notes.markdown')).toBe(true);
    expect(isDocsOnlyPath('docs/getting-started.md')).toBe(true);
  });

  it('classifies common doc filenames without extension', () => {
    expect(isDocsOnlyPath('README')).toBe(true);
    expect(isDocsOnlyPath('LICENSE')).toBe(true);
    expect(isDocsOnlyPath('LICENCE')).toBe(true);
    expect(isDocsOnlyPath('CHANGELOG')).toBe(true);
    expect(isDocsOnlyPath('CONTRIBUTING')).toBe(true);
    expect(isDocsOnlyPath('NOTICE')).toBe(true);
    expect(isDocsOnlyPath('subdir/README.md')).toBe(true);
  });

  it('classifies anything under docs/ as docs (case-insensitive)', () => {
    expect(isDocsOnlyPath('docs/anything/at/all.json')).toBe(true);
    expect(isDocsOnlyPath('Docs/Mixed.YAML')).toBe(true);
  });

  it('classifies rst/adoc/txt as docs', () => {
    expect(isDocsOnlyPath('NOTES.rst')).toBe(true);
    expect(isDocsOnlyPath('manual.adoc')).toBe(true);
    expect(isDocsOnlyPath('release-notes.txt')).toBe(true);
  });

  it('rejects source files', () => {
    expect(isDocsOnlyPath('src/index.js')).toBe(false);
    expect(isDocsOnlyPath('scripts/foo.mjs')).toBe(false);
    expect(isDocsOnlyPath('lib/x.cjs')).toBe(false);
    expect(isDocsOnlyPath('a.ts')).toBe(false);
    expect(isDocsOnlyPath('component.tsx')).toBe(false);
  });

  it('rejects configuration and metadata files at repo root', () => {
    expect(isDocsOnlyPath('package.json')).toBe(false);
    expect(isDocsOnlyPath('.github/workflows/ci.yml')).toBe(false);
    expect(isDocsOnlyPath('tsconfig.json')).toBe(false);
    expect(isDocsOnlyPath('vitest.config.ts')).toBe(false);
  });

  it('normalizes Windows-style separators', () => {
    expect(isDocsOnlyPath('docs\\guide\\setup.md')).toBe(true);
    expect(isDocsOnlyPath('src\\index.js')).toBe(false);
  });

  it('returns false for empty or non-string input', () => {
    expect(isDocsOnlyPath('')).toBe(false);
    expect(isDocsOnlyPath(null)).toBe(false);
    expect(isDocsOnlyPath(undefined)).toBe(false);
    expect(isDocsOnlyPath(42)).toBe(false);
  });
});

describe('isDocsOnlyDiff', () => {
  it('returns true when every file is a docs path', () => {
    expect(isDocsOnlyDiff(['README.md', 'docs/x.md', 'CHANGELOG'])).toBe(true);
  });

  it('returns false when ANY file is source', () => {
    expect(isDocsOnlyDiff(['README.md', 'src/index.js'])).toBe(false);
    expect(isDocsOnlyDiff(['docs/x.md', 'package.json'])).toBe(false);
  });

  it('returns false for empty / non-array input (no diff → cannot prove docs-only)', () => {
    expect(isDocsOnlyDiff([])).toBe(false);
    expect(isDocsOnlyDiff(null)).toBe(false);
    expect(isDocsOnlyDiff(undefined)).toBe(false);
    expect(isDocsOnlyDiff('docs/x.md')).toBe(false);
  });

  it('handles single docs file', () => {
    expect(isDocsOnlyDiff(['CLAUDE.md'])).toBe(true);
  });
});
