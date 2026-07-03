// SD-LEO-INFRA-WORKER-CLAIM-TIME-001 (FR-1/FR-2/FR-5/FR-6) — claim-time fitness gate tests.
// Hermetic: no live DB, no real filesystem (cwd + preconditionProbe injected). Validates the
// predicate (incl. FAIL-OPEN), the backward-compatible claim-eligibility extension, and the
// propose-only triage.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isSdExecutableHere, normalizeAppName, appOfCwd } = require('../../../lib/fleet/sd-executable-here.cjs');
const { classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');
const { proposeUnfitDecomposition } = require('../../../lib/fleet/unfit-triage.cjs');

const ENGINEER_CWD = 'C:/Users/x/Projects/_EHG/EHG_Engineer/.worktrees/SD-FOO-001';

describe('appOfCwd / normalizeAppName', () => {
  it('strips the worktree suffix and normalizes the repo-root basename', () => {
    expect(appOfCwd(ENGINEER_CWD)).toBe('ehgengineer');
    expect(appOfCwd('/home/u/ehg')).toBe('ehg');
    expect(appOfCwd('')).toBe(''); // indeterminate
  });
  it('normalizeAppName matches the repo-paths rule', () => {
    expect(normalizeAppName('EHG_Engineer')).toBe('ehgengineer');
    expect(normalizeAppName('EHG')).toBe('ehg');
    expect(normalizeAppName(null)).toBe('');
  });
});

describe('isSdExecutableHere (FR-1)', () => {
  const ctx = { cwd: ENGINEER_CWD };

  it('fit: target matches checkout, open premise, no preconditions', () => {
    const v = isSdExecutableHere({ sd_key: 'SD-A', target_application: 'EHG_Engineer', status: 'draft' }, ctx);
    expect(v).toEqual({ fit: true, blockClass: null, reasons: [] });
  });

  it('repo_mismatch: SD targets a different app than the checkout', () => {
    const v = isSdExecutableHere({ sd_key: 'SD-E', target_application: 'ehg', status: 'draft' }, ctx);
    expect(v.fit).toBe(false);
    expect(v.blockClass).toBe('repo_mismatch');
  });

  // QF-20260703-775: a bare shared-root cwd (no /.worktrees/<sd> segment) has no committed
  // per-SD context — this is exactly what an idle worker's checkin runs from, and every directed
  // WORK_ASSIGNMENT for a venture/cross-repo target SD was unconditionally rejected before this
  // fix. repo-match should only apply once the caller is actually checked into a specific worktree.
  it('bare shared-root cwd (idle worker, no worktree segment): FIT regardless of target', () => {
    const v = isSdExecutableHere(
      { sd_key: 'SD-MARKETLENS-1', target_application: 'MarketLens', status: 'draft' },
      { cwd: 'C:/Users/x/Projects/_EHG/EHG_Engineer' }
    );
    expect(v).toEqual({ fit: true, blockClass: null, reasons: [] });
  });

  it('repo_mismatch still applies once checked into a specific (wrong-app) worktree', () => {
    const v = isSdExecutableHere(
      { sd_key: 'SD-MARKETLENS-1', target_application: 'MarketLens', status: 'draft' },
      { cwd: 'C:/Users/x/Projects/_EHG/EHG_Engineer/.worktrees/qf/QF-999' }
    );
    expect(v.fit).toBe(false);
    expect(v.blockClass).toBe('repo_mismatch');
  });

  it('absent/ambiguous target => FIT (no constraint; fail-open)', () => {
    expect(isSdExecutableHere({ sd_key: 'SD-N', status: 'draft' }, ctx).fit).toBe(true);
    expect(isSdExecutableHere({ sd_key: 'SD-N', target_application: '', status: 'draft' }, ctx).fit).toBe(true);
    // indeterminate current app (a rootless cwd resolves to no app name) => skip repo check => fit
    expect(isSdExecutableHere({ sd_key: 'SD-N', target_application: 'ehg', status: 'draft' }, { cwd: '/' }).fit).toBe(true);
  });

  it('premise_closed: terminal status or superseded/released/handled metadata', () => {
    expect(isSdExecutableHere({ sd_key: 'SD-C', status: 'completed' }, ctx).blockClass).toBe('premise_closed');
    expect(isSdExecutableHere({ sd_key: 'SD-C', status: 'cancelled' }, ctx).blockClass).toBe('premise_closed');
    expect(isSdExecutableHere({ sd_key: 'SD-C', status: 'draft', metadata: { released: true } }, ctx).blockClass).toBe('premise_closed');
    expect(isSdExecutableHere({ sd_key: 'SD-C', status: 'draft', metadata: { superseded: true } }, ctx).blockClass).toBe('premise_closed');
  });

  it('missing_precondition: a declared input precondition is unmet (injected probe)', () => {
    const sd = { sd_key: 'SD-P', target_application: 'EHG_Engineer', status: 'draft', metadata: { preconditions: [{ type: 'file', path: 'data/ledger.json' }] } };
    const unmet = isSdExecutableHere(sd, { ...ctx, preconditionProbe: () => false });
    expect(unmet.blockClass).toBe('missing_precondition');
    const met = isSdExecutableHere(sd, { ...ctx, preconditionProbe: () => true });
    expect(met.fit).toBe(true);
  });

  it('FAILS OPEN: a probe that throws => fit (a fitness fault never blocks)', () => {
    const sd = { sd_key: 'SD-P', target_application: 'EHG_Engineer', status: 'draft', metadata: { preconditions: [{ type: 'file', path: 'x' }] } };
    const v = isSdExecutableHere(sd, { ...ctx, preconditionProbe: () => { throw new Error('boom'); } });
    expect(v.fit).toBe(true);
  });

  it('FAILS OPEN: garbage input never throws', () => {
    expect(isSdExecutableHere(null).fit).toBe(true);
    expect(isSdExecutableHere(undefined, null).fit).toBe(true);
  });

  it('premise is checked before repo (a completed EHG SD reports premise_closed, not repo_mismatch)', () => {
    const v = isSdExecutableHere({ sd_key: 'SD-X', target_application: 'ehg', status: 'completed' }, ctx);
    expect(v.blockClass).toBe('premise_closed');
  });
});

describe('classifyDispatchIneligibility (FR-2 — backward-compatible extension)', () => {
  it('without ctx: behavior is unchanged (existing axes only)', () => {
    expect(classifyDispatchIneligibility({ sd_type: 'orchestrator' })).toBe('orchestrator_parent');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-DEMO-1' })).toBe('test_fixture_key');
    expect(classifyDispatchIneligibility({ metadata: { requires_human_action: true } })).toBe('human_action_required');
    // an SD that WOULD be unfit is STILL eligible when no ctx is passed (zero regression)
    expect(classifyDispatchIneligibility({ sd_key: 'SD-E', target_application: 'ehg', status: 'draft' })).toBeNull();
  });
  it('with ctx: adds the fitness axes (unfit_<blockClass>)', () => {
    const ctx = { cwd: ENGINEER_CWD };
    expect(classifyDispatchIneligibility({ sd_key: 'SD-E', target_application: 'ehg', status: 'draft' }, ctx)).toBe('unfit_repo_mismatch');
    // SD-LEO-INFRA-UNIT-TEST-DEBT-TRIAGE-001: stale assertion. A completed/cancelled SD now
    // short-circuits to the terminal-status verdict 'sd_terminal' (claim-eligibility.cjs:64,
    // added by SD-FDBK-INFRA-STALE-SESSION-SWEEP-001) BEFORE the ctx/fitness axes — so a completed
    // SD is classified terminal, not by a fitness blockClass. Updated test to the current behavior.
    expect(classifyDispatchIneligibility({ sd_key: 'SD-C', status: 'completed' }, ctx)).toBe('sd_terminal');
    // a fit SD with ctx is still eligible
    expect(classifyDispatchIneligibility({ sd_key: 'SD-A', target_application: 'EHG_Engineer', status: 'draft' }, ctx)).toBeNull();
  });
  it('existing axes take precedence over fitness (orchestrator parent wins even with ctx)', () => {
    expect(classifyDispatchIneligibility({ sd_type: 'orchestrator', target_application: 'ehg' }, { cwd: ENGINEER_CWD })).toBe('orchestrator_parent');
  });
});

describe('proposeUnfitDecomposition (FR-5 — propose-only)', () => {
  it('partial block (missing_precondition): proposes a code child + a blocked run child', () => {
    const out = proposeUnfitDecomposition(
      { sd_key: 'SD-RUN-001', title: 'Extract X' },
      { blockClass: 'missing_precondition', reasons: ['precondition unmet: ledger.json'] }
    );
    expect(out.propose).toBe(true);
    expect(out.parent).toBe('SD-RUN-001');
    expect(out.children.map((c) => c.role)).toEqual(['code', 'run']);
    expect(out.children[0].blocked).toBe(false);
    expect(out.children[1].blocked).toBe(true);
    expect(out.signal).toMatch(/worker-signal\.cjs unfit .*--block-class missing_precondition/);
  });
  it('whole-SD reroute (repo_mismatch / premise_closed): propose:false (no split)', () => {
    expect(proposeUnfitDecomposition({ sd_key: 'SD-E' }, { blockClass: 'repo_mismatch' }).propose).toBe(false);
    expect(proposeUnfitDecomposition({ sd_key: 'SD-C' }, { blockClass: 'premise_closed' }).propose).toBe(false);
    expect(proposeUnfitDecomposition({ sd_key: 'SD-N' }, {}).propose).toBe(false);
  });
});
