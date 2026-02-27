/**
 * Unit tests for SiblingContextAnalyzer
 * @sd SD-LEO-INFRA-TYPE-CONTENT-BASED-001
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SiblingContextAnalyzer } from '../../scripts/modules/sd-type-sibling-context.js';

describe('SiblingContextAnalyzer', () => {
  beforeEach(() => {
    SiblingContextAnalyzer.clearCache();
  });

  it('returns null for standalone SDs (no parent)', async () => {
    const analyzer = new SiblingContextAnalyzer();
    const result = await analyzer.analyze({ id: 'sd-1', parent_sd_id: null });
    expect(result).toBeNull();
  });

  it('returns null when supabase is unavailable', async () => {
    const analyzer = new SiblingContextAnalyzer(null);
    const result = await analyzer.analyze({ id: 'sd-1', parent_sd_id: 'parent-1' });
    expect(result).toBeNull();
  });

  it('computes consensus when 60%+ siblings share a type', () => {
    const analyzer = new SiblingContextAnalyzer();
    const siblings = [
      { id: 's1', sd_type: 'infrastructure', title: 'A' },
      { id: 's2', sd_type: 'infrastructure', title: 'B' },
      { id: 's3', sd_type: 'infrastructure', title: 'C' },
      { id: 's4', sd_type: 'feature', title: 'D' },
      { id: 's5', sd_type: 'bugfix', title: 'E' }
    ];
    const result = analyzer._computeConsensus(siblings, 'current-id');
    expect(result.recommendedType).toBe('infrastructure');
    expect(result.confidence).toBe(60);
    expect(result.consensusRatio).toBe(0.6);
    expect(result.source).toBe('sibling_context');
  });

  it('returns null recommendation when no consensus', () => {
    const analyzer = new SiblingContextAnalyzer();
    const siblings = [
      { id: 's1', sd_type: 'infrastructure', title: 'A' },
      { id: 's2', sd_type: 'feature', title: 'B' },
      { id: 's3', sd_type: 'bugfix', title: 'C' },
      { id: 's4', sd_type: 'database', title: 'D' },
      { id: 's5', sd_type: 'security', title: 'E' }
    ];
    const result = analyzer._computeConsensus(siblings, 'current-id');
    expect(result.recommendedType).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('excludes current SD from consensus calculation', () => {
    const analyzer = new SiblingContextAnalyzer();
    const siblings = [
      { id: 'current-id', sd_type: 'feature', title: 'Self' },
      { id: 's1', sd_type: 'infrastructure', title: 'A' },
      { id: 's2', sd_type: 'infrastructure', title: 'B' }
    ];
    const result = analyzer._computeConsensus(siblings, 'current-id');
    expect(result.recommendedType).toBe('infrastructure');
    expect(result.confidence).toBe(100);
  });

  it('returns null for empty siblings after filtering', () => {
    const analyzer = new SiblingContextAnalyzer();
    const result = analyzer._computeConsensus([], 'current-id');
    expect(result).toBeNull();
  });

  it('defaults null sd_type to feature', () => {
    const analyzer = new SiblingContextAnalyzer();
    const siblings = [
      { id: 's1', sd_type: null, title: 'A' },
      { id: 's2', sd_type: null, title: 'B' },
      { id: 's3', sd_type: null, title: 'C' }
    ];
    const result = analyzer._computeConsensus(siblings, 'current-id');
    expect(result.recommendedType).toBe('feature');
  });
});
