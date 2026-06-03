// QF-20260603-485: deriveConditionalPassEvidence — ensures a CONDITIONAL_PASS
// verdict always carries the DB-required evidence (non-empty conditions array +
// justification >= 50 chars) so a sub-agent downgrade path that omitted them no
// longer false-fails the insert (check_conditions_required /
// check_justification_required on sub_agent_execution_results).

import { describe, it, expect } from 'vitest';
import { deriveConditionalPassEvidence } from '../../../lib/sub-agent-executor/results-storage.js';

// The two surviving DB constraints for verdict='CONDITIONAL_PASS'.
function satisfiesConstraints({ conditions, justification }) {
  return Array.isArray(conditions)
    && conditions.length > 0
    && typeof justification === 'string'
    && justification.length >= 50;
}

describe('deriveConditionalPassEvidence', () => {
  it('synthesizes conditions + justification from warnings when a downgrade omitted them', () => {
    // Mirrors resolve-repo.js / design index.js applyRepoResolutionVerdict output.
    const results = {
      verdict: 'CONDITIONAL_PASS',
      conditions: null,
      justification: null,
      warnings: [{
        severity: 'HIGH',
        issue: 'Sub-agent scanned an unresolved or empty repo',
        recommendation: 'Verify the SD target_application resolves to the correct repo'
      }]
    };
    const out = deriveConditionalPassEvidence(results, 'DESIGN');
    expect(satisfiesConstraints(out)).toBe(true);
    expect(out.conditions[0].action).toMatch(/target_application|resolves/i);
    expect(out.justification).toMatch(/^CONDITIONAL_PASS recorded by DESIGN/);
  });

  it('falls back to a default condition when there are no warnings/recommendations', () => {
    const out = deriveConditionalPassEvidence(
      { verdict: 'CONDITIONAL_PASS', warnings: [], critical_issues: [], recommendations: [] },
      'API'
    );
    expect(satisfiesConstraints(out)).toBe(true);
    expect(out.conditions.length).toBe(1);
  });

  it('derives conditions from critical_issues and string recommendations too', () => {
    const out = deriveConditionalPassEvidence({
      verdict: 'CONDITIONAL_PASS',
      critical_issues: [{ issue: '3 accessibility violations', recommendation: 'Fix WCAG 2.1 AA' }],
      recommendations: ['Add responsive breakpoints']
    }, 'DESIGN');
    expect(satisfiesConstraints(out)).toBe(true);
    // critical_issues take precedence over recommendations as the condition source
    expect(out.conditions.some(c => /WCAG|accessibility/i.test(c.action))).toBe(true);
  });

  it('is a pass-through for non-CONDITIONAL_PASS verdicts (does not fabricate evidence)', () => {
    const out = deriveConditionalPassEvidence(
      { verdict: 'PASS', conditions: null, justification: null, warnings: [{ issue: 'x' }] },
      'SECURITY'
    );
    expect(out.conditions).toBe(null);
    expect(out.justification).toBe(null);
  });

  it('does not overwrite caller-supplied valid conditions/justification', () => {
    const supplied = {
      verdict: 'CONDITIONAL_PASS',
      conditions: [{ action: 'pre-existing', priority: 'low', blocking: false }],
      justification: 'A pre-existing justification that is comfortably longer than fifty characters.'
    };
    const out = deriveConditionalPassEvidence(supplied, 'DOCMON');
    expect(out.conditions).toBe(supplied.conditions);
    expect(out.justification).toBe(supplied.justification);
  });

  it('caps each condition action length and the number of conditions', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ issue: 'x'.repeat(500) + i }));
    const out = deriveConditionalPassEvidence(
      { verdict: 'CONDITIONAL_PASS', warnings: many },
      'PERFORMANCE'
    );
    expect(out.conditions.length).toBeLessThanOrEqual(5);
    expect(out.conditions.every(c => c.action.length <= 300)).toBe(true);
  });
});
