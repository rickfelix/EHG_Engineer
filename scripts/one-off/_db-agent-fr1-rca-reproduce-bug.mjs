// FR-1 RCA: Reproduce the cascade-trigger bug with a SYNTHETIC PROBE SD.
//
// Strategy: create a synthetic SD that nobody else uses, claim it from a
// synthetic claude_sessions row, then flip the session active->stale and
// observe SD claim col deltas. Cleanup deletes both rows.

import { createDatabaseClient } from '../lib/supabase-connection.js';
import { randomUUID } from 'crypto';

const PROBE_SD_KEY = 'SD-RCA-PROBE-' + Date.now();
const PROBE_SD_ID = PROBE_SD_KEY; // sd_v2.id is varchar — use sd_key as id
const PROBE_SESSION_ID = randomUUID();
const PROBE_SD_CODE = 'RCA-PROBE-' + Date.now();

const client = await createDatabaseClient('engineer', { verify: false });

const result = {
  generated_at: new Date().toISOString(),
  hypothesis_paths: {
    A: 'BEFORE/UPDATE trigger overreach on sd_v2 (LEAD risk-agent: LOW likelihood)',
    B: 'cleanup_stale_sessions cron + auto-release behavior',
    C: 'PG release_sd race (concurrent worker)',
    D: 'sync_is_working_on_with_session trigger cascading from claude_sessions UPDATE',
    E: 'cannot reliably reproduce -> defer FR-2 to follow-up SD',
  },
  probe_sd_key: PROBE_SD_KEY,
  probe_sd_id: PROBE_SD_ID,
  probe_session_id: PROBE_SESSION_ID,
  steps: [],
};

let probeInserted = false;
let sessionInserted = false;

