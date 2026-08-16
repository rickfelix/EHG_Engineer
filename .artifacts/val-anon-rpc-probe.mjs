import dotenv from 'dotenv'; dotenv.config();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Probe a spread: Bucket C (expect anon-callable), Bucket B (expect revoked from anon per 20260603_03), Bucket A
const probes = ['fn_is_chairman','is_leo_admin','venture_exists_and_active','check_feedback_rate_limit',
                'delete_venture','kill_venture','claim_sd','set_global_auto_proceed','approve_chairman_decision',
                'fn_user_has_company_access','fn_write_kill_audit_trail','fn_stage_artifact_precondition',
                'fn_relay_insert_sms_candidate','record_venture_error','lhe_pending_migration_applied'];
console.log('role  fn'.padEnd(46),'http  pg_code  interpretation');
for (const role of ['anon']) {
  const key = ANON;
  for (const fn of probes) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
      method:'POST', headers:{apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json'}, body:'{}'
    });
    let j={}; try{ j = await r.json(); }catch{}
    const code = j.code || '';
    let verdict;
    if (code === '42501' || /permission denied/i.test(j.message||'')) verdict='REVOKED for anon ✅';
    else if (code === 'PGRST202') verdict='not in schema cache / arg mismatch (AMBIGUOUS)';
    else if (r.status === 404) verdict='404 (AMBIGUOUS)';
    else verdict=`EXECUTABLE by anon ⚠️  (${r.status})`;
    console.log(`${role}  ${fn}`.padEnd(46), String(r.status).padEnd(5), String(code).padEnd(8), verdict);
  }
}
