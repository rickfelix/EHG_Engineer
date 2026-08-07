// SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 (FR-4 + FR-5) — acceptance, and it must be TWO-SIDED.
//
// A zero-refusal counter is trivially satisfiable by a guard that is never invoked — which is
// precisely the state this SD suspected. So asserting only "a refusal is recorded" would accept
// the broken system: a fence that never runs passes that test forever.
//
// Hence both directions are asserted together: a genuine action produces a durable record AND a
// passing evaluation increments the denominator AND a failed audit write is visible. The third is
// the one that has never been exercised in production, which is the whole subject of the SD.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { verdictFor, GUARD_REGISTRY, characterize } from '../../../scripts/guard-firing-characterization.mjs';
import { recordSweepEvaluation, sweepAuditFailures } from '../../../lib/coordinator/singleton-relaunch-trigger.js';

const require_ = createRequire(import.meta.url);
const liveness = require_('../../../lib/fleet/claimant-liveness.cjs');
const { recordRefusal, recordEvaluation, maybeFlushEvaluationCount, fenceEvaluations, auditFailures } = liveness;

const capture = () => { const rows = []; return { rows, sb: { from: () => ({ insert: async (r) => { rows.push(r); return { error: null }; } }) } }; };

beforeEach(() => {
  fenceEvaluations.evaluated = 0; fenceEvaluations.refused = 0;
  fenceEvaluations.pendingEvaluated = 0; fenceEvaluations.pendingRefused = 0;
  fenceEvaluations.lastBucket = null;
  auditFailures.claim_write_refused_claimant_not_live = 0;
  auditFailures.claim_fence_evaluated = 0;
  sweepAuditFailures.singleton_relaunch_evaluated = 0;
});

describe('FR-5: acceptance is two-sided — both the action AND the evaluation must be recorded', () => {
  it('side 1: a genuine refusal produces a durable record', async () => {
    const { rows, sb } = capture();
    await recordRefusal(sb, { session_id: 's-1', verdict: 'DEAD', reason: 'pid not running' }, { sdKey: 'SD-X' });
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('claim_write_refused_claimant_not_live');
  });

  // SIDE 2 IS THE ONE THAT MAKES SIDE 1 MEAN ANYTHING. Without it, a fence that is never invoked
  // satisfies the whole suite — the exact failure mode the SD was filed about.
  it('side 2: a PASSING evaluation increments the denominator', async () => {
    const { rows, sb } = capture();
    await maybeFlushEvaluationCount(sb, Date.parse('2026-08-03T06:00:00Z'));
    recordEvaluation(false);   // a pass — no refusal at all
    recordEvaluation(false);
    expect(fenceEvaluations.evaluated).toBe(2);
    await maybeFlushEvaluationCount(sb, Date.parse('2026-08-03T07:00:00Z'));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.evaluated).toBe(2);
    expect(rows[0].payload.refused).toBe(0);   // fired zero times, and that is now READABLE
  });

  it('side 3: an audit-write FAILURE is visible, not swallowed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const bad = { from: () => ({ insert: async () => { throw new Error('permission denied'); } }) };
      await recordRefusal(bad, { session_id: 's-1' }, {});
      await recordSweepEvaluation(bad, [{ role: 'adam', scheduled: false, reason: 'fleet_busy' }], {});
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(1);
      expect(sweepAuditFailures.singleton_relaunch_evaluated).toBe(1);
      expect(warn).toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  // THE FALSIFIER, recorded so a later reader does not mistake it for success. The expected outcome
  // of this SD is a zero becoming READABLE, not a count rising. If refusal counts start appearing
  // once FR-1 is live, writes were failing all along and the finding is more urgent than assumed.
  it('does NOT assert that refusals appear — the rollout signal is inverted', async () => {
    const { rows, sb } = capture();
    for (let i = 0; i < 50; i += 1) recordEvaluation(false);
    await maybeFlushEvaluationCount(sb, Date.parse('2026-08-03T06:00:00Z'));
    expect(fenceEvaluations.refused).toBe(0);   // staying at zero is the EXPECTED healthy outcome
    expect(rows).toEqual([]);                   // and it costs no rows to know that
  });
});

describe('FR-4: the characterization answers "can I believe this zero", not "what does it record"', () => {
  // TS-6 — a report that merely lists guards and event types leaves the reader where the SD started.
  it('a guard WITHOUT a denominator is UNREADABLE, never healthy', () => {
    expect(verdictFor({ actions: 0, evaluations: null }).verdict).toBe('UNREADABLE');
  });

  it('a guard WITH a denominator that ran and never fired is readable', () => {
    const v = verdictFor({ actions: 0, evaluations: 10_000 });
    expect(v.verdict).toBe('NEVER_FIRED');
    expect(v.because).toMatch(/readable/);
  });

  it('separates the two zeros that used to look identical', () => {
    expect(verdictFor({ actions: 0, evaluations: 10_000 }).verdict).toBe('NEVER_FIRED');
    expect(verdictFor({ actions: 0, evaluations: 0 }).verdict).toBe('NO_EVALUATIONS_RECORDED');
  });

  // THE INSTRUMENT MUST NOT COMMIT THE SD'S OWN DEFECT. Zero evaluations means either never-ran or
  // denominator-not-deployed; asserting the first alone would be a guess dressed as a measurement.
  it('does not claim "never ran" when "not deployed yet" is equally consistent', () => {
    const v = verdictFor({ actions: 0, evaluations: 0 });
    expect(v.because).toMatch(/not deployed yet/);
    expect(v.because).toMatch(/cannot tell those apart/);
  });

  it('reports a firing guard as firing', () => {
    expect(verdictFor({ actions: 3, evaluations: 900 }).verdict).toBe('FIRES');
  });

  it('every registered guard names both an action and a denominator', () => {
    expect(GUARD_REGISTRY.length).toBeGreaterThanOrEqual(2);
    for (const g of GUARD_REGISTRY) {
      expect(g.action?.value, `${g.guard} action`).toBeTruthy();
      expect(g.denominator?.value, `${g.guard} denominator`).toBeTruthy();
    }
  });

  // A failed count that defaults to 0 renders as "never fired" — the exact misreading this SD
  // exists to prevent. An unknown must never print as a zero.
  it('a failed count DIES rather than defaulting to zero', async () => {
    const failing = { from: () => ({ select: () => ({ eq: () => ({ count: null, error: { message: 'relation missing' } }), filter: () => ({ count: null, error: { message: 'relation missing' } }) }) }) };
    await expect(characterize(failing, [GUARD_REGISTRY[0]])).rejects.toThrow(/count failed/);
  });
});
