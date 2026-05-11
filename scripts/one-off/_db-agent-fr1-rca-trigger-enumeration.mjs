// FR-1 RCA: SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001
// Database-agent at PLAN phase

import { createDatabaseClient } from '../lib/supabase-connection.js';

const TARGET_TABLES = [
  'strategic_directives_v2',
  'product_requirements_v2',
  'sd_phase_handoffs',
  'claude_sessions',
];

const SUSPECT_FUNCTIONS = [
  'release_sd',
  'release_session',
  'cleanup_stale_sessions',
  'sync_is_working_on_with_session',
  'claim_sd',
  'report_pid_validation_failure',
  'enforce_progress_on_completion',
  'check_handoff_bypass',
  'complete_orchestrator_sd',
];

const out = {
  generated_at: new Date().toISOString(),
  per_table_triggers: {},
  function_bodies: {},
  function_dependencies: {},
  function_overloads: {},
  recent_cleanup_events: [],
  cron_jobs: [],
};

const client = await createDatabaseClient('engineer', { verify: false });

try {
  for (const tbl of TARGET_TABLES) {
    const r = await client.query(`
      SELECT
        t.tgname AS trigger_name,
        t.tgenabled AS enabled,
        CASE
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END AS timing,
        CASE
          WHEN t.tgtype & 4 = 4 THEN 'INSERT'
          WHEN t.tgtype & 8 = 8 THEN 'DELETE'
          WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
          WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
          ELSE 'UNKNOWN'
        END AS event,
        t.tgtype AS tgtype_bitmask,
        p.proname AS function_name,
        n.nspname AS function_schema,
        p.prosecdef AS is_security_definer,
        pg_get_triggerdef(t.oid, true) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE c.relname = $1
        AND NOT t.tgisinternal
      ORDER BY t.tgname
    `, [tbl]);
    out.per_table_triggers[tbl] = r.rows;
    console.error(`[ok] ${tbl}: ${r.rows.length} trigger(s)`);
  }

  for (const fname of SUSPECT_FUNCTIONS) {
    const r = await client.query(`
      SELECT
        n.nspname AS schema,
        p.proname AS name,
        p.prosecdef AS is_security_definer,
        pg_get_function_identity_arguments(p.oid) AS args,
        pg_get_function_result(p.oid) AS return_type,
        l.lanname AS language,
        p.provolatile AS volatility,
        pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE p.proname = $1
        AND p.prokind = 'f'
      ORDER BY n.nspname, pg_get_function_identity_arguments(p.oid)
    `, [fname]);
    out.function_bodies[fname] = r.rows;
    out.function_overloads[fname] = r.rows.length;
    console.error(`[ok] ${fname}: ${r.rows.length} overload(s)`);
  }

  const claimColRefs = await client.query(`
    SELECT
      p.proname,
      n.nspname AS schema,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.prosecdef AS is_security_definer,
      CASE WHEN pg_get_functiondef(p.oid) ILIKE '%claiming_session_id%' THEN true ELSE false END AS touches_claiming_session_id,
      CASE WHEN pg_get_functiondef(p.oid) ILIKE '%is_working_on%' THEN true ELSE false END AS touches_is_working_on,
      CASE WHEN pg_get_functiondef(p.oid) ILIKE '%active_session_id%' THEN true ELSE false END AS touches_active_session_id,
      CASE WHEN pg_get_functiondef(p.oid) ILIKE '%current_phase%' THEN true ELSE false END AS touches_current_phase,
      CASE WHEN pg_get_functiondef(p.oid) ~* '\\bUPDATE\\s+strategic_directives_v2\\b' THEN true ELSE false END AS updates_sd_v2
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        pg_get_functiondef(p.oid) ILIKE '%claiming_session_id%' OR
        pg_get_functiondef(p.oid) ILIKE '%is_working_on%' OR
        pg_get_functiondef(p.oid) ILIKE '%active_session_id%'
      )
    ORDER BY p.proname
  `);
  out.function_dependencies = {
    total_functions_touching_claim_cols: claimColRefs.rows.length,
    functions: claimColRefs.rows,
  };
  console.error(`[ok] ${claimColRefs.rows.length} function(s) reference claim/is_working columns`);

  try {
    const cron = await client.query(`SELECT jobid, schedule, command, nodename, nodeport, database, username, active, jobname FROM cron.job ORDER BY jobid`);
    out.cron_jobs = cron.rows;
  } catch (e) {
    out.cron_jobs = { error: e.message, hint: 'pg_cron extension may not be installed or schema not exposed' };
  }
  console.error(`[ok] cron section`);

  const recentStale = await client.query(`
    SELECT
      session_id, status, terminal_id, current_branch,
      heartbeat_at, claimed_at, released_at, stale_at,
      stale_reason, sd_key
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at IS NOT NULL
      AND stale_at >= NOW() - INTERVAL '24 hours'
    ORDER BY stale_at DESC
    LIMIT 20
  `);
  out.recent_cleanup_events = recentStale.rows;
  console.error(`[ok] ${recentStale.rows.length} recent stale-flip event(s) in last 24h`);

  // strategic_directives_v2 has NO 'claimed_at' col — only claiming_session_id + active_session_id + is_working_on + current_phase
  const myClaim = await client.query(`
    SELECT
      sd_key, claiming_session_id, is_working_on, active_session_id,
      current_phase, status,
      governance_metadata, metadata
    FROM strategic_directives_v2
    WHERE sd_key = $1
  `, ['SD-FDBK-INFRA-CASCADE-TRIGGER-OVERREACH-001']);
  out.target_sd_state = myClaim.rows[0];
  console.error(`[ok] target SD claim state captured`);

  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (sessionId) {
    const mySession = await client.query(`
      SELECT
        session_id, status, terminal_id, current_branch, sd_key,
        claimed_at, heartbeat_at, released_at, stale_at, stale_reason
      FROM claude_sessions
      WHERE session_id = $1
    `, [sessionId]);
    out.this_session_state = mySession.rows[0] || { error: 'session_id not found in claude_sessions', session_id_attempted: sessionId };
  } else {
    out.this_session_state = { error: 'CLAUDE_SESSION_ID env var not set' };
  }

  const csCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  out.claude_sessions_schema = csCols.rows;
  console.error(`[ok] claude_sessions has ${csCols.rows.length} columns`);

  const sdCols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
      AND table_schema = 'public'
      AND column_name IN ('claiming_session_id', 'is_working_on', 'active_session_id',
                          'current_phase', 'status', 'progress', 'last_activity_at',
                          'governance_metadata', 'metadata', 'sd_type')
    ORDER BY column_name
  `);
  out.sd_v2_claim_schema = sdCols.rows;

  console.log(JSON.stringify(out, null, 2));
} finally {
  await client.end();
}
