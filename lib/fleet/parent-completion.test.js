import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../scripts/claim-orchestrator-for-rollup.mjs', () => ({
  claimOrchestratorForRollup: vi.fn(),
}));

const { claimOrchestratorForRollup } = await import('../../scripts/claim-orchestrator-for-rollup.mjs');
const { runParentCompletion, STATUS } = await import('./parent-completion.mjs');

beforeEach(() => {
  claimOrchestratorForRollup.mockReset();
});

const PARENT_ID = 'parent-uuid-1';
const PARENT_KEY = 'SD-ORCH-PARENT-001';

function stubSupabase({ parentRow, childrenRows = [], handoffRows = [], p2lRows = [] }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col) => ({
              maybeSingle: () => Promise.resolve({ data: parentRow, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// checkParentCompletable and getLatestPlanToLead both query strategic_directives_v2 /
// sd_phase_handoffs with different .eq() chains -- a richer stub distinguishing them by column.
function fullStub({ parentRow, childrenRows = [], lfaHandoffRows = [], p2lHandoffRows = [] }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col) => {
              if (col === 'sd_key' || col === 'id') {
                return {
                  maybeSingle: () => Promise.resolve({ data: parentRow, error: null }),
                  // checkParentCompletable's children query also calls .eq('parent_sd_id', ...)
                  // but reuses this same shape via a second .eq call in a chained object below.
                };
              }
              if (col === 'parent_sd_id') return Promise.resolve({ data: childrenRows, error: null });
              throw new Error(`unexpected eq column: ${col}`);
            },
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            or: () => ({
              // checkParentCompletable awaits .eq().order() directly (no .limit());
              // getLatestPlanToLead chains .eq().order().limit(1). Real supabase-js's query
              // builder is a thenable that also exposes further chain methods -- .order()'s
              // return value here must be BOTH awaitable AND carry a .limit() method, not a
              // bare Promise (a bare Promise has no .limit and throws when chained).
              eq: (_col, val) => {
                const rows = val === 'LEAD-FINAL-APPROVAL' ? lfaHandoffRows : p2lHandoffRows;
                return {
                  order: () => {
                    const p = Promise.resolve({ data: rows, error: null });
                    p.limit = () => Promise.resolve({ data: rows.slice(0, 1), error: null });
                    return p;
                  },
                };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// NOTE: checkParentCompletable's children lookup and parent-completion.mjs's own parent lookup
// BOTH call .eq() on strategic_directives_v2 but with different columns (sd_key/id vs
// parent_sd_id) -- the fullStub above distinguishes by column name, and getLatestPlanToLead's
// .order().limit() chain is distinguished by which handoff_type value was filtered on.
function baseDeps(overrides = {}) {
  return {
    sessionId: 'worker-1',
    parentKey: PARENT_KEY,
    getFilteredRetrospective: vi.fn(async () => ({ retrospective: { id: 'retro-1' }, error: null })),
    validateSDCompletionReadiness: vi.fn(async () => ({ passed: true, score: 90 })),
    runHandoff: vi.fn(async () => ({ pass: true, score: 95, reason: null })),
    ...overrides,
  };
}

describe('runParentCompletion', () => {
  it('TS-1: eligible parent (P2L already accepted, retro passes) claims, skips retrigger, executes LEAD-FINAL-APPROVAL, releases, reports completed', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      lfaHandoffRows: [],
      p2lHandoffRows: [{ id: 'h1', status: 'accepted', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const result = await runParentCompletion({ ...baseDeps(), supabase });
    expect(result.status).toBe(STATUS.COMPLETED);
    expect(claimOrchestratorForRollup).toHaveBeenCalledTimes(2);
    expect(claimOrchestratorForRollup).toHaveBeenNthCalledWith(2, supabase, expect.objectContaining({ release: true }));
  });

  it('retriggers PLAN-TO-LEAD when status=blocked AND metadata.wait=true, then proceeds', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'blocked', metadata: { wait: true }, created_at: '2026-01-01T01:00:00Z' }],
    });
    const deps = baseDeps();
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.COMPLETED);
    expect(deps.runHandoff).toHaveBeenCalledWith('PLAN-TO-LEAD', PARENT_KEY);
    expect(deps.runHandoff).toHaveBeenCalledWith('LEAD-FINAL-APPROVAL', PARENT_KEY);
  });

  it('TS-2b: NEVER retriggers when latest PLAN-TO-LEAD is rejected -- reports staged_other_gate, releases', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'rejected', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const deps = baseDeps();
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.STAGED_OTHER_GATE);
    expect(deps.runHandoff).not.toHaveBeenCalledWith('PLAN-TO-LEAD', PARENT_KEY);
    expect(claimOrchestratorForRollup).toHaveBeenCalledTimes(2); // still claimed then released
  });

  it('a real blocked handoff WITHOUT metadata.wait=true is also never retriggered (only the WAIT discriminator qualifies)', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'blocked', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const deps = baseDeps();
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.STAGED_OTHER_GATE);
    expect(deps.runHandoff).not.toHaveBeenCalledWith('PLAN-TO-LEAD', PARENT_KEY);
  });

  it('FR-2: retro would fail -- reports staged_retro_quality + needsRegeneration, releases the claim (does not hold it across regeneration)', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'accepted', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const deps = baseDeps({ validateSDCompletionReadiness: vi.fn(async () => ({ passed: false, score: 21 })) });
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.STAGED_RETRO_QUALITY);
    expect(result.needsRegeneration).toBe(true);
    expect(deps.runHandoff).not.toHaveBeenCalledWith('LEAD-FINAL-APPROVAL', PARENT_KEY);
    expect(claimOrchestratorForRollup).toHaveBeenCalledTimes(2);
  });

  it('TS-2c idempotency: re-running after regeneration (P2L now accepted) skips step (b) and does not create a duplicate PLAN-TO-LEAD row', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'accepted', metadata: {}, created_at: '2026-01-01T01:00:00Z' }], // simulates the SAME accepted row from a prior run
    });
    const deps = baseDeps(); // this time retro passes
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.COMPLETED);
    expect(deps.runHandoff).not.toHaveBeenCalledWith('PLAN-TO-LEAD', PARENT_KEY); // no duplicate P2L attempt
  });

  it('releases the claim even when LEAD-FINAL-APPROVAL fails on an unrelated gate (staged_other_gate)', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'released', sdKey: PARENT_KEY });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'accepted', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const deps = baseDeps({ runHandoff: vi.fn(async (phase) => (phase === 'LEAD-FINAL-APPROVAL' ? { pass: false, score: 40, reason: 'CHAIRMAN_APPLY_VERIFICATION' } : { pass: true, score: 100, reason: null })) });
    const result = await runParentCompletion({ ...deps, supabase });
    expect(result.status).toBe(STATUS.STAGED_OTHER_GATE);
    expect(result.blockedGate).toBe('CHAIRMAN_APPLY_VERIFICATION');
    expect(claimOrchestratorForRollup).toHaveBeenCalledTimes(2);
  });

  it('reports strandedClaim=true (never silently swallowed) when the release itself fails', async () => {
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: true, action: 'claimed', sdKey: PARENT_KEY });
    claimOrchestratorForRollup.mockResolvedValueOnce({ ok: false, action: 'refused', reason: 'claimed by a different live session' });
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'completed' }],
      p2lHandoffRows: [{ id: 'h1', status: 'accepted', metadata: {}, created_at: '2026-01-01T01:00:00Z' }],
    });
    const result = await runParentCompletion({ ...baseDeps(), supabase });
    expect(result.status).toBe(STATUS.COMPLETED); // the planning outcome itself still succeeded
    expect(result.strandedClaim).toBe(true);
    expect(result.strandedClaimReason).toBeTruthy();
  });

  it('not_ready, and no claim attempted at all, when a child is not yet terminal', async () => {
    const supabase = fullStub({
      parentRow: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} },
      childrenRows: [{ id: 'c1', status: 'in_progress' }],
    });
    const result = await runParentCompletion({ ...baseDeps(), supabase });
    expect(result.status).toBe(STATUS.NOT_READY);
    expect(claimOrchestratorForRollup).not.toHaveBeenCalled();
  });

  it('not_ready (never fail-open) when completability itself could not be checked', async () => {
    const throwingSupabase = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: (col) => {
                if (col === 'sd_key') return { maybeSingle: () => Promise.resolve({ data: { id: PARENT_ID, sd_key: PARENT_KEY, status: 'pending_approval', created_at: '2026-01-01T00:00:00Z', metadata: {} }, error: null }) };
                if (col === 'parent_sd_id') return Promise.resolve({ data: null, error: new Error('boom') });
                throw new Error(`unexpected eq: ${col}`);
              },
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const result = await runParentCompletion({ ...baseDeps(), supabase: throwingSupabase });
    expect(result.status).toBe(STATUS.NOT_READY);
    expect(claimOrchestratorForRollup).not.toHaveBeenCalled();
  });
});
