/**
 * SD-LEO-FIX-POST-MERGE-AUTOMATION-001 FR-3 — concurrency regression test.
 *
 * Race under test: post-merge automation (scripts/post-merge-handoff-orchestrator.js)
 * and a worker's own LEAD-FINAL-APPROVAL invocation can both pass the claim gate while
 * strategic_directives_v2.status is still 'pending_approval', then both reach
 * executeSpecific()'s terminal completion. Pre-fix, the terminal UPDATE was
 * unconditional, so both invocations believed they won — producing a duplicate
 * 'accepted' leo_handoff_executions row. FR-2's fix: a CAS-guarded UPDATE
 * (attemptCasCompletion) plus loser-side pre-insert cleanup (cleanupLosingPreInsert),
 * wired into LeadFinalApprovalExecutor.executeSpecific().
 *
 * Uses a single SHARED STATEFUL fake Supabase (one mutable SD row + recorders for
 * leo_handoff_executions/sd_phase_handoffs inserts) so the CAS's WHERE-clause
 * semantics are actually exercised, not just independently mocked per call.
 */
import { describe, it, expect } from 'vitest';
import { attemptCasCompletion, cleanupLosingPreInsert } from '../../../scripts/modules/handoff/executors/lead-final-approval/cas-completion.js';
import { LeadFinalApprovalExecutor } from '../../../scripts/modules/handoff/executors/lead-final-approval/index.js';

/**
 * Shared stateful fake Supabase: one mutable SD row, plus leo_handoff_executions
 * and sd_phase_handoffs tables modeled as arrays. All chain methods route through
 * a single execute() so the CAS UPDATE's .eq('status', 'pending_approval') filter
 * is evaluated against the CURRENT mutable state, not a snapshot.
 */
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

const SD_ROW = { id: 'sd-uuid-race-1', sd_key: 'SD-TEST-RACE-001', status: 'pending_approval' };

describe('attemptCasCompletion / cleanupLosingPreInsert (FR-2 mechanism)', () => {
  it('first caller wins the CAS (status still pending_approval)', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const result = await attemptCasCompletion(supabase, SD_ROW, { status: 'completed' });
    expect(result.won).toBe(true);
    expect(supabase._state.sdRow.status).toBe('completed');
  });

  it('second caller loses the CAS against the SAME shared row (0 rows affected)', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const first = await attemptCasCompletion(supabase, SD_ROW, { status: 'completed' });
    const second = await attemptCasCompletion(supabase, SD_ROW, { status: 'completed' });
    expect(first.won).toBe(true);
    expect(second.won).toBe(false);
    expect(second.error).toBeUndefined();
  });

  it('cleanupLosingPreInsert deletes only the specified row id, never a peer row', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    const winnerRow = await supabase.from('leo_handoff_executions').insert({ sd_id: SD_ROW.id, status: 'accepted', created_by: 'winner' }).select('id').maybeSingle();
    const loserRow = await supabase.from('leo_handoff_executions').insert({ sd_id: SD_ROW.id, status: 'accepted', created_by: 'loser' }).select('id').maybeSingle();

    await cleanupLosingPreInsert(supabase, loserRow.data.id);

    expect(supabase._state.lhe).toHaveLength(1);
    expect(supabase._state.lhe[0].id).toBe(winnerRow.data.id);
    expect(supabase._state.lhe[0].created_by).toBe('winner');
  });

  it('cleanupLosingPreInsert is a no-op for a null row id (fail-soft)', async () => {
    const supabase = makeSharedSupabase(SD_ROW);
    await expect(cleanupLosingPreInsert(supabase, null)).resolves.toBeUndefined();
    expect(supabase._calls).toHaveLength(0);
  });
});

