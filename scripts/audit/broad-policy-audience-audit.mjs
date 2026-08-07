#!/usr/bin/env node
/**
 * broad-policy-audience-audit.mjs — SD-LEO-INFRA-DEFAULT-ANON-AUTHENTICATED-001 (FR-4).
 *
 * READ-ONLY. Enumerates every table whose policies admit a principal broader than service_role
 * WITHOUT a row-level narrowing predicate, and reports whether each carries a recorded audience.
 *
 * This is what makes FR-1's rule decidable by whoever reads it next, rather than by whoever
 * remembers the convention. It is ALSO the only way this SD's outcome becomes checkable at all:
 * the SD is forbidden from applying anything (chairman-only, non-delegable per TR-1), so the
 * proof that the fix worked is this query returning zero AFTER the chairman applies the staged
 * migrations — not anything the SD itself can demonstrate.
 *
 * Classification is delegated to lib/db/broad-policy-classifier.mjs, shared with the FR-3 lint, so
 * the two instruments cannot drift apart while each continues to look correct alone.
 *
 *   node scripts/audit/broad-policy-audience-audit.mjs           # report
 *   node scripts/audit/broad-policy-audience-audit.mjs --json    # machine-readable
 */
import 'dotenv/config';
import pg from 'pg';
import { classifyPolicy, hasRecordedAudience } from '../../lib/db/broad-policy-classifier.mjs';

export async function auditBroadPolicies(client) {
  const { rows: policies } = await client.query(`
    SELECT p.tablename, p.policyname, p.roles::text AS roles, p.cmd, p.qual,
           obj_description(('public.'||p.tablename)::regclass) AS table_comment
      FROM pg_policies p
     WHERE p.schemaname = 'public'
     ORDER BY p.tablename, p.policyname
  `);

  const findings = [];
  for (const p of policies) {
    const verdict = classifyPolicy(p);
    if (!verdict.violation) continue;
    findings.push({
      table: p.tablename,
      policy: p.policyname,
      roles: p.roles,
      cmd: p.cmd,
      qual: p.qual === null ? 'TRUE' : p.qual,
      reason: verdict.reason,
      has_recorded_audience: hasRecordedAudience(p.table_comment),
    });
  }
  return findings;
}

async function main() {
  const json = process.argv.includes('--json');
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const findings = await auditBroadPolicies(client);
  await client.end();

  if (json) { console.log(JSON.stringify({ count: findings.length, findings }, null, 2)); return; }

  console.log(`[BROAD-POLICY-AUDIT] ${findings.length} policy/policies admit a principal broader than service_role with no narrowing predicate.`);
  if (!findings.length) {
    console.log('  None. Every broad read policy narrows its rows, or is service_role-only.');
    return;
  }
  // Two separable columns on purpose: the exposure shape and whether the intent was RECORDED are
  // different facts. A table can legitimately have a broad audience — what it cannot have is an
  // UNSTATED one, because an unstated exception is how a convention erodes one case at a time.
  for (const f of findings) {
    console.log(`   • ${f.table}.${f.policy}  roles=${f.roles} cmd=${f.cmd}`);
    console.log(`       qual: ${String(f.qual).slice(0, 100)}`);
    console.log(`       why:  ${f.reason}`);
    console.log(`       audience recorded: ${f.has_recorded_audience ? 'YES' : 'NO  <-- undecidable without guessing intent'}`);
  }
  const unrecorded = findings.filter(f => !f.has_recorded_audience).length;
  console.log('');
  console.log(`  ${unrecorded} of ${findings.length} lack a recorded audience. That count is the gauge — if it grows, the convention is eroding.`);
}

if (process.argv[1] && /broad-policy-audience-audit\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(e => { console.error('audit failed:', e.message); process.exit(1); });
}
