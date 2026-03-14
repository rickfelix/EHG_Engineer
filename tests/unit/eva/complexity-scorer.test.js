import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the health-config module
vi.mock('../../../scripts/eva/health-dimensions/health-config.mjs', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    dimension: 'complexity',
    enabled: true,
    threshold_warning: 70,
    threshold_critical: 50,
    allowlist: [],
    metadata: { complexity_threshold: 50 }
  }),
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) })
    })
  }
}));

describe('Complexity Scorer', () => {
  let scan;

  beforeEach(async () => {
    const mod = await import('../../../scripts/eva/health-dimensions/complexity-scorer.mjs');
    scan = mod.scan;
  });

  it('should return a score between 0 and 100', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should detect high cyclomatic complexity files', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    const complexFindings = result.findings.filter(f => f.strategy === 'high_cyclomatic');
    expect(complexFindings.length).toBeGreaterThan(0);
    expect(complexFindings.every(f => f.complexity > 50)).toBe(true);
  });

  it('should have proper finding structure', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('findings');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('finding_count');

    expect(result.metadata).toHaveProperty('strategies');
    expect(result.metadata).toHaveProperty('scanned_files');
    expect(result.metadata).toHaveProperty('avg_complexity');
    expect(result.metadata).toHaveProperty('scan_duration_ms');
    expect(result.metadata.strategies).toHaveProperty('high_cyclomatic');
    expect(result.metadata.strategies).toHaveProperty('high_function_count');
    expect(result.metadata.strategies).toHaveProperty('large_file');
  });

  it('should respect allowlist', async () => {
    const result = await scan(process.cwd(), {
      config: {
        allowlist: ['lib/agents/api-sub-agent.js'],
        metadata: { complexity_threshold: 50 }
      }
    });

    const allowlisted = result.findings.find(f => f.file === 'lib/agents/api-sub-agent.js');
    expect(allowlisted).toBeUndefined();
  });

  it('should report finding_count matching findings array length', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    expect(result.finding_count).toBe(result.findings.length);
  });

  it('should categorize findings by severity', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    for (const finding of result.findings) {
      expect(['info', 'warning', 'critical']).toContain(finding.severity);
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('strategy');
      expect(finding).toHaveProperty('reason');
    }
  });

  it('should complete scan in under 30 seconds', async () => {
    const result = await scan(process.cwd(), {
      config: { allowlist: [], metadata: { complexity_threshold: 50 } }
    });

    expect(result.metadata.scan_duration_ms).toBeLessThan(30000);
  });
});
