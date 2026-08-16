import { q } from './db-exec.mjs';

const TARGETS = {
  'BUCKET A': ['fn_enforce_stage_advancement_artifact_gate', 'fn_quick_fixes_validate_target_application',
    'fn_stage_artifact_precondition', 'fn_user_has_company_access', 'fn_verify_and_consume_stepup_token',
    'fn_write_kill_audit_trail', 'log_sd_mutation_audit'],
  'BUCKET B live': ['approve_chairman_decision', 'check_feedback_duplicate', 'claim_sd', 'fn_is_service_role',
    'fn_list_chairman_webauthn_credentials', 'fn_user_has_venture_access', 'get_gate_decision_status',
    'reject_chairman_decision', 'upsert_operator_cash_burn'],
};

const r = await q(`SELECT p.proname, p.prosecdef, p.prokind, pg_get_function_result(p.oid) AS ret,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
  coalesce(p.prosrc,'') AS src
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`);
const fns = r[0].result;

// also scan view definitions
const v = await q(`SELECT c.relname AS viewname, pg_get_viewdef(c.oid) AS def
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('v','m')`);
const views = v[0].result;

for (const [bucket, list] of Object.entries(TARGETS)) {
  console.log('\n########## ' + bucket + ' ##########');
  for (const target of list) {
    const re = new RegExp('\\b' + target + '\\s*\\(');
    const callers = fns.filter((f) => f.proname !== target && re.test(f.src));
    const invokerCallers = callers.filter((c) => !c.prosecdef);
    const viewRefs = views.filter((x) => re.test(x.def || ''));
    const risk = invokerCallers.length ? '  *** INVOKER-CALLER RISK ***' : '';
    const vrisk = viewRefs.length ? '  *** VIEW REF ***' : '';
    console.log(`\n${target}${risk}${vrisk}`);
    console.log(`   SECDEF callers (safe, inner call runs as definer): ` +
      (callers.filter((c) => c.prosecdef).map((c) => c.proname).join(', ') || 'none'));
    if (invokerCallers.length) {
      for (const ic of invokerCallers) {
        console.log(`   INVOKER caller: ${ic.proname}  ret=${ic.ret}  anon_exec=${ic.anon_exec} auth_exec=${ic.auth_exec}`);
      }
    }
    if (viewRefs.length) console.log(`   views: ${viewRefs.map((x) => x.viewname).join(', ')}`);
  }
}
