// Direct pg connection to introspect triggers on strategic_directives_v2
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;

// Try pooler URL with password substitution
let connStr = process.env.SUPABASE_POOLER_URL;
if (connStr && process.env.SUPABASE_DB_PASSWORD) {
  // Replace [YOUR-PASSWORD] placeholder if present
  connStr = connStr.replace('[YOUR-PASSWORD]', encodeURIComponent(process.env.SUPABASE_DB_PASSWORD));
  connStr = connStr.replace(':[YOUR-PASSWORD]@', `:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
}

console.log(`Connecting via: ${connStr ? connStr.replace(/:[^:@/]+@/, ':***@') : 'NONE'}`);

const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Direct pg connection OK\n');

  // 1. Triggers on strategic_directives_v2
  const trigRes = await client.query(`
    SELECT tgname, tgenabled,
           pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    WHERE tgrelid = 'strategic_directives_v2'::regclass
      AND NOT tgisinternal
    ORDER BY tgname;`);
  console.log(`--- TRIGGERS on strategic_directives_v2 (${trigRes.rows.length}) ---`);
  trigRes.rows.forEach(r => {
    console.log(`\n${r.tgname} (enabled=${r.tgenabled})`);
    console.log(r.def);
  });

  // 2. Key functions
  const fnRes = await client.query(`
    SELECT n.nspname AS schema, p.proname AS name, p.prosecdef AS security_definer,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN ('enforce_progress_on_completion', 'complete_orchestrator_sd', 'check_handoff_bypass', 'calculate_sd_progress', 'get_progress_breakdown')
    ORDER BY p.proname;`);
  console.log(`\n--- KEY FUNCTIONS ---`);
  fnRes.rows.forEach(r => {
    console.log(`${r.schema}.${r.name}(${r.args})  security_definer=${r.security_definer}`);
  });

  // 3. sd_type validation profile for feature
  const profileRes = await client.query(`SELECT sd_type, lead_weight, plan_weight, exec_weight, verify_weight, final_weight, requires_prd, requires_retrospective, min_handoffs FROM sd_type_validation_profiles WHERE sd_type IN ('feature', 'orchestrator', 'infrastructure', 'documentation', 'bugfix') ORDER BY sd_type;`);
  console.log(`\n--- sd_type_validation_profiles ---`);
  profileRes.rows.forEach(r => console.log(JSON.stringify(r)));

  // 4. Test calculate_sd_progress on witness
  const witnessProgress = await client.query(`SELECT calculate_sd_progress($1::varchar) AS progress`,
    ['b737c27f-3e83-4887-999e-3c1ae158faf4']);
  console.log(`\n--- WITNESS PROGRESS CALC TODAY ---`);
  console.log(`progress: ${witnessProgress.rows[0].progress}`);

  const witnessBreakdown = await client.query(`SELECT get_progress_breakdown($1::varchar) AS breakdown`,
    ['b737c27f-3e83-4887-999e-3c1ae158faf4']);
  console.log(`breakdown: ${JSON.stringify(witnessBreakdown.rows[0].breakdown, null, 2).substring(0, 3000)}`);

  // 5. Read the full text of enforce_progress_on_completion to confirm the predicate
  const fnBody = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    WHERE p.proname = 'enforce_progress_on_completion';`);
  console.log(`\n--- enforce_progress_on_completion BODY ---`);
  fnBody.rows.forEach(r => console.log(r.def));

  // 6. Find ALL functions that perform direct UPDATE on strategic_directives_v2.status
  const writerFns = await client.query(`
    SELECT p.proname, p.prosecdef AS security_definer,
           SUBSTRING(pg_get_functiondef(p.oid) FROM 1 FOR 200) AS preview
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND (pg_get_functiondef(p.oid) ILIKE '%UPDATE strategic_directives_v2%status%'
        OR pg_get_functiondef(p.oid) ILIKE '%UPDATE strategic_directives_v2%SET%status%')
    ORDER BY p.proname;`);
  console.log(`\n--- FUNCTIONS that UPDATE strategic_directives_v2.status (${writerFns.rows.length}) ---`);
  writerFns.rows.forEach(r => console.log(`${r.proname} sec_def=${r.security_definer}`));

  // 7. check_handoff_bypass body
  const cbk = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'check_handoff_bypass';`);
  console.log(`\n--- check_handoff_bypass BODY ---`);
  cbk.rows.forEach(r => console.log(r.def));

  // 8. complete_orchestrator_sd body — confirm it's installed and what it actually does
  const cosBody = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'complete_orchestrator_sd';`);
  console.log(`\n--- complete_orchestrator_sd BODY ---`);
  cosBody.rows.forEach(r => console.log(r.def));

  // 9. Was the witness completed via complete_orchestrator_sd? — search audit
  // Try several common audit/log table names
  for (const tbl of ['audit_log', 'compliance_log', 'governance_audit_trail', 'sub_agent_execution_results']) {
    try {
      const c = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position;`, [tbl]);
      if (c.rows.length > 0) {
        console.log(`\n--- ${tbl} columns: ${c.rows.map(r => r.column_name).join(', ')}`);
      }
    } catch {/* */}
  }

  // 10. Witness lifecycle via timestamps in sd_phase_handoffs + leo_handoff_executions interleaved
  const lifecycle = await client.query(`
    SELECT created_at, 'sph' AS src, handoff_type, status, validation_score, created_by
    FROM sd_phase_handoffs WHERE sd_id = $1
    UNION ALL
    SELECT created_at, 'lhe' AS src, handoff_type, status, validation_score, created_by
    FROM leo_handoff_executions WHERE sd_id = $1
    ORDER BY created_at ASC`, ['b737c27f-3e83-4887-999e-3c1ae158faf4']);
  console.log(`\n--- INTERLEAVED LIFECYCLE (witness) ---`);
  lifecycle.rows.forEach(r => console.log(`${r.created_at.toISOString()}  [${r.src}] ${r.handoff_type.padEnd(22)} ${r.status.padEnd(10)} score=${r.validation_score || 'null'} by=${r.created_by || 'null'}`));

  await client.end();
} catch (e) {
  console.error('Direct pg failed:', e.message);
  console.error(e.stack);
  process.exit(1);
}
