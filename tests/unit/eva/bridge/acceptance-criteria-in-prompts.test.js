/**
 * Tests for acceptance criteria in Replit prompt surfaces
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-A-D
 */
import { describe, it, expect } from 'vitest';
import { formatFeaturePrompts, formatPlanModePrompt } from '../../../../lib/eva/bridge/replit-format-strategies.js';

const makeGroups = (items) => [{
  group_key: 'sprint_plan',
  group_name: 'Sprint Plan',
  artifacts: [{
    content: JSON.stringify({ items }),
    title: 'Sprint Items',
    artifact_type: 'sprint_plan',
    lifecycle_stage: 19,
  }],
}];

const venture = { name: 'TestVenture', description: 'Test' };
const summary = { total_groups: 1, venture_name: 'TestVenture' };

describe('Acceptance criteria in Replit prompts', () => {
  const itemWithAC = {
    name: 'User Dashboard',
    description: 'Build the main dashboard',
    story_points: 5,
    priority: 'high',
    success_criteria: 'Dashboard loads in <2s and shows user stats',
  };

  const itemWithoutAC = {
    name: 'Setup CI/CD',
    description: 'Configure pipeline',
    story_points: 3,
    priority: 'medium',
  };

  describe('formatFeaturePrompts', () => {
    it('includes acceptance criteria section when present', () => {
      const groups = makeGroups([itemWithAC]);
      const prompts = formatFeaturePrompts(groups, venture, summary);
      expect(prompts).toHaveLength(1);
      expect(prompts[0].content).toContain('### Acceptance Criteria');
      expect(prompts[0].content).toContain('Dashboard loads in <2s');
    });

    it('omits acceptance criteria section when missing', () => {
      const groups = makeGroups([itemWithoutAC]);
      const prompts = formatFeaturePrompts(groups, venture, summary);
      expect(prompts).toHaveLength(1);
      expect(prompts[0].content).not.toContain('### Acceptance Criteria');
    });

    it('handles mixed items correctly', () => {
      const groups = makeGroups([itemWithAC, itemWithoutAC]);
      const prompts = formatFeaturePrompts(groups, venture, summary);
      expect(prompts).toHaveLength(2);
      expect(prompts[0].content).toContain('### Acceptance Criteria');
      expect(prompts[1].content).not.toContain('### Acceptance Criteria');
    });
  });

  describe('formatPlanModePrompt', () => {
    it('includes acceptance criteria in plan mode prompt', () => {
      const groups = makeGroups([itemWithAC]);
      const result = formatPlanModePrompt(groups, venture, summary);
      expect(result).toContain('Done when:');
      expect(result).toContain('Dashboard loads in <2s');
    });

    it('omits criteria line when not present', () => {
      const groups = makeGroups([itemWithoutAC]);
      const result = formatPlanModePrompt(groups, venture, summary);
      expect(result).not.toContain('Done when:');
    });
  });
});
