/**
 * One-off: Apply 2 migrations for SD-LEO-INFRA-REQUIRE-END-END-001 (EXEC phase).
 * - 20260513_add_activation_test_id_to_prd.sql
 * - 20260513_create_activation_catalog_expectations.sql
 *
 * Uses canonical createDatabaseClient + splitPostgreSQLStatements.
 * Writes a sub_agent_execution_results evidence row at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createDatabaseClient, splitPostgreSQLStatements, createSupabaseServiceClient } from '../lib/supabase-connection.js';

const SD_ID = 'ec4221f0-9f95-40a3-acb6-f4f2036351e9';
const REPO_ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-REQUIRE-END-END-001';

const FILES = [
  path.join(REPO_ROOT, 'database/migrations/20260513_add_activation_test_id_to_prd.sql'),
  path.join(REPO_ROOT, 'database/migrations/20260513_create_activation_catalog_expectations.sql'),
];

async function applyOne(client, file) {
  const sql = fs.readFileSync(file, 'utf8');
  const statements = splitPostgreSQLStatements(sql);
  console.log(`\n=== ${path.basename(file)} (${statements.length} stmt) ===`);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    const preview = trimmed.slice(0, 120).replace(/\s+/g, ' ');
    console.log(`  > ${preview}${trimmed.length > 120 ? '…' : ''}`);
    await client.query(trimmed);
  }
}

async function verify(client) {
  const col = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='product_requirements_v2' AND column_name='activation_test_id'
  `);
  const tbl = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name='activation_catalog_expectations'
  `);
  const pol = await client.query(`
    SELECT policyname FROM pg_policies WHERE tablename='activation_catalog_expectations'
  `);
  return {
    column_rows: col.rows.length,
    table_rows: tbl.rows.length,
    policy_rows: pol.rows.length,
    policy_names: pol.rows.map(r => r.policyname),
  };
}

(async () => {
  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true });
    console.log('✅ Connected to engineer DB');

    for (const f of FILES) {
      await applyOne(client, f);
    }

    const v = await verify(client);
    console.log('\n=== VERIFICATION ===');
    console.log(JSON.stringify(v, null, 2));

    const allPass = v.column_rows === 1 && v.table_rows === 1 && v.policy_rows === 2;
    if (!allPass) throw new Error(`Verification FAILED: ${JSON.stringify(v)}`);
    console.log('\n✅ All verification checks PASS');

    // Write evidence row via Supabase service role (RLS-aware insert)
    const supabase = await createSupabaseServiceClient();
    const { data: row, error } = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sd_id: SD_ID,
        sub_agent_code: 'DATABASE',
        phase: 'EXEC',
        verdict: 'PASS',
        confidence: 95,
        metadata: {
          migration_applied: true,
          migrations: [
            '20260513_add_activation_test_id_to_prd.sql',
            '20260513_create_activation_catalog_expectations.sql',
          ],
          verification: v,
          applied_by: 'database-agent',
          claude_session_id: '690c1ab6-b4a0-4445-b01b-b6480ff7a124',
          applied_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (error) throw error;
    console.log(`\n📝 Evidence row id: ${row.id}`);
    console.log(`EVIDENCE_ROW_ID=${row.id}`);
  } catch (e) {
    console.error('❌ FAILED:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  } finally {
    if (client) await client.end();
  }
})();
