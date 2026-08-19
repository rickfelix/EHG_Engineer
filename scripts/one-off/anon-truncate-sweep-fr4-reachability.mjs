#!/usr/bin/env node
/**
 * FR-4: re-verify the sourcing feedback row's reachability claims at EXEC time, with the SECURITY
 * DEFINER survey scope DERIVED (schemas where anon holds USAGE), not hardcoded -- the exact scoping
 * bug security-agent found and fixed once already during PLAN review must not be reintroduced here.
 *
 * PostgREST's TRUNCATE-verb exposure claim is NOT re-verified by this script -- it is a structural,
 * versioned fact about PostgREST's design (it maps HTTP verbs to CRUD operations: GET/POST/PATCH/
 * DELETE; TRUNCATE has never been and is not exposed as a REST verb in any PostgREST version), not a
 * per-project runtime configuration this DB-level script can observe. Cited per PostgREST's own API
 * reference (https://docs.postgrest.org/en/stable/references/api/tables_views.html), which documents
 * the supported HTTP-verb-to-SQL-operation mapping exhaustively and does not include TRUNCATE. This
 * satisfies FR-4 AC-4's "HTTP-level probe or versioned citation" requirement via the citation path.
 *
 * SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001, FR-4.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  const q = (sql, params) => client.query(sql, params);
  const findings = [];

  try {
    await q('BEGIN');

    const { rows: [createPriv] } = await q(`select has_schema_privilege('anon','public','CREATE') as ok`);
    findings.push({ claim: 'anon lacks schema CREATE on public', reverified: createPriv.ok === false, value: createPriv.ok });

    const { rows: [execPriv] } = await q(`
      select has_function_privilege('anon', 'public.exec_sql(text)', 'EXECUTE') as anon_execute,
             p.prosecdef as is_security_definer
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'exec_sql'
      limit 1
    `);
    findings.push({
      claim: 'anon lacks EXECUTE on public.exec_sql, and exec_sql is SECURITY INVOKER (not DEFINER)',
      reverified: execPriv?.anon_execute === false && execPriv?.is_security_definer === false,
      value: execPriv,
    });

    // Derived schema list: every schema where anon holds USAGE (not a hardcoded public/governance/
    // portfolio list -- that was the exact scoping bug found and fixed during PLAN review).
    const { rows: usageSchemas } = await q(`
      select n.nspname as schema
      from pg_namespace n
      where has_schema_privilege('anon', n.nspname, 'USAGE')
        and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname
    `);
    const schemaList = usageSchemas.map((r) => r.schema);

    const { rows: secdefFns } = await q(`
      select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ANY($1::text[])
        and p.prosecdef = true
        and has_function_privilege('anon', p.oid, 'EXECUTE')
      order by n.nspname, p.proname
    `, [schemaList]);

    const dynamicSqlFns = secdefFns.filter((f) => /\bEXECUTE\s+(format\(|'|\$)/i.test(f.def));

    findings.push({
      claim: `full anon-executable SECURITY DEFINER survey across derived schema list [${schemaList.join(', ')}]`,
      count: secdefFns.length,
      functions: secdefFns.map((f) => `${f.schema}.${f.name}`),
      dynamic_sql_count: dynamicSqlFns.length,
      dynamic_sql_functions: dynamicSqlFns.map((f) => `${f.schema}.${f.name}`),
    });

    for (const f of findings) console.log(JSON.stringify(f, null, 2));

    const baselineExpectedCount = 27; // recorded at PLAN phase, 2026-08-19
    if (secdefFns.length !== baselineExpectedCount) {
      console.log(`\nDRIFT NOTICE: live count (${secdefFns.length}) differs from the PLAN-phase baseline (${baselineExpectedCount}). Not necessarily a problem -- new functions may have been added -- but any NEW function not already reviewed must be individually checked for dynamic SQL before FR-4 is considered closed for this EXEC pass.`);
    } else {
      console.log(`\nCount matches PLAN-phase baseline (${baselineExpectedCount}) -- no drift.`);
    }
  } finally {
    await q('ROLLBACK');
    await client.end();
  }
}

main().catch((err) => {
  console.error('FR4_CHECK_FAILED:', err.message);
  process.exit(1);
});