describe('LeadFinalApprovalExecutor.executeSpecific — loser reconciles instead of duplicating (FR-2/FR-3)', () => {
  function makeExecutor(supabase) {
    const exec = Object.create(LeadFinalApprovalExecutor.prototype);
    exec.supabase = supabase;
    // Out of scope for this fix — stub to isolate the CAS/cleanup/reconcile path
    // under test from unrelated filesystem/DB-touching migration-file scanning.
    exec.verifyMigrationsApplied = async () => ({ hasMigrations: false, migrationFiles: [], foundTables: [], missingTables: [] });
    return exec;
  }

  it('reproduces the race: a peer already completed the SD before this invocation reaches the terminal UPDATE — no duplicate accepted row survives, no NO_CLAIM, idempotent success returned', async () => {
    // Simulate the peer (post-merge automation OR the other worker invocation) having
    // ALREADY won the CAS: the shared row is 'completed' even though THIS invocation's
    // own (now-stale) sd snapshot still says 'pending_approval' — exactly the observed
    // live race window.
    const supabase = makeSharedSupabase({ ...SD_ROW, status: 'completed' });
    // The peer's own accepted evidence row already exists (it completed for real).
    const peerLhe = await supabase.from('leo_handoff_executions').insert({
      sd_id: SD_ROW.id, handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_by: 'peer-winner'
    }).select('id').maybeSingle();

    const exec = makeExecutor(supabase);
    const staleSnapshot = { ...SD_ROW, status: 'pending_approval', active_session_id: 'this-session' };
    const result = await exec.executeSpecific('sd-uuid-race-1', staleSnapshot, {}, { normalizedScore: 95 });

    // No duplicate accepted leo_handoff_executions row: this invocation's own
    // unconditional pre-insert must have been cleaned up, leaving only the peer's.
    const acceptedLhe = supabase._state.lhe.filter(r => r.sd_id === SD_ROW.id && r.status === 'accepted');
    expect(acceptedLhe).toHaveLength(1);
    expect(acceptedLhe[0].id).toBe(peerLhe.data.id);

    // Idempotent success — NOT a NO_CLAIM/error result, and correctly flagged as a
    // reconciled loss rather than a fresh completion.
    expect(result.success).toBe(true);
    expect(result.alreadyCompleted).toBe(true);
    expect(result.concurrentRaceLost).toBe(true);

    // Reconcile wrote (or confirmed) the canonical sd_phase_handoffs LFA row.
    const canonicalSph = supabase._state.sph.filter(r => r.handoff_type === 'LEAD-FINAL-APPROVAL' && r.status === 'accepted');
    expect(canonicalSph.length).toBeGreaterThanOrEqual(1);
  });

  it('sanity check: when no peer has won, the CAS succeeds (not the loser branch)', async () => {
    const supabase = makeSharedSupabase({ ...SD_ROW }); // status still pending_approval
    const result = await attemptCasCompletion(supabase, SD_ROW, { status: 'completed' });
    expect(result.won).toBe(true);
    expect(supabase._state.sdRow.status).toBe('completed');
  });

  it('CAS miss for a NON-completion reason (e.g. cancelled) is rejected, not fabricated as a completion (adversarial /ship review finding)', async () => {
    // The shared row's status changed away from 'pending_approval' for some reason
    // OTHER than a peer completing it — e.g. a chairman cancellation, or an unrelated
    // reset. Blindly treating any CAS miss as "already completed" would fabricate a
    // false completion record; this must instead surface a distinct rejection.
    const supabase = makeSharedSupabase({ ...SD_ROW, status: 'cancelled' });
    const exec = makeExecutor(supabase);
    const staleSnapshot = { ...SD_ROW, status: 'pending_approval', active_session_id: 'this-session' };
    const result = await exec.executeSpecific('sd-uuid-race-1', staleSnapshot, {}, { normalizedScore: 95 });

    expect(result.success).toBe(false);
    expect(result.reasonCode).toBe('CAS_MISS_UNEXPECTED_STATUS');
    // This invocation's own leo_handoff_executions pre-insert was still cleaned up
    // (no orphaned pending row) even on this rejection path.
    expect(supabase._state.lhe).toHaveLength(0);
    // NOTE: the pre-existing (out-of-scope, unmodified by this fix) canonical
    // sd_phase_handoffs write happens BEFORE the CAS check runs at all — a known,
    // separately-tracked residual (TESTING EXEC-phase review + retrospective action
    // item), not something this fix's CAS-miss branch can retroactively undo.
  });
});
