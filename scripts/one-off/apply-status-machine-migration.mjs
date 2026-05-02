/**
 * Apply 20260502_venture_quality_findings_status_machine.sql to EHG_Engineer DB.
 *
 * Uses Supabase service-role client + native pg client (since the supabase-js
 * client doesn't expose raw multi-statement SQL execution). Reads the migration
 * file and runs it via pg.Client end-to-end so trigger functions and the
 * BEFORE UPDATE trigger commit together.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001 (FR-4)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';

const MIGRATION = '20260502_venture_quality_findings_status_machine.sql';

function buildConnectionString() {
  if (process.env.SUPABASE_POOLER_URL) return process.env.SUPABASE_POOLER_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  throw new Error('Need SUPABASE_POOLER_URL, DATABASE_URL, or POSTGRES_URL to apply migration directly.');
}

(async () => {
  const repoRoot = process.env.WORKTREE_ROOT
    || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-C-001';
  const sqlPath = path.join(repoRoot, 'database', 'migrations', MIGRATION);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = buildConnectionString();
  const client = new pg.Client({ connectionString: conn });
  await client.connect();
  console.log('Connected. Applying', MIGRATION);
  try {
    await client.query(sql);
    console.log('Migration applied successfully.');

    // Verify the four schema deltas landed.
    const checks = await client.query(`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='venture_quality_findings' AND column_name='status') AS has_status,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='venture_quality_findings' AND column_name='sd_filed_at') AS has_sd_filed_at,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='venture_quality_findings' AND column_name='resolved_at_v2') AS has_resolved_at_v2,
        EXISTS(SELECT 1 FROM information_schema.columns
               WHERE table_name='venture_quality_findings' AND column_name='cancelled_at') AS has_cancelled_at,
        EXISTS(SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name='venture_quality_findings_status_chk') AS has_check,
        EXISTS(SELECT 1 FROM pg_trigger
               WHERE tgname='venture_quality_findings_status_transition_trg') AS has_trigger
    `);
    console.log('Verification:', checks.rows[0]);
  } finally {
    await client.end();
  }
})().catch((err) => {
  console.error('FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
