/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-C (FR-1, FR-2, TS-1/TS-2/TS-3/TS-4/TS-5).
 *
 * scripts/reconcile-escalated-completed-sd-quick-fixes.mjs reconciles quick_fixes rows stuck
 * status='escalated' after their target SD completed. Mirrors the mocking pattern established
 * by tests/unit/scripts/backfill-stranded-escalated-qfs.test.js: the script loads
 * lib/quick-fix/status-writer.cjs via createRequire (CommonJS), so vi.mock() cannot intercept
 * it — the REAL writer runs against a supabase mock, exercising the script's actual
 * integration with the canonical writer rather than a bypassable mock boundary.
 *
 * THIS FILE IS ALSO FR-2's CI-ASSERTED PREVENTIVE (TS-4), not merely FR-1's test coverage.
 * The "findTargetRows" describe block below IS the invariant query the parent CAPA's own
 * MEASURE names ("the invariant query over escalation rows reads 0") — asserting it returns
 * [] on clean input and a non-empty violation set on a seeded one. An earlier version of this
 * FR used a live-DB tests/db-invariants/ suite instead; that suite was REMOVED after
 * verification (grep across every .github/workflows/*.yml) that NO workflow sets
 * VITEST_DB_ALLOW_REF anywhere, "by design" per five separate workflow comments — meaning that
 * whole test class is structurally dormant under this repo's CI configuration and would have
 * silently never fired, the exact "reads as wired, never runs" defect this SD exists to close
 * in OTHER rows. This mock-based suite runs on every PR via .github/workflows/unit-tier.yml
 * (`--project unit` includes all *.test.js files) — proven live in this session, not assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The imported script's own main() constructs a real client via createClient, but every test
// here calls findTargetRows()/run() directly with an injected mock — main()/createClient are
// never reached. Mocking the module anyway (matching backfill-stranded-escalated-qfs.test.js's
// convention) makes that unreachability explicit to the DB-test guard (audit-db-test-guards.mjs
// SUPABASE_MOCK_SIGNAL) rather than relying on it to infer it from control flow.
let supabaseInstance;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseInstance),
}));

/**
 * @param {{quickFixes: object[], sds: object[]}} fixtures
 * quickFixes rows carry: id, status, escalated_to_sd_id, resolution_sd_id, escalation_reason.
 * sds rows carry: id, sd_key, status.
 */
function makeSupabaseMock({ quickFixes, sds }) {
  const updateCalls = [];
  const from = vi.fn((table) => {
    if (table === 'strategic_directives_v2') {
      const builder = {};
      builder.select = vi.fn(() => builder);
      // findTargetRows reads via fetchAllPaginated, which appends .range() to whatever
      // queryFactory() returns — .in() must stay CHAINABLE (not resolve) so .range() lands
      // on the same builder; .range() is where the page actually resolves.
      builder.in = vi.fn(() => builder);
      builder.range = vi.fn(() => Promise.resolve({ data: sds, error: null }));
      return builder;
    }

    // table === 'quick_fixes'
    let isUpdate = false;
    let lastEqId = null;
    let pendingUpdate = null;
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col, val) => {
      // setQuickFixStatus's chains differ in ORDER: the lookup does
      // .select().eq('id',...), but the write does .update(patch).eq('id',...).eq('status',...)
      // — .eq('id', ...) fires AFTER .update() on the write path, so the id must be attached to
      // the SAME pending-call object .update() already pushed, not captured before it existed.
      if (col === 'id') {
        lastEqId = val;
        if (pendingUpdate) pendingUpdate.id = val;
      }
      return builder;
    });
    // findTargetRows reads via fetchAllPaginated too — .not() stays CHAINABLE so the
    // .range() it appends lands on this same builder; .range() is where the page resolves.
    builder.not = vi.fn(() => builder);
    builder.range = vi.fn(() => Promise.resolve({ data: quickFixes, error: null }));
    // setQuickFixStatus's internal lookup + update both terminate on .maybeSingle().
    builder.update = vi.fn((payload) => {
      isUpdate = true;
      pendingUpdate = { id: null, payload };
      updateCalls.push(pendingUpdate);
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => {
      if (isUpdate) {
        return { data: { id: lastEqId, status: 'closed' }, error: null };
      }
      const row = quickFixes.find((r) => r.id === lastEqId);
      return { data: { status: row?.status ?? 'escalated', escalation_reason: row?.escalation_reason ?? null }, error: null };
    });
    return builder;
  });
  return { from, _calls: { updateCalls } };
}

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://test.supabase';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

