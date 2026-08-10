// SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001 — the template-assertion corpus,
// pinned two-sided against detectBoilerplate.
//
// FR-0 measured the gap live: a textbook template retro (the LEAD_TO_PLAN handoff-retro
// generator's output) scored 68 on the AI rubric with boilerplate_penalty 0 — the 44 existing
// patterns catch ASPIRATIONAL filler while the live corpus is template ASSERTIONS, and the AI
// criterion graded the template's learning_specificity 8/10 (SD-ID splicing reads as
// specificity). The deterministic penalty below is the discrimination the AI cannot provide.
// Substring-redundancy audit (PLAN mandate): each new pattern checked against the existing 44
// and its siblings — no containment either direction (the existing list has no template-
// assertion shapes; the new anchored phrases share no substrings with each other).

import { describe, it, expect } from 'vitest';
import { RetrospectiveQualityRubric } from '../../scripts/modules/rubrics/retrospective-quality-rubric.js';

// Verbatim content class of retro 1908315c (measured FR-0 boilerplate sample), including the
// writer-stamped is_boilerplate:false flags that assert the opposite of reality.
const TEMPLATE_RETRO = {
  what_went_well: [
    { achievement: 'SD was clear and well-defined for planning', is_boilerplate: false },
    { achievement: 'Acceptance criteria were comprehensive and actionable', is_boilerplate: false },
    { achievement: 'Dependencies were correctly identified upfront', is_boilerplate: false },
    { achievement: 'Simplicity assessment was accurate and helpful', is_boilerplate: false },
    { achievement: 'Handoff validation passed all gates successfully', is_boilerplate: false }
  ],
  key_learnings: [
    { learning: 'LEAD-TO-PLAN revealed that infrastructure SDs targeting EHG_Engineer benefit from the 4-handoff workflow', is_boilerplate: false },
    { learning: 'Implement core changes was the primary implementation vector for SD-TEST-001', is_boilerplate: false }
  ],
  action_items: [],
  what_needs_improvement: []
};

// Content class of retro 26fbab8e (measured FR-0 thin-legit sample): terse but SD-specific.
const SPECIFIC_RETRO = {
  what_went_well: [
    'key_changes_delivered met target (95/100): All three FRs merged to main via PR #6919 (39c26da4f02)',
    'Heal scoring produced an actionable score (91/100) captured for the learning loop'
  ],
  key_learnings: [
    '[success_metrics_achieved] scored 90/100 (gap: 3pts) — backward compatibility held: 1270/1270 across 110 files',
    '[smoke_tests_pass] scored 85/100 — no smoke_test_steps declared on the SD (plan-created, derived fields empty)'
  ],
  action_items: [],
  what_needs_improvement: []
};

describe('detectBoilerplate: template-assertion corpus (two-sided)', () => {
  it('flags the generator template corpus at the -25 cap, ignoring is_boilerplate:false stamps', () => {
    const r = RetrospectiveQualityRubric.detectBoilerplate(TEMPLATE_RETRO);
    expect(r.hasBoilerplate).toBe(true);
    expect(r.matchCount).toBeGreaterThanOrEqual(5);
    expect(r.scorePenalty).toBe(25);
  });

  it('leaves thin-but-SD-specific content untouched (0 matches, 0 penalty)', () => {
    const r = RetrospectiveQualityRubric.detectBoilerplate(SPECIFIC_RETRO);
    expect(r.matchCount).toBe(0);
    expect(r.scorePenalty).toBe(0);
  });

  it('anchored patterns do not fire on near-miss genuine prose', () => {
    const r = RetrospectiveQualityRubric.detectBoilerplate({
      what_went_well: [
        'the SD scope was clear to reviewers after the second pass',
        'we validated the dependencies against the live catalog before EXEC',
        'the acceptance tests were comprehensive for the new resolver ladder'
      ],
      key_learnings: ['the handoff chain design benefits from measured premises'],
      action_items: [], what_needs_improvement: []
    });
    expect(r.matchCount).toBe(0);
  });
});
