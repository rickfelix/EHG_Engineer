/* eslint-disable */
// Read-only DB audit for SD-LEO-FEAT-STAGE-REJECT-KILL-001 PLAN phase
process.env.DISABLE_SSL_VERIFY = 'true';
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

const password = process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD;
if (!password) { console.error('NO PASSWORD'); process.exit(1); }
const projectId = 'dedlbzhpgkmetvhbkyzq';
const cs = `postgresql://postgres.${projectId}:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  async function run(label, sql) {
    try {
      const r = await c.query(sql);
      console.log(`\n=== ${label} ===`);
      console.table(r.rows);
    } catch (e) { console.log(`\n=== ${label} === ERROR: ${e.message}`); }
  }
  async function runText(label, sql) {
    try {
      const r = await c.query(sql);
      console.log(`\n=== ${label} ===`);
      console.log(r.rows[0] ? Object.values(r.rows[0])[0]?.slice?.(0, 3000) || r.rows[0] : 'no row');
    } catch (e) { console.log(`\n=== ${label} === ERROR: ${e.message}`); }
  }

  await run('Other functions calling reject_chairman_decision',
    `SELECT n.nspname AS schema, p.proname AS function
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE pg_get_functiondef(p.oid) ILIKE '%reject_chairman_decision%'
       AND p.proname != 'reject_chairman_decision'
     ORDER BY n.nspname, p.proname`);

  await runText('create_postmortem_on_venture_failure',
    `SELECT pg_get_functiondef('public.create_postmortem_on_venture_failure'::regproc) AS def`);

  await run('ventures status enum types',
    `SELECT a.attname, t.typname FROM pg_attribute a
     JOIN pg_class c2 ON c2.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c2.relnamespace
     JOIN pg_type t ON t.oid = a.atttypid
     WHERE n.nspname='public' AND c2.relname='ventures' AND a.attname IN ('status','workflow_status')`);

  await run('relevant enum values',
    `SELECT typname, enumlabel FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
     WHERE typname IN ('venture_status','venture_status_enum','workflow_status_enum')
     ORDER BY typname, enumsortorder`);

  await run('publications',
    `SELECT pubname, schemaname, tablename FROM pg_publication_tables
     WHERE schemaname='public' AND tablename IN ('ventures','operations_audit_log','eva_events')
     ORDER BY pubname, tablename`);

  await run('backfill volume',
    `SELECT COUNT(*)::int AS already_killed FROM ventures WHERE killed_at IS NOT NULL`);

  await run('eva_events FKs',
    `SELECT conname, pg_get_constraintdef(oid) AS def
     FROM pg_constraint
     WHERE conrelid = 'public.eva_events'::regclass AND contype='f'`);

  await run('chairman_decisions FK + columns',
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='chairman_decisions'
       AND column_name IN ('decided_by_user_id','decided_by','venture_id','lifecycle_stage','status','decision')
     ORDER BY ordinal_position`);

  await run('venture_decisions columns',
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema='public' AND table_name='venture_decisions'
       AND column_name IN ('venture_id','stage','decision','decided_by','decided_at','notes','status')
     ORDER BY ordinal_position`);

  await run('Other code referencing workflow_status = failed (kill-gate semantic)',
    `SELECT n.nspname || '.' || p.proname AS function
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE pg_get_functiondef(p.oid) ILIKE '%workflow_status%failed%'
        OR pg_get_functiondef(p.oid) ILIKE '%workflow_status = ''failed''%'
     LIMIT 50`);

  await run('Triggers on chairman_decisions / venture_decisions',
    `SELECT event_object_table, trigger_name, action_timing, event_manipulation
     FROM information_schema.triggers
     WHERE event_object_schema='public'
       AND event_object_table IN ('chairman_decisions','venture_decisions')
     ORDER BY event_object_table, trigger_name`);

  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
