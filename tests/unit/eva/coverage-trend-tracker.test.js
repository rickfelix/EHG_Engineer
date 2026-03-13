import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

// Mock fs/promises for controlled test data
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn()
}));

import { readFile, stat } from 'fs/promises';
import {
  scan,
  extractModuleMetrics,
  computeCompositeScore,
  normalizePath,
  METRIC_WEIGHTS
} from '../../../scripts/eva/health-dimensions/coverage-trend-tracker.mjs';

// Sample coverage-summary.json data matching Vitest v8 output format
const SAMPLE_COVERAGE = {
  total: {
    lines: { total: 1000, covered: 750, skipped: 0, pct: 75 },
    statements: { total: 1100, covered: 880, skipped: 0, pct: 80 },
    functions: { total: 200, covered: 140, skipped: 0, pct: 70 },
    branches: { total: 300, covered: 180, skipped: 0, pct: 60 }
  },
  '/abs/path/lib/utils/helpers.js': {
    lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
    statements: { total: 110, covered: 99, skipped: 0, pct: 90 },
    functions: { total: 20, covered: 14, skipped: 0, pct: 70 },
    branches: { total: 30, covered: 18, skipped: 0, pct: 60 }
  },
  '/abs/path/lib/services/auth.js': {
    lines: { total: 200, covered: 190, skipped: 0, pct: 95 },
    statements: { total: 220, covered: 209, skipped: 0, pct: 95 },
    functions: { total: 30, covered: 27, skipped: 0, pct: 90 },
    branches: { total: 40, covered: 36, skipped: 0, pct: 90 }
  },
  '/abs/path/scripts/modules/parser.js': {
    lines: { total: 50, covered: 20, skipped: 0, pct: 40 },
    statements: { total: 55, covered: 22, skipped: 0, pct: 40 },
    functions: { total: 10, covered: 3, skipped: 0, pct: 30 },
    branches: { total: 15, covered: 6, skipped: 0, pct: 40 }
  }
};

