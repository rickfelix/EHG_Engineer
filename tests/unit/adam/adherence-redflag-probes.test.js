/**
 * SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 — Adam red-flag probes (FR-1) +
 * action-time dedupe (FR-2). Proves the D1 belt-starvation + D2 dispatch-boundary probes
 * PASS/FAIL/UNKNOWN (fail-loud on unresolved) and that ledger writes dedupe on verdict change.
 */
import { describe, it, expect } from 'vitest';
import {
  probeBeltStarvation,
  probeDispatchBoundary,
  decideLedgerWrites,
  runCardinalProbes,
  CARDINAL_ACTION_TIME_PROBES,
  ADHERENCE_PROBES,
} from '../../../lib/adam/adherence-probes.js';
import {
  recordActionTimeAdherence,
  latestVerdictsByProbe,
  isActionTimeAdherenceEnabled,
} from '../../../lib/adam/action-time-adherence.mjs';

/** Minimal supabase stub: from().select().order().limit() → resolves the seeded ledger rows. */
function supabaseStub(ledgerRows) {
  const q = {
    select() { return q; }, order() { return q; },
    limit() { return Promise.resolve({ data: ledgerRows, error: null }); },
  };
  return { from() { return q; } };
}

describe('probeBeltStarvation (D1, FR-1)', () => {
  it('FAILs when belt=0 AND idle>0 AND sourceable backlog>0 (the exact session failure)', () => {
    expect(probeBeltStarvation({ claimableBelt: 0, idleWorkers: 2, sourceableBacklogCount: 5 }).verdict).toBe('fail');
  });
  it('PASSes when the belt has work', () => {
    expect(probeBeltStarvation({ claimableBelt: 3, idleWorkers: 2, sourceableBacklogCount: 5 }).verdict).toBe('pass');
  });
  it('PASSes when no workers are idle (belt-empty is legitimately drained)', () => {
    expect(probeBeltStarvation({ claimableBelt: 0, idleWorkers: 0, sourceableBacklogCount: 5 }).verdict).toBe('pass');
  });
  it('PASSes when the backlog is empty (nothing to source)', () => {
    expect(probeBeltStarvation({ claimableBelt: 0, idleWorkers: 2, sourceableBacklogCount: 0 }).verdict).toBe('pass');
  });
  it('UNKNOWN (fail-loud) when any input is unresolved', () => {
    expect(probeBeltStarvation({ claimableBelt: null, idleWorkers: 2, sourceableBacklogCount: 5 }).verdict).toBe('unknown');
    expect(probeBeltStarvation({ claimableBelt: 0, idleWorkers: undefined, sourceableBacklogCount: 5 }).verdict).toBe('unknown');
    expect(probeBeltStarvation({}).verdict).toBe('unknown');
  });
});

describe('probeDispatchBoundary (D2, FR-1)', () => {
  it.each([
    'we should spin down two workers',
    'spin up a worker to cover the backlog',
    'assign a worker to this SD',
    'dispatch a worker now',
    'reallocate the workers to track B',
    'scale the fleet up',
  ])('FAILs on fleet-dispatch language: "%s"', (body) => {
    expect(probeDispatchBoundary({ advisoryBody: body }).verdict).toBe('fail');
  });
  it.each([
    'the vision build-% gauge slipped; recommend sourcing a gap-closing SD',
    'distance-to-quit is at $0 — income not yet instrumented',
    'I assigned the venture a higher priority score',
  ])('PASSes on a clean advisory body: "%s"', (body) => {
    expect(probeDispatchBoundary({ advisoryBody: body }).verdict).toBe('pass');
  });
  it('UNKNOWN (fail-loud) when the body is unresolved', () => {
    expect(probeDispatchBoundary({}).verdict).toBe('unknown');
    expect(probeDispatchBoundary({ advisoryBody: null }).verdict).toBe('unknown');
  });
});

describe('decideLedgerWrites — dedupe-on-change (FR-2)', () => {
  it('writes on a verdict transition and on a newly-seen probe', () => {
    const bars = [{ probe: 'belt_starvation', verdict: 'fail' }, { probe: 'dispatch_boundary', verdict: 'pass' }];
    const out = decideLedgerWrites({ belt_starvation: 'pass' }, bars);
    expect(out.map((b) => b.probe)).toEqual(['belt_starvation', 'dispatch_boundary']); // changed + new
  });
  it('writes NOTHING in steady state (no verdict change)', () => {
    const bars = [{ probe: 'belt_starvation', verdict: 'pass' }, { probe: 'propose_only', verdict: 'pass' }];
    const out = decideLedgerWrites({ belt_starvation: 'pass', propose_only: 'pass' }, bars);
    expect(out).toHaveLength(0);
  });
});

