// Part 2: complete the introspection that failed at array_agg
import pg from 'pg';
import 'dotenv/config';

const { Client } = pg;
let connStr = process.env.SUPABASE_POOLER_URL.replace(':[YOUR-PASSWORD]@', `:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@`);
const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('connected\n');

// 1. Read calculate_sd_progress body to see how LEAD_final_approval is judged complete
const fnBody = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'calculate_sd_progress';`);
console.log('--- calculate_sd_progress BODY ---');
fnBody.rows.forEach(r => console.log(r.def));

// 2. Read get_progress_breakdown body to see LEAD_final_approval completion check
const fn2 = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'get_progress_breakdown' AND pg_get_function_identity_arguments(p.oid) = 'sd_id_param text';`);
console.log('\n--- get_progress_breakdown(text) BODY ---');
fn2.rows.forEach(r => console.log(r.def));

// 3. complete_orchestrator_sd full body
const fn3 = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'complete_orchestrator_sd';`);
console.log('\n--- complete_orchestrator_sd BODY ---');
fn3.rows.forEach(r => console.log(r.def));

// 4. try_auto_complete_parent_orchestrator
const fn4 = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'try_auto_complete_parent_orchestrator';`);
console.log('\n--- try_auto_complete_parent_orchestrator BODY ---');
fn4.rows.forEach(r => console.log(r.def));

// 5. Witness 'LEAD_final_approval' template phase definition
const tpl = await client.query(`SELECT id, name, version, phases FROM progress_templates WHERE id = 'ddd902e9-244b-4830-b634-7207ec8f037c';`).catch(() => null);
if (tpl) console.log('\n--- progress_template ddd902e9 ---\n' + JSON.stringify(tpl.rows[0], null, 2).substring(0, 3000));

// 6. Find every function performing UPDATE on strategic_directives_v2 + status
const writerFns = await client.query(`
  SELECT p.proname, p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND (pg_get_functiondef(p.oid) ILIKE '%UPDATE strategic_directives_v2%'
      OR pg_get_functiondef(p.oid) ILIKE '%FROM strategic_directives_v2%SET%')
    AND pg_get_functiondef(p.oid) ILIKE '%status%'
  ORDER BY p.proname;`);
console.log(`\n--- pg functions touching strategic_directives_v2 status (${writerFns.rows.length}) ---`);
writerFns.rows.forEach(r => console.log(`  ${r.proname} sec_def=${r.security_definer}`));

// 7. Sample 5 recent true-ghost SDs and check their progress breakdown
const recentGhosts = ['SD-OKR-AUTO-KR-GOV-2-2-001', 'SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001'];
for (const gid of recentGhosts) {
  console.log(`\n--- Ghost SD ${gid} ---`);
  const sd = await client.query(`SELECT id, sd_key, sd_type, status, current_phase, progress_percentage, completion_date, metadata->>'created_via' AS created_via FROM strategic_directives_v2 WHERE sd_key=$1 OR id::text=$1;`, [gid]);
  console.log('SD:', sd.rows[0] ? JSON.stringify(sd.rows[0]) : 'NOT FOUND');
  if (sd.rows[0]) {
    const breakdown = await client.query(`SELECT get_progress_breakdown($1::varchar) AS b`, [sd.rows[0].id]);
    console.log('Breakdown:', JSON.stringify(breakdown.rows[0].b, null, 2).substring(0, 2000));
  }
}

// 8. What does fn_emit_sd_completed_event do?
const fn5 = await client.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = 'fn_emit_sd_completed_event';`);
console.log('\n--- fn_emit_sd_completed_event BODY ---');
fn5.rows.forEach(r => console.log(r.def.substring(0, 2000)));

// 9. Look for the LEAD-FINAL-APPROVAL completion logic in template phases
const tplPhases = await client.query(`SELECT * FROM progress_template_phases WHERE template_id = 'ddd902e9-244b-4830-b634-7207ec8f037c' ORDER BY step_order;`).catch(() => null);
if (tplPhases) {
  console.log(`\n--- progress_template_phases for feature (${tplPhases.rows.length}) ---`);
  tplPhases.rows.forEach(r => console.log(JSON.stringify(r, null, 2)));
}

await client.end();
