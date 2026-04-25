/**
 * Tests for success-metrics-gate.js
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-132 (FR-1, FR-3, FR-5)
 *
 * Focus: auto-populated placeholder vs concrete-actual distinction.
 * Hand-edited values are authoritative; auto-populated literals from the
 * canonical placeholder set fail with SUCCESS_METRICS_PLACEHOLDER_VALUE.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSuccessMetricsGate } from './success-metrics-gate.js';
import { GATE_REASON_CODES } from './gate-reason-codes.js';

// ── Mock the verifier so the test focuses on the gate's own logic ──
vi.mock('../../../../../lib/metric-auto-verifier.js', () => ({
  verifyAllMetrics: () => ({
    results: [],
    overallScore: 100, // verification passes by default
  }),
}));

/**
 * Build a routed mock supabase. Each .from(table) returns a chain whose
 * eventual await resolves with the configured payload for that table.
 *
 * Supported tables in this gate:
 *   strategic_directives_v2 (children check + main success_metrics select + update)
 *   sd_phase_handoffs (auto-populate evidence)
 *   user_stories (auto-populate evidence)
 */
function makeSupabase({ children = [], successMetrics, parentSdId = null, handoffs = [], stories = [], updateError = null }) {
  const updates = [];
  const fromHandlers = {
    strategic_directives_v2: (call) => {
      // .select() chains then either .eq().single() (parent_sd_id check or main fetch) OR .update()
      const chain = {
        _select: null,
        _eqs: [],
        _update: null,
        select(fields) { this._select = fields; return this; },
        eq(col, val) { this._eqs.push([col, val]); return this; },
        update(payload) { this._update = payload; updates.push(payload); return this; },
        async single() {
          // Distinguish queries by the columns selected
          if (this._select && this._select.includes('parent_sd_id')) {
            return { data: { parent_sd_id: parentSdId }, error: null };
          }
          if (this._select && this._select.includes('success_metrics')) {
            return { data: { success_metrics: successMetrics }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve) {
          // Chain await without .single() — used by .from(...).select().eq() (children)
          if (this._select && this._select === 'id') {
            return Promise.resolve({ data: children, error: null }).then(resolve);
          }
          if (this._update) {
            return Promise.resolve({ data: null, error: updateError }).then(resolve);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
    sd_phase_handoffs: () => {
      const chain = {
        select() { return this; },
        eq() { return this; },
        then(resolve) { return Promise.resolve({ data: handoffs, error: null }).then(resolve); },
      };
      return chain;
    },
    user_stories: () => {
      const chain = {
        select() { return this; },
        eq() { return this; },
        then(resolve) { return Promise.resolve({ data: stories, error: null }).then(resolve); },
      };
      return chain;
    },
  };
  return {
    from: (table) => fromHandlers[table] ? fromHandlers[table]() : { select: () => ({ eq: () => ({ then: (r) => Promise.resolve({ data: [], error: null }).then(r) }) }) },
    _updates: updates,
  };
}

function makeCtx(sdOverrides = {}) {
  return {
    sd: { id: 'sd-uuid-1', sd_type: 'feature', ...sdOverrides },
    sdId: 'sd-uuid-1',
  };
}

describe('SUCCESS_METRICS gate — FR-1 placeholder distinction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('TS-1: auto-populated concrete actual passes', async () => {
    const supabase = makeSupabase({
      successMetrics: [
        { metric: 'Test coverage', target: '>=80%', actual: '92%', _auto_populated: true },
      ],
    });
    const gate = createSuccessMetricsGate(supabase);
    const result = await gate.validator(makeCtx());

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.issues).toHaveLength(0);
  });

  it('TS-2: auto-populated "100%" placeholder fails with SUCCESS_METRICS_PLACEHOLDER_VALUE', async () => {
    const supabase = makeSupabase({
      successMetrics: [
        { metric: 'Implementation completeness', target: '100%', actual: '100%', _auto_populated: true },
      ],
    });
    const gate = createSuccessMetricsGate(supabase);
    const result = await gate.validator(makeCtx());

    expect(result.passed).toBe(false);
    const placeholderIssue = result.issues.find(s => s.includes('SUCCESS_METRICS_PLACEHOLDER_VALUE'));
    expect(placeholderIssue).toBeDefined();
    expect(result.details.achievement.metric_scores[0].reason_code).toBe(GATE_REASON_CODES.SUCCESS_METRICS_PLACEHOLDER_VALUE);
  });

  it('TS-3: empty actual fails with SUCCESS_METRICS_EMPTY_ACTUAL', async () => {
    const supabase = makeSupabase({
      successMetrics: [
        { metric: 'Code coverage', target: '>=80%', actual: '' },
      ],
      // No handoffs/stories => auto-populate skips => actual stays empty
    });
    const gate = createSuccessMetricsGate(supabase);
    const result = await gate.validator(makeCtx());

    expect(result.passed).toBe(false);
    const emptyIssue = result.issues.find(s => s.includes('SUCCESS_METRICS_EMPTY_ACTUAL'));
    expect(emptyIssue).toBeDefined();
    expect(result.details.achievement.metric_scores[0].reason_code).toBe(GATE_REASON_CODES.SUCCESS_METRICS_EMPTY_ACTUAL);
  });

  it('TS-4 (FR-1c regression): hand-edited "100%" passes (no _auto_populated flag)', async () => {
    const supabase = makeSupabase({
      successMetrics: [
        // Note: NO _auto_populated flag — this is a human-asserted value
        { metric: 'Test pass rate', target: '100%', actual: '100%' },
      ],
    });
    const gate = createSuccessMetricsGate(supabase);
    const result = await gate.validator(makeCtx());

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('TS-5 (FR-1b): auto-populated TBD also fails as placeholder', async () => {
    const supabase = makeSupabase({
      successMetrics: [
        { metric: 'Adoption rate', target: '>=50%', actual: 'TBD', _auto_populated: true },
      ],
    });
    const gate = createSuccessMetricsGate(supabase);
    const result = await gate.validator(makeCtx());

    expect(result.passed).toBe(false);
    expect(result.details.achievement.metric_scores[0].reason_code).toBe(GATE_REASON_CODES.SUCCESS_METRICS_PLACEHOLDER_VALUE);
  });
});
