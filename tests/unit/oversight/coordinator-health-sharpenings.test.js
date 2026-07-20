import { describe, it, expect } from 'vitest';
import {
  deriveOutcomeFlow, classifyDispatchReason, deriveDispatchReasons, evaluateReasonBand,
  lacksHoldReason, sampleFalseCompletions, classifyFailureClasses,
  FAILURE_CLASSES, REASON_BAND, CONVERSION_FLOOR, LATENCY_CEILING_MS, MIN_COHORT_FOR_ALARM,
} from '../../../lib/oversight/coordinator-health-sharpenings.mjs';

const NOW = Date.parse('2026-07-16T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
const sd = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2), sd_key: 'SD-T-001', status: 'in_progress',
  completion_date: null, updated_at: daysAgo(0), claiming_session_id: null,
  metadata: { claim_history: [{ claimed_at: daysAgo(2) }] }, ...over,
});

describe('TS-1 deriveOutcomeFlow (S1 KPI-0)', () => {
  it('empty cohort -> null-shaped, never a fake 0%', () => {
    const r = deriveOutcomeFlow([], [], NOW);
    expect(r.status).toBe('no_cohort');
    expect(r.conversion).toBeNull();
  });
  it('computes conversion, median latency, rework over the first-claim cohort', () => {
    const done = sd({ id: 'a', status: 'completed', completion_date: daysAgo(1), metadata: { claim_history: [{ claimed_at: daysAgo(3) }] } });
    const open = sd({ id: 'b' });
    const old = sd({ id: 'c', metadata: { claim_history: [{ claimed_at: daysAgo(30) }] } }); // outside window
    const handoffs = [
      { sd_id: 'a', status: 'accepted' }, { sd_id: 'a', status: 'rejected' },
      { sd_id: 'b', status: 'accepted' }, { sd_id: 'c', status: 'rejected' },
    ];
    const r = deriveOutcomeFlow([done, open, old], handoffs, NOW);
    expect(r.cohort_size).toBe(2);
    expect(r.conversion).toBe(0.5);
    expect(r.median_latency_ms).toBe(2 * 24 * 60 * 60 * 1000);
    expect(r.rework_rate).toBeCloseTo(1 / 3); // old's handoff excluded (not in cohort)
  });
  it('multi-entry claim_history uses the FIRST entry (re-claims are churn, not cohort entries)', () => {
    const rechurned = sd({ id: 'd', metadata: { claim_history: [{ claimed_at: daysAgo(40) }, { claimed_at: daysAgo(1) }] } });
    const r = deriveOutcomeFlow([rechurned], [], NOW);
    expect(r.status).toBe('no_cohort'); // first claim outside window
  });
});

describe('TS-3 dispatch reason band (S3)', () => {
  it('classifies by provenance signals', () => {
    expect(classifyDispatchReason({ sd_key: 'SD-FDBK-FIX-X-001', metadata: {} })).toBe('feedback');
    expect(classifyDispatchReason({ sd_key: 'SD-LEO-FIX-Y-001', metadata: {} })).toBe('incident');
    expect(classifyDispatchReason({ sd_key: 'SD-Z-001', metadata: { chairman_directed: true } })).toBe('chairman_directed');
    expect(classifyDispatchReason({ sd_key: 'SD-Z-002', metadata: { plan_key: 'ARCH-X' } })).toBe('now_wave_remainder');
    expect(classifyDispatchReason({ sd_key: 'SD-Z-003', metadata: {} })).toBe('other');
  });
  it('synthetic 100% single-category skew trips the band; mixed passes; tiny cohorts never alarm', () => {
    const skew = deriveDispatchReasons(Array.from({ length: 10 }, (_, i) => ({ sd_key: `SD-FDBK-${i}`, metadata: {} })));
    expect(evaluateReasonBand(skew).band_ok).toBe(false);
    expect(evaluateReasonBand(skew).violations[0].category).toBe('feedback');
    const mixed = deriveDispatchReasons([
      { sd_key: 'SD-FDBK-1', metadata: {} }, { sd_key: 'SD-LEO-FIX-1', metadata: {} },
      { sd_key: 'SD-A', metadata: { plan_key: 'p' } }, { sd_key: 'SD-B', metadata: { chairman_directed: true } },
    ]);
    expect(evaluateReasonBand(mixed).band_ok).toBe(true);
    const tiny = deriveDispatchReasons([{ sd_key: 'SD-FDBK-1', metadata: {} }]);
    expect(evaluateReasonBand(tiny)).toMatchObject({ band_ok: true, insufficient_n: true });
    expect(REASON_BAND.now_wave_remainder).toEqual([0, 1]); // 100%-roadmap is NOT a target
  });
});

