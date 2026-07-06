import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseRevisitTags, evaluateTag, detectExpiredPremises, TAG_REGEX } from '../../../lib/governance/revisit-tags.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const NOW = new Date('2026-07-06T00:00:00Z');

describe('REVISIT-IF tag grammar (TS-2)', () => {
  it('round-trips a full tag to {condition, owner, provenance, note}', () => {
    const tags = parseRevisitTags(
      '// REVISIT-IF(expires=2026-07-15) owner=coordinator provenance=SD-X-001 note=cutover premise\nconst x = 1;\n',
      'a.js'
    );
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({
      condition: 'expires=2026-07-15', owner: 'coordinator', provenance: 'SD-X-001',
      note: 'cutover premise', orphaned: false, line: 1,
    });
  });

  it('parses hash-comment and note-less forms', () => {
    const tags = parseRevisitTags('# REVISIT-IF(condition=gemini-3.5 GA) owner=adam provenance=QF-123\nx=1\n', 'b.sh');
    expect(tags[0]).toMatchObject({ condition: 'condition=gemini-3.5 GA', owner: 'adam', provenance: 'QF-123', note: null });
  });

  it('rejects a malformed tag (missing provenance) as malformed, not silently dropped', () => {
    const tags = parseRevisitTags('// REVISIT-IF(expires=2026-01-01) owner=coordinator\ncode();\n', 'c.js');
    expect(tags).toHaveLength(1);
    expect(tags[0].malformed).toBe(true);
    expect(evaluateTag(tags[0], NOW).status).toBe('malformed');
  });

  it('parses CRLF-ending lines (JS `.` never matches \\r — regression pin)', () => {
    const tags = parseRevisitTags('// REVISIT-IF(expires=2026-07-12) owner=coordinator provenance=SD-X-001 note=cutover shim\r\nconst x = 1;\r\n', 'crlf.cjs');
    expect(tags).toHaveLength(1);
    expect(tags[0].malformed).toBeUndefined();
    expect(tags[0]).toMatchObject({ condition: 'expires=2026-07-12', note: 'cutover shim', orphaned: false });
  });

  it('prose/docstring mentions never parse as tag attempts', () => {
    const tags = parseRevisitTags(' *   // REVISIT-IF(expires=2026-01-01) owner=o provenance=p (docstring example)\n * Grammar: `REVISIT-IF(<c>) owner=<o> provenance=<p>`\nconst s = "REVISIT-IF(";\n', 'doc.js');
    expect(tags).toHaveLength(0);
  });

  it('TAG_REGEX matches the documented grammar exactly', () => {
    expect('REVISIT-IF(expires=2026-01-01) owner=o provenance=p note=n'.match(TAG_REGEX)).toBeTruthy();
    expect('REVISIT-IF() owner=o provenance=p'.match(TAG_REGEX)).toBeFalsy();
  });
});

describe('expiry evaluation', () => {
  const base = { condition: '', owner: 'o', provenance: 'p', orphaned: false };
  it('fires expired for a past expires= date', () => {
    expect(evaluateTag({ ...base, condition: 'expires=2026-01-01' }, NOW).status).toBe('expired');
  });
  it('healthy for a future expires= date', () => {
    expect(evaluateTag({ ...base, condition: 'expires=2099-12-31' }, NOW).status).toBe('healthy');
  });
  it('non-evaluable for free-text conditions (inventoried, never auto-fired)', () => {
    expect(evaluateTag({ ...base, condition: 'condition=model lineup changes' }, NOW).status).toBe('non_evaluable');
  });
  it('orphaned when no code follows the tag', () => {
    const tags = parseRevisitTags('// REVISIT-IF(expires=2099-12-31) owner=o provenance=p\n\n', 'd.js');
    expect(tags[0].orphaned).toBe(true);
    expect(evaluateTag(tags[0], NOW).status).toBe('orphaned');
  });
});

describe('gauge registry adoption (TS-3, RISK R7a: never a standalone)', () => {
  it('GAUGE_REGISTRY carries the enabled expired-premise-tags entry', async () => {
    const { GAUGE_REGISTRY } = await import('../../../lib/governance/gauge-registry.js');
    const entry = GAUGE_REGISTRY.find((g) => g.id === 'expired-premise-tags');
    expect(entry).toBeTruthy();
    expect(entry.enabled).toBe(true);
    expect(entry.detectorFn).toBe('expired-premise-tags');
    expect(entry.thresholdConfig.tripWhen({ count: 1 })).toBe(true);
    expect(entry.thresholdConfig.tripWhen({ count: 0 })).toBe(false);
  });

  it('gauge-runner resolver map wires the detector (source pin)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(join(REPO_ROOT, 'scripts', 'gauge-runner.mjs'), 'utf8');
    expect(src).toContain("'expired-premise-tags': async () => detectExpiredPremises(");
    expect(src).toContain("import { detectExpiredPremises } from '../lib/governance/revisit-tags.js'");
  });
});

describe('detectExpiredPremises both directions (TS-3)', () => {
  it('MISS: fires on the planted expired fixture when fixtures are opted in', () => {
    const result = detectExpiredPremises(REPO_ROOT, { now: NOW, scanDirs: ['tests/fixtures/revisit-tags'], includeFixtures: true });
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.expired.some((t) => t.file.endsWith('expired-fixture.js') && t.expired_on === '2026-01-01')).toBe(true);
    expect(result.healthy).toBeGreaterThanOrEqual(1); // the planted healthy tag stays quiet
  });

  it('PASS: the default scan (fixtures excluded) never counts the planted fixture', () => {
    const result = detectExpiredPremises(REPO_ROOT, { now: NOW });
    expect(result.expired.some((t) => t.file.includes('fixtures'))).toBe(false);
  });

  it('detector returns the gauge-runner contract shape { count, ... }', () => {
    const result = detectExpiredPremises(REPO_ROOT, { now: NOW, scanDirs: ['tests/fixtures/revisit-tags'], includeFixtures: true });
    for (const key of ['count', 'expired', 'orphaned', 'malformed', 'non_evaluable_inventory', 'healthy', 'total_tags', 'scanned_files']) {
      expect(result).toHaveProperty(key);
    }
  });
});
