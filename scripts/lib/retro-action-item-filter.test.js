import { describe, it, expect } from 'vitest';
import { isActionable, hasNonActionableOwner, hasExplicitPlaceholderSuccessCriteria, actionOwner, actionText } from './retro-action-item-filter.mjs';

// Real fixture shapes captured live during SD-FDBK-FIX-RETRO-ACTION-ITEM-001's
// investigation (2026-07-13) -- QF-606/691/713/963 were the concrete flooding
// examples; QF-800's items are the legitimately-actionable control case.
//
// IMPORTANT: verified against the RAW retrospectives.action_items JSONB, not
// the rendered QF description text. Only QF-800's smart_format items ever
// carry a real success_criteria field -- QF-606/691/713/963 never did, so
// these fixtures omit success_criteria entirely (matching live data) rather
// than setting it to 'n/a'.
const QF_606_ITEM = {
  item: 'Consider whether the QF-to-SD escalation flow (lib/sd-creation/source-adapters/qf.js::createFromQF) should preserve an already-pushed implementation branch reference',
  owner: 'unassigned',
  priority: 'high',
};
const QF_963_ITEM = {
  item: 'Resize phase-(b) lifecycle-machinery SD scope against the RETIRE verdict',
  owner: 'LEAD',
  priority: 'high',
};
const QF_691_ITEM_1 = {
  item: 'Land the ship_review_findings.repo column migration (fast-follow SD)',
  owner: 'LEAD',
  priority: 'high',
};
const QF_691_ITEM_2 = {
  item: 'Investigate real-world impact of the 5 confirmed borrowed-row candidates',
  owner: 'PLAN',
  priority: 'high',
};
const QF_713_ITEM_1 = {
  item: 'Fix GATE_VISION_SCORE non-determinism harness bug',
  owner: 'LEO-INFRA',
  priority: 'high',
};
const QF_800_ITEM_1 = {
  item: 'Create PRD for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 in product_requirements_v2 table',
  owner: 'PLAN Phase Agent',
  priority: 'high',
  success_criteria: 'PRD exists in database with directive_id=SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 and has ≥3 functional requirements',
};
const QF_800_ITEM_2 = {
  item: 'Re-run blocking sub-agents for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 until PASS verdict',
  owner: 'EXEC Phase Agent',
  priority: 'high',
  success_criteria: "All sub_agent_execution_results for SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 show verdict='PASS'",
};
const QF_800_ITEM_3 = {
  item: 'Verify user journey E2E tests cover all acceptance criteria',
  owner: 'QA Agent',
  priority: 'high',
  success_criteria: 'Each user story has at least one passing E2E test',
};

describe('isActionable', () => {
  it('rejects all 4 concrete flooding examples (QF-606/691/713/963 item shapes)', () => {
    expect(isActionable(QF_606_ITEM)).toBe(false);
    expect(isActionable(QF_963_ITEM)).toBe(false);
    expect(isActionable(QF_691_ITEM_1)).toBe(false);
    expect(isActionable(QF_691_ITEM_2)).toBe(false);
    expect(isActionable(QF_713_ITEM_1)).toBe(false);
  });

  it('does not reject QF-800 item shapes (real owner + real success_criteria)', () => {
    expect(isActionable(QF_800_ITEM_1)).toBe(true);
    expect(isActionable(QF_800_ITEM_2)).toBe(true);
    expect(isActionable(QF_800_ITEM_3)).toBe(true);
  });

  it('accepts an item with a concrete owner and NO success_criteria field (the real-world majority shape -- regression fixture)', () => {
    expect(isActionable({ owner: 'someone', priority: 'high' })).toBe(true);
  });

  it('rejects an item with success_criteria but a non-actionable owner', () => {
    expect(isActionable({ owner: 'unassigned', success_criteria: 'X exists in the DB' })).toBe(false);
  });

  it('rejects an item with a concrete owner but an EXPLICIT placeholder success_criteria', () => {
    expect(isActionable({ owner: 'Some Real Person', priority: 'high', success_criteria: 'n/a' })).toBe(false);
  });

  it('accepts an item with a concrete owner and concrete success_criteria', () => {
    expect(isActionable({ owner: 'Some Real Person', success_criteria: 'X exists in the DB' })).toBe(true);
  });
});

describe('hasNonActionableOwner', () => {
  it('is an exact match, not a substring match -- "PLAN Phase Agent" is not caught by "plan"', () => {
    expect(hasNonActionableOwner({ owner: 'PLAN Phase Agent' })).toBe(false);
    expect(hasNonActionableOwner({ owner: 'PLAN' })).toBe(true);
    expect(hasNonActionableOwner({ owner: 'plan' })).toBe(true);
    expect(hasNonActionableOwner({})).toBe(true); // defaults to 'unassigned'
  });
});

describe('hasExplicitPlaceholderSuccessCriteria', () => {
  it('treats n/a, na, none, and empty as an explicit placeholder (case-insensitive)', () => {
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: 'n/a' })).toBe(true);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: 'N/A' })).toBe(true);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: 'na' })).toBe(true);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: 'none' })).toBe(true);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: '' })).toBe(true);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: 'PRD exists in the database' })).toBe(false);
  });

  it('a MISSING field is never a rejection signal -- absence is normal for 3 of 4 real item shapes', () => {
    expect(hasExplicitPlaceholderSuccessCriteria({})).toBe(false);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: undefined })).toBe(false);
    expect(hasExplicitPlaceholderSuccessCriteria({ success_criteria: null })).toBe(false);
  });
});

describe('actionOwner / actionText (regression: unchanged behavior)', () => {
  it('still extracts owner/text across the four known item shapes', () => {
    expect(actionOwner({ owner: 'X' })).toBe('X');
    expect(actionOwner({ owner_role: 'Y' })).toBe('Y');
    expect(actionOwner({})).toBe('unassigned');
    expect(actionText({ item: 'a' })).toBe('a');
    expect(actionText({ action: 'b' })).toBe('b');
    expect(actionText({ title: 'c' })).toBe('c');
    expect(actionText({ text: 'd' })).toBe('d');
    expect(actionText({})).toBe('(no text)');
  });
});
