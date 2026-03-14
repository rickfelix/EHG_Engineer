import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'path';

// Mock the health-config module
vi.mock('../../../scripts/eva/health-dimensions/health-config.mjs', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    dimension: 'dead_code',
    enabled: true,
    threshold_warning: 70,
    threshold_critical: 50,
    min_occurrences: 2,
    max_sds_per_cycle: 2,
    allowlist: []
  }),
  evaluateThreshold: vi.fn((score, config) => {
    if (score <= config.threshold_critical) return { level: 'critical', breached: true };
    if (score <= config.threshold_warning) return { level: 'warning', breached: true };
    return { level: 'ok', breached: false };
  }),
  getConsecutiveBreaches: vi.fn().mockResolvedValue(0),
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
    })
  }
}));

describe('Dead Code Scanner', () => {
  let scan;

  beforeEach(async () => {
    const mod = await import('../../../scripts/eva/health-dimensions/dead-code-scanner.mjs');
    scan = mod.scan;
  });

  it('should return a score between 0 and 100', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [] },
      staleDays: 90
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should detect tmp-*.cjs files as orphans', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [] },
      staleDays: 90
    });

    const tmpFindings = result.findings.filter(f => f.strategy === 'tmp_orphan');
    expect(tmpFindings.length).toBeGreaterThan(0);
    expect(tmpFindings.every(f => f.file.startsWith('scripts/tmp-'))).toBe(true);
    expect(tmpFindings.every(f => f.file.endsWith('.cjs'))).toBe(true);
  });

  it('should have proper finding structure', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [] },
      staleDays: 90
    });

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('finding_count');

    expect(result.metadata).toHaveProperty('strategies');
    expect(result.metadata).toHaveProperty('scanned_files');
    expect(result.metadata).toHaveProperty('scan_duration_ms');
    expect(result.metadata.strategies).toHaveProperty('tmp_orphans');
    expect(result.metadata.strategies).toHaveProperty('unused_files');
    expect(result.metadata.strategies).toHaveProperty('stale_files');
  });

  it('should respect allowlist', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: ['scripts/tmp-add-columns.cjs'] },
      staleDays: 90
    });

    const allowlisted = result.findings.find(f => f.file === 'scripts/tmp-add-columns.cjs');
    expect(allowlisted).toBeUndefined();
  });

  it('should report finding_count matching findings array length', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [] },
      staleDays: 90
    });

    expect(result.finding_count).toBe(result.findings.length);
  });

  it('should categorize findings by severity', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [] },
      staleDays: 90
    });

    for (const finding of result.findings) {
      expect(['info', 'warning', 'critical']).toContain(finding.severity);
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('strategy');
      expect(finding).toHaveProperty('reason');
    }
  });
});
