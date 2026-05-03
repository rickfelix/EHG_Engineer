import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001 FR-002 — observability hardening
 * for the venture_stage_transitions audit-trail writer in
 * lib/eva/stage-execution-worker.js:_advanceStage and _emitTransitionFailureEvent.
 *
 * The existing stage-execution-worker-advancement.test.js reconstructs
 * _advanceStage's side-effect chain in-test (the module has too many file-level
 * side-effects to import directly). We follow the same pattern, scoped to
 * Side-effect 6 (transitions write) + the new helper.
 */

function createMockSupabase(overrides = {}) {
  // Per-table response queue lets a test set the result for each call.
  const responses = {
    venture_stage_transitions_select: { data: null, error: null },
    venture_stage_transitions_insert: { error: null },
    eva_orchestration_events_insert: { error: null },
    ...overrides,
  };

  const insertedRows = [];

  const chainBuilder = (tableName) => {
    const chain = {
      _table: tableName,
      _select: false,
      _insert: false,
      select: vi.fn(function () { this._select = true; return this; }),
      eq: vi.fn(function () { return this; }),
      limit: vi.fn(function () { return this; }),
      maybeSingle: vi.fn(async function () {
        if (this._table === 'venture_stage_transitions' && this._select) {
          return responses.venture_stage_transitions_select;
        }
        return { data: null, error: null };
      }),
      insert: vi.fn(async function (row) {
        insertedRows.push({ table: this._table, row });
        if (this._table === 'venture_stage_transitions') {
          return responses.venture_stage_transitions_insert;
        }
        if (this._table === 'eva_orchestration_events') {
          return responses.eva_orchestration_events_insert;
        }
        return { error: null };
      }),
    };
    return chain;
  };

  return {
    from: vi.fn((table) => chainBuilder(table)),
    _insertedRows: insertedRows,
  };
}

