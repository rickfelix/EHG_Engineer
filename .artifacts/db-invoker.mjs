import { q } from './db-exec.mjs';

console.log('=== fn_chairman_decide: the SECURITY INVOKER caller of fn_write_kill_audit_trail ===');
let r = await q(`SELECT p.oid::regprocedure::text AS sig, p.prosecdef, p.proconfig::text AS config,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS svc_exec,
  array_to_string(p.proacl::text[],' | ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_chairman_decide'`);
console.table(r[0].result);

console.log('\n=== the fn_write_kill_audit_trail call site inside fn_chairman_decide ===');
r = await q(`SELECT substring(p.prosrc from position('fn_write_kill_audit_trail' in p.prosrc) - 400 for 700) AS ctx
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='fn_chairman_decide'`);
console.log(r[0].result[0]?.ctx);

console.log('\n=== ALL SECURITY INVOKER fns in public that call ANY currently-anon-exposed SECDEF fn ===');
r = await q(`SELECT p.proname, p.prosecdef, coalesce(p.prosrc,'') AS src,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef = false AND p.prokind='f'`);
const invokers = r[0].result;
const targets = ['fn_enforce_stage_advancement_artifact_gate', 'fn_quick_fixes_validate_target_application',
  'fn_stage_artifact_precondition', 'fn_user_has_company_access', 'fn_verify_and_consume_stepup_token',
  'fn_write_kill_audit_trail', 'log_sd_mutation_audit', 'approve_chairman_decision', 'check_feedback_duplicate',
  'claim_sd', 'fn_is_service_role', 'fn_list_chairman_webauthn_credentials', 'fn_user_has_venture_access',
  'get_gate_decision_status', 'is_chairman_role', 'reject_chairman_decision', 'upsert_operator_cash_burn'];
let found = 0;
for (const t of targets) {
  const re = new RegExp('\\b' + t + '\\s*\\(');
  const hits = invokers.filter((i) => re.test(i.src));
  if (hits.length) {
    found++;
    console.log(`${t}  <-- INVOKER callers: ` + hits.map((h) => `${h.proname}(anon=${h.anon_exec},auth=${h.auth_exec})`).join(', '));
  }
}
if (!found) console.log('(none)');
