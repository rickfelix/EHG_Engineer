import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('review-findings-logger', () => {
  describe('finding categorization logic', () => {
    it('categorizes findings by type', () => {
      const findings = [
        { type: 'CRITICAL', description: 'Auth bypass' },
        { type: 'WARNING', description: 'Missing null check' },
        { type: 'WARNING', description: 'Off by one' },
        { type: 'INFO', description: 'Style suggestion' }
      ];

      const categories = {};
      for (const f of findings) {
        const type = (f.type || 'UNKNOWN').toUpperCase();
        categories[type] = (categories[type] || 0) + 1;
      }

      assert.deepEqual(categories, { CRITICAL: 1, WARNING: 2, INFO: 1 });
    });

    it('handles empty findings', () => {
      const findings = [];
      const categories = {};
      for (const f of findings) {
        const type = (f.type || 'UNKNOWN').toUpperCase();
        categories[type] = (categories[type] || 0) + 1;
      }

      assert.deepEqual(categories, {});
    });

    it('handles findings with missing type', () => {
      const findings = [{ description: 'No type field' }];
      const categories = {};
      for (const f of findings) {
        const type = (f.type || 'UNKNOWN').toUpperCase();
        categories[type] = (categories[type] || 0) + 1;
      }

      assert.deepEqual(categories, { UNKNOWN: 1 });
    });
  });

  describe('review history analysis logic', () => {
    it('computes tier distribution from records', () => {
      const records = [
        { review_tier: 'light', verdict: 'pass', finding_categories: {} },
        { review_tier: 'light', verdict: 'pass', finding_categories: {} },
        { review_tier: 'standard', verdict: 'block', finding_categories: { WARNING: 1 } },
        { review_tier: 'deep', verdict: 'pass', finding_categories: { INFO: 2 } }
      ];

      const tierDistribution = { light: 0, standard: 0, deep: 0 };
      for (const r of records) {
        tierDistribution[r.review_tier] = (tierDistribution[r.review_tier] || 0) + 1;
      }

      assert.deepEqual(tierDistribution, { light: 2, standard: 1, deep: 1 });
    });

    it('computes block rate', () => {
      const records = [
        { verdict: 'pass' },
        { verdict: 'block' },
        { verdict: 'pass' },
        { verdict: 'pass' }
      ];

      let blockCount = 0;
      for (const r of records) {
        if (r.verdict === 'block') blockCount++;
      }
      const blockRate = Math.round((blockCount / records.length) * 100);

      assert.equal(blockRate, 25);
    });

    it('aggregates finding patterns across records', () => {
      const records = [
        { finding_categories: { CRITICAL: 1, WARNING: 2 } },
        { finding_categories: { WARNING: 1, INFO: 3 } },
        { finding_categories: null }
      ];

      const patterns = { CRITICAL: 0, WARNING: 0, INFO: 0 };
      for (const r of records) {
        if (r.finding_categories) {
          for (const [type, count] of Object.entries(r.finding_categories)) {
            patterns[type] = (patterns[type] || 0) + count;
          }
        }
      }

      assert.deepEqual(patterns, { CRITICAL: 1, WARNING: 3, INFO: 3 });
    });

    it('handles empty history', () => {
      const records = [];
      const blockRate = records.length > 0 ? Math.round((0 / records.length) * 100) : 0;
      assert.equal(blockRate, 0);
    });
  });
});
