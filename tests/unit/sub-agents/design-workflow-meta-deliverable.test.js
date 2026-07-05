/**
 * QF-20260705-757: DESIGN workflow validator graph-checks meta-deliverable stories
 * (deviation-ledger records, copy edits, roadmap notes, contracts) as UI journeys,
 * producing a false dead-end/circular-flow FAIL even when no story has any real
 * UI-interaction pattern. Fix: detectWorkflowIssues skips topology checks when no
 * story's implementation_context contains a Navigate/Click/Fill/Submit signal.
 */
import { describe, it, expect } from 'vitest';
import {
  extractWorkflowFromStories,
  buildInteractionGraph,
  detectWorkflowIssues
} from '../../../lib/sub-agents/design/workflow-detection.js';

describe('detectWorkflowIssues: meta-deliverable vs UI-journey discrimination', () => {
  it('does NOT flag dead ends for a meta-deliverable story set with no UI-interaction signal', async () => {
    const userStories = [
      { id: 'US-1', user_role: 'planner', user_want: 'update the deviation ledger', user_benefit: 'record the drift', implementation_context: 'Append a row to the deviation ledger with the reason.' },
      { id: 'US-2', user_role: 'planner', user_want: 'revise the roadmap note', user_benefit: 'reflect the new sequencing', implementation_context: 'Edit the roadmap note text and re-save the contract.' }
    ];

    const workflow = await extractWorkflowFromStories(userStories);
    const graph = buildInteractionGraph(workflow);
    const issues = detectWorkflowIssues(graph, { steps: [], routes: [] }, [], userStories);

    expect(issues.is_ui_journey).toBe(false);
    expect(issues.deadEnds).toHaveLength(0);
    expect(issues.circularFlows).toHaveLength(0);
  });

  it('STILL flags a real dead end for a genuine UI-journey story set (regression guard)', async () => {
    const userStories = [
      {
        id: 'US-1',
        user_role: 'user',
        user_want: 'reach the settings page',
        user_benefit: 'change preferences',
        implementation_context: 'Navigate to /settings then Click #save-orphan-panel'
      }
    ];

    const workflow = await extractWorkflowFromStories(userStories);
    const graph = buildInteractionGraph(workflow);
    const issues = detectWorkflowIssues(graph, { steps: [], routes: [] }, [], userStories);

    expect(issues.is_ui_journey).toBe(true);
    expect(issues.deadEnds.length).toBeGreaterThan(0);
  });

  it('treats a mixed set (at least one real UI story) as a UI journey — topology checks still run', async () => {
    const userStories = [
      { id: 'US-1', user_role: 'planner', user_want: 'update the contract', user_benefit: 'stay current', implementation_context: 'Amend the contract text.' },
      {
        id: 'US-2',
        user_role: 'user',
        user_want: 'reach the review panel',
        user_benefit: 'inspect the change',
        implementation_context: 'Navigate to /review then Click #orphan-widget'
      }
    ];

    const workflow = await extractWorkflowFromStories(userStories);
    const graph = buildInteractionGraph(workflow);
    const issues = detectWorkflowIssues(graph, { steps: [], routes: [] }, [], userStories);

    expect(issues.is_ui_journey).toBe(true);
  });
});
