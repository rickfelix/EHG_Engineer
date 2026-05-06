/* eslint-disable */
process.env.DISABLE_SSL_VERIFY = 'true';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');
const fs = require('fs');

const password = process.env.SUPABASE_DB_PASSWORD || process.env.EHG_DB_PASSWORD;
const cs = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
const out = [];
const log = (s) => { console.log(s); out.push(typeof s === 'string' ? s : JSON.stringify(s, null, 2)); };

(async () => {
  const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await c.connect();

  async function run(label, sql) {
    try { const r = await c.query(sql); log(`\n=== ${label} ===`); log(JSON.stringify(r.rows, null, 2)); }
    catch (e) { log(`\n=== ${label} === ERROR: ${e.message}`); }
  }

  await run('Other functions calling reject_chairman_decision',
    `SELECT n.nspname AS sch, p.proname AS fn
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE pg_get_functiondef(p.oid) LIKE '%reject_chairman_decision%'
       AND p.proname <> 'reject_chairman_decision'`);

  await run('Functions referencing workflow_status...failed',
    `SELECT n.nspname AS sch, p.proname AS fn
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE pg_get_functiondef(p.oid) LIKE '%workflow_status%failed%'
     LIMIT 30`);

  await run('chairman_decisions RLS policies',
    `SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_qual,
            pg_get_expr(polwithcheck, polrelid) AS check_qual
     FROM pg_policy WHERE polrelid = 'public.chairman_decisions'::regclass`);

  await run('publication tables (top 100)',
    `SELECT tablename FROM pg_publication_tables
     WHERE schemaname='public' AND pubname='supabase_realtime' ORDER BY 1 LIMIT 100`);

  await run('Triggers on operations_audit_log + eva_events (any?)',
    `SELECT event_object_table, trigger_name, action_timing, event_manipulation
     FROM information_schema.triggers
     WHERE event_object_schema='public' AND event_object_table IN ('operations_audit_log','eva_events')
     ORDER BY 1, 2`);

  await run('eva_events trigger functions for status_change',
    `SELECT n.nspname AS sch, p.proname AS fn
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE pg_get_functiondef(p.oid) LIKE '%eva_events%status_change%'
     LIMIT 20`);

  await run('trigger_create_postmortem_on_failure already covered? Check trg_chairman_approval_side_effects source',
    `SELECT pg_get_functiondef('public.trigger_chairman_approval_side_effects'::regproc) AS def`);

  // Try alternative names for the trigger function
  await run('Find trigger function for trg_chairman_approval_side_effects',
    `SELECT proname FROM pg_proc WHERE proname LIKE '%chairman_approval%' OR proname LIKE '%chairman_decision%' LIMIT 20`);

  fs.writeFileSync(path.join(__dirname, '_db_audit_reject_kill_001b_output.txt'), out.join('\n'));
  log('\nDONE');
  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
