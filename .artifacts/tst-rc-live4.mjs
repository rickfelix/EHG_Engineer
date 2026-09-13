import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';
const UP = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive.sql','utf8');
const DOWN = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive_DOWN.sql','utf8');
const c = await createDatabaseClient('ehg');
const out=[];
await c.query('BEGIN');
try {
  // plant a row that is DRIFTED pre-install (cpe=true but status 4/4 not_attempted)
  const NA={fence_two_sidedness:'not_attempted',canary_mutation_control:'not_attempted',live_deployment_binding:'not_attempted',minimum_assertion_manifest:'not_attempted'};
  let r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id`, [`tstrc-re-${randomUUID()}`, JSON.stringify({control_pack_status:NA, control_pack_evaluated:true})]);
  const id = r.rows[0].id;
  await c.query(UP);
  r = await c.query(`SELECT count(*)::int n, count(DISTINCT snapshotted_at)::int batches FROM uat_control_pack_evaluated_rollback_snapshot`);
  out.push({step:'after 1st UP', ...r.rows[0]});
  r = await c.query(`SELECT control_pack_evaluated v FROM uat_control_pack_evaluated_rollback_snapshot WHERE id=$1`,[id]);
  out.push({step:'1st UP snapshot of the drifted row (TRUE = genuine pre-derivation)', v:r.rows.map(x=>x.v)});
  // trigger goes live and corrects the row
  await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','true') WHERE id=$1`,[id]);
  r = await c.query(`SELECT metadata->'control_pack_evaluated' v FROM uat_test_runs WHERE id=$1`,[id]);
  out.push({step:'row after trigger lived + a write', v:r.rows[0].v});
  await c.query(DOWN);
  r = await c.query(`SELECT to_regclass('public.uat_control_pack_evaluated_rollback_snapshot') t`);
  out.push({step:'snapshot table survives DOWN', exists: r.rows[0].t !== null});
  await c.query(UP); // re-apply
  r = await c.query(`SELECT count(*)::int n, count(DISTINCT snapshotted_at)::int batches FROM uat_control_pack_evaluated_rollback_snapshot`);
  out.push({step:'after 2nd UP (re-apply)', ...r.rows[0]});
  r = await c.query(`SELECT snapshotted_at, control_pack_evaluated v FROM uat_control_pack_evaluated_rollback_snapshot WHERE id=$1 ORDER BY snapshotted_at`,[id]);
  out.push({step:'ALL snapshot batches for the drifted row', values:r.rows.map(x=>x.v),
    note:'2 rows for the same id, distinguished ONLY by snapshotted_at; a restorer not filtering to the earliest batch may read POST-derivation state'});
  r = await c.query(`SELECT count(*)::int n FROM pg_constraint WHERE conrelid='public.uat_control_pack_evaluated_rollback_snapshot'::regclass`);
  out.push({step:'constraints/PK on snapshot table', n:r.rows[0].n});
  console.log(JSON.stringify(out,null,2));
} catch(e){ console.log('ERROR: '+e.message+'\n'+JSON.stringify(out,null,2)); }
finally { await c.query('ROLLBACK'); await c.end(); }
