/* eslint-disable */
process.env.DISABLE_SSL_VERIFY = 'true';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const password = process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD;
const cs = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const r1 = await c.query(`
    SELECT id, name, status, workflow_status, killed_at, kill_reason
    FROM ventures WHERE killed_at IS NOT NULL
  `);
  console.log('=== Already-killed venture rows ===');
  console.log(JSON.stringify(r1.rows, null, 2));

  const r2 = await c.query(`
    SELECT to_regtype('public.workflow_status_enum') AS exists,
           (SELECT COUNT(*)::int FROM pg_type WHERE typname='workflow_status_enum') AS cnt
  `);
  console.log('\n=== workflow_status_enum existence ===');
  console.log(JSON.stringify(r2.rows, null, 2));

  // Check whether ALTER TYPE ADD VALUE inside a transaction is the issue
  // PG docs: "ALTER TYPE ... ADD VALUE cannot run inside a transaction block" — confirms split is required
  const r3 = await c.query(`
    SELECT current_setting('server_version_num') AS pg_version
  `);
  console.log('\n=== pg version ===');
  console.log(JSON.stringify(r3.rows, null, 2));

  // Are there any sequences/etc on ventures_kill_log? No (table doesn't exist). Verify naming collision.
  const r4 = await c.query(`
    SELECT relname, relkind FROM pg_class
    WHERE relname LIKE '%kill_log%' OR relname LIKE '%kill%'
    ORDER BY 1 LIMIT 30
  `);
  console.log('\n=== Existing relations matching *kill* ===');
  console.log(JSON.stringify(r4.rows, null, 2));

  // chairman_decisions: status enum / column type for 'rejected' value
  const r5 = await c.query(`
    SELECT data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chairman_decisions' AND column_name='status'
  `);
  console.log('\n=== chairman_decisions.status type ===');
  console.log(JSON.stringify(r5.rows, null, 2));

  // CHECK constraints on chairman_decisions and venture_decisions involving status/decision
  const r6 = await c.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname='public' AND rel.relname IN ('chairman_decisions','venture_decisions')
      AND con.contype='c'
  `);
  console.log('\n=== chairman_decisions/venture_decisions CHECK constraints ===');
  console.log(JSON.stringify(r6.rows, null, 2));

  // RLS on operations_audit_log + ventures (for kill_venture INSERT permission)
  const r7 = await c.query(`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class WHERE relname IN ('ventures','operations_audit_log','eva_events','ventures_kill_log')
      AND relkind='r'
  `);
  console.log('\n=== RLS status of relevant tables ===');
  console.log(JSON.stringify(r7.rows, null, 2));

  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
