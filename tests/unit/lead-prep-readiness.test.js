// SD-LEO-INFRA-GATE-CALIBRATE-LEAD-PLAN-REJECTION-001 (FR-2/FR-3/FR-4) — the EARLY LEAD-TO-PLAN
// prep-readiness advisory reuses the gate's OWN prerequisite SSOT (checkLeadToPlanPrereqs), so it
// surfaces exactly the gaps the gate would reject — no new checks, no lowered thresholds. Closing
// these early reduces REAL defects (the diagnosed prep-insufficient cause), not the bar (FR-3).
import { describe, it, expect } from 'vitest';
import { runLeadPrepReadiness } from '../../scripts/lead-prep-readiness.js';
import { checkLeadToPlanPrereqs } from '../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';

// Minimal supabase mock returning a single SD row from the .or(...).limit(1).maybeSingle() chain.
function mockSb(sdRow) {
  return { from() { return { select() { return { or() { return { limit() { return { maybeSingle: () => Promise.resolve({ data: sdRow, error: null }) }; } }; } }; } }; } };
}

// A deficient SD mirroring the diagnosed dominant rejection cause: missing JSONB fields, short
// description, no smoke_test_steps.
const deficientSd = {
  sd_key: 'SD-TEST-DEFICIENT-001', sd_type: 'infrastructure',
  description: 'too short', // well under the min word count
  strategic_objectives: [], success_criteria: [], success_metrics: [], key_changes: [], dependencies: [], risks: [],
  smoke_test_steps: null, metadata: {},
};
// A prep-ready SD with the required fields populated.
const readySd = {
  sd_key: 'SD-TEST-READY-001', sd_type: 'infrastructure',
  description: 'This strategic directive expands the description well beyond the minimum word threshold by documenting the technical approach, the root cause context for why the work is needed, and a concrete definition of what success looks like once the change ships and is validated end to end across the full handoff chain and post-completion tail with evidence captured.',
  strategic_objectives: [{ objective: 'x' }], success_criteria: [{ criterion: 'c', measure: 'm' }],
  success_metrics: [{ metric: 'a', target: '1' }, { metric: 'b', target: '2' }, { metric: 'c', target: '3' }],
  key_changes: [{ change: 'k', type: 'code' }], dependencies: [{ note: 'none' }], risks: [{ risk: 'r', mitigation: 'm' }],
  smoke_test_steps: [{ instruction: 'Run the handoff', expected_outcome: 'PASS' }], metadata: {},
};

describe('runLeadPrepReadiness — reuses the gate SSOT, surfaces gaps early', () => {
  it('flags a deficient SD as NOT ready with the same blocking codes the gate would emit', async () => {
    const r = await runLeadPrepReadiness('SD-TEST-DEFICIENT-001', { supabase: mockSb(deficientSd) });
    expect(r.found).toBe(true);
    expect(r.ready).toBe(false);
    const codes = r.blocking.map(b => b.code);
    // mirror: the advisory blocking set equals the gate SSOT's non-info issues
    const gateCodes = checkLeadToPlanPrereqs(deficientSd).filter(i => i.severity !== 'info').map(i => i.code);
    expect(codes.sort()).toEqual(gateCodes.sort()); // advisory == gate SSOT (the key property)
    expect(codes).toContain('JSONB_FIELDS_INCOMPLETE');
    expect(codes).toContain('DESCRIPTION_TOO_SHORT');
    // (infrastructure is smoke-test-EXEMPT, so SMOKE_TEST_* is info-only here; the dominant
    //  SMOKE_TEST_MISSING rejections in the diagnosis came from non-exempt sd_types.)
  });

  it('marks a fully-populated SD as prep-ready (no blocking gaps)', async () => {
    const r = await runLeadPrepReadiness('SD-TEST-READY-001', { supabase: mockSb(readySd) });
    expect(r.found).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.blocking.length).toBe(0);
  });

  it('returns found=false for a missing SD', async () => {
    const r = await runLeadPrepReadiness('SD-NOPE-001', { supabase: mockSb(null) });
    expect(r.found).toBe(false);
    expect(r.ready).toBe(false);
  });

  it('does NOT lower the bar — blocking set is exactly the gate SSOT non-info issues (FR-3)', async () => {
    // Re-assert the equivalence explicitly: the advisory never reports fewer gaps than the gate.
    const r = await runLeadPrepReadiness('SD-TEST-DEFICIENT-001', { supabase: mockSb(deficientSd) });
    const gateBlocking = checkLeadToPlanPrereqs(deficientSd).filter(i => i.severity !== 'info').length;
    expect(r.blocking.length).toBe(gateBlocking);
  });
});