describe('cardinal action-time subset (FR-2)', () => {
  it('is exactly {belt-starvation, dispatch-boundary, propose-only}', () => {
    expect(CARDINAL_ACTION_TIME_PROBES.map((p) => p.name)).toEqual([
      'probeBeltStarvation', 'probeDispatchBoundary', 'probeProposeOnly',
    ]);
  });
  it('runCardinalProbes returns one bar per cardinal probe (fail-open to unknown)', () => {
    const bars = runCardinalProbes({}); // all unresolved
    expect(bars).toHaveLength(3);
    expect(bars.every((b) => b.verdict === 'unknown')).toBe(true);
  });
  it('the full ADHERENCE_PROBES set now includes the 2 new red-flag probes', () => {
    const names = ADHERENCE_PROBES.map((p) => p.name);
    expect(names).toContain('probeBeltStarvation');
    expect(names).toContain('probeDispatchBoundary');
  });
});

describe('recordActionTimeAdherence — FR-2 action-time IO (flag-gated, fail-open, dedupe)', () => {
  const flagOn = (env) => isActionTimeAdherenceEnabled({ ADAM_ACTION_TIME_ADHERENCE_V1: 'on' }) || env;
  it('is a no-op when the flag is off', async () => {
    const writes = [];
    const res = await recordActionTimeAdherence({
      supabase: supabaseStub([]), facts: { claimableBelt: 0, idleWorkers: 2, sourceableBacklogCount: 5, advisoryBody: 'ok', adamAuthoredBuildsInWindow: 0 },
      recordAdherence: async (_s, _r, bar) => writes.push(bar), enabled: false,
    });
    expect(res.recorded).toBe(0);
    expect(writes).toHaveLength(0);
  });
  it('records ONLY changed verdicts on a transition (belt-starvation pass→fail)', async () => {
    const writes = [];
    const prevLedger = [{ probe: 'belt_starvation', verdict: 'pass' }, { probe: 'dispatch_boundary', verdict: 'pass' }, { probe: 'propose_only', verdict: 'pass' }];
    const res = await recordActionTimeAdherence({
      supabase: supabaseStub(prevLedger),
      facts: { claimableBelt: 0, idleWorkers: 2, sourceableBacklogCount: 5, advisoryBody: 'clean body', adamAuthoredBuildsInWindow: 0 },
      recordAdherence: async (_s, _r, bar) => writes.push(bar), enabled: true, warn: () => {},
    });
    expect(res.recorded).toBe(1);
    expect(writes.map((b) => b.probe)).toEqual(['belt_starvation']); // only the changed one
    expect(writes[0].verdict).toBe('fail');
  });
  it('writes nothing in steady state (all verdicts unchanged)', async () => {
    const writes = [];
    const steady = [{ probe: 'belt_starvation', verdict: 'pass' }, { probe: 'dispatch_boundary', verdict: 'pass' }, { probe: 'propose_only', verdict: 'pass' }];
    const res = await recordActionTimeAdherence({
      supabase: supabaseStub(steady),
      facts: { claimableBelt: 4, idleWorkers: 0, sourceableBacklogCount: 0, advisoryBody: 'clean', adamAuthoredBuildsInWindow: 0 },
      recordAdherence: async (_s, _r, bar) => writes.push(bar), enabled: true, warn: () => {},
    });
    expect(res.recorded).toBe(0);
    expect(writes).toHaveLength(0);
  });
  it('fail-open: never throws on a bad writer', async () => {
    const res = await recordActionTimeAdherence({
      supabase: supabaseStub([]), facts: {}, recordAdherence: async () => { throw new Error('boom'); }, enabled: true, warn: () => {},
    });
    expect(res.ok).toBe(true); // unresolved facts → unknown verdicts → may write; writer throws are swallowed
  });
  it('latestVerdictsByProbe takes the newest row per probe', () => {
    const map = latestVerdictsByProbe([{ probe: 'belt_starvation', verdict: 'fail' }, { probe: 'belt_starvation', verdict: 'pass' }]);
    expect(map.belt_starvation).toBe('fail'); // first (newest) wins
  });
});
