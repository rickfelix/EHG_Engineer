// FR-1 RCA followup probe: confirm the ORIGINAL hypothesis is wrong.
// Test 1 (RCA-2-1): direct UPDATE on strategic_directives_v2 (LEAD-enrichment style)
//                    does NOT clear claim cols (PATH A is FALSE).
// Test 2 (RCA-2-2): cascade is asymmetric — only claude_sessions UPDATE triggers
//                    the cascade, NOT direct sd_v2 UPDATE.

import { createDatabaseClient } from '../lib/supabase-connection.js';
import { randomUUID } from 'crypto';

const PROBE_SD_KEY = 'SD-RCA-PROBE-2-' + Date.now();
const PROBE_SD_ID = PROBE_SD_KEY;
const PROBE_SESSION_ID = randomUUID();
const PROBE_SD_CODE = 'RCA-PROBE-2-' + Date.now();

const client = await createDatabaseClient('engineer', { verify: false });

const result = {
  generated_at: new Date().toISOString(),
  test: 'RCA-2: confirm sd_v2 direct UPDATE does NOT trigger claim-col clearing',
  probe_sd_key: PROBE_SD_KEY,
  probe_session_id: PROBE_SESSION_ID,
};

let probeInserted = false;
let sessionInserted = false;

try {
  // Setup: SD + session
  await client.query(`
    INSERT INTO strategic_directives_v2 (
      id, sd_key, title, status, category, priority, description, rationale, scope,
      sequence_rank, sd_type, sd_code_user_facing, uuid_internal_pk,
      current_phase, is_working_on, claiming_session_id, active_session_id, metadata
    ) VALUES (
      $1, $2, $3, 'in_progress', 'infrastructure', 'medium',
      'RCA probe 2 synthetic SD.',
      'RCA probe 2.',
      'In/Out: synthetic.',
      999998, 'infrastructure', $4, gen_random_uuid(),
      'PLAN_PRD', true, $5, $5, $6
    )
  `, [PROBE_SD_ID, PROBE_SD_KEY, 'RCA Probe 2', PROBE_SD_CODE, PROBE_SESSION_ID, JSON.stringify({ rca_probe_2: true })]);
  probeInserted = true;

  await client.query(`
    INSERT INTO claude_sessions (session_id, machine_id, terminal_id, status, sd_key, claimed_at, heartbeat_at, codebase, hostname)
    VALUES ($1, 'rca-probe-machine', 'rca-probe-tty', 'active', $2, NOW(), NOW(), 'EHG_Engineer', 'rca-probe-host')
  `, [PROBE_SESSION_ID, PROBE_SD_KEY]);
  sessionInserted = true;

  console.error(`[setup] SD + session inserted, both linked`);

  // TEST RCA-2-1: simulate a LEAD-enrichment direct UPDATE on sd_v2
  // (mimics enrichment scripts that .update({ description, scope, etc }))
  await client.query(`
    UPDATE strategic_directives_v2
    SET description = 'Updated description (RCA-2-1 probe)',
        scope = 'Updated scope (RCA-2-1 probe)',
        risks = '["updated risks (RCA-2-1 probe)"]'::jsonb,
        metadata = metadata || jsonb_build_object('rca_2_1_probe_marker', NOW())
    WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  console.error(`[ok] RCA-2-1: ran LEAD-enrichment-style .update() on sd_v2`);

  const after_2_1 = await client.query(`
    SELECT sd_key, claiming_session_id, is_working_on, active_session_id
    FROM strategic_directives_v2 WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  result.after_RCA_2_1_sd_v2_update = after_2_1.rows[0];

  result.RCA_2_1_verdict = {
    claiming_session_id_preserved: after_2_1.rows[0].claiming_session_id === PROBE_SESSION_ID,
    is_working_on_preserved: after_2_1.rows[0].is_working_on === true,
    active_session_id_preserved: after_2_1.rows[0].active_session_id === PROBE_SESSION_ID,
  };
  console.error(`[verdict-2-1] claiming_preserved: ${result.RCA_2_1_verdict.claiming_session_id_preserved}, working_preserved: ${result.RCA_2_1_verdict.is_working_on_preserved}, active_preserved: ${result.RCA_2_1_verdict.active_session_id_preserved}`);

  // TEST RCA-2-2: now flip the SESSION to stale. This SHOULD trigger the cascade.
  await client.query(`
    UPDATE claude_sessions
    SET status = 'stale', stale_at = NOW(), stale_reason = 'RCA_PROBE_2_2'
    WHERE session_id = $1
  `, [PROBE_SESSION_ID]);

  const after_2_2 = await client.query(`
    SELECT sd_key, claiming_session_id, is_working_on, active_session_id
    FROM strategic_directives_v2 WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  result.after_RCA_2_2_session_stale_flip = after_2_2.rows[0];
  result.RCA_2_2_verdict = {
    is_working_on_was_cleared: after_2_2.rows[0].is_working_on === false,
    active_session_id_was_cleared: after_2_2.rows[0].active_session_id === null,
    claiming_session_id_preserved: after_2_2.rows[0].claiming_session_id === PROBE_SESSION_ID,
  };
  console.error(`[verdict-2-2] is_working_on cleared: ${result.RCA_2_2_verdict.is_working_on_was_cleared}, active cleared: ${result.RCA_2_2_verdict.active_session_id_was_cleared}, claiming preserved: ${result.RCA_2_2_verdict.claiming_session_id_preserved}`);

  // FINAL VERDICT
  const v1 = result.RCA_2_1_verdict;
  const v2 = result.RCA_2_2_verdict;
  const path_a_disproven = v1.claiming_session_id_preserved && v1.is_working_on_preserved && v1.active_session_id_preserved;
  const path_d_confirmed = v2.is_working_on_was_cleared && v2.active_session_id_was_cleared && v2.claiming_session_id_preserved;

  result.combined_verdict = {
    path_a_disproven_direct_sd_v2_update_does_NOT_clear_claim_cols: path_a_disproven,
    path_d_confirmed_session_stale_flip_DOES_clear_is_working_and_active: path_d_confirmed,
    final_root_cause: path_d_confirmed && path_a_disproven
      ? 'PATH D — sync_is_working_on_with_session trigger fires when claude_sessions.status flips out of active'
      : 'INDETERMINATE — re-investigate',
  };

  console.error(`[FINAL] PATH A disproven: ${path_a_disproven}`);
  console.error(`[FINAL] PATH D confirmed: ${path_d_confirmed}`);
  console.error(`[FINAL] Root cause: ${result.combined_verdict.final_root_cause}`);

  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('[error]', e.message);
  result.error = e.message;
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (sessionInserted) {
    try {
      await client.query(`DELETE FROM claude_sessions WHERE session_id = $1`, [PROBE_SESSION_ID]);
    } catch {}
  }
  if (probeInserted) {
    try {
      await client.query(`DELETE FROM strategic_directives_v2 WHERE sd_key = $1`, [PROBE_SD_KEY]);
    } catch {}
  }
  await client.end();
}
