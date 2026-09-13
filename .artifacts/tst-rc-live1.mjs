import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../lib/supabase-connection.js';
const UP = readFileSync('database/chairman-gated/20260913_uat_control_pack_evaluated_derive.sql','utf8');
const c = await createDatabaseClient('ehg');
const out = [];
await c.query('BEGIN');
try {
  // --- BASELINE: reproduce CRITICAL-1 against the PRE-FIX guard (2-clause) to prove the probe is valid
  await c.query(`CREATE OR REPLACE FUNCTION derive_prefix() RETURNS TRIGGER LANGUAGE plpgsql AS $$
  DECLARE v_status jsonb; v_required text[] := ARRAY['fence_two_sidedness','canary_mutation_control','live_deployment_binding','minimum_assertion_manifest']; v_key text; v_evaluated boolean := true;
  BEGIN
    IF TG_OP='INSERT' OR OLD.metadata->'control_pack_status' IS DISTINCT FROM NEW.metadata->'control_pack_status' THEN
      v_status := NEW.metadata->'control_pack_status';
      IF v_status IS NULL OR jsonb_typeof(v_status)!='object' THEN v_evaluated := false;
      ELSE FOREACH v_key IN ARRAY v_required LOOP IF NOT (v_status ? v_key) OR v_status->>v_key='not_attempted' THEN v_evaluated := false; END IF; END LOOP; END IF;
      NEW.metadata := jsonb_set(COALESCE(NEW.metadata,'{}'::jsonb),'{control_pack_evaluated}',to_jsonb(v_evaluated));
    END IF; RETURN NEW; END; $$;`);
  await c.query(`CREATE TRIGGER trg_prefix BEFORE INSERT OR UPDATE ON uat_test_runs FOR EACH ROW EXECUTE FUNCTION derive_prefix()`);
  const NA = {fence_two_sidedness:'not_attempted',canary_mutation_control:'not_attempted',live_deployment_binding:'not_attempted',minimum_assertion_manifest:'not_attempted'};
  let r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id, metadata`, [`tstrc-base-${randomUUID()}`, JSON.stringify({control_pack_status:NA})]);
  const baseId = r.rows[0].id;
  out.push(`BASELINE insert (4/4 not_attempted) -> cpe=${r.rows[0].metadata.control_pack_evaluated} (expect false)`);
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','true') WHERE id=$1 RETURNING metadata`, [baseId]);
  out.push(`BASELINE force cpe=true on PRE-FIX guard -> cpe=${r.rows[0].metadata.control_pack_evaluated} (CRITICAL-1 reproduced if TRUE)`);
  const prefixDrifts = r.rows[0].metadata.control_pack_evaluated === true;
  await c.query(`DROP TRIGGER trg_prefix ON uat_test_runs`);
  await c.query(`DROP FUNCTION derive_prefix()`);

  // --- NOW apply the REAL current UP file
  await c.query(UP);
  out.push('UP (current) applied');

  // TEST A: exact CRITICAL-1 shape against the FIXED guard
  r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id, metadata`, [`tstrc-a-${randomUUID()}`, JSON.stringify({control_pack_status:NA})]);
  const aId = r.rows[0].id;
  out.push(`A1 insert 4/4 not_attempted -> cpe=${r.rows[0].metadata.control_pack_evaluated} (expect false)`);
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','true') WHERE id=$1 RETURNING metadata`, [aId]);
  const aSelfHeal = r.rows[0].metadata.control_pack_evaluated === false;
  out.push(`A2 force cpe=true (CRITICAL-1 exact shape) -> cpe=${r.rows[0].metadata.control_pack_evaluated} (expect false) SELF-HEAL=${aSelfHeal}`);
  // persisted, not just RETURNING?
  r = await c.query(`SELECT metadata->'control_pack_evaluated' v FROM uat_test_runs WHERE id=$1`,[aId]);
  out.push(`A3 re-SELECT persisted value -> ${JSON.stringify(r.rows[0].v)} (expect false)`);

  // TEST B: wholesale metadata replacement forcing a wrong value
  r = await c.query(`UPDATE uat_test_runs SET metadata = $2::jsonb WHERE id=$1 RETURNING metadata`, [aId, JSON.stringify({control_pack_status:NA, control_pack_evaluated:true, other:'x'})]);
  out.push(`B wholesale metadata replace w/ cpe=true -> cpe=${r.rows[0].metadata.control_pack_evaluated} (expect false)`);

  // TEST C: residual -- write the SAME wrong value that is already stored (no-op on the key)
  // set up a drifted row by disabling the trigger, then re-enable
  await c.query(`ALTER TABLE uat_test_runs DISABLE TRIGGER trg_uat_control_pack_evaluated_derive`);
  r = await c.query(`INSERT INTO uat_test_runs (run_id, metadata) VALUES ($1,$2::jsonb) RETURNING id`, [`tstrc-c-${randomUUID()}`, JSON.stringify({control_pack_status:NA, control_pack_evaluated:true, note:'v1'})]);
  const cId = r.rows[0].id;
  await c.query(`ALTER TABLE uat_test_runs ENABLE TRIGGER trg_uat_control_pack_evaluated_derive`);
  r = await c.query(`SELECT metadata->'control_pack_evaluated' v FROM uat_test_runs WHERE id=$1`,[cId]);
  out.push(`C1 pre-existing DRIFTED row (cpe=true, status 4/4 not_attempted) planted: cpe=${JSON.stringify(r.rows[0].v)}`);
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{note}','"v2"') WHERE id=$1 RETURNING metadata`, [cId]);
  out.push(`C2 UPDATE unrelated subkey on drifted row -> cpe=${r.rows[0].metadata.control_pack_evaluated} (drift persists if true)`);
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','true') WHERE id=$1 RETURNING metadata`, [cId]);
  out.push(`C3 re-write SAME wrong value (true->true) on drifted row -> cpe=${r.rows[0].metadata.control_pack_evaluated} (RESIDUAL GAP if true)`);
  r = await c.query(`UPDATE uat_test_runs SET metadata = jsonb_set(metadata,'{control_pack_evaluated}','false') WHERE id=$1 RETURNING metadata`, [cId]);
  out.push(`C4 write a DIFFERENT value on drifted row -> cpe=${r.rows[0].metadata.control_pack_evaluated} (heals)`);

  console.log(JSON.stringify({prefixDrifts, aSelfHeal, out}, null, 2));
} catch (e) { console.log('ERROR: '+e.message+'\n'+out.join('\n')); }
finally { await c.query('ROLLBACK'); await c.end(); }
