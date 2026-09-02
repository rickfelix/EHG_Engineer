/**
 * QF-20260901-962 — doc-health-report.js's metadata/duplication sub-checks crashed on every
 * scheduled run (0%/NaN%) rather than returning counts, because runValidationScript's JSON
 * extraction only recognized the `--- JSON RESULTS ---` marker (validate-doc-links.js), which
 * validate-doc-metadata.js and detect-duplicate-docs.js never print, AND their field-mapping
 * (result.valid/result.missing, result.exactFilename/result.totalFiles) never matched either
 * script's real report shape. These tests cover the fixed JSON extraction, the corrected field
 * mapping, and the overall-score exclusion of unverified metrics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
const { execSync } = await import('child_process');
const {
  extractJson,
  calculateCompletenessScore,
  calculateDuplicationScore,
  calculateOverallScore,
} = await import('../../scripts/doc-health-report.js');

describe('extractJson', () => {
  it('parses JSON after the marker (validate-doc-links.js shape)', () => {
    expect(extractJson('some noise\n--- JSON RESULTS ---\n{"summary":{"totalLinks":5}}')).toEqual({
      summary: { totalLinks: 5 },
    });
  });

  it('parses bare JSON with no marker (validate-doc-metadata.js / detect-duplicate-docs.js shape)', () => {
    expect(extractJson('{"summary":{"valid":1,"invalid":2}}')).toEqual({ summary: { valid: 1, invalid: 2 } });
  });

  it('trims trailing non-JSON noise after the last valid closing brace', () => {
    expect(extractJson('{"a":1}\nWarning: something printed after')).toEqual({ a: 1 });
  });

  it('returns null when nothing parseable is present (a genuine crash/timeout)', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson('not json at all')).toBeNull();
  });
});

describe('calculateCompletenessScore', () => {
  beforeEach(() => execSync.mockReset());

  it('computes a real score from the report.summary shape (previously read result.valid/result.missing, which never existed)', () => {
    execSync.mockReturnValue(JSON.stringify({ summary: { total: 10, valid: 4, invalid: 6, skipped: 0 } }));
    const result = calculateCompletenessScore();
    expect(result.score).toBe(40);
    expect(result.details).toEqual({ withMetadata: 4, missingMetadata: 6, totalFiles: 10 });
    expect(result.details.unverified).toBeUndefined();
  });

  it('marks unverified (not score:0-and-hidden) when the child prints nothing parseable (crash/wrong-flag/timeout partial output)', () => {
    execSync.mockReturnValue('not json at all');
    const result = calculateCompletenessScore();
    expect(result.details.unverified).toBe(true);
  });
});

describe('calculateDuplicationScore', () => {
  beforeEach(() => execSync.mockReset());

  it('counts filename-method duplicates from the real { stats, duplicates } shape (previously read result.exactFilename/result.totalFiles, which never existed)', () => {
    execSync.mockReturnValue(JSON.stringify({
      stats: { files_scanned: 100 },
      duplicates: [{ method: 'filename' }, { method: 'keyword' }, { method: 'filename' }],
    }));
    const result = calculateDuplicationScore();
    expect(result.details.duplicateGroups).toBe(2);
    expect(result.details.fuzzyMatches).toBe(1);
    expect(result.details.totalFiles).toBe(100);
    expect(result.details.unverified).toBeUndefined();
  });

  it('marks unverified with duplicateRate:0 (never NaN) when the child prints nothing parseable (timeout/crash)', () => {
    execSync.mockReturnValue('');
    const result = calculateDuplicationScore();
    expect(result.details.unverified).toBe(true);
    expect(result.details.duplicateRate).toBe(0);
    expect(Number.isNaN(100 - result.details.duplicateRate)).toBe(false);
  });
});

describe('calculateOverallScore', () => {
  it('excludes unverified metrics from both the weighted sum and the denominator', () => {
    const metrics = {
      organization: { score: 40, details: {} },
      completeness: { score: 2, details: {} },
      freshness: { score: 100, details: {} },
      linkHealth: { score: 100, details: {} },
      duplication: { score: 100, details: { unverified: true } },
      subCategorization: { score: 75, details: {} },
    };
    // weighted over the 90% remaining weight (duplication's 10% excluded), not 100%
    expect(calculateOverallScore(metrics)).toBe(61);
  });

  it('a fully-measured set behaves exactly as before (no metric excluded)', () => {
    const metrics = {
      organization: { score: 100, details: {} },
      completeness: { score: 100, details: {} },
      freshness: { score: 100, details: {} },
      linkHealth: { score: 100, details: {} },
      duplication: { score: 100, details: {} },
      subCategorization: { score: 100, details: {} },
    };
    expect(calculateOverallScore(metrics)).toBe(100);
  });
});
