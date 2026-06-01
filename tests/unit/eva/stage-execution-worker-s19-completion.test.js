/**
 * SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 / FR-1 — the shared leo_bridge SD-completion evaluator
 * StageExecutionWorker._isLeoBridgeBuildComplete(ventureId).
 *
 * This is the single source of truth consumed by BOTH the S19 hard gate (in-worker) and the
 * S20 pause controller, so "build complete" can never disagree between the two enforcement points.
 *
 * Contract under test (lib/eva/stage-execution-worker.js ~3369):
 *   - reads ventures.build_model + venture_stage_work(stage 19).advisory_data and resolves the model
 *     via ./bridge/resolve-build-model.js resolveBuildModel({ventureBuildModel, legacyBuildMethod});
 *   - buildModel !== 'leo_bridge'                     → null   (invariant does not apply)
 *   - leo_bridge + advisory_data.chairman_override    → true   (chairman escape hatch)
 *   - leo_bridge + 0 SDs                              → false  (the build never happened)
 *   - TERMINAL = {completed,cancelled,archived}, COMPLETED = {completed,archived}:
 *       returns true ONLY when every SD is TERMINAL AND at least one is COMPLETED;
 *       an all-'cancelled' tree → false; any non-terminal SD → false.
 *
 * IMPORTANT resolver nuance (lib/eva/bridge/resolve-build-model.js): an UNSET build_model
 * (null/undefined) DEFAULTS to 'leo_bridge'. So the "not a leo_bridge venture → null" case must
 * use an explicit non-leo_bridge signal — build_model='seeded_repo' (or legacy 'replit_agent') —
 * NOT a null build_model. This test pins that real behavior.
 *
 * Harness mirrors stage-execution-worker-s19-surfacing.test.js / -s19-gate.test.js: a real worker
 * is built with an injected chainable `_supabase` mock + no-op logger. Per `from(table)` a fresh
 * chain records `.eq()` filters and resolves the terminal `.maybeSingle()` from a per-table queue;
 * `strategic_directives_v2` resolves its `.eq()`-terminated array via the awaitable chain (`then`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

/**
 * Build a chainable supabase mock tailored to _isLeoBridgeBuildComplete's three reads:
 *   - ventures.build_model            (terminal: .maybeSingle())
 *   - venture_stage_work(19).advisory_data (terminal: .maybeSingle())
 *   - strategic_directives_v2.status  (terminal: awaited chain after .select().eq())
 *
 * @param {object} cfg
 * @param {string|null} [cfg.buildModel]      ventures.build_model row value (null ⇒ no row)
 * @param {object|null} [cfg.advisoryData]    venture_stage_work(19).advisory_data row value
 * @param {Array<{status:string}>|null} [cfg.sds]  strategic_directives_v2 rows (the awaited result)
 */
