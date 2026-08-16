/**
 * SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-4). Pure function, zero I/O, zero Supabase mocking —
 * per testing-agent's explicit recommendation: avoid the source-pin regex style of the sibling
 * issue-knowledge-base-proven-solutions-guard.test.js.
 */
import { describe, it, expect } from 'vitest';
import { evaluateQuarantineRefusal, normalizeTestPath, loadQuarantineManifest } from '../../../lib/learning/quarantine-refusal.js';

const MANIFEST = [
  { file: 'scripts/lib/branch-resolver.test.js' },
  { file: 'tests/unit/some/nested/path.test.js' },
];

describe('normalizeTestPath', () => {
  it('converts win32 backslashes to forward slashes', () => {
    expect(normalizeTestPath('scripts\\lib\\branch-resolver.test.js')).toBe('scripts/lib/branch-resolver.test.js');
  });
  it('strips a leading ./', () => {
    expect(normalizeTestPath('./scripts/lib/branch-resolver.test.js')).toBe('scripts/lib/branch-resolver.test.js');
  });
  it('returns null for non-string / empty input', () => {
    expect(normalizeTestPath(null)).toBeNull();
    expect(normalizeTestPath(undefined)).toBeNull();
    expect(normalizeTestPath('')).toBeNull();
    expect(normalizeTestPath(42)).toBeNull();
  });
});

describe('evaluateQuarantineRefusal', () => {
  it('TS-5: positive case — a quarantined path is refused with a recorded reason', () => {
    const result = evaluateQuarantineRefusal({
      targetTestPaths: ['scripts/lib/branch-resolver.test.js'],
      manifest: MANIFEST,
    });
    expect(result.refused).toBe(true);
    expect(result.matchedPath).toBe('scripts/lib/branch-resolver.test.js');
    expect(result.reason).toContain('scripts/lib/branch-resolver.test.js');
    expect(result.reason).toContain('quarantine-manifest.json');
  });

  it('TS-6: negative fence — a non-quarantined path is never refused', () => {
    const result = evaluateQuarantineRefusal({
      targetTestPaths: ['tests/unit/some-unrelated.test.js'],
      manifest: MANIFEST,
    });
    expect(result.refused).toBe(false);
    expect(result.reason).toBeNull();
    expect(result.matchedPath).toBeNull();
  });

  it('TS-7: win32-style targetTestPaths match POSIX-style manifest entries', () => {
    const result = evaluateQuarantineRefusal({
      targetTestPaths: ['scripts\\lib\\branch-resolver.test.js'],
      manifest: MANIFEST,
    });
    expect(result.refused).toBe(true);
    expect(result.matchedPath).toBe('scripts/lib/branch-resolver.test.js');
  });

  it('absent/empty targetTestPaths never refuses — absence of evidence is not evidence of absence', () => {
    expect(evaluateQuarantineRefusal({ targetTestPaths: [], manifest: MANIFEST }).refused).toBe(false);
    expect(evaluateQuarantineRefusal({ manifest: MANIFEST }).refused).toBe(false);
    expect(evaluateQuarantineRefusal({}).refused).toBe(false);
  });

  it('a match anywhere in a multi-path array is caught, not just the first entry', () => {
    const result = evaluateQuarantineRefusal({
      targetTestPaths: ['tests/unit/unrelated.test.js', 'tests/unit/some/nested/path.test.js'],
      manifest: MANIFEST,
    });
    expect(result.refused).toBe(true);
    expect(result.matchedPath).toBe('tests/unit/some/nested/path.test.js');
  });

  it('a malformed manifest (not an array) is treated as empty, never as "everything matches"', () => {
    const result = evaluateQuarantineRefusal({
      targetTestPaths: ['scripts/lib/branch-resolver.test.js'],
      manifest: null,
    });
    expect(result.refused).toBe(false);
  });
});

describe('loadQuarantineManifest', () => {
  it('fails LOUD on a missing manifest file — never silently returns []', () => {
    expect(() => loadQuarantineManifest('/no/such/path/quarantine-manifest.json')).toThrow(/could not read/);
  });

  it('loads the real repo manifest as a non-empty array', () => {
    const manifest = loadQuarantineManifest();
    expect(Array.isArray(manifest)).toBe(true);
    expect(manifest.length).toBeGreaterThan(0);
    expect(typeof manifest[0].file).toBe('string');
  });
});
