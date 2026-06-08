// Tests for SD-FDBK-INFRA-SYSTEMIC-CROSS-REPO-001 — the CROSS_REPO_STAGE_CONFIG_DRIFT gate.
// Proves: scoped-block (only a stage-config-relevant SD's real drift blocks), WARN on unrelated
// pre-existing drift, FAIL-OPEN on execution error, and the relevance fail-safe.

import { describe, it, expect } from 'vitest';
import {
  GATE_NAME,
  classifyCheckOutput,
  decideVerdict,
  isStageConfigRelevant,
  createCrossRepoStageConfigDriftGate,
} from './cross-repo-stage-config-drift.js';

describe('classifyCheckOutput', () => {
  it('exit 0 → in sync (no drift, no error)', () => {
    expect(classifyCheckOutput(0, 'CHECK PASSED: ... in sync.')).toEqual({ driftDetected: false, executionError: false });
  });
  it('exit 1 with "out of date" → real drift', () => {
    expect(classifyCheckOutput(1, 'CHECK FAILED: venture-workflow.ts is out of date vs venture_stages')).toEqual({ driftDetected: true, executionError: false });
  });
  it('exit 1 with "byte-parity" → real drift', () => {
    expect(classifyCheckOutput(1, 'CHECK FAILED: venture-workflow.ts ... (byte-parity broken). Run ...')).toEqual({ driftDetected: true, executionError: false });
  });
  it('exit 1 with a thrown DB error → execution error (fail-open)', () => {
    expect(classifyCheckOutput(1, 'Error: supabaseUrl is required\n  at ...')).toEqual({ driftDetected: false, executionError: true });
  });
  it('non-zero with no recognizable drift message → execution error', () => {
    expect(classifyCheckOutput(127, 'command not found')).toEqual({ driftDetected: false, executionError: true });
  });
});

describe('decideVerdict', () => {
  it('execution error → FAIL_OPEN (pass)', () => {
    const v = decideVerdict({ relevant: true, driftDetected: true, siblingUncommitted: true, executionError: true });
    expect(v.passed).toBe(true);
    expect(v.outcome).toBe('FAIL_OPEN');
  });
  it('drift + relevant → BLOCK (fail)', () => {
    const v = decideVerdict({ relevant: true, driftDetected: true, siblingUncommitted: false, executionError: false });
    expect(v.passed).toBe(false);
    expect(v.outcome).toBe('BLOCK');
  });
  it('sibling uncommitted + relevant → BLOCK (fail)', () => {
    const v = decideVerdict({ relevant: true, driftDetected: false, siblingUncommitted: true, executionError: false });
    expect(v.passed).toBe(false);
    expect(v.outcome).toBe('BLOCK');
  });
  it('drift + NOT relevant → WARN (pass)', () => {
    const v = decideVerdict({ relevant: false, driftDetected: true, siblingUncommitted: false, executionError: false });
    expect(v.passed).toBe(true);
    expect(v.outcome).toBe('WARN');
  });
  it('no drift → clean PASS', () => {
    const v = decideVerdict({ relevant: true, driftDetected: false, siblingUncommitted: false, executionError: false });
    expect(v.passed).toBe(true);
    expect(v.outcome).toBe('PASS');
  });
});

describe('isStageConfigRelevant', () => {
  const noMig = () => null;
  it('a changed SSOT input file (the generator) → relevant', () => {
    expect(isStageConfigRelevant(['scripts/generate-stage-config.cjs', 'README.md'], noMig)).toBe(true);
  });
  it('a changed stage-config artifact → relevant', () => {
    expect(isStageConfigRelevant(['lib/proving-companion/stage-config.js'], noMig)).toBe(true);
  });
  it('a migration whose body references venture_stages → relevant', () => {
    const read = (f) => (f.endsWith('20260601_x.sql') ? 'ALTER TABLE venture_stages ADD COLUMN foo text;' : null);
    expect(isStageConfigRelevant(['database/migrations/20260601_x.sql'], read)).toBe(true);
  });
  it('a migration NOT referencing venture_stages → not relevant', () => {
    const read = () => 'ALTER TABLE other_table ADD COLUMN bar text;';
    expect(isStageConfigRelevant(['database/migrations/20260601_y.sql'], read)).toBe(false);
  });
  it('unrelated files → not relevant', () => {
    expect(isStageConfigRelevant(['src/components/Foo.tsx', 'docs/x.md'], noMig)).toBe(false);
  });
  it('a migration read that throws is swallowed (not relevant on its own)', () => {
    const read = () => { throw new Error('ENOENT'); };
    expect(isStageConfigRelevant(['database/migrations/20260601_z.sql'], read)).toBe(false);
  });
});

