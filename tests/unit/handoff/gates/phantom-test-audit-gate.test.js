// Unit tests for phantom-test-audit gate
// SD-FDBK-ENH-PAT-PHANTOM-TABLE-001 / PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 CAPA-2+CAPA-3
//
// Pure-function audit tests use array fixtures (no execSync mocking).
// Gate verdict shape test uses minimal ctx + the bypass path on a known-clean repo.
// Static-pin test reads gates.js source via fs.readFileSync + regex.
// DB-touching issue_patterns test skips if SUPABASE_SERVICE_ROLE_KEY undefined.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  auditPhantomTableTests,
  PHANTOM_COMMIT_TRIGGER,
  collectAndAudit,
} from '../../../../scripts/phantom-test-audit.js';
import { createPhantomTestAuditGate } from '../../../../scripts/modules/handoff/executors/lead-final-approval/gates/phantom-test-audit-gate.js';

const ROOT_DIR = resolve(import.meta.dirname || __dirname, '../../../..');

describe('TS-1: audit FAIL on phantom commit + orphaned test fixture (FR-1+FR-4)', () => {
  it('returns passed=false and lists orphaned test', () => {
    const result = auditPhantomTableTests({
      removedTables: new Set(['sd_validation_results']),
      changedFiles: ['src/foo.js'],
      testFiles: [
        { path: 'tests/foo.test.js', contents: "expect.from('sd_validation_results').eq('x', 1)" },
      ],
    });
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.details.orphaned_tests).toEqual([
      { table: 'sd_validation_results', testFile: 'tests/foo.test.js' },
    ]);
    expect(result.details.matched_edits).toEqual([]);
  });
});

describe('TS-2: audit early-return PASS on empty input (FR-1+FR-4)', () => {
  it('returns passed=true with no issues', () => {
    const result = auditPhantomTableTests({
      removedTables: new Set(),
      changedFiles: [],
      testFiles: [],
    });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.details.orphaned_tests).toEqual([]);
  });
});

describe('TS-2b: subject-only negative control — adjacent phantom-* subjects do NOT trigger (FR-6)', () => {
  const negativeSubjects = [
    'phantom-completion-sweep cleanup',
    'phantom worktree reap orphans',
    'phantom-detect QF-20260426',
    'NODE_MODULES_LOCK phantom protocol',
  ];
  for (const s of negativeSubjects) {
    it(`subject "${s}" does NOT match trigger`, () => {
      expect(PHANTOM_COMMIT_TRIGGER.test(s)).toBe(false);
    });
  }
});

describe('TS-2c: body content is NOT scanned for trigger (FR-6)', () => {
  it('does not match a body-style cite of the pattern', () => {
    // PHANTOM_COMMIT_TRIGGER is applied to subjects only by the gate wrapper.
    // The regex itself would match "phantom table" anywhere, but the gate
    // wrapper passes ONLY the subject (--format=%s, not %b). Pin by
    // confirming git log invocation uses subject format — surface this as a
    // source-level static-pin so a future refactor that adds %b fails the
    // test loudly.
    const src = readFileSync(resolve(ROOT_DIR, 'scripts/phantom-test-audit.js'), 'utf8');
    expect(src).toMatch(/git log\s+\$\{baseRef\}\.\.HEAD\s+--format=%s/);
    expect(src).not.toMatch(/git log[^`]*--format=%b/);
  });
});

describe('TS-3: audit PASS when phantom commit + same-PR test edit (FR-1+FR-4)', () => {
  it('returns passed=true and records matched edit', () => {
    const result = auditPhantomTableTests({
      removedTables: new Set(['sd_validation_results']),
      changedFiles: ['src/foo.js', 'tests/foo.test.js'],
      testFiles: [
        { path: 'tests/foo.test.js', contents: "expect.from('sd_validation_results').eq('x', 1)" },
      ],
    });
    expect(result.passed).toBe(true);
    expect(result.details.orphaned_tests).toEqual([]);
    expect(result.details.matched_edits).toContain('tests/foo.test.js');
  });
});

describe('TS-4: gates.js registration static-pin (FR-3+FR-4)', () => {
  const gatesJs = readFileSync(
    resolve(ROOT_DIR, 'scripts/modules/handoff/executors/lead-final-approval/gates.js'),
    'utf8',
  );

  it('imports createPhantomTestAuditGate from the gate file', () => {
    expect(gatesJs).toMatch(/import\s*\{\s*createPhantomTestAuditGate\s*\}\s*from\s*['"]\.\/gates\/phantom-test-audit-gate\.js['"]/);
  });

  it('named-re-exports createPhantomTestAuditGate', () => {
    expect(gatesJs).toMatch(/export\s*\{\s*createPhantomTestAuditGate\s*\}/);
  });

  it('pushes createPhantomTestAuditGate(supabase) into the required gates list', () => {
    expect(gatesJs).toMatch(/gates\.push\(createPhantomTestAuditGate\(supabase\)\)/);
  });

  it('includes createPhantomTestAuditGate in the default-export map', () => {
    // Default-export map is at the bottom; match the bare identifier comma-separated.
    expect(gatesJs).toMatch(/createPhantomTestAuditGate,/);
  });
});

describe('TS-5: issue_patterns row + cross-link (FR-5+FR-4, DB-touching, skip-if-no-key)', () => {
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const itOrSkip = hasKey ? it : it.skip;

  itOrSkip('PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001 row exists with metadata.related_patterns cross-link', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, category, status, metadata')
      .eq('pattern_id', 'PAT-PHANTOM-TABLE-TEST-MISALIGNMENT-001');
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data[0].category).toBe('infrastructure');
    expect(data[0].status).toBe('active');
    expect(Array.isArray(data[0].metadata?.related_patterns)).toBe(true);
    expect(data[0].metadata.related_patterns).toContain('PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001');
  });
});

describe('TS-6: gate validator returns canonical verdict shape (FR-2+FR-4)', () => {
  it('PASS path (bypass via env): returns canonical PASS shape', async () => {
    process.env.PHANTOM_TEST_AUDIT_BYPASS = '1';
    try {
      const gate = createPhantomTestAuditGate(null);
      expect(gate.name).toBe('PHANTOM_TEST_AUDIT');
      expect(typeof gate.validator).toBe('function');
      expect(gate.required).toBe(true);
      const verdict = await gate.validator({ sd: null });
      expect(verdict).toEqual({
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: expect.arrayContaining([expect.stringContaining('PHANTOM_TEST_AUDIT bypassed')]),
        details: { bypassed: true, source: expect.any(String) },
      });
    } finally {
      delete process.env.PHANTOM_TEST_AUDIT_BYPASS;
    }
  });

  it('PASS path (no trigger): returns canonical PASS shape with triggered=false', async () => {
    const gate = createPhantomTestAuditGate(null);
    const verdict = await gate.validator({ sd: null });
    // On a clean repo with no /phantom.*table|dead.*query/i subjects in
    // origin/main..HEAD, the gate early-returns. If a phantom commit IS
    // present (own SD branch), we accept PASS or FAIL but pin the SHAPE.
    expect(verdict.max_score).toBe(100);
    expect(typeof verdict.passed).toBe('boolean');
    expect(typeof verdict.score).toBe('number');
    expect(Array.isArray(verdict.issues)).toBe(true);
    expect(Array.isArray(verdict.warnings)).toBe(true);
    expect(verdict.details).toBeDefined();
  });
});
