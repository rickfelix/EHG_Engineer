/**
 * SD-PAT-FIX-LEAD-PLAN-REJECTED-004 (FR-2): pattern-alert-sd-creator emits
 * COMPLETE SDs — output passes both LEAD-TO-PLAN validators with zero manual
 * backfill. Before this fix, pattern SDs inserted 0 of the 8 completeness
 * JSONB fields while defaulting to sd_type=feature (8/8 bar), guaranteeing a
 * JSONB_FIELDS_INCOMPLETE rejection for every created SD (incl. the SD that
 * shipped this fix, claimed with success_criteria=null).
 */
import { describe, it, expect } from 'vitest';
import { buildSdDataForPattern } from '../../../scripts/pattern-alert-sd-creator.js';
import { checkLeadToPlanPrereqs } from '../../../scripts/modules/handoff/pre-checks/prerequisite-preflight.js';
import { validateStrategicDirective } from '../../../scripts/verify-l2p/sd-validation.js';
import { SD_TYPE_OVERRIDES } from '../../../scripts/verify-l2p/constants.js';

const PATTERN_FIXTURE = {
  pattern_id: 'PAT-RETRO-LEADTOPLAN-e756f97d',
  category: 'session_retrospective',
  severity: 'high',
  occurrence_count: 7,
  trend: 'stable',
  issue_summary: 'LEAD-TO-PLAN rejected 7 times during SD lifecycle. Avg score: 0%. Common reasons: Prerequisite preflight failed: JSONB_FIELDS_INCOMPLETE',
  proven_solutions: [],
  prevention_checklist: ['Populate completeness fields before running the handoff'],
  first_seen_sd_id: 'e756f97d-c748-4dc2-aec0-6a60de837844',
  last_seen_sd_id: 'e756f97d-c748-4dc2-aec0-6a60de837844'
};

describe('FR-2: pattern SD completeness contract', () => {
  const sdData = buildSdDataForPattern(PATTERN_FIXTURE, 'SD-PAT-FIX-TEST-CONTRACT-001');

  it('classifies as bugfix targeting EHG_Engineer', () => {
    expect(sdData.sd_type).toBe('bugfix');
    expect(sdData.target_application).toBe('EHG_Engineer');
  });

  it('passes the prerequisite preflight with zero blocking issues', () => {
    const issues = checkLeadToPlanPrereqs(sdData);
    const blocking = issues.filter(i => i && i.severity !== 'info');
    expect(blocking).toEqual([]);
  });

  it('passes validateStrategicDirective at the effective threshold for its type', () => {
    const validation = validateStrategicDirective(sdData);
    const minScore = SD_TYPE_OVERRIDES[sdData.sd_type]?.minimumScore ?? 85;
    expect(validation.percentage).toBeGreaterThanOrEqual(minScore);
    expect(validation.errors).toEqual([]);
  });

  it('keeps acceptance criteria in sync between description and success_criteria', () => {
    for (const entry of sdData.success_criteria) {
      // each structured criterion also appears in the human-readable description
      expect(sdData.description).toContain(entry.criterion.replace(/\\`/g, '`').slice(0, 40));
    }
  });

  it('carries valid smoke_test_steps in canonical shape', () => {
    expect(sdData.smoke_test_steps.length).toBeGreaterThan(0);
    for (const step of sdData.smoke_test_steps) {
      expect(step.instruction).toBeTruthy();
      expect(step.expected_outcome).toBeTruthy();
    }
  });
});
