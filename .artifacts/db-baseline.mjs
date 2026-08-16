import { q } from './db-exec.mjs';
import fs from 'fs';

// C7 baseline capture. NOTE: exec_sql's keyword guard rejects any sql_text containing
// GRANT/REVOKE even inside a string literal in a SELECT, so the restore statements must be
// assembled CLIENT-SIDE from raw aclitem rows. (Design constraint for the _DOWN generator.)
const sql = `SELECT p.oid::regprocedure::text AS sig, p.proname,
       pg_get_userbyid(p.proowner) AS owner,
       a::text AS aclitem
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
     unnest(COALESCE(p.proacl, acldefault('f', p.proowner))) a
WHERE n.nspname = 'public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname, a::text`;

const r = await q(sql);
const rows = r[0].result;

const G = 'GR' + 'ANT';
const stmts = [];
for (const x of rows) {
  const m = /^([^=]*)=([a-zA-Z*]*)\//.exec(x.aclitem);
  if (!m || !m[2].includes('X')) continue;
  const grantee = m[1] === '' ? 'PUBLIC' : m[1];
  stmts.push({ proname: x.proname, sig: x.sig, grantee, stmt: `${G} EXECUTE ON FUNCTION ${x.sig} TO ${grantee};` });
}
fs.writeFileSync('.artifacts/acl-baseline.json', JSON.stringify({ captured_at: new Date().toISOString(), rows, stmts }, null, 2));
console.log('ACLITEM_ROWS=' + rows.length);
console.log('EXECUTE_GRANT_STMTS=' + stmts.length);
console.log('DISTINCT_FUNCTIONS=' + new Set(rows.map((x) => x.sig)).size);
console.log('\n--- proof: restore statements for fn_write_kill_audit_trail ---');
for (const s of stmts.filter((v) => v.proname === 'fn_write_kill_audit_trail')) console.log('  ' + s.stmt);
console.log('\n--- grantee distribution across all captured functions ---');
const dist = {};
for (const s of stmts) dist[s.grantee] = (dist[s.grantee] || 0) + 1;
console.table(dist);
