/**
 * Tests: SD-FDBK-FIX-LFA-ACCEPT-CANONICAL-001 — accepted LEAD-FINAL-APPROVAL must
 * persist to sd_phase_handoffs (to_phase coerced APPROVAL->LEAD), fail-loud, idempotent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HandoffRecorder } from '../../scripts/modules/handoff/recording/HandoffRecorder.js';

const SD_UUID = 'sd-uuid-1';

/** Minimal supabase stub recording inserts/updates per table. */
function makeSupabaseStub({ sphInsertError = null, existingAcceptedLfa = null } = {}) {
  const writes = { inserts: {}, updates: {} };
  const stub = {
    writes,
    from(table) {
      const q = {
        _table: table,
        _filters: {},
        select() { return q; },
        eq(col, val) { q._filters[col] = val; return q; },
        or() { return q; },
        in() { return q; },
        order() { return q; },
        limit() { return q; },
        not() { return q; },
        gte() { return q; },
        insert(row) {
          (writes.inserts[table] ||= []).push(row);
          const error = table === 'sd_phase_handoffs' ? sphInsertError : null;
          const resolved = { data: row, error };
          return { select: () => Promise.resolve(resolved), then: (r) => Promise.resolve(resolved).then(r) };
        },
        update(patch) {
          (writes.updates[table] ||= []).push(patch);
          return q._thenable({ data: null, error: null });
        },
        delete() { return q._thenable({ data: null, error: null }); },
        maybeSingle() {
          if (table === 'sd_phase_handoffs' && q._filters.status === 'accepted') {
            return Promise.resolve({ data: existingAcceptedLfa, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === 'strategic_directives_v2') {
            return Promise.resolve({ data: { id: SD_UUID, sd_key: 'SD-TEST-001', title: 'T' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        _thenable(resolved) {
          return { eq: () => q._thenable(resolved), then: (r) => Promise.resolve(resolved).then(r) };
        },
        then(resolve) {
          // awaited query without terminal method (e.g. sub_agent_execution_results list)
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return stub;
}

const stubContentBuilder = {
  build: () => ({ executive_summary: 's', deliverables_manifest: {}, key_decisions: [], known_issues: [], resource_utilization: {}, action_items: [], completeness_report: {} }),
  buildRejection: () => ({}),
  logElements: () => {},
};
const stubValidator = { preValidateData: async () => ({ valid: true }) };

function makeRecorder(supabase) {
  return new HandoffRecorder(supabase, { contentBuilder: stubContentBuilder, validationOrchestrator: stubValidator });
}

const okResult = { passed: true, normalizedScore: 95, gateCount: 5, issues: [], warnings: [], gateResults: {} };

describe('LFA accepted canonical persistence', () => {
  let supabase;
  beforeEach(() => { supabase = makeSupabaseStub(); });

  it('recordSuccess(LEAD-FINAL-APPROVAL) writes BOTH leo_handoff_executions and sd_phase_handoffs', async () => {
    const recorder = makeRecorder(supabase);
    await recorder.recordSuccess('LEAD-FINAL-APPROVAL', SD_UUID, okResult);
    expect(supabase.writes.inserts['leo_handoff_executions']?.length).toBe(1);
    const sph = supabase.writes.inserts['sd_phase_handoffs'];
    expect(sph?.length).toBe(1);
    expect(sph[0].handoff_type).toBe('LEAD-FINAL-APPROVAL');
  });

  it('coerces to_phase APPROVAL->LEAD on the canonical row (parity with recordFailure)', async () => {
    const recorder = makeRecorder(supabase);
    await recorder.recordSuccess('LEAD-FINAL-APPROVAL', SD_UUID, okResult);
    const row = supabase.writes.inserts['sd_phase_handoffs'][0];
    expect(row.to_phase).toBe('LEAD');
    expect(row.from_phase).toBe('LEAD');
  });

  it('FAIL-LOUD: throws when the sd_phase_handoffs write fails (never completed-on-executions-alone)', async () => {
    supabase = makeSupabaseStub({ sphInsertError: { message: 'CHECK violation' } });
    const recorder = makeRecorder(supabase);
    await expect(recorder.recordSuccess('LEAD-FINAL-APPROVAL', SD_UUID, okResult)).rejects.toThrow();
  });

  it('idempotent: existing accepted LFA row skips a duplicate canonical insert', async () => {
    supabase = makeSupabaseStub({ existingAcceptedLfa: { id: 'prior-accept' } });
    const recorder = makeRecorder(supabase);
    await recorder.recordSuccess('LEAD-FINAL-APPROVAL', SD_UUID, okResult);
    expect(supabase.writes.inserts['sd_phase_handoffs']).toBeUndefined();
    expect(supabase.writes.inserts['leo_handoff_executions']?.length).toBe(1);
  });

  it('phase transitions unchanged: LEAD-TO-PLAN writes sd_phase_handoffs with natural to_phase', async () => {
    const recorder = makeRecorder(supabase);
    await recorder.recordSuccess('LEAD-TO-PLAN', SD_UUID, okResult);
    const row = supabase.writes.inserts['sd_phase_handoffs'][0];
    expect(row.to_phase).toBe('PLAN');
  });
});
