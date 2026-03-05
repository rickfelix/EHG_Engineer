/**
 * Tests for Pipeline Data Aggregation Module (Stages 10-12)
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-K
 */

import { describe, it, expect } from 'vitest';
import {
  getCustomerIntelligence,
  getBrandGenomeData,
  getGtmStrategy,
  getPipelineSummary,
} from '../../lib/eva/pipeline-data/index.js';

// Mock supabase client helper
function mockSupabase(tables = {}) {
  return {
    from(table) {
      const tableData = tables[table] || [];
      const chain = {
        _filters: [],
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        gte() { return chain; },
        lte() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() {
          return Promise.resolve({ data: Array.isArray(tableData) ? tableData[0] || null : tableData, error: null });
        },
        then(resolve) {
          return Promise.resolve({ data: tableData, error: null }).then(resolve);
        },
      };
      // Make chain thenable for direct await
      chain[Symbol.for('nodejs.util.inspect.custom')] = () => '[MockChain]';
      return chain;
    },
  };
}

describe('getCustomerIntelligence (Stage 10)', () => {
  it('returns no-client when supabase is missing', async () => {
    const result = await getCustomerIntelligence('v1');
    expect(result).toEqual({ ventureId: 'v1', status: 'no-client' });
  });

  it('returns structured stage 10 data', async () => {
    const supabase = mockSupabase({
      venture_artifacts: [
        { artifact_type: 'customer_persona', content: { name: 'Persona A' }, quality_score: 85, created_at: '2026-01-01' },
        { artifact_type: 'positioning_statement', content: { statement: 'We are...' }, quality_score: 90, created_at: '2026-01-02' },
      ],
      brand_genome_submissions: { brand_data: { tone: 'bold' }, completeness_score: 75, submission_status: 'draft', created_at: '2026-01-01' },
      venture_stage_work: { stage_status: 'in_progress', health_score: 80, updated_at: '2026-01-03' },
    });

    const result = await getCustomerIntelligence('v1', { supabase });
    expect(result.ventureId).toBe('v1');
    expect(result.stage).toBe(10);
    expect(result.label).toBe('Customer & Brand Foundation');
    expect(result.status).toBe('in_progress');
    expect(result.healthScore).toBe(80);
  });

  it('handles empty artifacts gracefully', async () => {
    const supabase = mockSupabase({
      venture_artifacts: [],
      brand_genome_submissions: null,
      venture_stage_work: null,
    });

    const result = await getCustomerIntelligence('v1', { supabase });
    expect(result.personas).toEqual([]);
    expect(result.brandGenome).toBeNull();
    expect(result.positioning).toBeNull();
    expect(result.status).toBe('not_started');
  });
});

describe('getBrandGenomeData (Stage 11)', () => {
  it('returns no-client when supabase is missing', async () => {
    const result = await getBrandGenomeData('v1');
    expect(result).toEqual({ ventureId: 'v1', status: 'no-client' });
  });

  it('returns structured stage 11 data', async () => {
    const supabase = mockSupabase({
      venture_artifacts: [
        { artifact_type: 'naming_candidate', content: { name: 'BrandX' }, quality_score: 88, created_at: '2026-01-01' },
      ],
      venture_stage_work: { stage_status: 'completed', health_score: 95, updated_at: '2026-01-05' },
    });

    const result = await getBrandGenomeData('v1', { supabase });
    expect(result.stage).toBe(11);
    expect(result.label).toBe('Naming & Visual Identity');
    expect(result.status).toBe('completed');
    expect(result.namingCandidates).toHaveLength(1);
  });
});

describe('getGtmStrategy (Stage 12)', () => {
  it('returns no-client when supabase is missing', async () => {
    const result = await getGtmStrategy('v1');
    expect(result).toEqual({ ventureId: 'v1', status: 'no-client' });
  });

  it('returns structured stage 12 data', async () => {
    const supabase = mockSupabase({
      venture_artifacts: [
        { artifact_type: 'market_tier', content: { tier: 'enterprise' }, quality_score: 82, created_at: '2026-01-01' },
        { artifact_type: 'channel_strategy', content: { channel: 'direct' }, quality_score: 78, created_at: '2026-01-02' },
      ],
      venture_stage_work: { stage_status: 'in_progress', health_score: 70, updated_at: '2026-01-04' },
    });

    const result = await getGtmStrategy('v1', { supabase });
    expect(result.stage).toBe(12);
    expect(result.label).toBe('GTM & Sales Strategy');
    expect(result.marketTiers).toHaveLength(1);
    expect(result.channels).toHaveLength(1);
  });
});

describe('getPipelineSummary', () => {
  it('returns empty stages when supabase is missing', async () => {
    const result = await getPipelineSummary('v1');
    expect(result).toEqual({ ventureId: 'v1', stages: {} });
  });

  it('fills missing stages with not_started', async () => {
    const supabase = mockSupabase({
      venture_stage_work: [
        { lifecycle_stage: 10, stage_status: 'completed', health_score: 90, updated_at: '2026-01-01' },
      ],
    });

    const result = await getPipelineSummary('v1', { supabase });
    expect(result.stages.stage_10.status).toBe('completed');
    expect(result.stages.stage_11.status).toBe('not_started');
    expect(result.stages.stage_12.status).toBe('not_started');
    expect(result.completion.completed).toBe(1);
    expect(result.completion.percentage).toBe(33);
  });

  it('computes overall health from available scores', async () => {
    const supabase = mockSupabase({
      venture_stage_work: [
        { lifecycle_stage: 10, stage_status: 'completed', health_score: 80, updated_at: '2026-01-01' },
        { lifecycle_stage: 11, stage_status: 'completed', health_score: 90, updated_at: '2026-01-02' },
        { lifecycle_stage: 12, stage_status: 'completed', health_score: 100, updated_at: '2026-01-03' },
      ],
    });

    const result = await getPipelineSummary('v1', { supabase });
    expect(result.completion.completed).toBe(3);
    expect(result.completion.percentage).toBe(100);
    expect(result.overallHealth).toBe(90);
  });
});
