import { createDatabaseClient } from '../scripts/lib/supabase-connection.js';
const client = await createDatabaseClient('engineer');
const q = async (label, sql) => {
  try { const { rows } = await client.query(sql); console.log(`\n== ${label} ==`); console.log(JSON.stringify(rows, null, 1)); }
  catch (e) { console.log(`\n== ${label} == ERROR: ${e.message}`); }
};
await q('columns of validation_gate_registry',
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='validation_gate_registry' ORDER BY ordinal_position`);
await q('triggers on validation_gate_registry',
  `SELECT tgname, pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='validation_gate_registry' AND NOT t.tgisinternal`);
await q('lock function exists?',
  `SELECT proname FROM pg_proc WHERE proname='validation_gate_registry_lock_trigger'`);
await q('protected gate keys present?',
  `SELECT gate_key, count(*) FROM validation_gate_registry WHERE gate_key IN ('PR_MERGE_VERIFICATION','SHIP_REVIEW_FINDINGS_PROOF') GROUP BY gate_key`);
await client.end();
