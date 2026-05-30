/**
 * DB Invariant: rescan_stage_20 returns a human-readable `reason`.
 *
 * SD: SD-LEO-INFRA-STAGE-RESCAN-STAGE-001
 *
 * The rescan_stage_20 RPC gained an additive `reason` string explaining WHY a
 * venture did or did not advance past Stage 20 (advanced / deployment-URL-missing
 * / SDs-still-in-progress). This is the standing regression guard for the contract.
 *
 * IMPORTANT — why this asserts only the no-SD path behaviorally:
 * rescan_stage_20 UPDATEs venture_stage_work (and conditionally ventures /
 * chairman_decisions) on every path EXCEPT the `v_total=0` early return. To stay
 * fleet-safe (no mutation of shared venture data during tests) we exercise only
 * the early-return path with a random venture id that matches no SDs, asserting
 * the function is callable and returns a `reason` string. The three NEW branches
 * (artifact_missing / in_progress / advanced-to-21) are verified at deploy time by
 * the in-migration DO $verify$ ASSERT block in
 * database/migrations/20260530_rescan_stage20_reason.sql — the same
 * migration-self-verification pattern used by SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001.
 *
 * Skips cleanly without a real Supabase connection (db project / describeDb).
 */

import { it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';

describeDb('rescan_stage_20 reason contract', () => {
  let sb;

  beforeAll(() => {
    if (!HAS_REAL_DB) return;
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('is callable and returns a `reason` string on the non-mutating no-SD path', async () => {
    // Random UUID that matches no strategic_directives_v2.venture_id -> v_total=0
    // -> early RETURN before any UPDATE (fleet-safe, zero venture-state mutation).
    const randomVentureId = '00000000-0000-4000-8000-0000000000ff';

    const { data, error } = await sb.rpc('rescan_stage_20', { p_venture_id: randomVentureId });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.success).toBe(false);
    // The contract this SD extends: a human-readable reason is always present.
    expect(typeof data.reason).toBe('string');
    expect(data.reason.length).toBeGreaterThan(0);
    expect(data.reason).toContain('No SDs found');
    // Backward-compat: the early-return shape is unchanged.
    expect(data.total).toBe(0);
    expect(data.pending_count).toBe(0);
  });
});
