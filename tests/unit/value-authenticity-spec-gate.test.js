// SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001: tests for the spec-time anti-mock gate
// (FR-2 mock-satisfiability, FR-3 deferred-stub trap, FR-4 no-silent-pass, FR-5
// observe-only mode). Covers PRD test scenarios TS-1 through TS-5.
import { describe, it, expect } from 'vitest';
import {
  classifyTriggerPredicate,
  isMockSatisfiable,
  extractCriterionId,
  checkDeferredStubTrap,
  checkNoSilentPass,
  evaluateFunctionalRequirement,
  evaluateValueAuthenticitySpecGate
} from '../../scripts/modules/handoff/validation/validator-registry/gates/value-authenticity-spec-gate.js';

describe('classifyTriggerPredicate (trigger predicate — derived-result vs CRUD/nav)', () => {
  it('flags a derived-result leaf (analysis/recommendation) as in scope', () => {
    expect(classifyTriggerPredicate('System shall generate a persona recommendation with WTP pricing analysis based on user input')).toBe(true);
  });

  it('does NOT flag a CRUD/nav leaf — TS-5', () => {
    expect(classifyTriggerPredicate('User can create a venture record and navigate to the detail page')).toBe(false);
  });

  it('does NOT flag a pure display leaf even if it mentions a derived-result noun in passing', () => {
    expect(classifyTriggerPredicate('User can view the score history list and navigate back')).toBe(false);
  });

  it('returns false for empty/missing text', () => {
    expect(classifyTriggerPredicate('')).toBe(false);
    expect(classifyTriggerPredicate(undefined)).toBe(false);
  });
});

describe('isMockSatisfiable + extractCriterionId (FR-2)', () => {
  it('flags free-text "differs per input" as mock-satisfiable — the exact MarketLens TR-2 defect', () => {
    expect(isMockSatisfiable('Output differs per input, proving the engine is responsive')).toBe(true);
  });

  it('does NOT flag a criterion that selects a library form by ID', () => {
    expect(isMockSatisfiable('VA-T1-source-reached: instrumented_call_site=persona-gen-api, product_level_claim="WTP derives from real research"')).toBe(false);
  });

  it('extracts the criterion_id from a valid selection', () => {
    expect(extractCriterionId('Use VA-T2-metamorphic-monotonicity: perturbation=budget-2x')).toBe('VA-T2-METAMORPHIC-MONOTONICITY');
  });

  it('extractCriterionId returns null when no library ID is present', () => {
    expect(extractCriterionId('The output should be reasonable')).toBeNull();
  });

  it('empty criterion text is mock-satisfiable', () => {
    expect(isMockSatisfiable('')).toBe(true);
    expect(isMockSatisfiable(null)).toBe(true);
  });
});

describe('checkDeferredStubTrap (FR-3, two teeth)', () => {
  it('rejects a deferral with only a named blocking SD (missing claim-demotion tooth)', () => {
    const result = checkDeferredStubTrap({ namedBlockingSdKey: 'SD-FOLLOWUP-001', claimDemoted: false });
    expect(result.passed).toBe(false);
    expect(result.missingTeeth).toContain('CLAIM_DEMOTION');
  });

  it('rejects a deferral with only claim-demotion (missing named-SD tooth) — an untracked deferral', () => {
    const result = checkDeferredStubTrap({ namedBlockingSdKey: null, claimDemoted: true });
    expect(result.passed).toBe(false);
    expect(result.missingTeeth).toContain('NAMED_BLOCKING_PREDECESSOR_SD');
  });

  it('rejects the MarketLens TR-2-style untracked deferral (both teeth missing)', () => {
    const result = checkDeferredStubTrap({});
    expect(result.passed).toBe(false);
    expect(result.missingTeeth).toEqual(['NAMED_BLOCKING_PREDECESSOR_SD', 'CLAIM_DEMOTION']);
  });

  it('accepts a deferral with both teeth present', () => {
    const result = checkDeferredStubTrap({ namedBlockingSdKey: 'SD-REAL-ENGINE-001', claimDemoted: true });
    expect(result.passed).toBe(true);
    expect(result.missingTeeth).toEqual([]);
  });
});

describe('checkNoSilentPass (FR-4)', () => {
  it('passes when a library criterion is present', () => {
    expect(checkNoSilentPass({ hasLibraryCriterion: true }).passed).toBe(true);
  });

  it('fails (does not silently pass) when there is no criterion and no waiver', () => {
    const result = checkNoSilentPass({ hasLibraryCriterion: false, waiver: null });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('NO_CRITERION_NO_WAIVER');
  });

  it('fails when a waiver exists but has no named owner', () => {
    const result = checkNoSilentPass({ hasLibraryCriterion: false, waiver: { ownerName: '' } });
    expect(result.passed).toBe(false);
  });

  it('passes with a waiver that has a named owner', () => {
    const result = checkNoSilentPass({ hasLibraryCriterion: false, waiver: { ownerName: 'Adam' } });
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('WAIVER_WITH_NAMED_OWNER');
  });
});

