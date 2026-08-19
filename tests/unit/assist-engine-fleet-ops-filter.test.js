/**
 * Unit/integration tests for SD-FDBK-ENH-LEO-ASSIST-PHASE-001: exclude fleet-ops
 * telemetry categories from /leo assist Phase 2's enhancements stream.
 *
 * Golf-6 signal 2cb34b71: live-inbox dry-run returned 3477 enhancement-classified
 * rows, overwhelming majority routine fleet-ops (wind_down_survey dominant at 902/1000
 * sampled) rather than genuine enhancement requests.
 *
 * Mirrors assist-engine-non-code-fixable-filter.test.js's structure: pure-function
 * tests on the new filter in isolation, plus real-pipeline tests driving the actual
 * loadInboxItems() method — a filter wired in parallel instead of chained after
 * splitEnhancementsExcludingHarnessBacklog is invisible to pure-function-only tests
 * (two green endpoints, broken wire).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

const FEEDBACK_TABLE = 'v_feedback_with_sensemaking';

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
  filterEnhancementsExcludingFleetOps,
  FLEET_OPS_TELEMETRY_CATEGORIES,
  splitEnhancementsExcludingHarnessBacklog,
} = await import('../../lib/quality/assist-engine.js');

function row({ id, type = 'enhancement', category = null }) {
  return {
    id,
    type,
    category,
    strategic_directive_id: null,
    resolution_sd_id: null,
    ai_triage_classification: 'triaged', // clears filterStaleUntriaged regardless of created_at
    created_at: '2020-01-01T00:00:00.000Z',
    metadata: {},
  };
}

const ALL_FLEET_OPS_CATEGORIES = [
  'wind_down_survey',
  'coordinator_review',
  'coordinator_adam_review',
  'adam_self_assessment',
  'solomon_self_assessment',
  'solomon_adherence_drift',
  'chairman_decision_deferred',
  'fleet_retro',
  'fleet_dormancy',
  'model_capability_baseline',
  'feature_flag_governance',
  'solomon_forecast_basis',
];

// ── Pure-function tests on filterEnhancementsExcludingFleetOps ──

describe('Set membership pin', () => {
  it('FLEET_OPS_TELEMETRY_CATEGORIES has exactly the 12 expected members', () => {
    expect(FLEET_OPS_TELEMETRY_CATEGORIES.size).toBe(12);
    for (const c of ALL_FLEET_OPS_CATEGORIES) expect(FLEET_OPS_TELEMETRY_CATEGORIES.has(c)).toBe(true);
  });
});

describe('per-category exclusion', () => {
  it('excludes one enhancement-type row per each of the 12 fleet-ops categories', () => {
    const enriched = ALL_FLEET_OPS_CATEGORIES.map((category, i) => row({ id: `f${i}`, category }));
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps(enriched);
    expect(enhancements).toEqual([]);
    expect(skippedFleetOps).toBe(12);
  });
});

describe('genuine enhancement pass-through', () => {
  it('leaves rows with an unrelated category unchanged', () => {
    const enriched = [
      row({ id: 'e1', category: 'feature_request' }),
      row({ id: 'e2', category: 'ui_improvement' }),
    ];
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps(enriched);
    expect(enhancements.map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(skippedFleetOps).toBe(0);
  });

  it('does not throw on category=null and lets it survive', () => {
    const enriched = [row({ id: 'null-cat', category: null })];
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps(enriched);
    expect(enhancements.map((r) => r.id)).toEqual(['null-cat']);
    expect(skippedFleetOps).toBe(0);
  });

  it('does not exclude a future/unrecognized category — strict allowlist-by-exclusion of exactly 7 names, never a heuristic', () => {
    const enriched = [row({ id: 'new-cat', category: 'some_brand_new_enhancement_category' })];
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps(enriched);
    expect(enhancements.map((r) => r.id)).toEqual(['new-cat']);
    expect(skippedFleetOps).toBe(0);
  });
});

describe('null/empty robustness', () => {
  it('returns empty + zero on empty input', () => {
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps([]);
    expect(enhancements).toEqual([]);
    expect(skippedFleetOps).toBe(0);
  });

  it('returns empty + zero on null/undefined', () => {
    expect(filterEnhancementsExcludingFleetOps(null)).toEqual({ enhancements: [], skippedFleetOps: 0 });
    expect(filterEnhancementsExcludingFleetOps(undefined)).toEqual({ enhancements: [], skippedFleetOps: 0 });
  });
});

describe('type-gate enforcement (not left to caller discipline)', () => {
  it('a type=issue row with an excluded category name is not counted as skipped and does not appear in the output', () => {
    const enriched = [
      row({ id: 'issue-1', type: 'issue', category: 'wind_down_survey' }),
      row({ id: 'enh-1', type: 'enhancement', category: 'wind_down_survey' }),
    ];
    const { enhancements, skippedFleetOps } = filterEnhancementsExcludingFleetOps(enriched);
    expect(enhancements).toEqual([]);
    expect(skippedFleetOps).toBe(1); // only the enhancement-type row is considered at all
  });
});

describe('composition with splitEnhancementsExcludingHarnessBacklog', () => {
  it('chaining the two filters excludes both harness_backlog and fleet-ops rows, keeping only genuine rows', () => {
    const enriched = [
      row({ id: 'hb-1', category: 'harness_backlog' }),
      row({ id: 'wds-1', category: 'wind_down_survey' }),
      row({ id: 'cr-1', category: 'coordinator_review' }),
      row({ id: 'keep-1', category: 'feature_request' }),
    ];
    const { enhancements: harnessFiltered } = splitEnhancementsExcludingHarnessBacklog(enriched);
    const { enhancements: final, skippedFleetOps } = filterEnhancementsExcludingFleetOps(harnessFiltered);
    expect(final.map((r) => r.id)).toEqual(['keep-1']);
    expect(skippedFleetOps).toBe(2); // wds-1, cr-1 (hb-1 already removed by the prior stage)
  });
});

// ── Real-pipeline tests through the actual loadInboxItems() method ──

describe('real chained pipeline (loadInboxItems)', () => {
  afterEach(() => {
    delete process.env.LEO_ASSIST_ENH_OPSFILTER;
    vi.restoreAllMocks();
  });

  it('excludes all 7 fleet-ops categories end-to-end; a genuine enhancement survives', async () => {
    currentFixture = [
      ...ALL_FLEET_OPS_CATEGORIES.map((category, i) => row({ id: `f${i}`, category })),
      row({ id: 'keep-1', category: 'feature_request' }),
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { enhancements } = await engine.loadInboxItems();
    const ids = enhancements.map((i) => i.id);

    expect(ids).toEqual(['keep-1']);
  });

  it('does not affect the issues stream (no cross-contamination)', async () => {
    currentFixture = [
      row({ id: 'issue-wds', type: 'issue', category: 'wind_down_survey' }),
      row({ id: 'issue-ci', type: 'issue', category: 'ci_failure' }),
      row({ id: 'enh-wds', type: 'enhancement', category: 'wind_down_survey' }),
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { issues, enhancements } = await engine.loadInboxItems();

    // Both issue rows survive the enhancements-side filter untouched (category collision
    // across types does not leak into the issues stream's own filtering).
    expect(issues.map((i) => i.id).sort()).toEqual(['issue-ci', 'issue-wds']);
    expect(enhancements.map((i) => i.id)).toEqual([]);
  });

  it('existing harness_backlog and TERMINAL_CATEGORIES exclusions still function alongside the new filter', async () => {
    currentFixture = [
      row({ id: 'hb-1', category: 'harness_backlog' }),
      row({ id: 'term-1', category: 'completion_flag_witness' }),
      row({ id: 'wds-1', category: 'wind_down_survey' }),
      row({ id: 'keep-1', category: 'feature_request' }),
    ];
    const engine = new AssistEngine({ dryRun: true });
    const { enhancements } = await engine.loadInboxItems();
    expect(enhancements.map((i) => i.id)).toEqual(['keep-1']);
  });

  it('LEO_ASSIST_ENH_OPSFILTER=false is honored end-to-end, and the harness_backlog exclusion is unaffected by it', async () => {
    currentFixture = [
      row({ id: 'hb-1', category: 'harness_backlog' }),
      row({ id: 'wds-1', category: 'wind_down_survey' }),
    ];

    // Run 1: gate enabled (default / unset).
    delete process.env.LEO_ASSIST_ENH_OPSFILTER;
    const logSpyEnabled = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineEnabled = new AssistEngine({ dryRun: true });
    const enabledResult = await engineEnabled.loadInboxItems();
    const enabledIds = enabledResult.enhancements.map((i) => i.id);
    const enabledLogs = logSpyEnabled.mock.calls.map((c) => c.join(' '));
    logSpyEnabled.mockRestore();

    expect(enabledIds).toEqual([]); // both excluded
    expect(enabledLogs.some((l) => l.includes('fleet-ops telemetry') && l.includes('Excluded 1'))).toBe(true);
    expect(enabledLogs.some((l) => l.includes('fleet-ops filter disabled'))).toBe(false);

    // Run 2: gate disabled.
    process.env.LEO_ASSIST_ENH_OPSFILTER = 'false';
    const logSpyDisabled = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engineDisabled = new AssistEngine({ dryRun: true });
    const disabledResult = await engineDisabled.loadInboxItems();
    const disabledIds = disabledResult.enhancements.map((i) => i.id);
    const disabledLogs = logSpyDisabled.mock.calls.map((c) => c.join(' '));
    logSpyDisabled.mockRestore();

    // splitEnhancementsExcludingHarnessBacklog (untouched by this flag) still excludes
    // harness_backlog; the new filter is bypassed, so wind_down_survey survives.
    expect(disabledIds).toEqual(['wds-1']);
    expect(disabledLogs.some((l) => l.includes('fleet-ops filter disabled'))).toBe(true);

    // Distinguishability: the disabled run's log lines are never a subset-match of the
    // enabled run's "0 matched" case.
    expect(disabledLogs).not.toEqual(enabledLogs);
  });

  it('zero-excluded-rows produces no fleet-ops skip-count log line', async () => {
    currentFixture = [row({ id: 'keep-1', category: 'feature_request' })];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const engine = new AssistEngine({ dryRun: true });
    await engine.loadInboxItems();
    const logs = logSpy.mock.calls.map((c) => c.join(' '));
    logSpy.mockRestore();

    expect(logs.some((l) => l.includes('fleet-ops telemetry'))).toBe(false);
  });
});
