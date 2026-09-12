/**
 * QF-20260912-856 — the protocol-improvement summary action item must be a SMART-shaped
 * object like every other entry in action_items, never a bare string.
 *
 * Root cause: formatActionItems() (scripts/modules/rubrics/retrospective-quality-rubric.js)
 * renders a plain string with no owner/deadline/status context, while an object gets
 * "[Owner: ...] [Deadline: ...]" appended. A retrospective whose action_items array mixed
 * well-formed SMART objects with one bare summary string read as generic boilerplate to the
 * Learning Specificity grader, dragging RETROSPECTIVE_QUALITY_GATE down to 39-43/100 even
 * when every other item was well-formed (issue_patterns PAT-LES-f087731803f9,
 * PAT-LES-d9a2837fa5d8).
 */
import { describe, it, expect } from 'vitest';
import { generateRetrospective, generateProtocolImprovements } from '../../../lib/sub-agents/retro/generators.js';

// Minimal fixture that reaches generateProtocolImprovements() with >0 findings: no PRD
// (PLAN_ENFORCEMENT) + fewer than 4 handoffs (HANDOFF_ENFORCEMENT).
function makeFixture() {
  return {
    sdData: {
      id: 'sd-test-1', sd_key: 'SD-TEST-001', title: 'Test SD', status: 'completed',
      sd_type: 'feature', target_application: 'EHG_Engineer', category: 'feature',
    },
    prdData: { found: false },
    handoffs: { count: 2, list: [], handoffs: [{ handoff_type: 'LEAD-TO-PLAN' }, { handoff_type: 'PLAN-TO-EXEC' }] },
    subAgentResults: { count: 1, results: [{ verdict: 'PASS', sub_agent_code: 'TESTING' }] },
  };
}

describe('QF-20260912-856: protocol-improvement action item shape', () => {
  it('generateProtocolImprovements finds >0 improvements for this fixture (precondition)', () => {
    const { sdData, prdData, handoffs, subAgentResults } = makeFixture();
    const improvements = generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, []);
    expect(improvements.length).toBeGreaterThan(0);
  });

  it('the protocol-improvement summary entry in action_items is a SMART object, not a string', () => {
    const { sdData, prdData, handoffs, subAgentResults } = makeFixture();
    const retro = generateRetrospective(sdData, prdData, handoffs, subAgentResults, {}, null, null, null);

    const summaryItem = retro.action_items.find(
      (item) => typeof item === 'object' && item.source === 'protocol_improvement_summary'
    );
    expect(summaryItem).toBeDefined();
    expect(typeof summaryItem).toBe('object');
    expect(summaryItem).toMatchObject({
      owner: expect.any(String),
      deadline: expect.any(String),
      success_criteria: expect.any(String),
      priority: expect.any(String),
      smart_format: true,
    });
    expect(summaryItem.action).toMatch(/^Address \d+ protocol finding\(s\) in:/);
  });

  it('no entry in action_items is a bare string (every item is a structured SMART object)', () => {
    const { sdData, prdData, handoffs, subAgentResults } = makeFixture();
    const retro = generateRetrospective(sdData, prdData, handoffs, subAgentResults, {}, null, null, null);
    for (const item of retro.action_items) {
      expect(typeof item).toBe('object');
      expect(item).not.toBeNull();
    }
  });

  it('omits the summary item entirely when there are no protocol improvements (unchanged behavior)', () => {
    const sdData = {
      id: 'sd-test-2', sd_key: 'SD-TEST-002', title: 'Test SD 2', status: 'completed',
      sd_type: 'orchestrator', target_application: 'EHG_Engineer', category: 'orchestrator',
    };
    const prdData = { found: true, prd: { title: 'PRD', functional_requirements: [{}, {}, {}] } };
    const handoffs = { count: 4, list: [], handoffs: [
      { handoff_type: 'LEAD-TO-PLAN' }, { handoff_type: 'PLAN-TO-EXEC' },
      { handoff_type: 'EXEC-TO-PLAN' }, { handoff_type: 'PLAN-TO-LEAD' },
    ] };
    const subAgentResults = { count: 3, results: [
      { verdict: 'PASS', sub_agent_code: 'TESTING' }, { verdict: 'PASS', sub_agent_code: 'SECURITY' }, { verdict: 'PASS', sub_agent_code: 'DOCMON' },
    ] };
    const improvements = generateProtocolImprovements(sdData, prdData, handoffs, subAgentResults, []);
    expect(improvements.length).toBe(0); // orchestrator is exempt from every category here

    const retro = generateRetrospective(sdData, prdData, handoffs, subAgentResults, {}, null, null, null);
    const summaryItem = retro.action_items.find(
      (item) => typeof item === 'object' && item.source === 'protocol_improvement_summary'
    );
    expect(summaryItem).toBeUndefined();
  });
});
