import { q } from './db-exec.mjs';
import fs from 'fs';
const sql = `SELECT p.oid::text AS oid,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec,
       EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a::text LIKE '=%X%') AS public_exec_direct,
       EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a::text LIKE 'anon=%X%') AS anon_direct,
       EXISTS (SELECT 1 FROM unnest(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a::text LIKE 'authenticated=%X%') AS auth_direct,
       (p.proacl IS NULL) AS acl_is_default,
       COALESCE(array_to_string(p.proacl::text[], ' | '), '<NULL=default:owner+PUBLIC>') AS acl,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY p.proname, args`;
const r = await q(sql);
const rows = r[0].result;
fs.writeFileSync('.artifacts/secdef-census.json', JSON.stringify(rows, null, 2));
console.log('TOTAL_SECDEF_IN_PUBLIC=' + rows.length);
console.log('ANON_EXECUTABLE=' + rows.filter(x=>x.anon_exec).length);
console.log('PUBLIC_GRANT_PRESENT=' + rows.filter(x=>x.public_exec_direct).length);
console.log('ACL_IS_NULL(default owner+PUBLIC)=' + rows.filter(x=>x.acl_is_default).length);
console.log('\n--- ANON-EXECUTABLE SECDEF FUNCTIONS (live) ---');
for (const x of rows.filter(v=>v.anon_exec))
  console.log(`${x.proname}(${x.args})\n    pubDirect=${x.public_exec_direct} anonDirect=${x.anon_direct} authDirect=${x.auth_direct} aclNull=${x.acl_is_default}\n    ACL=${x.acl}`);