// ---- gate validator via injected deps -------------------------------------------------------

function makeGate(over = {}) {
  const deps = {
    gitRoot: () => '/repo',
    changedFiles: () => over.changedFiles ?? [],
    resolveSibling: () => '/repo/../ehg',
    runCheck: () => over.runCheck ?? { exitCode: 0, output: 'CHECK PASSED' },
    siblingStatus: () => over.siblingStatus ?? { present: true, uncommitted: false },
    readMigration: () => over.migrationBody ?? null,
  };
  // allow function-valued overrides (e.g. changedFiles that throws)
  if (typeof over.changedFiles === 'function') deps.changedFiles = over.changedFiles;
  if (typeof over.runCheck === 'function') deps.runCheck = over.runCheck;
  if (typeof over.siblingStatus === 'function') deps.siblingStatus = over.siblingStatus;
  return createCrossRepoStageConfigDriftGate({}, deps);
}

describe('createCrossRepoStageConfigDriftGate validator', () => {
  it('exposes the canonical gate name and is required', () => {
    const g = makeGate();
    expect(g.name).toBe(GATE_NAME);
    expect(g.name).toBe('CROSS_REPO_STAGE_CONFIG_DRIFT');
    expect(g.required).toBe(true);
  });

  it('relevant SD + real drift → BLOCK (passed:false, remediation present)', async () => {
    const g = makeGate({
      changedFiles: ['scripts/generate-stage-config.cjs'],
      runCheck: { exitCode: 1, output: 'CHECK FAILED: venture-workflow.ts is out of date vs venture_stages' },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.issues[0]).toContain(GATE_NAME);
    expect(r.remediation).toMatch(/venture-stages:generate|venture-workflow\.ts/);
    expect(r.details.outcome).toBe('BLOCK');
  });

  it('UNRELATED SD + drift → WARN (passed:true, warning, no remediation)', async () => {
    const g = makeGate({
      changedFiles: ['src/components/Foo.tsx'],
      runCheck: { exitCode: 1, output: 'CHECK FAILED: venture-workflow.ts is out of date vs venture_stages' },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(true);
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain('WARN');
    expect(r.remediation).toBeUndefined();
    expect(r.details.outcome).toBe('WARN');
  });

  it('relevant SD + sibling uncommitted (check clean) → BLOCK', async () => {
    const g = makeGate({
      changedFiles: ['lib/proving-companion/stage-config.js'],
      runCheck: { exitCode: 0, output: 'CHECK PASSED' },
      siblingStatus: { present: true, uncommitted: true },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(false);
    expect(r.details.outcome).toBe('BLOCK');
    expect(r.details.sibling_uncommitted).toBe(true);
  });

  it('execution error (check throws DB error) → FAIL-OPEN (passed:true + warning)', async () => {
    const g = makeGate({
      changedFiles: ['scripts/generate-stage-config.cjs'],
      runCheck: { exitCode: 1, output: 'Error: supabaseUrl is required' },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(true);
    expect(r.details.outcome).toBe('FAIL_OPEN');
    expect(r.warnings[0]).toContain('FAIL_OPEN');
  });

  it('sibling repo absent AND no positive drift → FAIL-OPEN', async () => {
    const g = makeGate({
      changedFiles: ['scripts/generate-stage-config.cjs'],
      runCheck: { exitCode: 0, output: 'CHECK PASSED' },
      siblingStatus: { present: false, uncommitted: false },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(true);
    expect(r.details.outcome).toBe('FAIL_OPEN');
  });

  it('relevance detection error → treated as RELEVANT (must-fix #1: no silent downgrade)', async () => {
    const g = makeGate({
      changedFiles: () => { throw new Error('git diff failed'); },
      runCheck: { exitCode: 1, output: 'CHECK FAILED: byte-parity broken' },
    });
    const r = await g.validator({});
    expect(r.details.relevant).toBe(true);
    expect(r.passed).toBe(false); // real drift + forced-relevant → BLOCK, not WARN
    expect(r.details.outcome).toBe('BLOCK');
  });

  it('clean (in sync, sibling committed) → PASS with no warnings/issues', async () => {
    const g = makeGate({
      changedFiles: ['scripts/generate-stage-config.cjs'],
      runCheck: { exitCode: 0, output: 'CHECK PASSED' },
      siblingStatus: { present: true, uncommitted: false },
    });
    const r = await g.validator({});
    expect(r.passed).toBe(true);
    expect(r.outcome).toBeUndefined();
    expect(r.details.outcome).toBe('PASS');
    expect(r.issues).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});
