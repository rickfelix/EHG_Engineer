/**
 * Tests for lib/eva/stage-governance.js
 * SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-6.
 *
 * Validates the unified DB-backed governance reader: cache, helpers, and
 * realtime-subscription fallback behavior.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getStageGovernance, _resetCacheForTest } from '../../../lib/eva/stage-governance.js';

const V2_FIXTURE = [
  // gate_type=kill: 3, 5, 13, 23
  { stage_number: 3,  stage_name: 'Comprehensive Validation', stage_key: 'comprehensive_validation', gate_type: 'kill',      review_mode: 'auto',   chunk: 'THE_TRUTH' },
  { stage_number: 5,  stage_name: 'Profitability Forecasting', stage_key: 'profitability_forecasting', gate_type: 'kill',      review_mode: 'auto',   chunk: 'THE_TRUTH' },
  { stage_number: 13, stage_name: 'Product Roadmap',           stage_key: 'product_roadmap',           gate_type: 'kill',      review_mode: 'auto',   chunk: 'THE_BLUEPRINT' },
  { stage_number: 23, stage_name: 'Launch Readiness Kill Gate', stage_key: 'launch_readiness_gate',    gate_type: 'kill',      review_mode: 'auto',   chunk: 'THE_BUILD' },
  // gate_type=promotion: 10, 16, 17, 18, 19, 24, 25
  { stage_number: 10, stage_name: 'Customer & Brand Foundation', stage_key: 'customer_brand_foundation', gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_IDENTITY' },
  { stage_number: 16, stage_name: 'Financial Projections',       stage_key: 'financial_projections',     gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_BLUEPRINT' },
  { stage_number: 17, stage_name: 'Blueprint Review',            stage_key: 'blueprint_review',          gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_BLUEPRINT' },
  { stage_number: 18, stage_name: 'Marketing Copy Studio',       stage_key: 'marketing_copy_studio',     gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_BUILD' },
  { stage_number: 19, stage_name: 'Sprint Planning',             stage_key: 'sprint_planning',           gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_BUILD' },
  { stage_number: 24, stage_name: 'Go Live & Announce',          stage_key: 'go_live',                   gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_LAUNCH' },
  { stage_number: 25, stage_name: 'Post-Launch Review',          stage_key: 'post_launch_review',        gate_type: 'promotion', review_mode: 'auto', chunk: 'THE_LAUNCH' },
  // review_mode=review: 7, 8, 9, 11
  { stage_number: 7,  stage_name: 'Revenue Architecture',  stage_key: 'revenue_architecture',  gate_type: 'none', review_mode: 'review', chunk: 'THE_ENGINE' },
  { stage_number: 8,  stage_name: 'Business Model Canvas', stage_key: 'business_model_canvas', gate_type: 'none', review_mode: 'review', chunk: 'THE_ENGINE' },
  { stage_number: 9,  stage_name: 'Exit Strategy',         stage_key: 'exit_strategy',         gate_type: 'none', review_mode: 'review', chunk: 'THE_ENGINE' },
  { stage_number: 11, stage_name: 'Naming & Visual Identity', stage_key: 'naming_visual_identity', gate_type: 'none', review_mode: 'review', chunk: 'THE_IDENTITY' },
];

function mockSupabase(rows, { failChannel = false } = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
    channel: failChannel
      ? () => { throw new Error('channel not available'); }
      : vi.fn(() => ({
          on: vi.fn().mockReturnThis(),
          subscribe: vi.fn(function (cb) { cb?.('SUBSCRIBED'); return this; }),
          unsubscribe: vi.fn(),
        })),
  };
}

describe('stage-governance', () => {
  beforeEach(() => { _resetCacheForTest(); });
  afterEach(() => { _resetCacheForTest(); });

  test('builds correct kill / promotion / review / blocking sets from stage_config', async () => {
    const gov = await getStageGovernance(mockSupabase(V2_FIXTURE));
    expect([...gov.killStages].sort((a, b) => a - b)).toEqual([3, 5, 13, 23]);
    expect([...gov.promotionStages].sort((a, b) => a - b)).toEqual([10, 16, 17, 18, 19, 24, 25]);
    expect([...gov.reviewStages].sort((a, b) => a - b)).toEqual([7, 8, 9, 11]);
    expect([...gov.blockingStages].sort((a, b) => a - b)).toEqual([3, 5, 10, 13, 16, 17, 18, 19, 23, 24, 25]);
  });

  test('isKill / isPromotion / isReview / isBlocking helpers agree with sets', async () => {
    const gov = await getStageGovernance(mockSupabase(V2_FIXTURE));
    expect(gov.isKill(3)).toBe(true);
    expect(gov.isKill(8)).toBe(false);
    expect(gov.isPromotion(16)).toBe(true);
    expect(gov.isPromotion(8)).toBe(false);
    expect(gov.isReview(8)).toBe(true);
    expect(gov.isReview(3)).toBe(false);
    expect(gov.isBlocking(3)).toBe(true);   // kill
    expect(gov.isBlocking(16)).toBe(true);  // promotion
    expect(gov.isBlocking(8)).toBe(false);  // review-only (not in blocking)
    expect(gov.isBlocking(1)).toBe(false);  // plain
  });

  test('getStage returns the row for known stages and null for unknown', async () => {
    const gov = await getStageGovernance(mockSupabase(V2_FIXTURE));
    expect(gov.getStage(8)).toMatchObject({ stage_number: 8, stage_name: 'Business Model Canvas', gate_type: 'none', review_mode: 'review' });
    expect(gov.getStage(99)).toBeNull();
  });

  test('S16 is promotion (audit Issue B fix — was missing from prior PROMOTION_GATE_STAGES)', async () => {
    const gov = await getStageGovernance(mockSupabase(V2_FIXTURE));
    expect(gov.isPromotion(16)).toBe(true);
    expect(gov.isBlocking(16)).toBe(true);
  });

  test('cache: second call within TTL does not re-fetch (mock from() called once)', async () => {
    const supabase = mockSupabase(V2_FIXTURE);
    await getStageGovernance(supabase);
    await getStageGovernance(supabase);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test('_resetCacheForTest forces a re-fetch', async () => {
    const supabase = mockSupabase(V2_FIXTURE);
    await getStageGovernance(supabase);
    _resetCacheForTest();
    await getStageGovernance(supabase);
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  test('falls back gracefully when realtime channel API is unavailable', async () => {
    const supabase = mockSupabase(V2_FIXTURE, { failChannel: true });
    const gov = await getStageGovernance(supabase);
    expect(gov.isKill(3)).toBe(true);
    expect(gov.isReview(8)).toBe(true);
  });

  test('propagates DB read errors instead of returning empty sets', async () => {
    const supabase = {
      from: () => ({ select: () => ({ order: async () => ({ data: null, error: new Error('connection lost') }) }) }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    };
    await expect(getStageGovernance(supabase)).rejects.toThrow('connection lost');
  });

  test('null data with no error yields empty sets (defensive — empty table or minimal mock)', async () => {
    const supabase = {
      from: () => ({ select: () => ({ order: async () => ({ data: null, error: null }) }) }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    };
    const gov = await getStageGovernance(supabase);
    expect(gov.killStages.size).toBe(0);
    expect(gov.reviewStages.size).toBe(0);
    expect(gov.isBlocking(3)).toBe(false);
  });
});
