/**
 * model_usage_log_phase_check enum regression test
 * QF-20260511-163 — closes feedback 31c14ea3
 *
 * Verifies the migration database/migrations/20260511_fix_model_usage_log_phase_lead_final_underscore.sql:
 *   - 'LEAD_FINAL' (underscore internal phase-state name) is accepted by the
 *     check constraint after the 2026-05-11 widen.
 *
 * Approach: introspect pg_constraint.conbindef to confirm 'LEAD_FINAL' is in
 * the CHECK predicate. Avoids touching real model_usage_log rows.
 */

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

describe('model_usage_log_phase_check enum (QF-20260511-163)', () => {
  it("includes the 'LEAD_FINAL' underscore internal phase-state name", async () => {
    let data = null;
    let error = null;
    try {
      const rpcResult = await supabase.rpc('exec_sql_readonly', {
        sql: `SELECT pg_get_constraintdef(c.oid) AS def
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = 'model_usage_log'
                AND c.conname = 'model_usage_log_phase_check'`
      });
      data = rpcResult.data;
      error = rpcResult.error;
    } catch (e) {
      error = e;
    }

    // Fallback path: many test envs don't have an exec_sql_readonly RPC. Use a
    // probe INSERT that exercises the CHECK constraint without depending on
    // optional columns. Cleanup is by session_id to scope the delete.
    if (!data || error) {
      const probeSessionId = 'test-LEAD_FINAL-enum-probe-' + Date.now();
      const probeRow = {
        session_id: probeSessionId,
        phase: 'LEAD_FINAL',
        subagent_type: 'qf-enum-probe',
        subagent_configured_model: 'claude-opus-4-7',
        reported_model_name: 'claude-opus-4-7',
        reported_model_id: 'claude-opus-4-7',
        config_matches_reported: true,
        metadata: { probe: 'QF-20260511-163' }
      };
      const { error: insertErr } = await supabase
        .from('model_usage_log')
        .insert(probeRow);
      // Cleanup synth probe row regardless of outcome
      await supabase
        .from('model_usage_log')
        .delete()
        .eq('session_id', probeSessionId);
      expect(insertErr, `phase='LEAD_FINAL' should not raise 23514: ${insertErr?.message}`)
        .toBeNull();
      return;
    }

    expect(data[0].def, `constraint def should mention LEAD_FINAL: ${data[0].def}`)
      .toMatch(/LEAD_FINAL/);
  });
});
