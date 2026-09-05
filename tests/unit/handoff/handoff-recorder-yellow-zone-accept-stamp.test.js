/**
 * FR-9 (SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A): HandoffRecorder stamps
 * metadata.yellow_zone_accept onto the sd_phase_handoffs artifact whenever
 * ValidationOrchestrator.validateGates() granted a GATE2-yellow-zone SD_TYPE_THRESHOLD
 * accept, so the two scores are auditable on the handoff record itself -- mirrors the
 * existing metadata.gate2_validation / metadata.gate3_validation stamping pattern.
 */

import { describe, it, expect } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';

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
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return chain;
  }
  return { supabase: { from: chainFor }, inserts };
}

function newRecorder(supabase) {
  return new HandoffRecorder(supabase, {
    contentBuilder: { build: () => ({}), logElements: () => {} },
    validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) },
  });
}

const yellowZoneAccept = {
  gate: 'SD_TYPE_THRESHOLD',
  sd_type: 'feature',
  sd_type_threshold_score: 82,
  sd_type_threshold_required: 85,
  gate2_score: 82,
  gate2_zone: 'YELLOW',
};

describe('FR-9: HandoffRecorder yellow_zone_accept metadata stamp', () => {
  it('present when result.yellowZoneAccept is set on an EXEC-TO-PLAN handoff', async () => {
    const { supabase, inserts } = createMockSupabase();
    await newRecorder(supabase).recordSuccess('EXEC-TO-PLAN', 'SD-TEST-001', {
      totalScore: 82,
      maxScore: 100,
      gateResults: { GATE2_IMPLEMENTATION_FIDELITY: { passed: true, score: 82, zone: 'YELLOW' } },
      yellowZoneAccept,
    });

    const artifact = inserts.sd_phase_handoffs[0];
    expect(artifact.metadata.yellow_zone_accept).toEqual(yellowZoneAccept);
  });

  it('absent when no accept was granted (normal pass, no yellowZoneAccept field)', async () => {
    const { supabase, inserts } = createMockSupabase();
    await newRecorder(supabase).recordSuccess('EXEC-TO-PLAN', 'SD-TEST-001', {
      totalScore: 95,
      maxScore: 100,
      gateResults: { GATE2_IMPLEMENTATION_FIDELITY: { passed: true, score: 95, zone: 'GREEN' } },
    });

    const artifact = inserts.sd_phase_handoffs[0];
    expect(artifact.metadata.yellow_zone_accept).toBeUndefined();
  });
});
