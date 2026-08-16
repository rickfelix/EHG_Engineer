import { q } from './db-exec.mjs';

const BUCKET_A = ['fn_enforce_stage_advancement_artifact_gate', 'fn_quick_fixes_validate_target_application',
  'fn_stage_artifact_precondition', 'fn_user_has_company_access', 'fn_verify_and_consume_stepup_token',
  'fn_write_kill_audit_trail'];
const BUCKET_B_LIVE = ['approve_chairman_decision', 'check_feedback_duplicate', 'claim_sd', 'fn_is_service_role',
  'fn_list_chairman_webauthn_credentials', 'fn_user_has_venture_access', 'get_gate_decision_status',
  'is_chairman_role', 'reject_chairman_decision', 'upsert_operator_cash_burn'];
const NEW_UNBUCKETED = ['fn_anon_ingress_prior_hour_count', 'log_sd_mutation_audit'];
const BUCKET_C = ['check_feedback_rate_limit', 'fn_advance_pipeline_stage', 'fn_is_chairman',
  'fn_relay_insert_sms_candidate', 'is_leo_admin', 'lhe_pending_migration_applied', 'record_venture_error',
  'set_session_working_context', 'venture_exists_and_active'];

const r = await q(`SELECT schemaname, tablename, policyname, cmd, roles::text AS roles,
  coalesce(qual,'') || ' ~~ ' || coalesce(with_check,'') AS body FROM pg_policies`);
const pols = r[0].result;
console.log('TOTAL_POLICIES_ALL_SCHEMAS=' + pols.length);

function scan(label, fns) {
  console.log('\n===== ' + label + ' =====');
  for (const fn of fns) {
    const re = new RegExp('\\b' + fn + '\\s*\\(');
    const hits = pols.filter((p) => re.test(p.body));
    const anonRole = hits.filter((p) => /\banon\b/.test(p.roles));
    const pubRole = hits.filter((p) => /^\{public\}$/.test(p.roles) || p.roles === '{}' || p.roles == null);
    const flag = (anonRole.length || pubRole.length) ? '   <<<< ANON-REACHABLE POLICY' : '';
    console.log(`${fn}: policies=${hits.length} anonRole=${anonRole.length} publicRole=${pubRole.length}${flag}`);
    for (const h of hits.slice(0, 5)) {
      console.log(`      ${h.schemaname}.${h.tablename} :: ${h.policyname} [${h.cmd}] roles=${h.roles}`);
    }
  }
}
scan('BUCKET A (revoke PUBLIC,anon,authenticated)', BUCKET_A);
scan('BUCKET B live residual (revoke PUBLIC,anon)', BUCKET_B_LIVE);
scan('NEW UNBUCKETED (needs triage)', NEW_UNBUCKETED);
scan('BUCKET C (revoke nothing) - control', BUCKET_C);
