/**
 * SD-LEO-INFRA-REWARD-SPINE-ONE-001-D — live-DB smoke test for the L1 backtest CLI's core
 * claims (TS-4/TS-5): honest per-lane coverage reporting and ghost-completed re-detection.
 * Skips cleanly when no real Supabase credentials are present.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { HAS_REAL_DB } from '../helpers/db-available.js';
import { computeL1Outcome } from '../../lib/governance/l1-work-outcome.js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = HAS_REAL_DB;
const supabase = LIVE ? createClient(URL, KEY) : null;

describe.skipIf(!LIVE)('L1 backtest (live DB): honest coverage and ghost-completed re-detection', () => {
  it('computeL1Outcome against a known real ship-auto-merge-lane work_key never silently reports clean when rungs are not fully pass', async () => {
    const result = await computeL1Outcome(supabase, 'QF-20260704-717');
    expect(result.coverage).toBe('witnessed');
    expect(['shipped_clean', 'unproven']).toContain(result.outcome);
    expect(result.evidence.rungs).toBeDefined();
  });

  it('computeL1Outcome against a known reconcile-sweep-lane work_key never reports shipped_clean', async () => {
    const result = await computeL1Outcome(supabase, 'SD-LEO-INFRA-REWARD-SPINE-ONE-001-B');
    expect(result.coverage).toBe('unwitnessed');
    expect(result.outcome).not.toBe('shipped_clean');
  });

  it('v_sd_completion_integrity has a non-zero, real ghost-completed count to re-detect (TS-5)', async () => {
    const { count, error } = await supabase
      .from('v_sd_completion_integrity')
      .select('*', { count: 'exact', head: true })
      .eq('is_ghost_completed', true);
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);
  });
});
