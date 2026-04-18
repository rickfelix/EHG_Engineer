import { describe, it, expect } from 'vitest';
import { extractKeywords, parseCriteria } from '../../scripts/modules/handoff/executors/plan-to-lead/gates/acceptance-criteria-traceability.js';

describe('acceptance-criteria-traceability', () => {
  describe('extractKeywords', () => {
    it('extracts meaningful words, filters stopwords', () => {
      const kw = extractKeywords('The gate should parse vision document criteria');
      expect(kw).toContain('gate');
      expect(kw).toContain('parse');
      expect(kw).toContain('vision');
      expect(kw).toContain('document');
      expect(kw).toContain('criteria');
      expect(kw).not.toContain('the');
      expect(kw).not.toContain('should');
    });

    it('returns empty for null/undefined', () => {
      expect(extractKeywords(null)).toEqual([]);
      expect(extractKeywords(undefined)).toEqual([]);
      expect(extractKeywords('')).toEqual([]);
    });

    it('filters short tokens (< 3 chars)', () => {
      const kw = extractKeywords('a is to be or ok now test');
      expect(kw).not.toContain('is');
      expect(kw).not.toContain('to');
      expect(kw).not.toContain('be');
      expect(kw).toContain('now');
      expect(kw).toContain('test');
    });
  });

  describe('parseCriteria', () => {
    it('extracts bullet items from Success Criteria section', () => {
      const doc = `# Vision Doc
## Overview
Some overview text.

## Success Criteria
- Per-screen storage enables granular progress tracking
- Page-type classification with >90% accuracy
- Design scoring completes within 5 minutes

## Risks
- Some risk here
`;
      const criteria = parseCriteria(doc);
      expect(criteria).toHaveLength(3);
      expect(criteria[0]).toContain('Per-screen storage');
      expect(criteria[1]).toContain('Page-type classification');
      expect(criteria[2]).toContain('Design scoring');
    });

    it('handles Acceptance Criteria heading variant', () => {
      const doc = `# Plan
### Acceptance Criteria
1. Users can log in
2. Dashboard shows metrics
## Next Section
`;
      const criteria = parseCriteria(doc);
      expect(criteria).toHaveLength(2);
      expect(criteria[0]).toContain('Users can log in');
    });

    it('returns empty for no criteria section', () => {
      const doc = `# Vision Doc
## Overview
Just an overview, no criteria section.
`;
      expect(parseCriteria(doc)).toEqual([]);
    });

    it('returns empty for null/undefined', () => {
      expect(parseCriteria(null)).toEqual([]);
      expect(parseCriteria(undefined)).toEqual([]);
    });

    it('stops at next heading', () => {
      const doc = `## Success Criteria
- First criterion here
- Second criterion here
## Architecture
- This should not be included
`;
      const criteria = parseCriteria(doc);
      expect(criteria).toHaveLength(2);
    });

    it('filters short bullet items (< 5 chars)', () => {
      const doc = `## Success Criteria
- OK
- This is a proper criterion
- No
`;
      const criteria = parseCriteria(doc);
      expect(criteria).toHaveLength(1);
      expect(criteria[0]).toContain('This is a proper criterion');
    });
  });
});
