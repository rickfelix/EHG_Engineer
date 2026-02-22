/**
 * Tests for Flywheel Analytics
 * SD-LEO-FEAT-DATA-FLYWHEEL-001 (FR-003, FR-004, FR-005)
 *
 * Verifies:
 * - Analytics views exist and are queryable
 * - fn_flywheel_summary RPC works
 * - Error handling returns clean error objects
 */

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Flywheel Analytics - Database Views', () => {
  describe('eva_interactions table', () => {
    it('should exist and be queryable', async () => {
      const { data, error } = await supabase
        .from('eva_interactions')
        .select('id, decision_type, interaction_type, gate_score, created_at')
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });
  });

  describe('v_flywheel_velocity view', () => {
    it('should exist and be queryable', async () => {
      const { data, error } = await supabase
        .from('v_flywheel_velocity')
        .select('week_start, venture_id, total_interactions, closed_loop_count, closure_rate_pct, coverage_status')
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('v_cross_venture_patterns view', () => {
    it('should exist and be queryable', async () => {
      const { data, error } = await supabase
        .from('v_cross_venture_patterns')
        .select('decision_type, ventures_affected, total_occurrences, acceptance_rate_pct, rejection_rate_pct, modification_rate_pct, avg_gate_score, median_gate_score')
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('v_eva_accuracy view', () => {
    it('should exist and be queryable', async () => {
      const { data, error } = await supabase
        .from('v_eva_accuracy')
        .select('decision_type, chairman_action, total_count, pct_of_decision_type, avg_gate_score, avg_confidence, count_last_30d, count_prior_30d')
        .limit(5);

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('fn_flywheel_summary RPC', () => {
    it('should return JSONB summary with default params', async () => {
      const { data, error } = await supabase.rpc('fn_flywheel_summary', {
        p_venture_id: null,
        p_weeks_back: 4
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data).toHaveProperty('generated_at');
      expect(data).toHaveProperty('weeks_back', 4);
      expect(data).toHaveProperty('weekly_metrics');
      expect(data).toHaveProperty('total_interactions');
      expect(data).toHaveProperty('unique_ventures');
    });
  });
});

describe('Flywheel Analytics - Module Functions', () => {
  // Import the actual module functions
  let analytics;

  it('should import analytics module without error', async () => {
    analytics = await import('../../../lib/flywheel/analytics.js');
    expect(analytics.getFlywheelVelocity).toBeDefined();
    expect(analytics.getCrossVenturePatterns).toBeDefined();
    expect(analytics.getEvaAccuracy).toBeDefined();
    expect(analytics.getFlywheelSummary).toBeDefined();
  });

  it('getFlywheelVelocity should return data array', async () => {
    const result = await analytics.getFlywheelVelocity({ weeksBack: 4 });
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('getCrossVenturePatterns should return data array', async () => {
    const result = await analytics.getCrossVenturePatterns();
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('getEvaAccuracy should return data array', async () => {
    const result = await analytics.getEvaAccuracy();
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('getFlywheelSummary should return JSONB object', async () => {
    const result = await analytics.getFlywheelSummary({ weeksBack: 2 });
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.data).toHaveProperty('generated_at');
  });
});
