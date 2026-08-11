import { describe, it, expect } from 'vitest';
import {
  deriveOutcomeFlow, classifyDispatchReason, deriveDispatchReasons, evaluateReasonBand,
  lacksHoldReason, hasStaleUnreviewedHold, sampleFalseCompletions, classifyFailureClasses,
  FAILURE_CLASSES, REASON_BAND, CONVERSION_FLOOR, LATENCY_CEILING_MS, MIN_COHORT_FOR_ALARM,
  STALE_HOLD_CEILING_HOURS,
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

describe('TS-2 seven failure classes (S2)', () => {
  const healthy = {
    outcomeFlow: { status: 'measured', cohort_size: MIN_COHORT_FOR_ALARM + 2, conversion: 0.8, median_latency_ms: 1000, rework_rate: 0.1 },
    utilization: { idle: 0, dispatchable_backlog_size: 5 },
    integrity: { integrity_ok: true, divergent_fields: [] },
    stuckRows: [],
    staleHoldRows: [],
    falseCompletionSample: { samples: [], false_completions: [] },
  };
  it('exactly the 7 enumerated classes, all silent on healthy input', () => {
    const classes = classifyFailureClasses(healthy);
    expect(classes.map((c) => c.cls)).toEqual([...FAILURE_CLASSES]);
    expect(classes.every((c) => c.firing === false)).toBe(true);
  });
  it('each class fires on its synthetic trigger', () => {
    const fire = (over) => classifyFailureClasses({ ...healthy, ...over });
    expect(fire({ falseCompletionSample: { samples: [], false_completions: ['SD-GHOST-001'] } })[0].firing).toBe(true);
    expect(fire({ stuckRows: [sd({ sd_key: 'SD-STUCK-001' })] })[1].firing).toBe(true);
    expect(fire({ staleHoldRows: [sd({ sd_key: 'SD-STALE-HOLD-001' })] })[2].firing).toBe(true);
    expect(fire({ utilization: { idle: 2, dispatchable_backlog_size: 4 } })[3].firing).toBe(true);
    expect(fire({ integrity: { integrity_ok: false, divergent_fields: ['dispatchable_count'] } })[4].firing).toBe(true);
    expect(fire({ outcomeFlow: { ...healthy.outcomeFlow, conversion: CONVERSION_FLOOR - 0.05 } })[5].firing).toBe(true);
    expect(fire({ outcomeFlow: { ...healthy.outcomeFlow, median_latency_ms: LATENCY_CEILING_MS + 1 } })[6].firing).toBe(true);
  });
  it('outcome classes never alarm on insufficient cohorts', () => {
    const classes = classifyFailureClasses({ ...healthy, outcomeFlow: { status: 'measured', cohort_size: 1, conversion: 0, median_latency_ms: 1e12, rework_rate: 1 } });
    expect(classes[5].firing).toBe(false);
    expect(classes[6].firing).toBe(false);
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
  it('SD-LEO-INFRA-AGE-GAUGE-NON-001 FR-2: an orchestrator with NO children data is NOT vacuously exempt (corrects the old blanket sd_type skip)', () => {
    const parent = sd({ status: 'in_progress', updated_at: daysAgo(5), sd_type: 'orchestrator', metadata: {} });
    expect(lacksHoldReason(parent, NOW)).toBe(true); // no children arg -> defaults to [] -> not exempt
    expect(lacksHoldReason(parent, NOW, 24, [])).toBe(true); // explicit empty array -> same
  });
  it('FR-2: an orchestrator whose children are ALL human-held IS exempt', () => {
    const parent = sd({ status: 'in_progress', updated_at: daysAgo(5), sd_type: 'orchestrator', metadata: {} });
    const heldChild = { sd_key: 'SD-CHILD-A', sd_type: 'bugfix', status: 'draft', metadata: { requires_human_action: true } };
    expect(lacksHoldReason(parent, NOW, 24, [heldChild])).toBe(false);
  });
  it('FR-2: a MIXED-state orchestrator (one child held, one not) breaches — proves live per-child state, not a blanket skip', () => {
    const parent = sd({ status: 'in_progress', updated_at: daysAgo(5), sd_type: 'orchestrator', metadata: {} });
    const heldChild = { sd_key: 'SD-CHILD-A', sd_type: 'bugfix', status: 'draft', metadata: { requires_human_action: true } };
    const notHeldChild = { sd_key: 'SD-CHILD-B', sd_type: 'bugfix', status: 'draft', metadata: {} };
    expect(lacksHoldReason(parent, NOW, 24, [heldChild, notHeldChild])).toBe(true);
  });
  it('TS-7 regression: a stray falsy-but-not-strictly-false hold value (empty string) no longer counts as a hold', () => {
    const stale = sd({ status: 'in_progress', updated_at: daysAgo(2) });
    // Old check (!== false) treated '' as a hold (bug); new Boolean() check correctly does not.
    expect(lacksHoldReason({ ...stale, metadata: { requires_human_action: '' } }, NOW)).toBe(true);
    // Regression guard: a genuinely truthy hold of any shape still counts (object, not just boolean).
    expect(lacksHoldReason({ ...stale, metadata: { lead_blocker: { reason: 'x' } } }, NOW)).toBe(false);
  });
});

describe('SD-LEO-INFRA-AGE-GAUGE-NON-001 FR-1: hasStaleUnreviewedHold (STALE_HOLD_UNREVIEWED)', () => {
  it('TS-1: a hold with no review_at, past the ceiling, is stale', () => {
    const row = {
      sd_key: 'SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001', status: 'pending_approval', claiming_session_id: null,
      created_at: daysAgo(9), metadata: { requires_human_action: true, requires_human_action_reason: 'FORMAL FENCE' },
    };
    expect(hasStaleUnreviewedHold(row, NOW)).toBe(true);
  });
  it('TS-2: a hold with a future review_at stays silent', () => {
    const row = {
      sd_key: 'SD-X-001', created_at: daysAgo(9),
      metadata: { requires_human_action: true, requires_human_action_review_at: new Date(NOW + 24 * 60 * 60 * 1000).toISOString() },
    };
    expect(hasStaleUnreviewedHold(row, NOW)).toBe(false);
  });
  it('TS-3: a past review_at fires even within the fallback ceiling window (review_at takes precedence)', () => {
    const row = {
      sd_key: 'SD-X-002', created_at: daysAgo(1), // within STALE_HOLD_CEILING_HOURS if using set_at fallback
      metadata: { requires_human_action: true, requires_human_action_review_at: daysAgo(0.1) },
    };
    expect(hasStaleUnreviewedHold(row, NOW)).toBe(true);
  });
  it('a hold within the ceiling window and no review_at stays silent', () => {
    const row = { sd_key: 'SD-X-003', created_at: daysAgo(1), metadata: { requires_human_action: true } };
    expect(hasStaleUnreviewedHold(row, NOW)).toBe(false);
    expect(STALE_HOLD_CEILING_HOURS).toBeGreaterThan(24); // deliberately longer than STUCK_HOURS
  });
  it('no hold at all -> never stale (that is lacksHoldReason\'s job, not this class)', () => {
    expect(hasStaleUnreviewedHold({ sd_key: 'SD-X-004', created_at: daysAgo(30), metadata: {} }, NOW)).toBe(false);
  });
  it('exec_boundary_hold_set_at (lib/fleet/exec-boundary-hold-writer.js convention) is honored as the fallback clock', () => {
    const row = { sd_key: 'SD-X-005', created_at: daysAgo(0), metadata: { exec_boundary_hold: true, exec_boundary_hold_set_at: daysAgo(9) } };
    expect(hasStaleUnreviewedHold(row, NOW)).toBe(true);
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
    expect(r.sd_dispatch_partition).toEqual({ direct_dispatch: 1, self_claim: 1 });
    expect(r.counts.feedback).toBe(1);
    expect(r.counts.chairman_directed).toBe(1);
  });

  // QF-20260727-978: the partition read metadata.directed_assignment, which NO production code
  // ever wrote (4 repo occurrences: 2 reads, 1 comment, 1 fixture). direct_dispatch was therefore
  // structurally pinned at 0 — arithmetic of an absent field, not a measurement. The writer now
  // exists in lib/checkin/steps/directed-assignment.cjs; these two tests pin the honesty contract.
  it('names its population, so a QF-heavy day cannot be misread as "the coordinator never direct-dispatches"', () => {
    // Replays 2026-07-27: five QF dispatches, two of them chairman-directed. None can appear
    // here — deriveDispatchReasons takes strategic_directives_v2 rows and quick_fixes has no
    // metadata column to carry the marker. The gauge must SAY that rather than imply coverage.
    const r = deriveDispatchReasons([
      { sd_key: 'SD-A-001', metadata: { dispatch_reason_band: 'feedback' } },
    ]);
    expect(r.sd_dispatch_partition_scope).toMatch(/strategic_directives_v2 rows only/);
    expect(r.sd_dispatch_partition_scope).toMatch(/quick-fix dispatch is not counted/);
    expect(r.partition).toBeUndefined(); // renamed: an unscoped `partition` must not come back
  });

  it('direct_dispatch can actually reach non-zero once the marker is written', () => {
    // Pre-fix this was impossible for any input a live writer could produce.
    const r = deriveDispatchReasons([
      { sd_key: 'SD-D-001', metadata: { dispatch_reason_band: 'chairman-directed', directed_assignment: true } },
      { sd_key: 'SD-E-001', metadata: { dispatch_reason_band: 'chairman-directed', directed_assignment: true } },
    ]);
    expect(r.sd_dispatch_partition.direct_dispatch).toBe(2);
    expect(r.sd_dispatch_partition.self_claim).toBe(0);
  });
});
