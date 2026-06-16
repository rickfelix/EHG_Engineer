/**
 * track-model-usage phase normalization regression test
 * SD-LEO-INFRA-MODEL-USAGE-PHASE-NORMALIZE-001
 *
 * The model_usage_log_phase_check constraint accepts PLAN_VERIFY but NOT
 * PLAN_VERIFICATION (the canonical VERIFY phase name used by
 * subagent-enforcement-system.js / sub_agent_execution_results). Before this fix,
 * track-model-usage.js inserted record.phase='PLAN_VERIFICATION' and every VERIFY-phase
 * sub-agent log was rejected (23514) → 'Failed to log model usage' → telemetry hole
 * (feedback c6c81725). The fix adds normalizePhase() mapping PLAN_VERIFICATION → PLAN_VERIFY.
 *
 * This test asserts:
 *  (1) the pure helper behavior (synonym map, pass-through, UNKNOWN fallback),
 *  (2) the LIVE constraint actually rejects PLAN_VERIFICATION and accepts PLAN_VERIFY
 *      (real INSERT probes — NOT a mock), proving the normalization is necessary,
 *  (3) a real model_usage_log INSERT with phase=normalizePhase('PLAN_VERIFICATION')
 *      succeeds with no 23514.
 *
 * Probe rows are scoped by a unique session_id and deleted regardless of outcome.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { normalizePhase } from '../../scripts/track-model-usage.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const probeSessionIds = [];
const probeRow = (phase) => {
  const session_id = 'test-mup-normalize-' + phase + '-' + Date.now() + '-' + Math.round(performance.now());
  probeSessionIds.push(session_id);
  return {
    session_id,
    phase,
    subagent_type: 'mup-normalize-probe',
    subagent_configured_model: 'claude-sonnet-4-6',
    reported_model_name: 'claude-sonnet-4-6',
    reported_model_id: 'claude-sonnet-4-6',
    config_matches_reported: true,
    metadata: { probe: 'SD-LEO-INFRA-MODEL-USAGE-PHASE-NORMALIZE-001' },
  };
};

afterAll(async () => {
  if (probeSessionIds.length) {
    await supabase.from('model_usage_log').delete().in('session_id', probeSessionIds);
  }
});

describe('normalizePhase() pure helper (FR-1)', () => {
  it('maps the canonical synonym PLAN_VERIFICATION → PLAN_VERIFY', () => {
    expect(normalizePhase('PLAN_VERIFICATION')).toBe('PLAN_VERIFY');
  });
  it('passes through values already in the allowed set', () => {
    expect(normalizePhase('LEAD')).toBe('LEAD');
    expect(normalizePhase('PLAN_VERIFY')).toBe('PLAN_VERIFY');
    expect(normalizePhase('EXEC-TO-PLAN')).toBe('EXEC-TO-PLAN');
  });
  it('falls back to UNKNOWN for empty/nullish/unrecognized input', () => {
    expect(normalizePhase(undefined)).toBe('UNKNOWN');
    expect(normalizePhase(null)).toBe('UNKNOWN');
    expect(normalizePhase('')).toBe('UNKNOWN');
    expect(normalizePhase('TOTALLY_BOGUS')).toBe('UNKNOWN');
  });
});

describe('live model_usage_log_phase_check constraint (FR-3, real probes)', () => {
  it('REJECTS the raw PLAN_VERIFICATION (proves the normalization is necessary, not a mock)', async () => {
    const { error } = await supabase.from('model_usage_log').insert(probeRow('PLAN_VERIFICATION'));
    expect(error, 'raw PLAN_VERIFICATION should violate model_usage_log_phase_check').not.toBeNull();
    expect(error.message).toMatch(/phase_check|violates check constraint/i);
  });

  it('ACCEPTS the normalized phase for a PLAN_VERIFICATION input (no 23514)', async () => {
    const normalized = normalizePhase('PLAN_VERIFICATION'); // PLAN_VERIFY
    const { error } = await supabase.from('model_usage_log').insert(probeRow(normalized));
    expect(error, `normalized phase '${normalized}' should insert cleanly: ${error?.message}`).toBeNull();
  });
});
