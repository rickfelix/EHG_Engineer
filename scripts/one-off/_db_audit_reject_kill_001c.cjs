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

  // Pull ALL function defs once, filter client-side to avoid triggering the buggy server filter
  const r = await c.query(`SELECT n.nspname AS sch, p.proname AS fn, pg_get_functiondef(p.oid) AS def
                            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                            WHERE n.nspname IN ('public') AND p.prokind = 'f'`);
  const callers = r.rows.filter(r => r.fn !== 'reject_chairman_decision' && r.def && r.def.includes('reject_chairman_decision'));
  console.log('=== Other public.* functions calling reject_chairman_decision ===');
  console.log(callers.map(c => c.fn));

  const wsFailed = r.rows.filter(r => r.def && /workflow_status\s*=\s*'failed'/.test(r.def));
  console.log('\n=== Functions setting workflow_status = failed ===');
  console.log(wsFailed.map(c => c.fn));

  const wsAny = r.rows.filter(r => r.def && r.def.includes("workflow_status") && r.def.includes("failed"));
  console.log('\n=== Functions referencing both workflow_status + failed (broader) ===');
  console.log(wsAny.map(c => c.fn));

  const evaStatusChange = r.rows.filter(r => r.def && r.def.includes('eva_events') && r.def.includes('status_change'));
  console.log('\n=== Functions inserting status_change eva_events ===');
  console.log(evaStatusChange.map(c => c.fn));

  const idsChairman = r.rows.find(rr => rr.fn === 'on_chairman_approval_side_effects');
  if (idsChairman) {
    console.log('\n=== on_chairman_approval_side_effects (first 2500 chars) ===');
    console.log(idsChairman.def.slice(0, 2500));
  }

  const trgUnblock = r.rows.find(rr => rr.fn === 'trg_chairman_approval_unblock_orchestrator');
  if (trgUnblock) {
    console.log('\n=== trg_chairman_approval_unblock_orchestrator (first 2000 chars) ===');
    console.log(trgUnblock.def.slice(0, 2000));
  }

  const approveCD = r.rows.filter(rr => rr.fn === 'approve_chairman_decision');
  approveCD.forEach((d, i) => {
    console.log(`\n=== approve_chairman_decision overload ${i+1} (first 2500 chars) ===`);
    console.log(d.def.slice(0, 2500));
  });

  await c.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
