/**
 * Regression test for QF-20260521-053 (closes feedback 2b74895e).
 *
 * The RETROSPECTIVE_EXISTS rejection brief referenced a non-existent `sd_retrospectives`
 * table and documented none of the structural invariants the retro gate filters on. This
 * pins the corrected guidance so it cannot regress.
 */

import { describe, it, expect } from 'vitest';
import { getRemediation } from '../../scripts/modules/handoff/rejection-subagent-mapping.js';

describe('QF-20260521-053 — retrospective-gate rejection guidance', () => {
  const ctx = { sdId: 'SD-TEST-RETRO-001' };

  it('RETROSPECTIVE_EXISTS references the real `retrospectives` table, not `sd_retrospectives`', () => {
    const { message, subagentType } = getRemediation('RETROSPECTIVE_EXISTS', ctx);
    expect(message).toContain('retrospectives table');
    expect(message).not.toContain('sd_retrospectives');
    expect(subagentType).toBe('retro-agent');
  });

  it('RETROSPECTIVE_EXISTS documents the gate invariants (retro_type, retrospective_type IS NULL, freshness)', () => {
    const { message } = getRemediation('RETROSPECTIVE_EXISTS', ctx);
    expect(message).toContain("retro_type='SD_COMPLETION'");
    expect(message).toMatch(/retrospective_type IS NULL/i);
    expect(message).toMatch(/LEAD-TO-PLAN acceptance/i);
    expect(message).toMatch(/quality_score >= 60/i);
  });

  it('RETROSPECTIVE_QUALITY_GATE guidance also avoids the wrong table name', () => {
    const { message } = getRemediation('RETROSPECTIVE_QUALITY_GATE', ctx);
    expect(message).not.toContain('sd_retrospectives');
    expect(message).toContain('retrospectives table');
  });
});
