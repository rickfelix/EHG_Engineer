import { q } from './db-exec.mjs';

console.log('=== 1. archetype_benchmarks: all policies + anon table grants (is_chairman_role C8 risk) ===');
let r = await q(`SELECT policyname, cmd, permissive, roles::text AS roles, qual FROM pg_policies
WHERE schemaname='public' AND tablename='archetype_benchmarks'`);
console.table(r[0].result);
r = await q(`SELECT c.relname, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
  has_table_privilege('anon','public.archetype_benchmarks','SELECT') AS anon_select,
  has_table_privilege('anon','public.archetype_benchmarks','INSERT') AS anon_insert,
  has_table_privilege('authenticated','public.archetype_benchmarks','SELECT') AS auth_select
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='archetype_benchmarks'`);
console.table(r[0].result);

console.log('\n=== 2. trigger attachment for candidate trigger-functions ===');
r = await q(`SELECT p.proname AS fn, count(t.oid) AS n_triggers,
  string_agg(DISTINCT c.relname||':'||t.tgname, ', ') AS triggers
FROM pg_proc p
LEFT JOIN pg_trigger t ON t.tgfoid = p.oid AND NOT t.tgisinternal
LEFT JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('log_sd_mutation_audit','fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application',
  'fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token','fn_write_kill_audit_trail',
  'fn_anon_ingress_prior_hour_count')
GROUP BY 1 ORDER BY 1`);
console.table(r[0].result);

console.log('\n=== 3. cross-function callers: which SECDEF fn bodies reference the Bucket A targets? ===');
const A = ['fn_stage_artifact_precondition', 'fn_user_has_company_access', 'fn_verify_and_consume_stepup_token',
  'fn_write_kill_audit_trail', 'fn_anon_ingress_prior_hour_count', 'log_sd_mutation_audit', 'is_chairman_role'];
r = await q(`SELECT p.proname AS caller, p.prosecdef, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`);
const fns = r[0].result;
for (const target of A) {
  const re = new RegExp('\\b' + target + '\\s*\\(');
  const callers = fns.filter((f) => f.proname !== target && re.test(f.prosrc || ''));
  console.log(`${target}: called by ${callers.length} fn(s) -> ` +
    callers.map((c) => `${c.proname}[secdef=${c.prosecdef}]`).join(', '));
}

console.log('\n=== 4. EXACT SIGNATURES (regprocedure) for all live-exposed SECDEF targets ===');
r = await q(`SELECT p.oid::regprocedure::text AS sig, p.proname,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
  EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f',p.proowner))) a WHERE a::text LIKE '=%X%') AS has_public,
  pg_get_function_result(p.oid) AS returns
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
ORDER BY p.proname`);
for (const x of r[0].result) console.log(`${x.has_public ? 'PUB ' : '    '}${x.anon_exec ? 'ANON ' : '     '}${x.auth_exec ? 'AUTH ' : '     '} ${x.sig} -> ${x.returns}`);
