#!/usr/bin/env node
/**
 * CO-EXISTING PERMISSIVE POLICY CENSUS — SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001 (SURVEY-3).
 *
 * WHY THIS EXISTS. Postgres OR-s PERMISSIVE policies, so where two or more exist on the same
 * table+command, THE WEAKEST ONE GOVERNS. Tightening one while another remains changes nothing —
 * and reasoning about "the" policy on a table (singular) is how that gets missed. The live instance
 * that motivated this SD: `feedback | INSERT` carries telegram_bot_insert_feedback (WITH CHECK
 * source_type='telegram') alongside venture_user_insert_feedback, which places NO constraint on
 * source_type at all. A fence derived from the first policy alone bounds nothing.
 *
 * WHY IT IS A QUERY AND NOT A FILE SWEEP. The prior census was a static replay of CREATE/DROP POLICY
 * text ordered by FILENAME — which is not apply order, and _STAGED / _rollback files may never have
 * been applied at all. That produces CANDIDATES, not findings. This reads pg_policies, so every row
 * is what the database actually enforces right now.
 *
 * IT REPORTS A DENOMINATOR, NOT A CHECKLIST. It enumerates every multi-permissive table+command in
 * the schema rather than confirming a pre-supplied list, so a pair nobody suspected is still found.
 *
 * ALSO REPORTS THE PERMISSIVE-DENY CLASS (D3): a policy NAMED like a fence but declared PERMISSIVE
 * with USING(false) contributes NOTHING to the OR. It reads as a guard and provides none — and it
 * would not restrain a future permissive policy added beside it.
 *
 * USAGE: node scripts/security/rls-coexisting-permissive-census.mjs [--json]
 * Requires DATABASE_URL, or SUPABASE_DB_PASSWORD + SUPABASE_URL (direct-connection form).
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

// Use the POOLER, not the direct host. db.<ref>.supabase.co does not resolve for this project, and
// CLAUDE_CORE.md:1238 records why the pooler is canonical here: direct URLs hit connection limits.
// Host is configured in config/databases.json (aws-1-us-east-1.pooler.supabase.com).
const POOLER_HOST = process.env.SUPABASE_POOLER_HOST || 'aws-1-us-east-1.pooler.supabase.com';

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
  if (!pw || !ref) return null;
  return `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${POOLER_HOST}:5432/postgres`;
}

// THE QUERY. Grouped by (table, command) because the OR happens PER COMMAND — a table with one
// INSERT policy and three SELECT policies is not a multi-permissive INSERT surface, and reporting
// by table alone would hide which command is actually widened.
const CENSUS_SQL = `
SELECT
  schemaname, tablename, cmd,
  count(*)                                          AS permissive_count,
  array_agg(policyname ORDER BY policyname)         AS policies,
  array_agg(DISTINCT r ORDER BY r)                  AS roles,
  bool_or(r IN ('anon','public'))                   AS reaches_anon_or_public
FROM pg_policies pp, LATERAL unnest(pp.roles) AS r
WHERE pp.permissive = 'PERMISSIVE' AND pp.schemaname = 'public'
GROUP BY schemaname, tablename, cmd
HAVING count(*) > 1
ORDER BY bool_or(r IN ('anon','public')) DESC, tablename, cmd;
`;

// D3 — a policy that is PERMISSIVE with an always-false predicate. It contributes NOTHING to the OR:
// it reads as an explicit fence and provides none.
//
// PREDICATE, NOT NAME. A name filter (%deny%/%block%) produced 7 false positives on the first run —
// auto_apply_denylist matched on the TABLE name, circuit_breaker_blocks on "blocks", and
// venture_stages' "deny_write_..." is a SELECT policy with qual=true. Matching the always-false
// predicate is what actually identifies the class; the name is decoration.
//
// AND IT REPORTS REACHABILITY, because the harm is conditional. With no other permissive policy
// granting that role+command, RLS default-denies anyway, so the fence is REDUNDANT-but-harmless
// today. It becomes LOAD-BEARING-AND-ABSENT the moment someone adds a permissive grant beside it —
// which is exactly the safe-by-coincidence shape. `co_granting_policies` is that tripwire.
const PERMISSIVE_DENY_SQL = `
SELECT
  d.schemaname, d.tablename, d.cmd, d.policyname, d.roles, d.qual, d.with_check,
  (SELECT count(*) FROM pg_policies g
     WHERE g.schemaname = d.schemaname AND g.tablename = d.tablename
       AND g.permissive = 'PERMISSIVE'
       AND (g.cmd = d.cmd OR g.cmd = 'ALL' OR d.cmd = 'ALL')
       AND g.policyname <> d.policyname
       AND coalesce(g.qual,'true') NOT IN ('false','(false)')
       AND g.roles && d.roles
  ) AS co_granting_policies
FROM pg_policies d
WHERE d.permissive = 'PERMISSIVE' AND d.schemaname = 'public'
  AND (coalesce(d.qual,'') IN ('false','(false)') OR coalesce(d.with_check,'') IN ('false','(false)'))
ORDER BY d.tablename, d.cmd, d.policyname;
`;

async function main() {
  const cs = connectionString();
  if (!cs) { console.error('No DATABASE_URL and cannot derive one from SUPABASE_DB_PASSWORD + SUPABASE_URL'); process.exit(2); }
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const census = (await client.query(CENSUS_SQL)).rows;
    const denies = (await client.query(PERMISSIVE_DENY_SQL)).rows;
    const writeCmds = new Set(['INSERT', 'UPDATE', 'DELETE', 'ALL']);
    const reaching = census.filter((r) => r.reaches_anon_or_public);
    const reachingWrites = reaching.filter((r) => writeCmds.has(r.cmd));

    if (process.argv.includes('--json')) {
      console.log(JSON.stringify({ census, permissive_denies: denies }, null, 2));
      return;
    }

    console.log('CO-EXISTING PERMISSIVE POLICIES — the weakest governs, per table+command');
    console.log(`  multi-permissive table+command pairs (public schema): ${census.length}`);
    console.log(`  of those, reaching anon/public                      : ${reaching.length}`);
    console.log(`  of those, on a WRITE command (INSERT/UPDATE/DELETE/ALL): ${reachingWrites.length}`);
    console.log('');
    console.log('REACHING ANON/PUBLIC ON A WRITE COMMAND — the weakest-governs surface:');
    const arr = (v) => Array.isArray(v) ? v : String(v || '').replace(/^[{]|[}]$/g, '').split(',').filter(Boolean);
    for (const r of reachingWrites) {
      console.log(`  ${r.tablename} | ${r.cmd} | n=${r.permissive_count} | roles=${arr(r.roles).join(',')}`);
      console.log(`      ${arr(r.policies).join('  +  ')}`);
    }
    console.log('');
    // Split by REACHABILITY, not by count. A permissive-deny with no co-granting policy is redundant
    // (RLS default-denies anyway); one WITH a co-granting policy is a fence that is already being
    // OR-ed around. Reporting a single number would merge a latent hazard with a live one.
    const live = denies.filter((d) => Number(d.co_granting_policies) > 0);
    const latent = denies.filter((d) => !(Number(d.co_granting_policies) > 0));
    console.log(`PERMISSIVE-DENY CLASS (always-false PERMISSIVE — contributes nothing to the OR): ${denies.length}`);
    console.log(`  LIVE (a co-granting permissive policy already OR-s around this fence): ${live.length}`);
    for (const d of live) {
      console.log(`  ! ${d.tablename} | ${d.cmd} | ${d.policyname} | roles=${d.roles} | co_granting=${d.co_granting_policies}`);
    }
    console.log(`  LATENT (no co-granting policy today — RLS default-denies, so it is redundant, not protective): ${latent.length}`);
    for (const d of latent) {
      console.log(`    ${d.tablename} | ${d.cmd} | ${d.policyname} | roles=${d.roles} | qual=${d.qual}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('census failed:', e.message); process.exit(1); });
