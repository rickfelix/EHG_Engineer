/**
 * Tests for mobile-first template selection in Replit prompts
 * SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-A
 */
import { describe, it, expect } from 'vitest';
import { formatPlanModePrompt, formatReplitMd } from '../../../../lib/eva/bridge/replit-format-strategies.js';

const makeGroups = (items = []) => [{
  group_key: 'sprint_plan',
  group_name: 'Sprint Plan',
  artifacts: [{
    content: JSON.stringify({ items }),
    title: 'Sprint Items',
    artifact_type: 'sprint_plan',
    lifecycle_stage: 19,
  }],
}];

const summary = { total_groups: 1, venture_name: 'TestVenture' };

describe('Mobile-first template selection', () => {
  describe('formatPlanModePrompt', () => {
    it('uses Expo framework for mobile ventures', () => {
      const venture = { name: 'TestApp', description: 'Test', targetPlatform: 'mobile' };
      const result = formatPlanModePrompt(makeGroups(), venture, summary);
      expect(result).toContain('Expo');
      expect(result).not.toContain('Vite');
    });

    it('uses Expo framework for both ventures', () => {
      const venture = { name: 'TestApp', description: 'Test', targetPlatform: 'both' };
      const result = formatPlanModePrompt(makeGroups(), venture, summary);
      expect(result).toContain('Expo');
    });

    it('uses Vite/React for web ventures', () => {
      const venture = { name: 'TestApp', description: 'Test', targetPlatform: 'web' };
      const result = formatPlanModePrompt(makeGroups(), venture, summary);
      expect(result).not.toContain('Expo');
    });

    it('defaults to web when no targetPlatform', () => {
      const venture = { name: 'TestApp', description: 'Test' };
      const result = formatPlanModePrompt(makeGroups(), venture, summary);
      expect(result).not.toContain('Expo');
    });
  });

  describe('formatReplitMd', () => {
    it('includes Expo stack for mobile ventures', () => {
      const venture = { name: 'TestApp', description: 'Test', targetPlatform: 'mobile' };
      const result = formatReplitMd(makeGroups(), venture, summary);
      expect(result).toContain('Expo');
      expect(result).toContain('React Native');
    });

    it('uses standard stack for web ventures', () => {
      const venture = { name: 'TestApp', description: 'Test', targetPlatform: 'web' };
      const result = formatReplitMd(makeGroups(), venture, summary);
      expect(result).not.toContain('React Native');
    });
  });
});
