import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';
const UP = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive.sql','utf8');
const DOWN = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive_DOWN.sql','utf8');
const c = await createDatabaseClient('ehg');
const out=[];
try {
  const NA={fence_two_sidedness:'not_attempted',canary_mutation_control:'not_attempted',live_deployment_binding:'not_attempted',minimum_assertion_manifest:'not_attempted'};
  let id;
  // TX1: plant drifted row + 1st UP  (separate transactions => distinct now())
  await c.query('BEGIN');
  let r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id`, [`tstrc-dv-${randomUUID()}`, JSON.stringify({control_pack_status:NA, control_pack_evaluated:true})]);
  id = r.rows[0].id;
  await c.query(UP);
  r = await c.query(`SELECT control_pack_evaluated v, snapshotted_at s FROM uat_control_pack_evaluated_rollback_snapshot WHERE id=$1`,[id]);
  out.push({step:'batch1 (true pre-derivation)', v:r.rows.map(x=>x.v)});
  // heal the row via a DIFFERENT-value write (trigger corrects it)
  await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','false') WHERE id=$1`,[id]);
  r = await c.query(`SELECT metadata->'control_pack_evaluated' v FROM uat_test_runs WHERE id=$1`,[id]);
  out.push({step:'row healed by live trigger', v:r.rows[0].v});
  await c.query(DOWN);
  await c.query(`SELECT pg_sleep(0.05)`);
  await c.query(UP); // re-apply -- snapshot now captures POST-derivation state
  r = await c.query(`SELECT control_pack_evaluated v, snapshotted_at s FROM uat_control_pack_evaluated_rollback_snapshot WHERE id=$1 ORDER BY snapshotted_at`,[id]);
  out.push({step:'ALL batches after re-apply', values:r.rows.map(x=>x.v), distinctTimes:new Set(r.rows.map(x=>String(x.s))).size,
    verdict: r.rows.length===2 && r.rows[0].v===true && r.rows[1].v===false
      ? 'CONFIRMED: 2nd batch holds POST-derivation state in the same table as the true pre-derivation batch'
      : 'not reproduced as expected'});
  console.log(JSON.stringify(out,null,2));
} catch(e){ console.log('ERROR: '+e.message+'\n'+JSON.stringify(out,null,2)); }
finally { await c.query('ROLLBACK'); await c.end(); }
