// QF-20260705-043 — port the coordinator's venture-remediation belt exclusion
// (isUnactionableRemediationSd, lib/coordinator/sd-exclusion.mjs, SD-REFILL-00306WTS) into
// classifyDispatchIneligibility, the shared SSOT for worker self-claim + coordinator/sweep-PUSH.
// Harness gap (live incident 2026-07-06): worker-checkin.cjs self-claimed
// SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005 (a fr-c-generator.test.js real-DB fixture row,
// target_application='EHG', fc000000- sentinel venture_id) within 0.5s of its creation; the
// test's own afterEach cancelled+hard-deleted the row 2s later and sd-start.js crashed on the
// vanished row (PostgREST .single() 0-row coercion error).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classifyDispatchIneligibility } = require('../../lib/fleet/claim-eligibility.cjs');

describe('classifyDispatchIneligibility — venture-remediation axis (QF-20260705-043)', () => {
  it('a REMEDIATION SD targeting a venture (EHG) is NOT self-claimable', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005', target_application: 'EHG' }))
      .toBe('unactionable_venture_remediation');
  });
  it('reads target_application from metadata when the top-level column is absent', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-UNIT-TEST-005', metadata: { target_application: 'EHG' } }))
      .toBe('unactionable_venture_remediation');
  });
  it('a REMEDIATION SD genuinely targeting EHG_Engineer stays claimable', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-X-001', target_application: 'EHG_Engineer' })).toBeNull();
  });
  it('a REMEDIATION SD with no target_application falls through unchanged (fail-open)', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-X-001' })).toBeNull();
  });
  it('a non-REMEDIATION key is unaffected regardless of target_application', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X-001', target_application: 'EHG' })).toBeNull();
  });
  it('the live incident specimen (SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005) is refused', () => {
    const specimen = {
      sd_key: 'SD-LEO-FIX-REMEDIATION-LINT-MEDIUM-005',
      target_application: 'EHG',
      metadata: { venture_id: 'fc000000-0000-4000-8000-b3f778cfb649', generated_by: 'fr-c-prime-generator' },
    };
    expect(classifyDispatchIneligibility(specimen)).toBe('unactionable_venture_remediation');
  });
});

describe('classifyDispatchIneligibility — venture-remediation axis composition (QF-20260705-043)', () => {
  it('prior axes (orchestrator/fixture/human-action) still win over the new venture-remediation check', () => {
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-X-001', sd_type: 'orchestrator', target_application: 'EHG' }))
      .toBe('orchestrator_parent');
    expect(classifyDispatchIneligibility({ sd_key: 'SD-LEO-FIX-REMEDIATION-X-001', target_application: 'EHG', metadata: { requires_human_action: true } }))
      .toBe('human_action_required');
  });
});
