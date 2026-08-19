#!/usr/bin/env node
/**
 * FR-1: live-enumerate every ordinary table (relkind='r') owned by postgres where anon holds
 * TRUNCATE, using pg_catalog aclexplode() -- NOT information_schema.role_table_grants (role-filtered,
 * returns different results under different connecting identities) and NOT has_table_privilege as an
 * interchangeable alternative (it also sees PUBLIC-granted relations like net.http_request_queue,
 * which this SD explicitly excludes -- see the Deletion Audit in the SD scope).
 *
 * Exclusion is by MECHANISM (pg_get_userbyid(relowner) != 'postgres'), not by a hardcoded name list --
 * this structurally excludes storage.* and net.* regardless of which relations exist at run time.
 *
 * Includes a mandatory positive control: a scratch table is granted anon TRUNCATE inside the same
 * session (never committed) and must appear in the raw aclexplode() result before an empty overall
 * result is trusted.
 *
 * SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001, FR-1.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_PATH = join(__dirname, '..', '..', 'database', 'chairman-gated', 'anon-truncate-sweep-enumeration.json');

async function main() {
  const client = await createDatabaseClient('engineer', { verify: true, verbose: true });
  try {
    // Positive control, inside a session-local scratch schema, never committed.
    await client.query('BEGIN');
    await client.query('CREATE TEMP TABLE _sweep_positive_control (id int)');
    await client.query('GRANT TRUNCATE ON _sweep_positive_control TO anon');

    const { rows } = await client.query(`
      select
        n.nspname as schema,
        c.relname as relation,
        c.relkind as relkind,
        pg_get_userbyid(c.relowner) as owner
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a on true
      join pg_roles r on r.oid = a.grantee
      where r.rolname = 'anon'
        and a.privilege_type = 'TRUNCATE'
        and n.nspname not in ('pg_catalog', 'information_schema')
      order by n.nspname, c.relname
    `);

    const positiveControlSeen = rows.some((r) => r.relation === '_sweep_positive_control');
    if (!positiveControlSeen) {
      throw new Error('POSITIVE_CONTROL_FAILED: the scratch table granted anon TRUNCATE in this same session did not appear in the aclexplode() result -- the enumeration query is broken; refusing to trust an otherwise-empty result.');
    }

    const withoutControl = rows.filter((r) => r.relation !== '_sweep_positive_control');

    const byKind = { r: [], v: [], other: [] };
    for (const row of withoutControl) {
      if (row.relkind === 'r') byKind.r.push(row);
      else if (row.relkind === 'v') byKind.v.push(row);
      else byKind.other.push(row);
    }

    const postgresOwnedTables = byKind.r.filter((r) => r.owner === 'postgres');
    const nonPostgresOwnedTables = byKind.r.filter((r) => r.owner !== 'postgres');

    console.log(`Raw aclexplode() rows (excluding positive control): ${withoutControl.length}`);
    console.log(`  relkind='r' (ordinary tables): ${byKind.r.length}`);
    console.log(`    owned by postgres (ACTIONABLE): ${postgresOwnedTables.length}`);
    console.log(`    owned by other roles (excluded by mechanism): ${nonPostgresOwnedTables.length} -- ${nonPostgresOwnedTables.map((r) => `${r.schema}.${r.relation} (${r.owner})`).join(', ')}`);
    console.log(`  relkind='v' (views, structurally excluded -- TRUNCATE inapplicable): ${byKind.v.length}`);
    console.log(`  other relkinds: ${byKind.other.length}`);

    await client.query('ROLLBACK');

    const artifact = {
      generated_at: new Date().toISOString(),
      generated_by: 'scripts/one-off/anon-truncate-sweep-enumerate.mjs',
      enumeration_predicate: "pg_catalog aclexplode(relacl) filtered to grantee='anon' AND privilege_type='TRUNCATE', relkind='r', owner='postgres'",
      positive_control_verified: true,
      raw_relkind_r_count: byKind.r.length,
      excluded_non_postgres_owned: nonPostgresOwnedTables.map((r) => ({ schema: r.schema, relation: r.relation, owner: r.owner })),
      excluded_views_count: byKind.v.length,
      actionable_count: postgresOwnedTables.length,
      relations: postgresOwnedTables.map((r) => `${r.schema}.${r.relation}`).sort(),
    };

    writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + '\n');
    console.log(`\nArtifact written: ${ARTIFACT_PATH}`);
    console.log(`Actionable relation count: ${artifact.actionable_count}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ENUMERATION_FAILED:', err.message);
  process.exit(1);
});
