import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('ehg');
try {
  for (const t of ['sms_outbound_obligations','strategic_directives_v2','uat_test_runs']) {
    const r = await c.query(
      `SELECT t.tgname, t.tgenabled FROM pg_trigger t WHERE t.tgrelid = to_regclass($1) AND NOT t.tgisinternal ORDER BY t.tgname`, [`public.${t}`]);
    console.log(`\n### ${t}: ${r.rows.length} user trigger(s)`);
    const sd = r.rows.filter(x => /control_pack|fence_status|summary_column|derive/i.test(x.tgname));
    console.log('  SD-introduced-name matches:', sd.length ? JSON.stringify(sd) : 'NONE');
    if (t === 'sms_outbound_obligations') console.log('  all:', r.rows.map(x=>x.tgname).join(', ') || '(none)');
  }
  // FR-3 AC-5 no-backfill re-measure
  const rows = await c.query(`SELECT id, metadata->'control_pack_evaluated' AS ev, metadata->'control_pack_status' AS st FROM uat_test_runs`);
  const REQ=['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest'];
  let keyed=0, legacy=0, dis=0;
  for (const r of rows.rows) {
    if (r.ev === null && r.st === null) { legacy++; continue; }
    keyed++;
    const st = r.st;
    const derived = (st && typeof st === 'object' && !Array.isArray(st)) ? REQ.every(k => Object.prototype.hasOwnProperty.call(st,k) && st[k] !== 'not_attempted') : false;
    if ((r.ev === true) !== derived) { dis++; console.log('  DISAGREE', r.id, 'stored=', r.ev, 'derived=', derived); }
  }
  console.log(`\n### uat_test_runs: total=${rows.rows.length} keyed=${keyed} legacy(no keys)=${legacy} disagreements=${dis}`);
} finally { await c.end(); }
