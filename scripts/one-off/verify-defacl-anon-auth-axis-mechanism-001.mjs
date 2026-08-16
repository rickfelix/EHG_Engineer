#!/usr/bin/env node
// SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 — LEAD-phase INDEPENDENT mechanism verification.
// GATE_MECHANISM_CLAIM_VERIFIER requires a named reader at a named file:line, not an
// inherited endorsement. This re-measures the claim at source rather than trusting the
// proposal's cited "Hotel signal d302b64c" secondhand.
//
// Pooler direct-connect (pg.Client) failed with "password authentication failed for user
// postgres" (confirmed here 2026-08-16; matches the same credential-broken finding recorded
// at scripts/one-off/lead-correct-scan-findings-close-remaining-security-001.mjs:98-102).
// Using the documented working path instead: supabase.rpc('exec_sql', { sql_text }) via the
// REST client (service-role key). NOTE: the exec_sql wrapper rejects multi-line/indented SQL
// text with a false "only allows SELECT/WITH" 42501 (a wrapper quirk, not a real permission
// boundary) — every query below is single-line to work around it. Read-only. NO DDL. NO writes.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const out = (label, v) => { console.log(`\n=== ${label} ===`); console.log(JSON.stringify(v, null, 2)); };

async function q(sql_text) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_text });
  if (error) throw new Error(error.message || JSON.stringify(error));
  return data?.[0]?.result ?? data;
}

async function main() {
  // 1. Raw default ACL for functions, per creator role, all schemas (filter to 'public' below)
  const raw = await q(`select r.rolname as creator_role, n.nspname as schema, d.defaclacl::text as raw_acl from pg_default_acl d join pg_roles r on r.oid = d.defaclrole left join pg_namespace n on n.oid = d.defaclnamespace where d.defaclobjtype = 'f' order by r.rolname, n.nspname`);
  out('RAW pg_default_acl rows (objtype=function, all schemas)', raw);
  out('FILTERED TO schema=public (the axis this SD stages a REVOKE for)', raw.filter((r) => r.schema === 'public'));

  // 2. Live census on the actual SECDEF surface
  const census = await q(`select (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef) as total_secdef, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_exec, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')) as authenticated_exec, (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proacl is not null and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) as literal_public`);
  out('LIVE CENSUS (compare to proposal: 145/28/41/18)', census);

  // 3. Binding constraint: fn_submit_venture_user_feedback MUST remain anon-EXEC through triage (coordinator_review_reason)
  const keep = await q(`select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fn_submit_venture_user_feedback'`);
  out('BINDING KEEP CHECK: fn_submit_venture_user_feedback', keep);
}
main().catch((e) => { console.error('UNREADABLE:', e.message); process.exit(2); });
