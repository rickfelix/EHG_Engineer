/**
 * Tests for the Sub-Agent Evidence PRE-check (QF-20260830-878).
 *
 * TS-1: no required agents for the handoff type → passes, does not call the resolver.
 * TS-2: all required evidence present → passes, prints success line.
 * TS-3: missing evidence → still resolves passed:false (two-sided: does not silently
 *       weaken to pass), prints missing agents + remediation.
 * TS-4: reuses validateSubagentEvidence from the gate module (never a second list).
 * TS-5: never throws — DB/resolver errors are swallowed (advisory only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./subagent-evidence-gate.js', () => ({
  validateSubagentEvidence: vi.fn(),
}));

import { validateSubagentEvidence } from './subagent-evidence-gate.js';
import { printSubagentEvidencePrecheck } from './subagent-evidence-precheck.js';

describe('printSubagentEvidencePrecheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TS-1: handoff type with no required agents skips the resolver and passes', async () => {
    const result = await printSubagentEvidencePrecheck({
      handoffType: 'LEAD-FINAL-APPROVAL',
      sd: { id: 'sd-uuid' },
      supabase: {},
    });
    expect(result).toEqual({ passed: true, checked: false });
    expect(validateSubagentEvidence).not.toHaveBeenCalled();
  });

  it('TS-2: all evidence present → passed:true, checked:true', async () => {
    validateSubagentEvidence.mockResolvedValue({
      passed: true,
      details: { required: ['TESTING'], missing: [] },
    });
    const result = await printSubagentEvidencePrecheck({
      handoffType: 'PLAN-TO-EXEC',
      sd: { id: 'sd-uuid', sd_key: 'SD-X-001' },
      supabase: {},
    });
    expect(result).toEqual({ passed: true, checked: true });
    expect(validateSubagentEvidence).toHaveBeenCalledTimes(1);
  });

  it('TS-3: missing evidence → passed:false surfaces (gate not weakened by the precheck)', async () => {
    validateSubagentEvidence.mockResolvedValue({
      passed: false,
      details: { required: ['TESTING', 'SECURITY'], missing: ['SECURITY'] },
      remediation: 'Produce evidence for SECURITY...',
    });
    const result = await printSubagentEvidencePrecheck({
      handoffType: 'EXEC-TO-PLAN',
      sd: { id: 'sd-uuid' },
      supabase: {},
    });
    expect(result).toEqual({ passed: false, checked: true });
  });

  it('TS-4: forwards handoffType/sd/supabase straight through to validateSubagentEvidence (single resolver)', async () => {
    validateSubagentEvidence.mockResolvedValue({ passed: true, details: { missing: [] } });
    const sd = { id: 'sd-uuid', sd_key: 'SD-X-001' };
    const supabase = { marker: true };
    await printSubagentEvidencePrecheck({ handoffType: 'EXEC-TO-PLAN', sd, supabase });
    expect(validateSubagentEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ handoffType: 'EXEC-TO-PLAN', sd, supabase }),
      supabase
    );
  });

  it('TS-5: resolver throwing does not propagate — fails open, non-blocking', async () => {
    validateSubagentEvidence.mockRejectedValue(new Error('db unavailable'));
    const result = await printSubagentEvidencePrecheck({
      handoffType: 'EXEC-TO-PLAN',
      sd: { id: 'sd-uuid' },
      supabase: {},
    });
    expect(result).toEqual({ passed: true, checked: false });
  });

  it('TS-6: no supabase/sd identifier available → skips resolver, passes advisory-open', async () => {
    const result = await printSubagentEvidencePrecheck({
      handoffType: 'EXEC-TO-PLAN',
      sd: null,
      sdId: null,
      supabase: null,
    });
    expect(result).toEqual({ passed: true, checked: false });
    expect(validateSubagentEvidence).not.toHaveBeenCalled();
  });
});