describe('TS-2 six failure classes (S2)', () => {
  const healthy = {
    outcomeFlow: { status: 'measured', cohort_size: MIN_COHORT_FOR_ALARM + 2, conversion: 0.8, median_latency_ms: 1000, rework_rate: 0.1 },
    utilization: { idle: 0, dispatchable_backlog_size: 5 },
    integrity: { integrity_ok: true, divergent_fields: [] },
    stuckRows: [],
    falseCompletionSample: { samples: [], false_completions: [] },
  };
  it('exactly the 6 enumerated classes, all silent on healthy input', () => {
    const classes = classifyFailureClasses(healthy);
    expect(classes.map((c) => c.cls)).toEqual([...FAILURE_CLASSES]);
    expect(classes.every((c) => c.firing === false)).toBe(true);
  });
  it('each class fires on its synthetic trigger', () => {
    const fire = (over) => classifyFailureClasses({ ...healthy, ...over });
    expect(fire({ falseCompletionSample: { samples: [], false_completions: ['SD-GHOST-001'] } })[0].firing).toBe(true);
    expect(fire({ stuckRows: [sd({ sd_key: 'SD-STUCK-001' })] })[1].firing).toBe(true);
    expect(fire({ utilization: { idle: 2, dispatchable_backlog_size: 4 } })[2].firing).toBe(true);
    expect(fire({ integrity: { integrity_ok: false, divergent_fields: ['dispatchable_count'] } })[3].firing).toBe(true);
    expect(fire({ outcomeFlow: { ...healthy.outcomeFlow, conversion: CONVERSION_FLOOR - 0.05 } })[4].firing).toBe(true);
    expect(fire({ outcomeFlow: { ...healthy.outcomeFlow, median_latency_ms: LATENCY_CEILING_MS + 1 } })[5].firing).toBe(true);
  });
  it('outcome classes never alarm on insufficient cohorts', () => {
    const classes = classifyFailureClasses({ ...healthy, outcomeFlow: { status: 'measured', cohort_size: 1, conversion: 0, median_latency_ms: 1e12, rework_rate: 1 } });
    expect(classes[4].firing).toBe(false);
    expect(classes[5].firing).toBe(false);
  });
});

describe('S2 STUCK_WITHOUT_HOLD_REASON predicate', () => {
  it('fires only for stale, unclaimed, in-flight rows with NO hold provenance', () => {
    const stale = sd({ status: 'in_progress', updated_at: daysAgo(2), metadata: {} });
    expect(lacksHoldReason(stale, NOW)).toBe(true);
    expect(lacksHoldReason({ ...stale, metadata: { requires_human_action: true } }, NOW)).toBe(false);
    expect(lacksHoldReason({ ...stale, metadata: { lead_blocker: { reason: 'x' } } }, NOW)).toBe(false);
    expect(lacksHoldReason({ ...stale, claiming_session_id: 's1' }, NOW)).toBe(false);
    expect(lacksHoldReason({ ...stale, updated_at: daysAgo(0) }, NOW)).toBe(false);
    expect(lacksHoldReason({ ...stale, status: 'draft' }, NOW)).toBe(false);
  });
  it('orchestrator parents are unclaimed BY DESIGN — never the stuck class', () => {
    const parent = sd({ status: 'in_progress', updated_at: daysAgo(5), sd_type: 'orchestrator', metadata: {} });
    expect(lacksHoldReason(parent, NOW)).toBe(false);
  });
});

describe('S2 FALSE_COMPLETION sampler', () => {
  it('DB-completed with no main trace fires; PR evidence or grep hit passes; unverifiable is distinct', () => {
    const rows = [
      { sd_key: 'SD-OK-001', metadata: { pr_url: 'https://x/pr/1' } },
      { sd_key: 'SD-OK-002', metadata: {} },
      { sd_key: 'SD-GHOST-001', metadata: {} },
      { sd_key: 'SD-UNKNOWN-001', metadata: {} },
    ];
    const grep = (k) => (k === 'SD-OK-002' ? true : k === 'SD-UNKNOWN-001' ? 'unverifiable' : false);
    const r = sampleFalseCompletions(rows, grep);
    expect(r.false_completions).toEqual(['SD-GHOST-001']);
    expect(r.samples.find((s) => s.sd_key === 'SD-UNKNOWN-001').unverifiable).toBe(true);
  });
  it('cross-repo SDs are unverifiable from this checkout, never false completions', () => {
    const r = sampleFalseCompletions(
      [{ sd_key: 'SD-VENTURE-001', target_application: 'apexniche-ai', metadata: {} }],
      () => false
    );
    expect(r.false_completions).toEqual([]);
    expect(r.samples[0].unverifiable).toBe(true);
  });
});

describe('QF-20260719-365 — rank-time reason-band stamp is authoritative', () => {
  it('classifyDispatchReason prefers the stamp over heuristics', () => {
    expect(classifyDispatchReason({ sd_key: 'SD-FDBK-X-001', metadata: { dispatch_reason_band: 'incident' } })).toBe('incident');
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'now-wave-remainder' } })).toBe('now_wave_remainder');
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'chairman-directed' } })).toBe('chairman_directed');
  });

  it('falls back to heuristics when unstamped or the stamp is unknown vocabulary', () => {
    expect(classifyDispatchReason({ sd_key: 'SD-FDBK-X-001', metadata: {} })).toBe('feedback');
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'bogus' } })).toBe('other');
  });

  it('deriveDispatchReasons reports stamped coverage + direct-dispatch/self-claim partition', () => {
    const rows = [
      { sd_key: 'SD-A-001', metadata: { dispatch_reason_band: 'feedback' } },                              // self-claim
      { sd_key: 'SD-B-001', metadata: { dispatch_reason_band: 'chairman-directed', directed_assignment: true } }, // direct
      { sd_key: 'SD-C-001', metadata: {} },                                                                // unstamped
    ];
    const r = deriveDispatchReasons(rows);
    expect(r.stamped).toBe(2);
    expect(r.stamped_coverage).toBeCloseTo(2 / 3);
    expect(r.partition).toEqual({ direct_dispatch: 1, self_claim: 1 });
    expect(r.counts.feedback).toBe(1);
    expect(r.counts.chairman_directed).toBe(1);
  });
});
