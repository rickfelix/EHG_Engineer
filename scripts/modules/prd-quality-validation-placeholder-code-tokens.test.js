/**
 * QF-20260905-185 — prd-quality-validation.js's placeholder/boilerplate check must not self-flag
 * a PRD that legitimately discusses the exact code identifiers it targets (a function call, a
 * file path, or a SCREAMING_SNAKE_CASE constant). Cross-cites QF-20260903-722, which fixed the
 * earlier whole-serialized-object substring match but added no code-token exclusion -- these
 * tests reproduce the SAME false-positive class QF-722 could not have caught (its own PRD never
 * needed to name a real 'placeholder'-containing identifier).
 */
import { describe, it, expect } from 'vitest';
import { validatePRDHeuristic } from './prd-quality-validation.js';

function baseFRs(overrideFirst) {
  return [
    overrideFirst,
    { id: 'FR-2', title: 'Unrelated second requirement', description: 'Adds a second, genuinely distinct piece of functionality.' },
    { id: 'FR-3', title: 'Unrelated third requirement', description: 'Adds a third, genuinely distinct piece of functionality.' },
  ];
}

function baseAC() {
  return ['Specific, measurable criterion one.', 'Specific, measurable criterion two.', 'Specific, measurable criterion three.'];
}

function placeholderIssues(result) {
  return result.issues.filter((i) => i.includes('placeholder/boilerplate requirements'));
}

describe('QF-20260905-185: code-token exclusion in containsPlaceholder/isBoilerplate', () => {
  it('a genuine placeholder FR (no code identifiers) is STILL flagged -- the exclusion must not widen past real filler', () => {
    const prd = {
      id: 'PRD-TEST-1',
      functional_requirements: baseFRs({ id: 'FR-1', title: 'To be defined based on SD objectives', description: 'Requirements to be defined during planning.' }),
      acceptance_criteria: baseAC(),
    };
    const result = validatePRDHeuristic(prd);
    expect(placeholderIssues(result).length).toBe(1);
  });

  it('an FR naming a real function call (validatePlaceholderContent()) is NOT flagged', () => {
    const prd = {
      id: 'PRD-TEST-2',
      functional_requirements: baseFRs({
        id: 'FR-1',
        title: 'Flip pass AND required together',
        description: 'validatePlaceholderContent() in scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js currently hard-codes pass:true; change the return so it derives the real verdict.',
      }),
      acceptance_criteria: baseAC(),
    };
    const result = validatePRDHeuristic(prd);
    expect(placeholderIssues(result).length).toBe(0);
  });

  it('an FR naming a real SCREAMING_SNAKE_CASE constant (PLACEHOLDER_PATTERNS) is NOT flagged', () => {
    const prd = {
      id: 'PRD-TEST-3',
      functional_requirements: baseFRs({
        id: 'FR-1',
        title: 'The predicate stays narrow',
        description: 'The trigger is 100% of success_criteria matching isPlaceholderText(), using the 25-regex PLACEHOLDER_PATTERNS corpus, never the any-filler predicate from a different module.',
      }),
      acceptance_criteria: baseAC(),
    };
    const result = validatePRDHeuristic(prd);
    expect(placeholderIssues(result).length).toBe(0);
  });

  it('an FR naming only a real file path (placeholder-content.js) with no function call or constant is NOT flagged', () => {
    const prd = {
      id: 'PRD-TEST-4',
      functional_requirements: baseFRs({
        id: 'FR-1',
        title: 'Fix the gate file',
        description: 'The fix lives entirely in scripts/modules/handoff/executors/lead-to-plan/gates/placeholder-content.js and touches no other module.',
      }),
      acceptance_criteria: baseAC(),
    };
    const result = validatePRDHeuristic(prd);
    expect(placeholderIssues(result).length).toBe(0);
  });

  it('a boilerplate acceptance criterion (no code identifiers) is STILL flagged as a warning', () => {
    const prd = {
      id: 'PRD-TEST-5',
      functional_requirements: baseFRs({ id: 'FR-1', title: 'A real requirement', description: 'A genuinely specific description of real work.' }),
      acceptance_criteria: ['All functional requirements implemented.', 'Specific criterion two.', 'Specific criterion three.'],
    };
    const result = validatePRDHeuristic(prd);
    expect(result.warnings.some((w) => w.includes('boilerplate acceptance criteria'))).toBe(true);
  });
});
