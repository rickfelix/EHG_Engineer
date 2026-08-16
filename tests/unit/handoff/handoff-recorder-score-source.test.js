/**
 * QF-20260816-210: HandoffRecorder score ladder used `result.totalScore || 100` — a
 * legitimate totalScore:0 was indistinguishable from "not measured", and both cases
 * silently normalized to 100 (looks like a full pass). Fixed to `?? NOT_MEASURED_SCORE`
 * (75, shared sentinel from fr-delivery-classifier.js) and stamps
 * validation_details.score_source so a not-measured row is never mistaken for a
 * verified one downstream.
 */

import { describe, it, expect } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';
import { NOT_MEASURED_SCORE } from '../../../scripts/modules/handoff/gates/fr-delivery-classifier.js';

function createMockSupabase() {
  const inserts = {};
  function chainFor(table) {
    const chain = {
      select: () => chain,
      insert: (data) => { (inserts[table] ||= []).push(data); return chain; },
      update: () => chain,
      delete: () => chain,
      eq: () => chain,
      or: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => (table === 'strategic_directives_v2'
        ? { data: { id: 'SD-TEST-001' }, error: null }
        : { data: null, error: null }),
      maybeSingle: () => ({ data: null, error: null }),
      then: (resolve) => resolve({ data: [], error: null })
    };
    return chain;
  }
  return { supabase: { from: chainFor }, inserts };
}

function newRecorder(supabase) {
  return new HandoffRecorder(supabase, {
    contentBuilder: { build: () => ({}), logElements: () => {} },
    validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) }
  });
}

describe('QF-20260816-210: HandoffRecorder validation_score normalization', () => {
  it('empty result -> NOT_MEASURED_SCORE (75), score_source=not_measured', async () => {
    const { supabase, inserts } = createMockSupabase();
    await newRecorder(supabase).recordSuccess('EXEC-TO-PLAN', 'SD-TEST-001', {});

    const lhe = inserts.leo_handoff_executions[0];
    expect(lhe.validation_score).toBe(NOT_MEASURED_SCORE);
    expect(lhe.validation_details.score_source).toBe('not_measured');

    const artifact = inserts.sd_phase_handoffs[0];
    expect(artifact.validation_score).toBe(NOT_MEASURED_SCORE);
    expect(artifact.validation_details.score_source).toBe('not_measured');
  });

  it('totalScore: 0 stays 0 (?? not ||), score_source=measured', async () => {
    const { supabase, inserts } = createMockSupabase();
    await newRecorder(supabase).recordSuccess('EXEC-TO-PLAN', 'SD-TEST-001', { totalScore: 0 });

    const lhe = inserts.leo_handoff_executions[0];
    expect(lhe.validation_score).toBe(0);
    expect(lhe.validation_details.score_source).toBe('measured');

    const artifact = inserts.sd_phase_handoffs[0];
    expect(artifact.validation_score).toBe(0);
    expect(artifact.validation_details.score_source).toBe('measured');
  });

  it('totalScore/maxScore ratio -> 80, unaffected by the sentinel fix', async () => {
    const { supabase, inserts } = createMockSupabase();
    await newRecorder(supabase).recordSuccess('EXEC-TO-PLAN', 'SD-TEST-001', { totalScore: 8, maxScore: 10 });

    const lhe = inserts.leo_handoff_executions[0];
    expect(lhe.validation_score).toBe(80);
    expect(lhe.validation_details.score_source).toBe('measured');
  });
});