describe('coverage-trend-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractModuleMetrics', () => {
    it('extracts per-module metrics and skips total', () => {
      const modules = extractModuleMetrics(SAMPLE_COVERAGE);
      expect(modules).toHaveLength(3);
      expect(modules.every(m => m.path !== 'total')).toBe(true);
    });

    it('extracts correct metric values', () => {
      const modules = extractModuleMetrics(SAMPLE_COVERAGE);
      const helpers = modules.find(m => m.path.includes('helpers'));
      expect(helpers.metrics.lines).toBe(80);
      expect(helpers.metrics.functions).toBe(70);
      expect(helpers.metrics.branches).toBe(60);
      expect(helpers.metrics.statements).toBe(90);
    });

    it('handles missing metric data with fallback to 0', () => {
      const partial = {
        '/abs/path/lib/empty.js': {
          lines: { pct: 50 }
          // functions, branches, statements missing
        }
      };
      const modules = extractModuleMetrics(partial);
      expect(modules[0].metrics.functions).toBe(0);
      expect(modules[0].metrics.branches).toBe(0);
      expect(modules[0].metrics.statements).toBe(0);
    });

    it('returns empty array for coverage with only total', () => {
      const totalOnly = { total: { lines: { pct: 80 } } };
      const modules = extractModuleMetrics(totalOnly);
      expect(modules).toHaveLength(0);
    });
  });

  describe('computeCompositeScore', () => {
    it('computes weighted average correctly', () => {
      const metrics = { lines: 80, functions: 70, branches: 60, statements: 90 };
      // 80*0.4 + 70*0.3 + 60*0.2 + 90*0.1 = 32 + 21 + 12 + 9 = 74
      expect(computeCompositeScore(metrics)).toBe(74);
    });

    it('returns 100 for perfect coverage', () => {
      const metrics = { lines: 100, functions: 100, branches: 100, statements: 100 };
      expect(computeCompositeScore(metrics)).toBe(100);
    });

    it('returns 0 for zero coverage', () => {
      const metrics = { lines: 0, functions: 0, branches: 0, statements: 0 };
      expect(computeCompositeScore(metrics)).toBe(0);
    });

    it('weights are correct (sum to 1.0)', () => {
      const sum = Object.values(METRIC_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });

    it('lines metric has highest weight', () => {
      expect(METRIC_WEIGHTS.lines).toBeGreaterThan(METRIC_WEIGHTS.functions);
      expect(METRIC_WEIGHTS.functions).toBeGreaterThan(METRIC_WEIGHTS.branches);
      expect(METRIC_WEIGHTS.branches).toBeGreaterThan(METRIC_WEIGHTS.statements);
    });
  });

  describe('normalizePath', () => {
    it('strips absolute prefix up to lib/', () => {
      expect(normalizePath('/abs/path/lib/utils/helpers.js')).toBe('lib/utils/helpers.js');
    });

    it('strips absolute prefix up to scripts/', () => {
      expect(normalizePath('/abs/path/scripts/modules/parser.js')).toBe('scripts/modules/parser.js');
    });

    it('normalizes backslashes to forward slashes', () => {
      expect(normalizePath('C:\\Users\\user\\lib\\test.js')).toBe('lib/test.js');
    });

    it('handles paths without known prefixes', () => {
      const result = normalizePath('/some/random/deep/path/file.js');
      expect(result).toBeTruthy();
      expect(result.includes('\\')).toBe(false);
    });
  });

  describe('scan', () => {
    it('returns null score when coverage file is missing', async () => {
      stat.mockRejectedValue({ code: 'ENOENT' });
      readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await scan('/fake/root');
      expect(result.score).toBeNull();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].strategy).toBe('missing_data');
      expect(result.metadata.error).toBe('File not found');
    });

    it('parses valid coverage data and computes scores', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue(JSON.stringify(SAMPLE_COVERAGE));

      const result = await scan('/fake/root', {
        config: { threshold_critical: 60, threshold_warning: 70 }
      });

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.metadata.module_count).toBe(3);
      expect(result.finding_count).toBeGreaterThanOrEqual(0);
    });

    it('detects threshold breach for low-coverage modules', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue(JSON.stringify(SAMPLE_COVERAGE));

      const result = await scan('/fake/root', {
        config: { threshold_critical: 60, threshold_warning: 70 }
      });

      // parser.js has composite ~38 which is below 60
      const breaches = result.findings.filter(f => f.strategy === 'threshold_breach');
      expect(breaches.length).toBeGreaterThanOrEqual(1);

      const parserBreach = breaches.find(f => f.file.includes('parser'));
      expect(parserBreach).toBeTruthy();
      expect(parserBreach.details.composite).toBeLessThan(60);
    });

    it('flags stale coverage data', async () => {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      stat.mockResolvedValue({ mtime: tenDaysAgo });
      readFile.mockResolvedValue(JSON.stringify(SAMPLE_COVERAGE));

      const result = await scan('/fake/root', { config: {} });

      expect(result.metadata.stale).toBe(true);
      const staleFindings = result.findings.filter(f => f.strategy === 'stale_data');
      expect(staleFindings).toHaveLength(1);
      // Score should still be computed despite staleness
      expect(result.score).not.toBeNull();
    });

    it('returns score 100 for empty coverage (no modules)', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue(JSON.stringify({ total: { lines: { pct: 100 } } }));

      const result = await scan('/fake/root', { config: {} });
      expect(result.score).toBe(100);
    });

    it('handles malformed JSON gracefully', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue('not valid json {{{');

      const result = await scan('/fake/root');
      expect(result.score).toBeNull();
      expect(result.findings[0].strategy).toBe('missing_data');
    });

    it('includes per-module breakdown in metadata', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue(JSON.stringify(SAMPLE_COVERAGE));

      const result = await scan('/fake/root', { config: {} });
      expect(result.metadata.modules).toBeDefined();
      expect(result.metadata.modules).toHaveLength(3);
      expect(result.metadata.modules[0]).toHaveProperty('composite');
      expect(result.metadata.modules[0]).toHaveProperty('lines');
    });

    it('detects warning-level low coverage modules', async () => {
      stat.mockResolvedValue({ mtime: new Date() });
      readFile.mockResolvedValue(JSON.stringify(SAMPLE_COVERAGE));

      const result = await scan('/fake/root', {
        config: { threshold_critical: 40, threshold_warning: 80 }
      });

      const warnings = result.findings.filter(f => f.strategy === 'low_coverage');
      // helpers.js composite ~74 is between 40 and 80
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });
  });
});
