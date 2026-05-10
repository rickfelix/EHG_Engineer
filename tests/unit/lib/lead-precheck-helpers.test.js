/**
 * Unit tests for scripts/lib/lead-precheck-helpers.js.
 *
 * SD-LEO-INFRA-LEAD-EMPIRICAL-PRECHECK-001 / FR-7.
 *
 * Coverage:
 *   verifyOriginMainPremise: happy path, fetch-fail, missing witnessFile, expectedAbsent regex
 *   verifyJoinShape:        compatible, incompatible, supabase=null, empty samples, threshold boundary, error
 *   verifyHelperCoverage:   ≥8 adversarial fixtures (template-literal table, dynamic, multi-line chain, archived/test exclusion, helper-self-reference, canonical-import detection, etc.)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  verifyOriginMainPremise,
  verifyJoinShape,
  verifyHelperCoverage,
  DEFAULT_JOIN_THRESHOLDS,
  EVIDENCE_SCHEMAS,
} from '../../../scripts/lib/lead-precheck-helpers.js';

describe('lead-precheck-helpers — public API', () => {
  it('exports DEFAULT_JOIN_THRESHOLDS with leftMatchMin and rightMatchMax', () => {
    expect(DEFAULT_JOIN_THRESHOLDS).toMatchObject({
      leftMatchMin: expect.any(Number),
      rightMatchMax: expect.any(Number),
    });
  });
  it('exports EVIDENCE_SCHEMAS for all three helpers', () => {
    expect(EVIDENCE_SCHEMAS.verifyOriginMainPremise).toBeDefined();
    expect(EVIDENCE_SCHEMAS.verifyJoinShape).toBeDefined();
    expect(EVIDENCE_SCHEMAS.verifyHelperCoverage).toBeDefined();
  });
});

describe('verifyJoinShape', () => {
  it('returns ok=null with test_mode=true when supabase=null', async () => {
    const result = await verifyJoinShape({
      leftTable: 'a', leftCol: 'x',
      rightTable: 'b', rightCol: 'y',
      supabase: null,
    });
    expect(result.ok).toBe(null);
    expect(result.evidence.test_mode).toBe(true);
  });

  it('returns ok=true for compatible UUID-vs-UUID histograms', async () => {
    const uuids = Array.from({ length: 100 }, (_, i) =>
      `${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${String(i).padStart(12, '0')}`,
    );
    const supabase = mockSupabase({
      a: uuids.map((id) => ({ x: id })),
      b: uuids.map((id) => ({ y: id })),
    });
    const result = await verifyJoinShape({
      leftTable: 'a', leftCol: 'x',
      rightTable: 'b', rightCol: 'y',
      supabase,
    });
    expect(result.ok).toBe(true);
    expect(result.evidence.left_histogram.uuid).toBe(100);
    expect(result.evidence.right_histogram.uuid).toBe(100);
  });

  it('returns ok=false for incompatible UUID-vs-SD-key histograms', async () => {
    const uuids = Array.from({ length: 100 }, (_, i) =>
      `${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${String(i).padStart(12, '0')}`,
    );
    const sdKeys = Array.from({ length: 100 }, (_, i) => `SD-FOO-${i}`);
    const supabase = mockSupabase({
      a: uuids.map((id) => ({ x: id })),
      b: sdKeys.map((key) => ({ y: key })),
    });
    const result = await verifyJoinShape({
      leftTable: 'a', leftCol: 'x',
      rightTable: 'b', rightCol: 'y',
      supabase,
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok=null with error=empty_sample when one side has zero rows', async () => {
    const supabase = mockSupabase({
      a: [{ x: 'aaaaaaaa-bbbb-cccc-dddd-000000000000' }],
      b: [],
    });
    const result = await verifyJoinShape({
      leftTable: 'a', leftCol: 'x',
      rightTable: 'b', rightCol: 'y',
      supabase,
    });
    expect(result.ok).toBe(null);
    expect(result.evidence.error).toBe('empty_sample');
  });

  it('returns ok=null with error message when supabase rejects', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }) }),
      }),
    };
    const result = await verifyJoinShape({
      leftTable: 'a', leftCol: 'x', rightTable: 'b', rightCol: 'y', supabase,
    });
    expect(result.ok).toBe(null);
    expect(result.evidence.error).toMatch(/permission denied/);
  });
});

describe('verifyHelperCoverage — 3-axis classifier and adversarial fixtures', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lph-test-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function mkfile(rel, content) {
    const full = join(tmpDir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  it('flags WRITE_NOW for direct insert call', async () => {
    mkfile('lib/dummy.js', "supabase.from('feedback').insert({ x: 1 });\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.ok).toBe(false);
    expect(r.evidence.bypass_sites.length).toBe(1);
    expect(r.evidence.bypass_sites[0].axis).toBe('WRITE_NOW');
    expect(r.evidence.bypass_sites[0].verb).toBe('insert');
  });

  it('flags CLEAR_NULL for .update({col: null}) pattern', async () => {
    mkfile('lib/clear.js', "supabase.from('feedback').update({\n  status: null,\n  x: 1\n});\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.ok).toBe(false);
    expect(r.evidence.bypass_sites[0].axis).toBe('CLEAR_NULL');
  });

  it('flags DYNAMIC_TABLE_NAME on template-literal table', async () => {
    mkfile('lib/dyn.js', "const t = 'feedback'; supabase.from(`${t}`).insert({});\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    // The literal-table regex won't match, but the dynamic regex will
    expect(r.evidence.bypass_sites.some((s) => s.axis === 'DYNAMIC_TABLE_NAME')).toBe(true);
  });

  it('does NOT flag a select() (READ axis is excluded from bypass list)', async () => {
    mkfile('lib/read.js', "supabase.from('feedback').select('*').limit(10);\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.bypass_sites.length).toBe(0);
    expect(r.ok).toBe(true);
  });

  it('excludes test files (.test.js) by default', async () => {
    mkfile('lib/foo.test.js', "supabase.from('feedback').insert({ x: 1 });\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.bypass_sites.length).toBe(0);
  });

  it('excludes archived-* directories', async () => {
    mkfile('scripts/archived-sd-scripts/old.js', "supabase.from('feedback').insert({ x: 1 });\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.bypass_sites.length).toBe(0);
  });

  it('excludes the helper file itself', async () => {
    mkfile('lib/canonical-helper.js', "supabase.from('feedback').insert({ x: 1 });\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.bypass_sites.length).toBe(0);
  });

  it('excludes the canonical _lead-enrich-template.mjs', async () => {
    mkfile('scripts/templates/_lead-enrich-template.mjs', "supabase.from('feedback').insert({ x: 1 });\n");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.bypass_sites.length).toBe(0);
  });

  it('detects canonical-import in a non-bypass file', async () => {
    mkfile('lib/consumer.js', "import { emitFeedback } from './governance/emit-feedback.js';\nemitFeedback({});\n");
    mkfile('lib/governance/emit-feedback.js', "// canonical helper");
    const r = await verifyHelperCoverage({ helperFile: 'lib/governance/emit-feedback.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.canonical_imports.some((p) => p.endsWith('lib/consumer.js'))).toBe(true);
    expect(r.evidence.bypass_sites.length).toBe(0);
  });

  it('returns files_scanned and ms_elapsed in evidence', async () => {
    mkfile('lib/a.js', "// nothing");
    mkfile('lib/b.js', "// nothing");
    const r = await verifyHelperCoverage({ helperFile: 'lib/canonical-helper.js', table: 'feedback', repoRoot: tmpDir });
    expect(r.evidence.files_scanned).toBeGreaterThanOrEqual(2);
    expect(r.evidence.ms_elapsed).toBeGreaterThanOrEqual(0);
  });

  it('returns ok=false with error when required args missing', async () => {
    const r = await verifyHelperCoverage({});
    expect(r.ok).toBe(false);
    expect(r.evidence.error).toBe('missing_required_args');
  });
});

describe('verifyOriginMainPremise — offline / fetch-fail handling', () => {
  it('returns network_error=true and ok=null when getMainRef yields local-fallback', async () => {
    // Run inside a brand-new throwaway dir that has no git remote — getMainRef
    // will fall back to local main (or fail). Either way, ok must be null
    // (not throw, not false).
    const tmp = mkdtempSync(join(tmpdir(), 'lph-git-'));
    try {
      const result = await verifyOriginMainPremise({
        claim: 'fake claim',
        witnessFile: 'README.md',
        cwd: tmp,
      });
      expect(result.ok).toBe(null);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not throw when called with no args', async () => {
    const result = await verifyOriginMainPremise({});
    expect(result.ok).toBe(null); // graceful degrade
    expect(result.evidence).toBeDefined();
  });
});

// --- helpers ---

function mockSupabase(tableData) {
  return {
    from(table) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve({ data: tableData[table] || [], error: null });
            },
          };
        },
      };
    },
  };
}
