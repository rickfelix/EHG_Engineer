import { describe, it, expect } from 'vitest';
import {
  formatItemForReview,
  buildIntentOptions,
  inferAIRecommendation,
  buildSummaryTable,
  INTENT_OPTIONS,
} from '../../../scripts/eva/chairman-intake-review.js';

describe('chairman-intake-review', () => {
  describe('INTENT_OPTIONS', () => {
    it('contains Build, Research, Reference, Improve', () => {
      expect(INTENT_OPTIONS).toEqual(['Build', 'Research', 'Reference', 'Improve']);
    });
  });

  describe('formatItemForReview', () => {
    it('formats basic item with title and index', () => {
      const item = { id: '1', title: 'Test Item' };
      const result = formatItemForReview(item, 0, 3);
      expect(result).toContain('Item 1 of 3: Test Item');
    });

    it('includes source URL when present', () => {
      const item = { id: '1', title: 'Test', todoist_url: 'https://todoist.com/task/123' };
      const result = formatItemForReview(item, 0, 1);
      expect(result).toContain('**Source:** https://todoist.com/task/123');
    });

    it('includes application and aspects', () => {
      const item = {
        id: '1',
        title: 'Test',
        target_application: 'EHG_Engineer',
        target_aspects: ['tooling', 'automation'],
      };
      const result = formatItemForReview(item, 0, 1);
      expect(result).toContain('**Application:** EHG_Engineer');
      expect(result).toContain('**Aspects:** tooling, automation');
    });

    it('includes enrichment summary and confidence', () => {
      const item = {
        id: '1',
        title: 'Test',
        enrichment_summary: 'A helpful summary',
        classification_confidence: 0.85,
      };
      const result = formatItemForReview(item, 0, 1);
      expect(result).toContain('**Enrichment Summary:** A helpful summary');
      expect(result).toContain('**AI Confidence:** 85%');
    });

    it('truncates long descriptions to 200 chars', () => {
      const item = {
        id: '1',
        title: 'Test',
        description: 'x'.repeat(300),
      };
      const result = formatItemForReview(item, 0, 1);
      expect(result).toContain('x'.repeat(200) + '...');
    });

    it('handles string aspects gracefully', () => {
      const item = { id: '1', title: 'Test', target_aspects: 'single-aspect' };
      const result = formatItemForReview(item, 0, 1);
      expect(result).toContain('**Aspects:** single-aspect');
    });
  });

  describe('buildIntentOptions', () => {
    it('puts AI recommendation first with label suffix', () => {
      const options = buildIntentOptions('Build');
      expect(options[0].label).toBe('Build (AI Recommended)');
      expect(options.length).toBe(4);
    });

    it('defaults to Research when no recommendation', () => {
      const options = buildIntentOptions(null);
      expect(options[0].label).toBe('Research (AI Recommended)');
    });

    it('is case-insensitive for matching', () => {
      const options = buildIntentOptions('reference');
      expect(options[0].label).toBe('Reference (AI Recommended)');
    });

    it('includes all four intent options', () => {
      const options = buildIntentOptions('Build');
      const labels = options.map(o => o.label.replace(' (AI Recommended)', ''));
      expect(labels).toContain('Build');
      expect(labels).toContain('Research');
      expect(labels).toContain('Reference');
      expect(labels).toContain('Improve');
    });

    it('includes descriptions for each option', () => {
      const options = buildIntentOptions('Build');
      options.forEach(o => {
        expect(o.description).toBeTruthy();
      });
    });
  });

  describe('inferAIRecommendation', () => {
    it('returns existing chairman_intent when present', () => {
      expect(inferAIRecommendation({ chairman_intent: 'build' })).toBe('build');
    });

    it('returns Reference for reference/documentation aspects', () => {
      expect(inferAIRecommendation({ target_aspects: ['reference'] })).toBe('Reference');
      expect(inferAIRecommendation({ target_aspects: ['documentation'] })).toBe('Reference');
    });

    it('returns Improve for bug/fix aspects', () => {
      expect(inferAIRecommendation({ target_aspects: ['bug'] })).toBe('Improve');
      expect(inferAIRecommendation({ target_aspects: ['fix'] })).toBe('Improve');
    });

    it('returns Build for feature/new aspects', () => {
      expect(inferAIRecommendation({ target_aspects: ['feature'] })).toBe('Build');
      expect(inferAIRecommendation({ target_aspects: ['new'] })).toBe('Build');
    });

    it('defaults to Research when no signals', () => {
      expect(inferAIRecommendation({})).toBe('Research');
      expect(inferAIRecommendation({ target_aspects: ['unknown'] })).toBe('Research');
    });

    it('handles non-array aspects', () => {
      expect(inferAIRecommendation({ target_aspects: 'not-an-array' })).toBe('Research');
    });
  });

  describe('buildSummaryTable', () => {
    it('produces markdown table with counts', () => {
      const decisions = [
        { intent: 'build' },
        { intent: 'build' },
        { intent: 'research' },
      ];
      const result = buildSummaryTable(decisions);
      expect(result).toContain('## Review Summary');
      expect(result).toContain('| Build | 2 |');
      expect(result).toContain('| Research | 1 |');
      expect(result).toContain('| **Total** | **3** |');
    });

    it('omits intents with zero count', () => {
      const decisions = [{ intent: 'reference' }];
      const result = buildSummaryTable(decisions);
      expect(result).not.toContain('| Build |');
      expect(result).toContain('| Reference | 1 |');
    });

    it('handles empty decisions', () => {
      const result = buildSummaryTable([]);
      expect(result).toContain('| **Total** | **0** |');
    });
  });
});
