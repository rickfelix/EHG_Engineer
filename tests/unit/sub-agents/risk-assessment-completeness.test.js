/**
 * Unit tests for checkRiskAssessmentCompleteness (lib/sub-agents/risk.js).
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154 / PAT-LES-0bac630efd73.
 *
 * Pure function -- no Supabase mocking required.
 */
import { describe, it, expect } from 'vitest';
import { checkRiskAssessmentCompleteness } from '../../../lib/sub-agents/risk.js';

describe('checkRiskAssessmentCompleteness', () => {
  it('warns when an infrastructure SD has high data-migration risk but <3 documented risks', () => {
    const sd = { sd_type: 'infrastructure' };
    const prd = { risks: [{ risk: 'Only one risk', mitigation: 'x', severity: 'medium' }] };

    const warning = checkRiskAssessmentCompleteness(sd, prd, 7);

    expect(warning).not.toBeNull();
    expect(warning.domain).toBe('Risk Assessment Completeness');
    expect(warning.issue).toContain('1 entry');
    expect(warning.issue).toContain('data integrity');
    expect(warning.issue).toContain('rollback strategy');
    expect(warning.monitoring_recommended).toBe(true);
  });

  it('does not warn when the infrastructure SD has 3+ documented risks', () => {
    const sd = { sd_type: 'infrastructure' };
    const prd = {
      risks: [
        { risk: 'Data integrity', mitigation: 'x', severity: 'high' },
        { risk: 'Performance impact', mitigation: 'y', severity: 'medium' },
        { risk: 'Rollback strategy', mitigation: 'z', severity: 'medium' },
      ],
    };

    expect(checkRiskAssessmentCompleteness(sd, prd, 7)).toBeNull();
  });

  it('does not warn for a non-infrastructure SD type regardless of risk count', () => {
    const sd = { sd_type: 'feature' };
    const prd = { risks: [{ risk: 'Only one', mitigation: 'x', severity: 'low' }] };

    expect(checkRiskAssessmentCompleteness(sd, prd, 9)).toBeNull();
  });

  it('does not warn when data-migration risk score is below the threshold', () => {
    const sd = { sd_type: 'infrastructure' };
    const prd = { risks: [] };

    expect(checkRiskAssessmentCompleteness(sd, prd, 5)).toBeNull();
  });

  it('treats a missing or malformed prd.risks as zero risks (no throw)', () => {
    const sd = { sd_type: 'infrastructure' };

    expect(checkRiskAssessmentCompleteness(sd, undefined, 6)).not.toBeNull();
    expect(checkRiskAssessmentCompleteness(sd, {}, 6)).not.toBeNull();
    expect(checkRiskAssessmentCompleteness(sd, { risks: 'not-an-array' }, 6)).not.toBeNull();
  });

  it('is boundary-inclusive at score 6 and at exactly 3 risks', () => {
    const sd = { sd_type: 'infrastructure' };
    expect(checkRiskAssessmentCompleteness(sd, { risks: [] }, 6)).not.toBeNull();

    const threeRisks = { risks: [{ risk: 'a' }, { risk: 'b' }, { risk: 'c' }] };
    expect(checkRiskAssessmentCompleteness(sd, threeRisks, 10)).toBeNull();
  });

  // validation-learn154 F4: the origin retrospective (SD-LEO-FIX-MULTI-VENTURE-ISOLATION-001)
  // measured "only one risk listed" against the SD-level `risks` column, not the PRD's.
  it('reads sd.risks, not only prd.risks -- reproduces the origin retrospective case', () => {
    const sd = { sd_type: 'infrastructure', risks: [{ risk: 'Only one risk' }] };
    const prd = { risks: [] };

    const warning = checkRiskAssessmentCompleteness(sd, prd, 7);

    expect(warning).not.toBeNull();
    expect(warning.issue).toContain('SD.risks=1');
    expect(warning.issue).toContain('PRD.risks=0');
  });

  it('takes the max of sd.risks and prd.risks -- either artifact having 3+ clears the warning', () => {
    const sd = { sd_type: 'infrastructure', risks: [{ risk: 'a' }, { risk: 'b' }, { risk: 'c' }] };
    const prd = { risks: [] };

    expect(checkRiskAssessmentCompleteness(sd, prd, 9)).toBeNull();
  });

  it('treats a missing or malformed sd.risks as zero risks (no throw)', () => {
    const sd = { sd_type: 'infrastructure' };
    expect(checkRiskAssessmentCompleteness(sd, { risks: [] }, 6)).not.toBeNull();

    const sdMalformed = { sd_type: 'infrastructure', risks: 'not-an-array' };
    expect(checkRiskAssessmentCompleteness(sdMalformed, { risks: [] }, 6)).not.toBeNull();
  });
});
