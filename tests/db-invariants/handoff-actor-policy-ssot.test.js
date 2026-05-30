/**
 * DB Invariant: handoff trusted-actor SSOT (handoff_actor_policy)
 *
 * SD: SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001
 *
 * The two BEFORE-INSERT triggers on sd_phase_handoffs (enforce_handoff_system +
 * enforce_is_working_on_for_handoffs) derive their trusted-actor decisions from
 * ONE canonical SSOT function, public.handoff_actor_policy(created_by) ->
 * (may_create, skips_claim_check). This test is the standing regression guard:
 *
 *   1. Policy matrix — handoff_actor_policy returns the exact (may_create,
 *      skips_claim_check) for every trusted actor, every dropped actor, and the
 *      default-deny fall-through (unknown / session-id-style actors).
 *   2. End-to-end enforcement — the triggers actually honor the SSOT at INSERT
 *      time. We assert the BLOCKING cases only (they roll back atomically, so no
 *      rows persist): a normal handoff on an unclaimed SD is still rejected
 *      (no-regression), and dropped / session-id actors are HANDOFF_BYPASS_BLOCKED
 *      (default-deny lock — mirrors heal-before-complete.js so nobody "fixes" it
 *      by polluting the registry with session ids).
 *
 * The ACCEPT cases (ORCHESTRATOR_AUTO_COMPLETE / PCVP_EMERGENCY_BYPASS /
 * ORCHESTRATOR-GUARDIAN succeeding on an unclaimed SD) are proven at the policy
 * level here and end-to-end by the migration's in-DB ASSERT block; they are not
 * inserted here to avoid persisting rows.
 *
 * Skips cleanly without a real Supabase connection (db project / describeDb).
 */

import { it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { describeDb, HAS_REAL_DB } from '../helpers/db-available.js';

// [actor, expected may_create, expected skips_claim_check]
const POLICY_MATRIX = [
  ['UNIFIED-HANDOFF-SYSTEM', true, false], // normal handoff.js: legit creator, still claim-subject
  ['SYSTEM_MIGRATION', true, true],
  ['ADMIN_OVERRIDE', true, true],
  ['ORCHESTRATOR_AUTO_COMPLETE', true, true], // D1
  ['PCVP_EMERGENCY_BYPASS', true, true], // D2
  ['ORCHESTRATOR-GUARDIAN', true, true], // D3 (hyphen = canonical)
  // Dropped (no producer) — must default-deny:
  ['SYSTEM_AUTO_COMPLETE', false, false],
  ['bypass_script', false, false],
  ['ORCHESTRATOR_GUARDIAN', false, false], // underscore typo
  // Unknown / dynamic actors — default-deny (locks heal-before-complete behavior):
  ['7f3a1b2c-9d4e-4a5b-8c6d-0e1f2a3b4c5d', false, false], // session-id style
  ['heal-before-complete-gate', false, false],
  ['definitely-not-an-actor', false, false],
  ['', false, false],
];

describeDb('handoff_actor_policy SSOT invariant', () => {
  let sb;
  let unclaimedSdId;

  beforeAll(async () => {
    if (!HAS_REAL_DB) return;
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // FK target for the end-to-end blocking tests: any SD that is NOT actively
    // claimed (is_working_on IS NOT TRUE) so the working-on guard is in force.
    const { data } = await sb
      .from('strategic_directives_v2')
      .select('id, is_working_on')
      .eq('status', 'completed')
      .not('is_working_on', 'is', true)
      .limit(1);
    unclaimedSdId = data && data[0] ? data[0].id : null;
  });

  // ---- 1. Policy matrix -----------------------------------------------------
  it.each(POLICY_MATRIX)(
    'handoff_actor_policy(%s) = (may_create=%s, skips_claim_check=%s)',
    async (actor, expectedMayCreate, expectedSkips) => {
      const { data, error } = await sb.rpc('handoff_actor_policy', { p_created_by: actor });
      expect(error, `rpc error for "${actor}": ${error?.message}`).toBeNull();
      const row = Array.isArray(data) ? data[0] : data;
      expect(row, `no policy row returned for "${actor}"`).toBeTruthy();
      expect(row.may_create).toBe(expectedMayCreate);
      expect(row.skips_claim_check).toBe(expectedSkips);
    }
  );

  // ---- 2. End-to-end enforcement (blocking cases only — they roll back) ------
  function handoffPayload(createdBy) {
    return {
      sd_id: unclaimedSdId,
      handoff_type: 'PLAN-TO-LEAD',
      from_phase: 'PLAN',
      to_phase: 'LEAD',
      status: 'pending_acceptance', // valid status; skips the 'accepted'-only 7-element validator; not in the working-on bypass

      created_by: createdBy,
    };
  }

  it('no-regression: a normal UNIFIED-HANDOFF-SYSTEM handoff for an unclaimed SD is STILL rejected', async () => {
    expect(unclaimedSdId, 'need an unclaimed SD fixture').toBeTruthy();
    const { error } = await sb.from('sd_phase_handoffs').insert(handoffPayload('UNIFIED-HANDOFF-SYSTEM'));
    expect(error, 'expected the working-on guard to reject this insert').toBeTruthy();
    expect(error.message).toMatch(/active session claim|is_working_on/i);
  });

  it('default-deny: a dropped actor (SYSTEM_AUTO_COMPLETE) is HANDOFF_BYPASS_BLOCKED', async () => {
    expect(unclaimedSdId).toBeTruthy();
    const { error } = await sb.from('sd_phase_handoffs').insert(handoffPayload('SYSTEM_AUTO_COMPLETE'));
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/HANDOFF_BYPASS_BLOCKED/);
  });

  it('default-deny lock: a session-id-style actor is HANDOFF_BYPASS_BLOCKED (registry must not be polluted with session ids)', async () => {
    expect(unclaimedSdId).toBeTruthy();
    const { error } = await sb
      .from('sd_phase_handoffs')
      .insert(handoffPayload('7f3a1b2c-9d4e-4a5b-8c6d-0e1f2a3b4c5d'));
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/HANDOFF_BYPASS_BLOCKED/);
  });
});
