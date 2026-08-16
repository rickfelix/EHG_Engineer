import { q } from './db-exec.mjs';
console.log('=== Newest 25 functions in public by OID (proxy for creation order) ===');
const r = await q(`SELECT p.oid::text AS oid, p.proname, p.prosecdef,
       pg_get_userbyid(p.proowner) AS owner,
       EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f',p.proowner))) a WHERE a::text LIKE '=%X%') AS has_public,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
       array_to_string(p.proacl::text[],' | ') AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' ORDER BY p.oid DESC LIMIT 25`);
console.table(r[0].result.map(x=>({oid:x.oid,proname:x.proname,secdef:x.prosecdef,owner:x.owner,has_public:x.has_public,anon:x.anon_exec})));
