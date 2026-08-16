import { q } from './db-exec.mjs';
console.log('=== NATURAL EXPERIMENT: schemas whose pg_default_acl(f) OMITS PUBLIC ===');
console.log('If ADP entries SUPPRESS the built-in PUBLIC default, functions in governance/portfolio/runtime should have has_public=false\n');
let r = await q(`SELECT n.nspname AS schema, count(*) AS n_fns,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f',p.proowner))) a WHERE a::text LIKE '=%X%')) AS with_public,
  count(*) FILTER (WHERE p.proacl IS NULL) AS acl_null,
  count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')) AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','governance','portfolio','runtime','staging')
GROUP BY 1 ORDER BY 1`);
console.table(r[0].result);
console.log('\n=== sample function ACLs in governance/portfolio/runtime ===');
r = await q(`SELECT n.nspname AS schema, p.proname, pg_get_userbyid(p.proowner) AS owner,
  COALESCE(array_to_string(p.proacl::text[],' | '),'<NULL>') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('governance','portfolio','runtime') ORDER BY 1,2 LIMIT 12`);
console.table(r[0].result);
