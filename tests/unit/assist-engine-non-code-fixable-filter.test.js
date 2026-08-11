/**
 * Unit/integration tests for SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001:
 * exclude non-code-fixable monitoring/telemetry feedback categories from /leo
 * assist Phase 1's autonomous-fix issue stream.
 *
 * T4/T8 drive the REAL loadInboxItems() pipeline (not just the two pure filter
 * functions in isolation) — a defect where the two filters are wired in parallel
 * instead of chained is invisible to pure-function-only tests (two green
 * endpoints, broken wire); see testing-agent DEF-1.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FEEDBACK_TABLE = 'v_feedback_with_sensemaking';

describe('FR-1 AC5: direct CommonJS require() of the new governance module', () => {
  it('exposes NON_CODE_FIXABLE_CATEGORIES and filterIssuesExcludingNonCodeFixable via require(), not only via the assist-engine.js re-export', () => {
    const direct = require('../../lib/governance/non-code-fixable-categories.cjs');
    expect(direct.NON_CODE_FIXABLE_CATEGORIES).toBeInstanceOf(Set);
    expect(direct.NON_CODE_FIXABLE_CATEGORIES.size).toBe(11);
    expect(typeof direct.filterIssuesExcludingNonCodeFixable).toBe('function');
    // Same module.exports shape as the precedent (module.exports = { CONSTANT, function }).
    expect(Object.keys(direct).sort()).toEqual(['NON_CODE_FIXABLE_CATEGORIES', 'filterIssuesExcludingNonCodeFixable'].sort());
  });
});

function makeQueryBuilder(rows) {
  const builder = {
    select: () => builder,
    not: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return builder;
}

let currentFixture = [];

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: (table) => {
      if (table === FEEDBACK_TABLE) return makeQueryBuilder(currentFixture);
      return makeQueryBuilder([]); // quick_fixes / anything else — never reached (fixtures omit quick_fix_id)
    },
  }),
}));

const {
  AssistEngine,
  filterIssuesExcludingNonCodeFixable,
  NON_CODE_FIXABLE_CATEGORIES,
  NEEDS_DECISION_CATEGORY,
} = await import('../../lib/quality/assist-engine.js');
const { TERMINAL_CATEGORIES } = await import('../../lib/governance/feedback-terminal-categories.cjs');

function row({ id, type = 'issue', category = null, quick_fix_id = undefined }) {
  return {
    id,
    type,
    category,
    quick_fix_id,
    strategic_directive_id: null,
    resolution_sd_id: null,
    ai_triage_classification: 'triaged', // clears filterStaleUntriaged regardless of created_at
    created_at: '2020-01-01T00:00:00.000Z',
    metadata: {},
  };
}

const ALL_ELEVEN = [
  'invariant_gauge_finding',
  'comms_quality',
  'verification_ledger',
  'adam_adherence_drift',
  'adam_doc_drift',
  'adam_solomon_health',
  'adam_morning_brief',
  'chairman_ruling',
  'feedback_sla_breach',
  'relay_drop',
  'sms_relay',
];

// ── T1-T3, T5-T7: pure-function tests on filterIssuesExcludingNonCodeFixable ──

describe('T1: per-category mutation-resistant exclusion', () => {
  it('excludes one issue-type row per each of the 11 categories', () => {
    const enriched = ALL_ELEVEN.map((category, i) => row({ id: `n${i}`, category }));
    const { issues, skippedNonCodeFixable } = filterIssuesExcludingNonCodeFixable(enriched);
    expect(issues).toEqual([]);
    expect(skippedNonCodeFixable).toBe(11);
  });
});

describe('T2: control pass-through for non-excluded categories', () => {
  it('leaves a ci_failure row unchanged', () => {
    const enriched = [row({ id: 'c1', category: 'ci_failure' })];
    const { issues, skippedNonCodeFixable } = filterIssuesExcludingNonCodeFixable(enriched);
    expect(issues.map((r) => r.id)).toEqual(['c1']);
    expect(skippedNonCodeFixable).toBe(0);
  });
});

describe('T3: set-size/contents pin', () => {
  it('NON_CODE_FIXABLE_CATEGORIES has exactly the 11 expected members', () => {
    expect(NON_CODE_FIXABLE_CATEGORIES.size).toBe(11);
    for (const c of ALL_ELEVEN) expect(NON_CODE_FIXABLE_CATEGORIES.has(c)).toBe(true);
  });
});

describe('T5: disjointness invariant across exclusion sets', () => {
  it('no category appears in more than one of NON_CODE_FIXABLE_CATEGORIES, NEEDS_DECISION_CATEGORY, TERMINAL_CATEGORIES', () => {
    for (const c of ALL_ELEVEN) {
      expect(c).not.toBe(NEEDS_DECISION_CATEGORY);
      expect(TERMINAL_CATEGORIES.includes(c)).toBe(false);
    }
    expect(TERMINAL_CATEGORIES.includes(NEEDS_DECISION_CATEGORY)).toBe(false);
  });
});

describe('T6: null/empty robustness', () => {
  it('returns empty + zero on empty input', () => {
    const { issues, skippedNonCodeFixable } = filterIssuesExcludingNonCodeFixable([]);
    expect(issues).toEqual([]);
    expect(skippedNonCodeFixable).toBe(0);
  });

  it('returns empty + zero on null/undefined', () => {
    expect(filterIssuesExcludingNonCodeFixable(null)).toEqual({ issues: [], skippedNonCodeFixable: 0 });
    expect(filterIssuesExcludingNonCodeFixable(undefined)).toEqual({ issues: [], skippedNonCodeFixable: 0 });
  });

  it('does not throw on a type=issue row with category=null and lets it survive', () => {
    // 18 live unlinked type=issue/category=null rows measured by PLAN-phase TESTING
    // sub-agent (26% of the 69 rows expected to survive this fix) — Set.has(null) is
    // false, so these must pass through unchanged, matching the sibling precedent
    // (assist-engine-needs-decision-filter.test.js:25).
    const enriched = [row({ id: 'null-cat', category: null })];
    const { issues, skippedNonCodeFixable } = filterIssuesExcludingNonCodeFixable(enriched);
    expect(issues.map((r) => r.id)).toEqual(['null-cat']);
    expect(skippedNonCodeFixable).toBe(0);
  });
});

describe('T7: type-gate enforcement (Phase 2 boundary)', () => {
  it('an enhancement-type row with an excluded category name is not counted as skipped, and does not appear as an issue', () => {
    const enriched = [
      row({ id: 'issue-1', type: 'issue', category: 'adam_solomon_health' }),
      row({ id: 'enh-1', type: 'enhancement', category: 'adam_solomon_health' }),
    ];
    const { issues, skippedNonCodeFixable } = filterIssuesExcludingNonCodeFixable(enriched);
    // Only the issue-type row is considered at all; the enhancement-type row is
    // structurally invisible to this filter (neither excluded-and-counted nor
    // present-as-an-issue) — Phase 2's own stream (built separately from `enriched`
    // via splitEnhancementsExcludingHarnessBacklog) is untouched.
    expect(issues).toEqual([]);
    expect(skippedNonCodeFixable).toBe(1);
  });

  it('an enhancement-type row never inflates the skip count relative to an equivalent issue-only batch', () => {
    const issueOnly = [row({ id: 'i1', type: 'issue', category: 'chairman_ruling' })];
    const mixed = [
      row({ id: 'i1', type: 'issue', category: 'chairman_ruling' }),
      row({ id: 'e1', type: 'enhancement', category: 'chairman_ruling' }),
    ];
    expect(filterIssuesExcludingNonCodeFixable(mixed).skippedNonCodeFixable)
      .toBe(filterIssuesExcludingNonCodeFixable(issueOnly).skippedNonCodeFixable);
  });
});

// ── T4/T8: integration tests through the REAL loadInboxItems() pipeline ──

describe('T4/T8: real chained pipeline (loadInboxItems)', () => {
  afterEach(() => {
    delete process.env.LEO_ASSIST_NONCODE_FILTER;
    vi.restoreAllMocks();
  });

  it('T4 (closes DEF-1): excludes completion_flag AND invariant_gauge_finding; ci_failure survives both filters', async () => {
    currentFixture = [
      row({ id: 'cf-1', category: 'completion_flag' }),
      row({ id: 'gauge-1', category: 'invariant_gauge_finding' }),
      row({ id: 'ci-1', category: 'ci_failure' }), // positive control — proves the fixture reached the final stage alive
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { issues } = await engine.loadInboxItems();
    const ids = issues.map((i) => i.id);

    // Positive control first: if this fails, the fixture died at an earlier stage
    // (GAP-008 / preclaim / stale-untriaged / sensemaking-discard), not at either filter.
    expect(ids).toContain('ci-1');
    expect(ids).not.toContain('cf-1');
    expect(ids).not.toContain('gauge-1');
    expect(ids).toEqual(['ci-1']);
  });

  it('T8 (closes plan_critiques BLOCK finding): LEO_ASSIST_NONCODE_FILTER is honored end-to-end, and the completion_flag exclusion is unaffected by it', async () => {
    currentFixture = [
      row({ id: 'cf-1', category: 'completion_flag' }),
      row({ id: 'gauge-1', category: 'invariant_gauge_finding' }),
    ];

    // Run 1: gate enabled (default / unset).
    delete process.env.LEO_ASSIST_NONCODE_FILTER;
    const logSpyEnabled = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineEnabled = new AssistEngine({ dryRun: true });
    const enabledResult = await engineEnabled.loadInboxItems();
    const enabledIds = enabledResult.issues.map((i) => i.id);
    const enabledLogs = logSpyEnabled.mock.calls.map((c) => c.join(' '));
    logSpyEnabled.mockRestore();

    expect(enabledIds).toEqual([]); // both excluded
    expect(enabledLogs.some((l) => l.includes('non-code-fixable') && l.includes('Excluded 1'))).toBe(true);
    expect(enabledLogs.some((l) => l.includes('non-code-fixable filter disabled'))).toBe(false);

    // Run 2: gate disabled.
    process.env.LEO_ASSIST_NONCODE_FILTER = 'false';
    const logSpyDisabled = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineDisabled = new AssistEngine({ dryRun: true });
    const disabledResult = await engineDisabled.loadInboxItems();
    const disabledIds = disabledResult.issues.map((i) => i.id);
    const disabledLogs = logSpyDisabled.mock.calls.map((c) => c.join(' '));
    logSpyDisabled.mockRestore();

    // filterIssuesExcludingNeedsDecision (untouched by this flag) still excludes completion_flag;
    // the new filter is bypassed, so invariant_gauge_finding survives.
    expect(disabledIds).toEqual(['gauge-1']);
    expect(disabledLogs.some((l) => l.includes('non-code-fixable filter disabled'))).toBe(true);

    // Distinguishability (FR-2 AC4): the disabled run's log lines are never a subset-match
    // of the enabled run's "0 matched" case — the disabled run always carries its own
    // explicit marker, so "0 skipped because disabled" is never confused with "0 skipped
    // because no rows matched".
    expect(disabledLogs).not.toEqual(enabledLogs);
  });
});
