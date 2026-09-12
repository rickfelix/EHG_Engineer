import pg from 'pg'; import dotenv from 'dotenv'; dotenv.config();
const c = new pg.Client({ connectionString: process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL, ssl:{rejectUnauthorized:false} });
await c.connect();
const r = await c.query(`SELECT sd_key, status, current_phase, metadata FROM strategic_directives_v2 WHERE parent_sd_id='f651ec94-852d-4727-8146-5d39cd00c476' AND sd_key IN ('SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-B','SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G')`);
for (const row of r.rows) {
  console.log(`\n===== ${row.sd_key} (${row.status}/${row.current_phase}) =====`);
  const md = row.metadata || {};
  for (const k of ['cancellation_reason','cancelled_reason','completion_summary','lead_final_approval','closure_note','outcome','resolution']) {
    if (md[k]) console.log(` ${k}: ${String(typeof md[k]==='string'?md[k]:JSON.stringify(md[k])).slice(0,1400)}`);
  }
  console.log(' metadata keys:', Object.keys(md).join(', ').slice(0,400));
}
// sub_agent_execution_results for child C so far
const sa = await c.query(`SELECT sub_agent_code, verdict, created_at FROM sub_agent_execution_results WHERE sd_id='30a5f9e6-fa6c-47d2-abfc-5639745010f3' ORDER BY created_at DESC LIMIT 20`);
console.log('\n=== existing sub_agent_execution_results for Child C ===');
sa.rows.forEach(x=>console.log(` ${x.sub_agent_code} | ${x.verdict} | ${x.created_at.toISOString()}`));
console.log(`(count=${sa.rowCount})`);
await c.end();
