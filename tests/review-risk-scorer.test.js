import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRiskScore, inferChangeType } from '../lib/ship/review-risk-scorer.js';

describe('review-risk-scorer', () => {
  describe('computeRiskScore', () => {
    it('classifies small config change as Light tier', () => {
      const result = computeRiskScore(
        { linesChanged: 15, filesChanged: ['config/workers.json', 'config/phase-model-config.json'] },
        1
      );
      assert.equal(result.tier, 'light');
      assert.equal(result.riskKeywordOverride, false);
    });

    it('classifies medium change as Standard tier', () => {
      const result = computeRiskScore(
        { linesChanged: 80, filesChanged: ['lib/utils/format.js', 'lib/utils/parse.js', 'lib/utils/validate.js', 'lib/utils/transform.js', 'lib/utils/convert.js'] },
        2
      );
      assert.equal(result.tier, 'standard');
    });

    it('classifies large change as Deep tier', () => {
      const result = computeRiskScore(
        { linesChanged: 200, filesChanged: Array.from({ length: 10 }, (_, i) => `lib/module${i}.js`) },
        3
      );
      assert.equal(result.tier, 'deep');
    });

    it('forces Deep tier when auth file is touched regardless of LOC', () => {
      const result = computeRiskScore(
        { linesChanged: 10, filesChanged: ['lib/auth/verify-token.js'] },
        1
      );
      assert.equal(result.tier, 'deep');
      assert.equal(result.riskKeywordOverride, true);
    });

    it('forces Deep tier when migration file is touched', () => {
      const result = computeRiskScore(
        { linesChanged: 5, filesChanged: ['database/migrations/20260407_add_column.sql'] },
        1
      );
      assert.equal(result.tier, 'deep');
      assert.equal(result.riskKeywordOverride, true);
    });

    it('forces Deep tier when schema keyword in SD description', () => {
      const result = computeRiskScore(
        { linesChanged: 10, filesChanged: ['lib/utils/helper.js'] },
        1,
        undefined,
        'Add schema validation for user input'
      );
      assert.equal(result.tier, 'deep');
      assert.equal(result.riskKeywordOverride, true);
    });

    it('boundary: exactly 30 LOC with 3 files = Light', () => {
      const result = computeRiskScore(
        { linesChanged: 30, filesChanged: ['a.js', 'b.js', 'c.js'] },
        1
      );
      assert.equal(result.tier, 'light');
    });

    it('boundary: 31 LOC with more files and higher tier bumps to Standard', () => {
      const result = computeRiskScore(
        { linesChanged: 80, filesChanged: ['a.js', 'b.js', 'c.js', 'd.js'] },
        2
      );
      assert.equal(result.tier, 'standard');
    });

    it('returns correct signal breakdown', () => {
      const result = computeRiskScore(
        { linesChanged: 50, filesChanged: ['lib/ship/review-gate.js'] },
        2
      );
      assert.ok(result.signals.loc);
      assert.ok(result.signals.riskSurface);
      assert.ok(result.signals.sdTier);
      assert.ok(result.signals.changeType);
      assert.equal(result.signals.loc.weight, 0.30);
      assert.equal(result.signals.riskSurface.weight, 0.35);
      assert.equal(result.signals.sdTier.weight, 0.20);
      assert.equal(result.signals.changeType.weight, 0.15);
    });

    it('handles empty diff gracefully', () => {
      const result = computeRiskScore({ linesChanged: 0, filesChanged: [] }, 1);
      assert.equal(result.tier, 'light');
      assert.equal(result.score, 0.1);
    });

    it('forces Deep for RLS-related files', () => {
      const result = computeRiskScore(
        { linesChanged: 5, filesChanged: ['database/rls-policies.sql'] },
        1
      );
      assert.equal(result.tier, 'deep');
      assert.equal(result.riskKeywordOverride, true);
    });
  });

  describe('inferChangeType', () => {
    it('detects migration files', () => {
      assert.equal(inferChangeType(['database/migrations/001.sql']), 'migration');
    });

    it('detects auth files', () => {
      assert.equal(inferChangeType(['lib/auth/login.js']), 'auth');
    });

    it('detects docs-only changes', () => {
      assert.equal(inferChangeType(['README.md', 'docs/guide.md']), 'docs');
    });

    it('detects config-only changes', () => {
      assert.equal(inferChangeType(['config/workers.json', 'config/phase-model-config.json']), 'config');
    });

    it('detects test-only changes', () => {
      assert.equal(inferChangeType(['tests/unit.test.js', 'tests/spec.test.js']), 'test');
    });

    it('returns mixed for heterogeneous changes', () => {
      assert.equal(inferChangeType(['lib/app.js', 'README.md', 'config/x.json', 'test/y.test.js']), 'mixed');
    });
  });
});