// Reconstruct just Side-effect 6 + helper as it appears in the worker.
function makeTransitionWriter(supabase, logger) {
  const worker = { _supabase: supabase, _logger: logger };

  worker._emitTransitionFailureEvent = async function (payload) {
    try {
      const { error } = await this._supabase
        .from('eva_orchestration_events')
        .insert({
          event_type: 'escalation',
          event_source: 'stage_execution_worker',
          venture_id: payload.venture_id,
          event_data: {
            subtype: 'transition_record_failed',
            from_stage: payload.from_stage,
            to_stage: payload.to_stage,
            advancement_type: payload.advancement_type,
            failure_phase: payload.failure_phase,
            error_message: payload.error_message,
            sd_origin: 'SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001',
          },
          chairman_flagged: false,
        });
      if (error) {
        this._logger.error(`[SAE] Failed to emit transition_record_failed event (last-resort): ${error.message}`);
      }
    } catch (eventErr) {
      this._logger.error(`[SAE] Failed to emit transition_record_failed event (last-resort): ${eventErr?.message || eventErr}`);
    }
  };

  // Side-effect 6 only (the new split SELECT/INSERT block)
  worker._writeTransition = async function (ventureId, fromStage, toStage, advancementType) {
    let dedupOk = true;
    let existingTransition = null;
    try {
      const { data, error } = await this._supabase
        .from('venture_stage_transitions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('from_stage', fromStage)
        .eq('to_stage', toStage)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existingTransition = data;
    } catch (selectErr) {
      dedupOk = false;
      await this._emitTransitionFailureEvent({
        venture_id: ventureId,
        from_stage: fromStage,
        to_stage: toStage,
        advancement_type: advancementType,
        failure_phase: 'dedup_guard_select',
        error_message: selectErr?.message || String(selectErr),
      });
      this._logger.error(`[SAE] Transition dedup guard SELECT failed (non-fatal): ${selectErr?.message || selectErr}`);
    }

    if (dedupOk && !existingTransition) {
      try {
        const { error: insertErr } = await this._supabase
          .from('venture_stage_transitions')
          .insert({
            venture_id: ventureId,
            from_stage: fromStage,
            to_stage: toStage,
            transition_type: advancementType === 'governance_override' ? 'governance_override' : 'normal',
          });
        if (insertErr) throw insertErr;
      } catch (insertErr) {
        await this._emitTransitionFailureEvent({
          venture_id: ventureId,
          from_stage: fromStage,
          to_stage: toStage,
          advancement_type: advancementType,
          failure_phase: 'insert',
          error_message: insertErr?.message || String(insertErr),
        });
        this._logger.error(`[SAE] Transition INSERT failed (non-fatal): ${insertErr?.message || insertErr}`);
      }
    }
  };

  return worker;
}

describe('FR-002: transition_record_failed observability', () => {
  let logger;

  beforeEach(() => {
    logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  });

  it('happy path: SELECT returns no row, INSERT succeeds, no event emitted', async () => {
    const supabase = createMockSupabase();
    const worker = makeTransitionWriter(supabase, logger);

    await worker._writeTransition('11111111-1111-1111-1111-111111111111', 12, 13, 'normal');

    const insertedTables = supabase._insertedRows.map(r => r.table);
    expect(insertedTables).toEqual(['venture_stage_transitions']);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('SELECT failure emits eva_orchestration_events row + logger.error; INSERT skipped', async () => {
    const supabase = createMockSupabase({
      venture_stage_transitions_select: { data: null, error: { message: 'simulated RLS denial' } },
    });
    const worker = makeTransitionWriter(supabase, logger);

    await worker._writeTransition('22222222-2222-2222-2222-222222222222', 15, 16, 'normal');

    const eventRows = supabase._insertedRows.filter(r => r.table === 'eva_orchestration_events');
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].row.event_type).toBe('escalation');
    expect(eventRows[0].row.event_data.subtype).toBe('transition_record_failed');
    expect(eventRows[0].row.event_data.failure_phase).toBe('dedup_guard_select');
    expect(eventRows[0].row.event_data.from_stage).toBe(15);
    expect(eventRows[0].row.event_data.to_stage).toBe(16);
    expect(eventRows[0].row.event_data.error_message).toMatch(/RLS denial/);

    // Critical: INSERT must be skipped when dedup guard fails (avoid duplicate writes)
    const transitionInserts = supabase._insertedRows.filter(r => r.table === 'venture_stage_transitions');
    expect(transitionInserts).toHaveLength(0);

    expect(logger.error).toHaveBeenCalled();
    const errorMsgs = logger.error.mock.calls.map(c => String(c[0]));
    expect(errorMsgs.some(m => m.includes('dedup guard SELECT failed'))).toBe(true);
  });

  it('INSERT failure emits eva_orchestration_events row + logger.error; advance still completes', async () => {
    const supabase = createMockSupabase({
      venture_stage_transitions_select: { data: null, error: null },
      venture_stage_transitions_insert: { error: { message: 'simulated INSERT conflict' } },
    });
    const worker = makeTransitionWriter(supabase, logger);

    let threw = false;
    try {
      await worker._writeTransition('33333333-3333-3333-3333-333333333333', 16, 17, 'normal');
    } catch (e) {
      threw = true;
    }
    // Non-fatal preserved — function does NOT throw out
    expect(threw).toBe(false);

    const eventRows = supabase._insertedRows.filter(r => r.table === 'eva_orchestration_events');
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].row.event_data.failure_phase).toBe('insert');
    expect(eventRows[0].row.event_data.error_message).toMatch(/INSERT conflict/);
    expect(eventRows[0].row.event_data.sd_origin).toBe('SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001');
    expect(logger.error).toHaveBeenCalled();
  });

  it('event-emit failure is also logged (last-resort observability)', async () => {
    const supabase = createMockSupabase({
      venture_stage_transitions_insert: { error: { message: 'primary INSERT failed' } },
      eva_orchestration_events_insert: { error: { message: 'event-emit also failed' } },
    });
    const worker = makeTransitionWriter(supabase, logger);

    await worker._writeTransition('44444444-4444-4444-4444-444444444444', 12, 13, 'normal');

    // Two error logs: original failure + last-resort emit failure
    const errorMsgs = logger.error.mock.calls.map(c => String(c[0]));
    expect(errorMsgs.some(m => m.includes('Transition INSERT failed'))).toBe(true);
    expect(errorMsgs.some(m => m.includes('Failed to emit transition_record_failed event'))).toBe(true);
  });

  it('existing transition: dedup guard returns row, no INSERT attempted', async () => {
    const supabase = createMockSupabase({
      venture_stage_transitions_select: { data: { id: 'existing-uuid' }, error: null },
    });
    const worker = makeTransitionWriter(supabase, logger);

    await worker._writeTransition('55555555-5555-5555-5555-555555555555', 12, 13, 'normal');

    const transitionInserts = supabase._insertedRows.filter(r => r.table === 'venture_stage_transitions');
    expect(transitionInserts).toHaveLength(0);

    const eventRows = supabase._insertedRows.filter(r => r.table === 'eva_orchestration_events');
    expect(eventRows).toHaveLength(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('governance_override transition_type passes through correctly', async () => {
    const supabase = createMockSupabase();
    const worker = makeTransitionWriter(supabase, logger);

    await worker._writeTransition('66666666-6666-6666-6666-666666666666', 10, 11, 'governance_override');

    const transitionInserts = supabase._insertedRows.filter(r => r.table === 'venture_stage_transitions');
    expect(transitionInserts).toHaveLength(1);
    expect(transitionInserts[0].row.transition_type).toBe('governance_override');
  });
});
