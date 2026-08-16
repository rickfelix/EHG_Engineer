import { q } from './db-exec.mjs';
console.log('=== C2: pg_default_acl (default privileges) ===');
let r = await q(`SELECT pg_get_userbyid(d.defaclrole) AS creating_role,
       COALESCE(n.nspname,'<all schemas>') AS schema,
       d.defaclobjtype AS objtype,
       array_to_string(d.defaclacl::text[], ' | ') AS acl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
ORDER BY 1,2,3`);
console.table(r[0].result);
console.log('\n=== C5: status of the 3 previously-flagged unbucketed fns ===');
r = await q(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef,
       has_function_privilege('anon', p.oid,'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid,'EXECUTE') AS auth_exec,
       array_to_string(p.proacl::text[],' | ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('get_daily_briefing','get_okr_metrics','get_portfolio_summary','fn_anon_ingress_prior_hour_count','log_sd_mutation_audit','set_adam_flag','clear_adam_flag')
ORDER BY 1`);
console.table(r[0].result);
console.log('\n=== role membership: is anon/authenticated a member of anything? ===');
r = await q(`SELECT r.rolname AS member, g.rolname AS member_of
FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
WHERE r.rolname IN ('anon','authenticated','service_role') ORDER BY 1,2`);
console.table(r[0].result);
