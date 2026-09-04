/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-2 (AC-4): LeadFinalApprovalExecutor refuses
 * completion while an unreleased chairman hold stands (isUnreleasedChairmanHold, FR-1),
 * instead of silently writing status='completed' over it.
 *
 * Harness mirrors lead-final-approval-cas-race.test.js's shared stateful fake Supabase
 * (duplicated rather than imported — that file does not export it).
 *
 * Zero-regression coverage for released holds / non-chairman-hold metadata (deferred_by,
 * absent metadata, etc.) lives in tests/unit/fleet/claim-eligibility-unreleased-chairman-hold.test.js
 * (the predicate itself) plus the pre-existing attemptCasCompletion coverage in
 * lead-final-approval-cas-race.test.js. Deliberately NOT re-driven through the full
 * executeSpecific() happy path here -- that path performs real gate/retro/migration work
 * well past this guard's early-return and reliably exceeds vitest's default per-test
 * timeout under load; the pre-existing race-test file avoids the same trap by calling
 * attemptCasCompletion directly for its own "no peer" sanity check rather than going
 * through executeSpecific.
 */
import { describe, it, expect } from 'vitest';
import { LeadFinalApprovalExecutor } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

function makeSharedSupabase(initialSdRow) {
  const state = { sdRow: { ...initialSdRow }, lhe: [], sph: [], seq: 0 };
  const calls = [];
  const nextId = (prefix) => `${prefix}-${++state.seq}`;
  const matches = (row, filters) => Object.entries(filters).every(([k, v]) => row[k] === v);

  function makeBuilder(table) {
    const ctx = { table, op: null, filters: {}, payload: null, limitN: null };

    function execute(single) {
      calls.push({ table: ctx.table, op: ctx.op, filters: { ...ctx.filters } });

      if (ctx.table === 'strategic_directives_v2') {
        if (ctx.op === 'update') {
          if (!matches(state.sdRow, ctx.filters)) return { data: [], error: null };
          state.sdRow = { ...state.sdRow, ...ctx.payload };
          const row = { id: state.sdRow.id };
          return single ? { data: row, error: null } : { data: [row], error: null };
        }
        if (ctx.op === 'select') {
          if (!matches(state.sdRow, ctx.filters)) return single ? { data: null, error: null } : { data: [], error: null };
          return single ? { data: { ...state.sdRow }, error: null } : { data: [{ ...state.sdRow }], error: null };
        }
      }

      if (ctx.table === 'leo_handoff_executions') {
        if (ctx.op === 'insert') {
          const row = { id: nextId('lhe'), ...ctx.payload, created_at: '2026-07-17T00:00:00.000Z' };
          state.lhe.push(row);
          return single ? { data: row, error: null } : { data: [row], error: null };
        }
        if (ctx.op === 'delete') {
          state.lhe = state.lhe.filter(r => !matches(r, ctx.filters));
          return { data: null, error: null };
        }
        if (ctx.op === 'select') {
          let rows = state.lhe.filter(r => matches(r, ctx.filters));
          if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
          return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
        }
      }

      if (ctx.table === 'sd_phase_handoffs') {
        if (ctx.op === 'insert') {
          const row = { id: nextId('sph'), ...ctx.payload };
          state.sph.push(row);
          return single ? { data: row, error: null } : { data: [row], error: null };
        }
        if (ctx.op === 'select') {
          let rows = state.sph.filter(r => matches(r, ctx.filters));
          if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
          return single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null };
        }
      }

      return { data: null, error: null };
    }

    const builder = {
      select() { ctx.op = ctx.op || 'select'; return builder; },
      insert(payload) { ctx.op = 'insert'; ctx.payload = payload; return builder; },
      update(payload) { ctx.op = 'update'; ctx.payload = payload; return builder; },
      delete() { ctx.op = 'delete'; return builder; },
      eq(col, val) { ctx.filters[col] = val; return builder; },
      order() { return builder; },
      limit(n) { ctx.limitN = n; return builder; },
      maybeSingle() { return Promise.resolve(execute(true)); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
    };
    return builder;
  }

  return {
    _state: state,
    _calls: calls,
    from(table) { return makeBuilder(table); },
  };
}

function makeExecutor(supabase) {
  const exec = Object.create(LeadFinalApprovalExecutor.prototype);
  exec.supabase = supabase;
  exec.verifyMigrationsApplied = async () => ({ hasMigrations: false, migrationFiles: [], foundTables: [], missingTables: [] });
  return exec;
}

const SD_ROW = { id: 'sd-uuid-hold-1', sd_key: 'SD-TEST-HOLD-001', status: 'pending_approval' };

describe('LeadFinalApprovalExecutor.executeSpecific — unreleased chairman hold refusal (FR-2 AC-4)', () => {
  it('refuses completion when requires_human_action_reason is set and unreleased — SD status is NOT written to completed', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const exec = makeExecutor(supabase);
    const snapshot = {
      ...SD_ROW,
      active_session_id: 'this-session',
      metadata: { requires_human_action_reason: 'chairman must review scope change', requires_human_action_at: '2026-08-01T00:00:00Z' },
    };
    const result = await exec.executeSpecific('sd-uuid-hold-1', snapshot, {}, { normalizedScore: 95 });

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('UNRELEASED_CHAIRMAN_HOLD');
    expect(supabase._state.sdRow.status).toBe('pending_approval'); // never transitioned
  });

  it('refuses completion when review_hold_reason is set and unreleased (the one-way-latch gap FR-1 closes)', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const exec = makeExecutor(supabase);
    const snapshot = {
      ...SD_ROW,
      active_session_id: 'this-session',
      metadata: { review_hold_reason: 'build review flagged, chairman must decide' },
    };
    const result = await exec.executeSpecific('sd-uuid-hold-1', snapshot, {}, { normalizedScore: 95 });

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('UNRELEASED_CHAIRMAN_HOLD');
    expect(supabase._state.sdRow.status).toBe('pending_approval');
  });

  it('SECURITY finding SEC-3 fix: a refusal leaves NO ghost evidence rows behind (guard fires before any leo_handoff_executions/sd_phase_handoffs write)', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const exec = makeExecutor(supabase);
    const snapshot = {
      ...SD_ROW,
      active_session_id: 'this-session',
      metadata: { review_hold_reason: 'build review flagged, chairman must decide' },
    };
    await exec.executeSpecific('sd-uuid-hold-1', snapshot, {}, { normalizedScore: 95 });

    expect(supabase._state.lhe).toHaveLength(0);
    expect(supabase._state.sph).toHaveLength(0);
  });
});