async function importScript() {
  vi.resetModules();
  return await import('../../../scripts/reconcile-escalated-completed-sd-quick-fixes.mjs');
}

describe('findTargetRows — selects only escalated rows pointing at a completed SD, not yet resolved', () => {
  it('TS-3: a row escalated to a NON-completed SD is excluded', async () => {
    const quickFixes = [
      { id: 'QF-A', status: 'escalated', escalated_to_sd_id: 'sd-1', resolution_sd_id: null },
    ];
    const sds = [{ id: 'sd-1', sd_key: 'SD-NOT-DONE-001', status: 'in_progress' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { findTargetRows } = await importScript();
    const targets = await findTargetRows(supabaseInstance);
    expect(targets).toEqual([]);
  });

  it('includes a row escalated to a completed SD with resolution_sd_id still NULL', async () => {
    const quickFixes = [
      { id: 'QF-B', status: 'escalated', escalated_to_sd_id: 'sd-2', resolution_sd_id: null },
    ];
    const sds = [{ id: 'sd-2', sd_key: 'SD-DONE-001', status: 'completed' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { findTargetRows } = await importScript();
    const targets = await findTargetRows(supabaseInstance);
    expect(targets).toEqual([{ id: 'QF-B', escalated_to_sd_id: 'sd-2', sd_key: 'SD-DONE-001' }]);
  });

  it('TS-5 (idempotency half): a row already carrying resolution_sd_id is excluded even if its target SD is completed', async () => {
    const quickFixes = [
      { id: 'QF-C', status: 'escalated', escalated_to_sd_id: 'sd-3', resolution_sd_id: 'sd-3' },
    ];
    const sds = [{ id: 'sd-3', sd_key: 'SD-DONE-002', status: 'completed' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { findTargetRows } = await importScript();
    const targets = await findTargetRows(supabaseInstance);
    expect(targets).toEqual([]);
  });
});

describe('TS-1: dry-run performs zero writes', () => {
  it('reports the target population without calling update', async () => {
    const quickFixes = [
      { id: 'QF-D', status: 'escalated', escalated_to_sd_id: 'sd-4', resolution_sd_id: null },
    ];
    const sds = [{ id: 'sd-4', sd_key: 'SD-DONE-003', status: 'completed' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: false, log: () => {} });

    expect(result.targets).toEqual([{ id: 'QF-D', escalated_to_sd_id: 'sd-4', sd_key: 'SD-DONE-003' }]);
    expect(result.reconciled).toEqual([]);
    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });
});

describe('TS-2: live mode transitions through setQuickFixStatus with every Guard B field plus resolution_sd_id', () => {
  it('writes status=closed, disposition_reason_code distinct from the mint-time value, disposed_by/at, and resolution_sd_id', async () => {
    const quickFixes = [
      { id: 'QF-E', status: 'escalated', escalated_to_sd_id: 'sd-5', resolution_sd_id: null, escalation_reason: 'escalated_to_sd' },
    ];
    const sds = [{ id: 'sd-5', sd_key: 'SD-DONE-004', status: 'completed' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: true, log: () => {} });

    expect(result.reconciled.length).toBe(1);
    expect(supabaseInstance._calls.updateCalls.length).toBe(1);
    const { id, payload } = supabaseInstance._calls.updateCalls[0];
    expect(id).toBe('QF-E');
    expect(payload.status).toBe('closed');
    expect(payload.disposition_reason_code).toBeTruthy();
    expect(payload.disposition_reason_code).not.toBe('escalated_to_sd');
    expect(payload.disposed_by).toContain('reconcile-escalated-completed-sd-quick-fixes.mjs');
    expect(payload.disposed_at).toBeTruthy();
    expect(payload.resolution_sd_id).toBe('sd-5');
    // Never the unrelated `disposition` enum column (coordinator-stale-qf-disposition-sweep.mjs's vocabulary).
    expect(payload).not.toHaveProperty('disposition');
  });
});

describe('TS-5 (write half): re-running live after a successful reconciliation is a no-op', () => {
  it('a second run against a row that already carries resolution_sd_id performs zero further writes', async () => {
    const quickFixes = [
      { id: 'QF-F', status: 'closed', escalated_to_sd_id: 'sd-6', resolution_sd_id: 'sd-6' },
    ];
    const sds = [{ id: 'sd-6', sd_key: 'SD-DONE-005', status: 'completed' }];
    supabaseInstance = makeSupabaseMock({ quickFixes, sds });

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: true, log: () => {} });

    expect(result.targets).toEqual([]);
    expect(result.reconciled).toEqual([]);
    expect(supabaseInstance._calls.updateCalls.length).toBe(0);
  });
});
