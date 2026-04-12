import { describe, it, expect } from 'vitest';
import { buildEditPrompt } from '../../lib/eva/qa/stitch-edit-prompt-builder.js';

describe('buildEditPrompt', () => {
  describe('missing elements', () => {
    it('includes missing elements in prompt', () => {
      const result = buildEditPrompt({
        missing_elements: ['navigation bar', 'search button'],
      });
      expect(result).toContain('navigation bar');
      expect(result).toContain('search button');
    });

    it('handles single missing element', () => {
      const result = buildEditPrompt({ missing_elements: ['sidebar'] });
      expect(result).toContain('sidebar');
    });
  });

  describe('low dimensions', () => {
    it('mentions low layout score', () => {
      const result = buildEditPrompt({
        dimensions: { components: 90, layout: 30, navigation: 85, purpose: 90 },
      });
      expect(result).toContain('layout');
      expect(result).toContain('30%');
    });

    it('mentions multiple low dimensions sorted by score', () => {
      const result = buildEditPrompt({
        dimensions: { components: 20, layout: 40, navigation: 85, purpose: 90 },
      });
      expect(result).toContain('component');
      expect(result).toContain('layout');
      expect(result.indexOf('component')).toBeLessThan(result.indexOf('layout'));
    });

    it('skips dimensions above 70 and returns generic prompt', () => {
      const result = buildEditPrompt({
        dimensions: { components: 90, layout: 80, navigation: 85, purpose: 95 },
      });
      // All dimensions are above 70, so no specific dimension feedback — generic prompt
      expect(result).toContain('Refine');
      expect(result).not.toContain('currently');
    });
  });

  describe('combined feedback', () => {
    it('includes both missing elements and low dimensions', () => {
      const result = buildEditPrompt({
        missing_elements: ['footer'],
        dimensions: { layout: 45 },
      });
      expect(result).toContain('footer');
      expect(result).toContain('layout');
    });

    it('includes screen name as context', () => {
      const result = buildEditPrompt({
        name: 'Dashboard',
        missing_elements: ['chart widget'],
      });
      expect(result).toContain('Dashboard');
      expect(result).toContain('chart widget');
    });
  });

  describe('edge cases', () => {
    it('returns generic prompt for null input', () => {
      const result = buildEditPrompt(null);
      expect(result).toContain('Improve');
    });

    it('returns generic prompt for undefined input', () => {
      const result = buildEditPrompt(undefined);
      expect(result.length).toBeGreaterThan(10);
    });

    it('returns generic prompt for empty object', () => {
      const result = buildEditPrompt({});
      expect(result).toContain('Refine');
    });

    it('returns generic prompt for empty missing_elements and high dimensions', () => {
      const result = buildEditPrompt({
        missing_elements: [],
        dimensions: { components: 90, layout: 85, navigation: 80, purpose: 95 },
      });
      expect(result).toContain('Refine');
    });

    it('handles non-numeric dimension scores gracefully', () => {
      const result = buildEditPrompt({
        dimensions: { components: 'high', layout: null },
      });
      // Should not crash, should return generic
      expect(result).toContain('Refine');
    });
  });
});
