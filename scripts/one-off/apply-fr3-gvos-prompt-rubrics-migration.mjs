#!/usr/bin/env node
/**
 * FR-3: Apply 20260513_007_gvos_prompt_rubrics_a_schema.sql to the EHG/EHG_Engineer
 * consolidated Supabase database (dedlbzhpgkmetvhbkyzq).
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-3
 * Pre-state verified: SELECT to_regclass('public.gvos_prompt_rubrics') returns null.
 * Post-state target: table exists + at least one default rubric row (version=1, active=true).
 *
 * Migration is idempotent (CREATE TABLE IF NOT EXISTS + INSERT ... WHERE NOT EXISTS).
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { createDatabaseClient, splitPostgreSQLStatements } from '../lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const migrationPath = path.join(repoRoot, 'database', 'migrations', '20260513_007_gvos_prompt_rubrics_a_schema.sql');
console.log('Reading migration:', migrationPath);
const migrationSQL = readFileSync(migrationPath, 'utf-8');
console.log('SQL length:', migrationSQL.length, 'chars');

const client = await createDatabaseClient('ehg', { verify: true });
console.log('Connected to ehg project');

try {
  const statements = splitPostgreSQLStatements(migrationSQL);
  console.log('Statements parsed:', statements.length);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.trim().slice(0, 80).replace(/\s+/g, ' ');
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);
    await client.query(stmt);
  }
  console.log('All statements executed');

  const verify = await client.query("SELECT to_regclass('public.gvos_prompt_rubrics') AS rel_oid");
  console.log('Verify gvos_prompt_rubrics rel_oid:', verify.rows[0].rel_oid);

  const rowCount = await client.query('SELECT COUNT(*) AS cnt FROM public.gvos_prompt_rubrics');
  console.log('Row count:', rowCount.rows[0].cnt);

  if (verify.rows[0].rel_oid !== null && Number(rowCount.rows[0].cnt) >= 1) {
    console.log('FR-3 ACCEPTANCE PASSED: gvos_prompt_rubrics exists with', rowCount.rows[0].cnt, 'row(s)');
  } else {
    console.error('FR-3 ACCEPTANCE FAILED');
    process.exit(1);
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await client.end();
  console.log('Connection closed');
}