describe('evaluateFunctionalRequirement — integration of the checks above', () => {
  it('TS-1: MarketLens replay — free-text "differs per input" on a derived-result leaf is flagged', () => {
    const fr = {
      id: 'FR-1',
      title: 'Generate persona recommendations',
      description: 'System shall generate a persona and WTP pricing analysis from user input',
      acceptance_criteria: ['Output differs per input']
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set() });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].issue).toBe('MOCK_SATISFIABLE');
  });

  it('TS-1: MarketLens replay fails on BOTH grounds when the FR also declares an untracked deferral (SSOT §4.1)', () => {
    const fr = {
      id: 'TR-2',
      title: 'Generate persona recommendations',
      description: 'System shall generate a persona and WTP pricing analysis from user input',
      acceptance_criteria: ['Output differs per input'],
      // The real engine was deferred to an UNTRACKED follow-up — no named blocking SD,
      // no claim-demotion. This is the exact MarketLens TR-2 defect.
      deferral: {}
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set() });
    const issues = findings.map(f => f.issue);
    expect(issues).toContain('MOCK_SATISFIABLE');
    expect(issues).toContain('DEFERRED_STUB_TRAP_VIOLATION');
  });

  it('FR-3 wired: a tracked deferral (both teeth present) does not raise DEFERRED_STUB_TRAP_VIOLATION', () => {
    const fr = {
      id: 'FR-7',
      title: 'Generate persona recommendations',
      description: 'System shall generate a persona and WTP pricing analysis from user input',
      acceptance_criteria: ['VA-T1-source-reached: instrumented_call_site=x, product_level_claim=y'],
      deferral: { namedBlockingSdKey: 'SD-REAL-ENGINE-001', claimDemoted: true }
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set(['VA-T1-SOURCE-REACHED']) });
    expect(findings.some(f => f.issue === 'DEFERRED_STUB_TRAP_VIOLATION')).toBe(false);
  });

  it('FR-3 wired: an FR with no `deferral` field at all is never flagged for the stub trap', () => {
    const fr = {
      id: 'FR-8',
      title: 'Generate market analysis',
      description: 'System shall produce a market analysis score',
      acceptance_criteria: ['VA-T1-source-reached: instrumented_call_site=x, product_level_claim=y']
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set(['VA-T1-SOURCE-REACHED']) });
    expect(findings.some(f => f.issue === 'DEFERRED_STUB_TRAP_VIOLATION')).toBe(false);
  });

  it('TS-5: a CRUD/nav FR is never gated, even with a vague criterion', () => {
    const fr = {
      id: 'FR-2',
      title: 'Create venture record',
      description: 'User can create a venture record via a form',
      acceptance_criteria: ['Form submits successfully']
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set() });
    expect(findings).toEqual([]);
  });

  it('a library-selected criterion on a derived-result leaf produces no findings', () => {
    const fr = {
      id: 'FR-3',
      title: 'Generate market analysis',
      description: 'System shall produce a market analysis score',
      acceptance_criteria: ['VA-T1-source-reached: instrumented_call_site=market-api, product_level_claim="score derives from real market data"']
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set(['VA-T1-SOURCE-REACHED']) });
    expect(findings).toEqual([]);
  });

  it('flags UNKNOWN_CRITERION_ID when the referenced ID is not in the live library', () => {
    const fr = {
      id: 'FR-4',
      title: 'Generate market analysis',
      description: 'System shall produce a market analysis score',
      acceptance_criteria: ['VA-T1-nonexistent-form: some params']
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set(['VA-T1-SOURCE-REACHED']) });
    expect(findings.some(f => f.issue === 'UNKNOWN_CRITERION_ID')).toBe(true);
  });

  it('FR-4 no-silent-pass: derived-result leaf with zero criteria and no waiver is flagged, not silently passed', () => {
    const fr = {
      id: 'FR-5',
      title: 'Generate persona recommendations',
      description: 'System shall generate persona recommendations',
      acceptance_criteria: []
    };
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set() });
    expect(findings.some(f => f.issue === 'NO_SILENT_PASS_VIOLATION')).toBe(true);
  });

  it('FR-4 waiver path: a named-owner waiver silences the no-silent-pass finding', () => {
    const fr = {
      id: 'FR-6',
      title: 'Generate persona recommendations',
      description: 'System shall generate persona recommendations',
      acceptance_criteria: []
    };
    const waiversByFrId = new Map([['FR-6', { ownerName: 'Adam' }]]);
    const findings = evaluateFunctionalRequirement(fr, { libraryCriterionIds: new Set(), waiversByFrId });
    expect(findings).toEqual([]);
  });
});

describe('evaluateValueAuthenticitySpecGate — TS-4 observe-only vs binding mode', () => {
  const nonConformingPrd = {
    functional_requirements: [
      {
        id: 'FR-1',
        title: 'Generate persona recommendations',
        description: 'System shall generate a persona and WTP pricing analysis',
        acceptance_criteria: ['Output differs per input']
      }
    ]
  };

  it('observe-only (default): gate PASSES with warnings, never blocks a non-conforming PRD', () => {
    const result = evaluateValueAuthenticitySpecGate(nonConformingPrd, { bindingEnabled: false });
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  it('binding mode: the SAME non-conforming PRD FAILS the gate', () => {
    const result = evaluateValueAuthenticitySpecGate(nonConformingPrd, { bindingEnabled: true });
    expect(result.passed).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('a conforming PRD passes in BOTH modes', () => {
    const conformingPrd = {
      functional_requirements: [
        {
          id: 'FR-1',
          title: 'Generate persona recommendations',
          description: 'System shall generate a persona and WTP pricing analysis',
          acceptance_criteria: ['VA-T1-source-reached: instrumented_call_site=x, product_level_claim=y']
        }
      ]
    };
    const libraryCriterionIds = new Set(['VA-T1-SOURCE-REACHED']);
    expect(evaluateValueAuthenticitySpecGate(conformingPrd, { bindingEnabled: false, libraryCriterionIds }).passed).toBe(true);
    expect(evaluateValueAuthenticitySpecGate(conformingPrd, { bindingEnabled: true, libraryCriterionIds }).passed).toBe(true);
  });

  it('handles a PRD with no functional_requirements gracefully', () => {
    const result = evaluateValueAuthenticitySpecGate({}, { bindingEnabled: true });
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
  });
});
