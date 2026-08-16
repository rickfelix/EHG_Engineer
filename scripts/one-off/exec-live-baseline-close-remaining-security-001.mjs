// EXEC-phase live re-measurement, immediately before migration authoring, per FR-5/TR-1/TESTING
// guidance: use has_function_privilege() directly (never proacl text-matching — TESTING found
// PUBLIC renders as the empty-grantee token =X/postgres, matching zero of the functions that
// actually carry it), and re-capture fresh since sibling migrations may have landed since PLAN.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BUCKET_A_NAMES = ['fn_enforce_stage_advancement_artifact_gate', 'fn_quick_fixes_validate_target_application', 'fn_stage_artifact_precondition', 'fn_user_has_company_access', 'fn_verify_and_consume_stepup_token', 'log_sd_mutation_audit'];
const BUCKET_B_NAMES = ['approve_chairman_decision', 'check_feedback_duplicate', 'claim_sd', 'fn_is_service_role', 'fn_list_chairman_webauthn_credentials', 'fn_user_has_venture_access', 'fn_write_kill_audit_trail', 'get_gate_decision_status', 'reject_chairman_decision', 'upsert_operator_cash_burn'];
const BUCKET_C_NAMES = ['check_feedback_rate_limit', 'fn_advance_pipeline_stage', 'fn_is_chairman', 'fn_relay_insert_sms_candidate', 'is_leo_admin', 'lhe_pending_migration_applied', 'record_venture_error', 'set_session_working_context', 'venture_exists_and_active', 'is_chairman_role', 'fn_anon_ingress_prior_hour_count'];

const ALL = [...BUCKET_A_NAMES, ...BUCKET_B_NAMES, ...BUCKET_C_NAMES];

async function q(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
  if (error) throw new Error(`exec_sql failed: ${JSON.stringify(error)}`);
  return data?.[0]?.result || [];
}

const sql = `SELECT p.proname, p.oid::text AS oid, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec, has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec, p.prosecdef AS is_secdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${ALL.map((n) => `'${n}'`).join(',')}]) ORDER BY p.proname`;

const rows = await q(sql);
console.log(`Found ${rows.length} functions (expected ${ALL.length})`);

const byName = {};
for (const r of rows) {
  if (!byName[r.proname]) byName[r.proname] = [];
  byName[r.proname].push(r);
}

const missing = ALL.filter((n) => !byName[n]);
if (missing.length) console.log('MISSING FROM CATALOG:', missing.join(', '));

const multiOverload = Object.entries(byName).filter(([, v]) => v.length > 1);
if (multiOverload.length) console.log('MULTI-OVERLOAD (needs disambiguation):', multiOverload.map(([n]) => n).join(', '));

console.log('\n=== BUCKET A (expect anon=T, auth=T before; F,F after) ===');
for (const n of BUCKET_A_NAMES) {
  const r = byName[n]?.[0];
  console.log(r ? `${r.full_sig} | anon=${r.anon_exec} auth=${r.auth_exec} public=${r.public_exec} svc=${r.svc_exec} secdef=${r.is_secdef}` : `${n}: NOT FOUND`);
}
console.log('\n=== BUCKET B (expect anon=T before/F after, auth=T before/after) ===');
for (const n of BUCKET_B_NAMES) {
  const r = byName[n]?.[0];
  console.log(r ? `${r.full_sig} | anon=${r.anon_exec} auth=${r.auth_exec} public=${r.public_exec} svc=${r.svc_exec} secdef=${r.is_secdef}` : `${n}: NOT FOUND`);
}
console.log('\n=== BUCKET C (expect unchanged) ===');
for (const n of BUCKET_C_NAMES) {
  const r = byName[n]?.[0];
  console.log(r ? `${r.full_sig} | anon=${r.anon_exec} auth=${r.auth_exec} public=${r.public_exec} svc=${r.svc_exec} secdef=${r.is_secdef}` : `${n}: NOT FOUND`);
}

const baseline = { captured_at: new Date().toISOString(), rows: rows.map((r) => ({ signature: r.full_sig, anon_exec: r.anon_exec, auth_exec: r.auth_exec, public_exec: r.public_exec, svc_exec: r.svc_exec, is_secdef: r.is_secdef })) };
writeFileSync('.artifacts/exec-live-baseline.json', JSON.stringify(baseline, null, 2));
console.log('\nBaseline written to .artifacts/exec-live-baseline.json');
