/**
 * QF-20260906-403: sub_agent_execution_results.phase is stored verbatim from the caller
 * while six readers filter by exact equality -- five label conventions on one SD's own
 * rows produced SUBAGENT_EVIDENCE_MISSING false negatives. Fix: normalizePhaseToken is now
 * applied at the write (lib/sub-agent-executor/results-storage.js) AND at every reader's
 * query param, including HandoffRepository.getSubAgentResults (this file's target).
 *
 * This fixture proves the round-trip: a row STORED under one case/separator spelling is
 * FOUND by a reader querying with a genuinely different spelling of the same phase.
 */
import { describe, it, expect } from 'vitest';
import { HandoffRepository } from '../../../scripts/modules/handoff/db/HandoffRepository.js';
import { normalizePhaseToken } from '../../../lib/sub-agent-executor/phase-token.js';

function fakeSupabase(rows) {
  return {
    from(table) {
      const filters = {};
      const builder = {
        select() { return builder; },
        eq(col, val) { filters[col] = val; return builder; },
        order() { return builder; },
        // getSubAgentResults awaits the query object directly (no terminal call) --
        // make the builder itself thenable, matching the real PostgREST filter-builder.
        then(resolve, reject) {
          if (table !== 'sub_agent_execution_results') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          const matched = rows.filter((r) =>
            (filters.sd_id === undefined || r.sd_id === filters.sd_id)
            && (filters.phase === undefined || r.phase === filters.phase));
          return Promise.resolve({ data: matched, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

describe('QF-20260906-403: normalizePhaseToken (five observed labels collapse to one canonical token each)', () => {
  it.each([
    ['lead-to-plan'], ['LEAD_TO_PLAN'], ['Lead-To-Plan'], ['lead_to_plan'], ['LEAD-TO-PLAN'],
  ])('%s normalizes to LEAD_TO_PLAN', (raw) => {
    expect(normalizePhaseToken(raw)).toBe('LEAD_TO_PLAN');
  });

  it('distinct sub-phases stay distinct (normalization is format-only, never semantic bucketing)', () => {
    expect(normalizePhaseToken('PLAN_PRD')).not.toBe(normalizePhaseToken('PLAN_VERIFICATION'));
    expect(normalizePhaseToken('EXEC')).not.toBe(normalizePhaseToken('EXEC-TO-PLAN'));
  });
});

describe('QF-20260906-403: HandoffRepository.getSubAgentResults finds a row across two DIFFERENT phase spellings', () => {
  it('a row stored as EXEC-TO-PLAN (hyphenated, pre-normalization write convention) is found by a query for exec_to_plan (lowercase, underscored)', async () => {
    const repo = new HandoffRepository(fakeSupabase([
      { id: 'row-1', sd_id: 'SD-TEST-001', phase: 'EXEC_TO_PLAN', sub_agent_code: 'TESTING' },
    ]));

    const results = await repo.getSubAgentResults('SD-TEST-001', 'exec_to_plan');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('row-1');
  });

  it('a row stored as PLAN-VERIFICATION (hyphenated) is found by a query for PLAN_VERIFICATION (underscored)', async () => {
    const repo = new HandoffRepository(fakeSupabase([
      { id: 'row-2', sd_id: 'SD-TEST-002', phase: 'PLAN_VERIFICATION', sub_agent_code: 'VALIDATION' },
    ]));

    const results = await repo.getSubAgentResults('SD-TEST-002', 'PLAN-VERIFICATION');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('row-2');
  });

  it('a genuinely different phase (EXEC vs EXEC-TO-PLAN) does NOT match -- normalization never bridges distinct sub-phases', async () => {
    const repo = new HandoffRepository(fakeSupabase([
      { id: 'row-3', sd_id: 'SD-TEST-003', phase: 'EXEC_TO_PLAN', sub_agent_code: 'TESTING' },
    ]));

    const results = await repo.getSubAgentResults('SD-TEST-003', 'EXEC');
    expect(results).toHaveLength(0);
  });

  it('an omitted phase returns every row for the SD, unfiltered (unchanged pre-existing behavior)', async () => {
    const repo = new HandoffRepository(fakeSupabase([
      { id: 'row-4', sd_id: 'SD-TEST-004', phase: 'LEAD', sub_agent_code: 'VALIDATION' },
      { id: 'row-5', sd_id: 'SD-TEST-004', phase: 'EXEC', sub_agent_code: 'TESTING' },
    ]));

    const results = await repo.getSubAgentResults('SD-TEST-004');
    expect(results).toHaveLength(2);
  });
});