try {
  // Insert with all NOT NULLs supplied. Use minimum-noise values that satisfy CHECK constraints.
  await client.query(`
    INSERT INTO strategic_directives_v2 (
      id, sd_key, title, status, category, priority, description, rationale, scope,
      sequence_rank, sd_type, sd_code_user_facing, uuid_internal_pk,
      current_phase, is_working_on, claiming_session_id, active_session_id, metadata
    ) VALUES (
      $1, $2, $3, 'in_progress', 'infrastructure', 'medium',
      'RCA probe synthetic SD for cascade trigger reproduction. Auto-deleted in finally block.',
      'RCA probe — reproduce sync_is_working_on_with_session trigger behavior.',
      'In: synthetic. Out: real production tables.',
      999999, 'infrastructure', $4, gen_random_uuid(),
      'PLAN_PRD', true, $5, $5, $6
    )
  `, [
    PROBE_SD_ID, PROBE_SD_KEY, 'RCA Probe (auto-deleted)', PROBE_SD_CODE,
    PROBE_SESSION_ID, JSON.stringify({ rca_probe: true, transient: true })
  ]);
  probeInserted = true;
  result.steps.push({ step: 1, action: 'inserted synthetic SD', sd_key: PROBE_SD_KEY });
  console.error(`[ok] step 1: inserted synthetic SD ${PROBE_SD_KEY}`);

  const sdAfterInsert = await client.query(`
    SELECT sd_key, claiming_session_id, is_working_on, active_session_id, current_phase, status
    FROM strategic_directives_v2 WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  result.sd_after_insert = sdAfterInsert.rows[0];
  console.error(`[snap] after SD insert: claiming=${sdAfterInsert.rows[0].claiming_session_id?.substring(0,18)} working=${sdAfterInsert.rows[0].is_working_on} active=${sdAfterInsert.rows[0].active_session_id?.substring(0,18)}`);

  await client.query(`
    INSERT INTO claude_sessions (session_id, machine_id, terminal_id, status, sd_key, claimed_at, heartbeat_at, codebase, hostname)
    VALUES ($1, 'rca-probe-machine', 'rca-probe-tty', 'active', $2, NOW(), NOW(), 'EHG_Engineer', 'rca-probe-host')
  `, [PROBE_SESSION_ID, PROBE_SD_KEY]);
  sessionInserted = true;
  result.steps.push({ step: 2, action: 'inserted active session', session_id: PROBE_SESSION_ID });
  console.error(`[ok] step 2: inserted probe session ${PROBE_SESSION_ID.substring(0,18)}`);

  const sdAfterSession = await client.query(`
    SELECT sd_key, claiming_session_id, is_working_on, active_session_id, current_phase, status
    FROM strategic_directives_v2 WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  result.sd_after_session_insert = sdAfterSession.rows[0];
  console.error(`[snap] after session insert: claiming=${sdAfterSession.rows[0].claiming_session_id?.substring(0,18)} working=${sdAfterSession.rows[0].is_working_on} active=${sdAfterSession.rows[0].active_session_id?.substring(0,18)}`);

  console.error(`[run] step 3: UPDATE claude_sessions SET status='stale' (the trigger test)`);
  const flipResult = await client.query(`
    UPDATE claude_sessions
    SET status = 'stale', stale_at = NOW(), stale_reason = 'RCA_PROBE_HEARTBEAT_TIMEOUT', updated_at = NOW()
    WHERE session_id = $1
    RETURNING session_id, status, sd_key
  `, [PROBE_SESSION_ID]);
  result.session_after_flip = flipResult.rows[0];
  console.error(`[ok] step 3: flipped session active -> stale`);

  const sdAfterFlip = await client.query(`
    SELECT sd_key, claiming_session_id, is_working_on, active_session_id, current_phase, status
    FROM strategic_directives_v2 WHERE sd_key = $1
  `, [PROBE_SD_KEY]);
  result.sd_after_stale_flip = sdAfterFlip.rows[0];
  console.error(`[snap] after stale flip:    claiming=${sdAfterFlip.rows[0].claiming_session_id?.substring(0,18)} working=${sdAfterFlip.rows[0].is_working_on} active=${sdAfterFlip.rows[0].active_session_id?.substring(0,18)}`);

  result.bug_reproduction_verdict = {
    is_working_on_was_cleared:
      result.sd_after_session_insert.is_working_on === true &&
      result.sd_after_stale_flip.is_working_on === false,
    active_session_id_was_cleared:
      result.sd_after_session_insert.active_session_id !== null &&
      result.sd_after_stale_flip.active_session_id === null,
    claiming_session_id_was_cleared:
      result.sd_after_session_insert.claiming_session_id !== null &&
      result.sd_after_stale_flip.claiming_session_id === null,
    claiming_session_id_preserved:
      result.sd_after_session_insert.claiming_session_id === result.sd_after_stale_flip.claiming_session_id,
  };

  const v = result.bug_reproduction_verdict;
  if (v.is_working_on_was_cleared && v.active_session_id_was_cleared && v.claiming_session_id_preserved) {
    result.path_selection = 'D';
    result.path_explanation = 'PATH D CONFIRMED: sync_is_working_on_with_session AFTER UPDATE trigger on claude_sessions clears is_working_on + active_session_id (but NOT claiming_session_id) when status flips active->non-active and OLD.sd_key IS NOT NULL.';
  } else if (v.claiming_session_id_was_cleared) {
    result.path_selection = 'B+D combo';
    result.path_explanation = 'Both PATH B (function block 3 clears claiming_session_id) AND PATH D (trigger clears is_working_on + active_session_id) fired together.';
  } else if (!v.is_working_on_was_cleared) {
    result.path_selection = 'E';
    result.path_explanation = 'PATH E: trigger did not fire as predicted. Hypothesis disproven empirically.';
  }

  console.error(`[VERDICT] PATH ${result.path_selection}`);
  console.error(`[VERDICT] ${result.path_explanation}`);

  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('[error]', e.message);
  console.error(e.stack);
  result.error = e.message;
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (sessionInserted) {
    try {
      await client.query(`DELETE FROM claude_sessions WHERE session_id = $1`, [PROBE_SESSION_ID]);
      console.error(`[cleanup] deleted probe session`);
    } catch (e) { console.error('[cleanup-error] session:', e.message); }
  }
  if (probeInserted) {
    try {
      await client.query(`DELETE FROM strategic_directives_v2 WHERE sd_key = $1`, [PROBE_SD_KEY]);
      console.error(`[cleanup] deleted probe SD`);
    } catch (e) { console.error('[cleanup-error] sd:', e.message); }
  }
  await client.end();
}