function createMockSupabase({ buildModel = null, advisoryData = null, sds = [] } = {}) {
  const calls = { from: [], eq: [], select: [] };

  const from = vi.fn((table) => {
    calls.from.push(table);

    // The awaited result of the chain (used by strategic_directives_v2's .select().eq() terminal).
    let awaitResult = { data: null, error: null };
    if (table === 'strategic_directives_v2') awaitResult = { data: sds, error: null };

    const single = () => {
      if (table === 'ventures') {
        return Promise.resolve({ data: buildModel === null ? null : { build_model: buildModel }, error: null });
      }
      if (table === 'venture_stage_work') {
        return Promise.resolve({ data: advisoryData === null ? null : { advisory_data: advisoryData }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };

    const chain = {
      select: vi.fn((cols) => { calls.select.push({ table, cols }); return chain; }),
      eq: vi.fn((col, val) => { calls.eq.push({ table, col, val }); return chain; }),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(() => single()),
      single: vi.fn(() => single()),
      // strategic_directives_v2 ends at `.select(...).eq(...)` and is awaited directly.
      then: (resolve) => resolve(awaitResult),
    };
    return chain;
  });

  return { from, _calls: calls };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  worker._verifyAndProvisionVenture = vi.fn().mockResolvedValue(undefined);
  return worker;
}

const eqStrings = (calls, table) =>
  calls.eq.filter((e) => e.table === table).map((e) => `${e.col}=${e.val}`);

describe('SD-LEO-INFRA-ENFORCE-S19-COMPLETION-001 _isLeoBridgeBuildComplete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns NULL when the venture is NOT leo_bridge (build_model=seeded_repo) — invariant does not apply', async () => {
    const supabase = createMockSupabase({ buildModel: 'seeded_repo', sds: [{ status: 'in_progress' }] });
    const worker = makeWorker(supabase);

    const result = await worker._isLeoBridgeBuildComplete('v-seeded');

    expect(result).toBeNull();
    // Short-circuits before ever querying SDs (the invariant doesn't apply to seeded_repo).
    expect(supabase._calls.from.filter((t) => t === 'strategic_directives_v2')).toHaveLength(0);
  });

  it('returns NULL when legacy build_method=replit_agent forces seeded_repo (not leo_bridge)', async () => {
    const supabase = createMockSupabase({
      buildModel: null, // unset SSOT column…
      advisoryData: { build_method: 'replit_agent' }, // …but legacy signal pins seeded_repo
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-legacy')).toBeNull();
  });

  it('returns TRUE on chairman_override (escape hatch) regardless of SD state', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      advisoryData: { chairman_override: true },
      sds: [{ status: 'in_progress' }, { status: 'pending' }], // would otherwise be incomplete
    });
    const worker = makeWorker(supabase);

    const result = await worker._isLeoBridgeBuildComplete('v-override');

    expect(result).toBe(true);
    // Escape hatch short-circuits before the SD query.
    expect(supabase._calls.from.filter((t) => t === 'strategic_directives_v2')).toHaveLength(0);
  });

  it('returns FALSE for a leo_bridge venture with ZERO build SDs (the build never happened)', async () => {
    const supabase = createMockSupabase({ buildModel: 'leo_bridge', sds: [] });
    const worker = makeWorker(supabase);

    const result = await worker._isLeoBridgeBuildComplete('v-no-sds');

    expect(result).toBe(false);
    // Confirms it actually reached + filtered the SD query.
    expect(eqStrings(supabase._calls, 'strategic_directives_v2')).toContain('venture_id=v-no-sds');
  });

  it('returns TRUE when EVERY SD is completed (all terminal + at least one completed)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'completed' }, { status: 'completed' }, { status: 'completed' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-done')).toBe(true);
  });

  it('returns TRUE for a mixed completed + cancelled tree (all terminal, at least one completed)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'completed' }, { status: 'cancelled' }, { status: 'archived' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-mixed')).toBe(true);
  });

  it('returns FALSE when a single SD is still in_progress (non-terminal blocks completion)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'completed' }, { status: 'in_progress' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-inprog')).toBe(false);
  });

  it('returns FALSE when a single SD is pending (non-terminal blocks completion)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'completed' }, { status: 'pending' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-pending')).toBe(false);
  });

  it('returns FALSE for an ALL-cancelled tree (terminal, but no completed ⇒ build never delivered)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'cancelled' }, { status: 'cancelled' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-cancelled')).toBe(false);
  });

  it('treats "archived" as a completed-equivalent terminal status (all-archived ⇒ true)', async () => {
    const supabase = createMockSupabase({
      buildModel: 'leo_bridge',
      sds: [{ status: 'archived' }, { status: 'archived' }],
    });
    const worker = makeWorker(supabase);

    expect(await worker._isLeoBridgeBuildComplete('v-archived')).toBe(true);
  });

  it('queries the SD status filtered by venture_id (lifecycle_stage=19 used for the work read)', async () => {
    const supabase = createMockSupabase({ buildModel: 'leo_bridge', sds: [{ status: 'completed' }] });
    const worker = makeWorker(supabase);

    await worker._isLeoBridgeBuildComplete('v-filters');

    // The S19 work read is filtered to stage 19…
    expect(eqStrings(supabase._calls, 'venture_stage_work')).toContain('lifecycle_stage=19');
    expect(eqStrings(supabase._calls, 'venture_stage_work')).toContain('venture_id=v-filters');
    // …and the ventures read + SD read are venture-scoped.
    expect(eqStrings(supabase._calls, 'ventures')).toContain('id=v-filters');
    expect(eqStrings(supabase._calls, 'strategic_directives_v2')).toContain('venture_id=v-filters');
  });
});
