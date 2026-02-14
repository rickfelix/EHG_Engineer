/**
 * One-time script to execute the eva_event_log migration
 * Uses SUPABASE_POOLER_URL (no DB password required)
 *
 * NOTE: Uses rejectUnauthorized: false for dev environment
 * (Supabase pooler uses self-signed cert in cert chain)
 */
const { readFileSync } = require('fs');
const { join } = require('path');
const pg = require('pg');
require('dotenv').config({ path: join(__dirname, '..', '..', '.env') });

const { Client } = pg;

async function run() {
  const migrationFile = join(
    __dirname, '..', '..', '.worktrees',
    'SD-EVA-FEAT-EVENT-MONITOR-001',
    '.worktrees', 'SD-EVA-FEAT-EVENT-MONITOR-001',
    'database', 'migrations', '20260213_eva_event_log.sql'
  );

  const sql = readFileSync(migrationFile, 'utf-8');
  console.log('Migration file loaded (' + sql.length + ' characters)');

  const poolerUrl = process.env.SUPABASE_POOLER_URL;
  if (!poolerUrl) throw new Error('SUPABASE_POOLER_URL not set');
  console.log('Using SUPABASE_POOLER_URL for connection');

  // Dev environment: Supabase pooler uses certs that fail strict verification
  // This is consistent with how other successful migrations connect
  const client = new Client({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await client.connect();
  const verifyResult = await client.query('SELECT current_database(), current_user');
  console.log('Connected to: ' + verifyResult.rows[0].current_database + ' as ' + verifyResult.rows[0].current_user);

  // Split on semicolons, ignoring comments-only blocks
  const rawStatements = sql.split(';')
    .map(s => s.trim())
    .filter(s => {
      const lines = s.split('\n').filter(l => l.trim().length > 0 && !l.trim().startsWith('--'));
      return lines.length > 0;
    });

  console.log('Found ' + rawStatements.length + ' SQL statements\n');

  let successCount = 0;
  let skipCount = 0;
  const errors = [];

  for (let i = 0; i < rawStatements.length; i++) {
    const stmt = rawStatements[i];
    const preview = stmt.substring(0, 80).replace(/[\n\r]/g, ' ') + '...';
    try {
      console.log('[' + (i + 1) + '/' + rawStatements.length + '] Executing: ' + preview);
      const result = await client.query(stmt);
      console.log('   OK: ' + (result.command || 'executed'));
      successCount++;
    } catch (err) {
      const msg = err.message.split('\n')[0];
      if (msg.includes('already exists') || msg.includes('already enabled')) {
        console.log('   SKIPPED: ' + msg);
        skipCount++;
      } else {
        console.error('   ERROR: ' + msg);
        errors.push({ preview, error: err.message });
      }
    }
  }

  console.log('\n=== Migration Summary ===');
  console.log('Successful: ' + successCount);
  console.log('Skipped (already exists): ' + skipCount);
  console.log('Errors: ' + errors.length);

  if (errors.length > 0) {
    errors.forEach((e, i) => {
      console.error('\nError ' + (i + 1) + ': ' + e.preview);
      console.error('  ' + e.error);
    });
  }

  // Verify table creation
  const tableCheck = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eva_event_log'"
  );
  console.log('\nVerification: eva_event_log table exists = ' + (tableCheck.rows.length > 0));

  if (tableCheck.rows.length > 0) {
    const colCheck = await client.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'eva_event_log' ORDER BY ordinal_position"
    );
    console.log('Columns (' + colCheck.rows.length + '):');
    colCheck.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ', nullable=' + r.is_nullable + ')'));

    const idxCheck = await client.query(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'eva_event_log'"
    );
    console.log('Indexes (' + idxCheck.rows.length + '):');
    idxCheck.rows.forEach(r => console.log('  ' + r.indexname));

    const rlsCheck = await client.query(
      "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'eva_event_log'"
    );
    console.log('RLS Policies (' + rlsCheck.rows.length + '):');
    rlsCheck.rows.forEach(r => console.log('  ' + r.policyname + ' (' + r.cmd + ')'));
  }

  await client.end();
  console.log('\nDatabase connection closed');

  if (errors.length > 0) process.exit(1);
  console.log('Migration completed successfully!');
}

run().catch(err => {
  console.error('FATAL: ' + err.message);
  process.exit(1);
});
